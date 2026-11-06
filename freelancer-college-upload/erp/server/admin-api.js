// Admin API: everything the admin panel reads and writes. Mounted at /api/admin/*.
// Every request must pass verifyAdmin() first.
import { verifyAdmin, authMethods } from "./auth.js";
import { ensureSchema, all, first, run, now, audit } from "./db.js";
import { getRawContent, isEditableKey, saveContent, resetContent } from "./content.js";
import { listSlips, getSlip, getSlipFile, approveSlip, rejectSlip, SlipError } from "./slips.js";
import { listMedia, saveMedia, getMedia, deleteMedia, mediaResponse, MEDIA_ID } from "./media.js";
import {
  listLeads, listEnrollments, createEnrollment, updateEnrollment, stats, toCsv,
  LEAD_STATUSES, ENROLL_STATUSES,
} from "./business.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const csv = (text, name) =>
  new Response("﻿" + text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

const LEAD_CSV = ["id", "created_at", "type", "status", "name", "phone", "email", "magnet", "page", "message", "notes"];
const ENROLL_CSV = ["id", "created_at", "reference", "status", "name", "phone", "email", "city", "course", "cohort", "plan", "method", "code", "amount_due", "amount_paid", "balance_due", "notes"];

export async function handleAdmin(request, env, origin) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin\/?/, "").replace(/\/$/, "");
  const method = request.method;

  // Public: tells the panel how to log in
  if (path === "auth" && method === "GET") return json({ methods: authMethods(env), database: !!env.DB });

  const admin = await verifyAdmin(request, env);
  if (!admin) return json({ error: "Not signed in", methods: authMethods(env) }, 401);
  if (!env.DB) return json({ error: "The database is not connected. Add a D1 binding named DB in Cloudflare Pages settings." }, 503);
  await ensureSchema(env.DB);
  const who = admin.user;
  const q = Object.fromEntries(url.searchParams);
  const limit = Math.min(200, Math.max(1, parseInt(q.limit || "50", 10)));
  const offset = Math.max(0, parseInt(q.offset || "0", 10));

  try {
    // ---------- Session ----------
    if (path === "me") return json({ user: who, method: admin.method });

    // ---------- Website content ----------
    if (path === "content" && method === "GET") {
      const { defaults, raw, rows } = await getRawContent(env, origin);
      const updated = Object.fromEntries(rows.map((r) => [r.key, { at: r.updated_at, by: r.updated_by }]));
      return json({ data: raw, defaults, updated });
    }
    let m = /^content\/([\w.]+)$/.exec(path);
    if (m) {
      const key = m[1];
      const { defaults } = await getRawContent(env, origin);
      if (!isEditableKey(key, defaults)) return json({ error: "Unknown content section" }, 400);
      if (method === "PUT") {
        const { value } = await body(request);
        if (value === undefined) return json({ error: "Missing value" }, 400);
        await saveContent(env, key, value, who);
        await audit(env.DB, who, "content.save", key);
        return json({ ok: true, key, saved_at: now() });
      }
      if (method === "DELETE") {
        await resetContent(env, key);
        await audit(env.DB, who, "content.reset", key);
        return json({ ok: true, key });
      }
    }

    // ---------- Dashboard ----------
    if (path === "stats") return json(await stats(env, origin));

    // ---------- Leads ----------
    if (path === "leads" && method === "GET") return json({ ...(await listLeads(env, { ...q, limit, offset })), statuses: LEAD_STATUSES });
    if (path === "leads.csv") return csv(toCsv((await listLeads(env, { ...q, limit: 100000, offset: 0 })).rows, LEAD_CSV), `leads-${now().slice(0, 10)}.csv`);
    m = /^leads\/(\d+)$/.exec(path);
    if (m) {
      const id = +m[1];
      if (method === "GET") return json(await first(env.DB, "SELECT * FROM leads WHERE id = ?", id) || { error: "Not found" });
      if (method === "PATCH") {
        const b = await body(request);
        const cur = await first(env.DB, "SELECT * FROM leads WHERE id = ?", id);
        if (!cur) return json({ error: "Not found" }, 404);
        const status = b.status !== undefined ? String(b.status) : cur.status;
        if (!LEAD_STATUSES.includes(status)) return json({ error: "Unknown status" }, 400);
        const notes = b.notes !== undefined ? String(b.notes).slice(0, 5000) : cur.notes;
        await run(env.DB, "UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE id = ?", status, notes, now(), id);
        await audit(env.DB, who, "lead.update", { id, status });
        return json({ ok: true });
      }
      if (method === "DELETE") {
        await run(env.DB, "DELETE FROM leads WHERE id = ?", id);
        await audit(env.DB, who, "lead.delete", { id });
        return json({ ok: true });
      }
    }

    // ---------- Enrollments ----------
    if (path === "enrollments" && method === "GET") return json({ ...(await listEnrollments(env, { ...q, limit, offset })), statuses: ENROLL_STATUSES });
    if (path === "enrollments.csv") return csv(toCsv((await listEnrollments(env, { ...q, limit: 100000, offset: 0 })).rows, ENROLL_CSV), `enrollments-${now().slice(0, 10)}.csv`);
    if (path === "enrollments" && method === "POST") {
      const b = await body(request);
      if (!b.name || String(b.name).trim().length < 2) return json({ error: "Name is required" }, 400);
      const id = await createEnrollment(env, origin, b, who);
      if (b.amount_paid) await updateEnrollment(env, origin, id, { amount_paid: b.amount_paid }, who);
      return json({ ok: true, id });
    }
    m = /^enrollments\/(\d+)$/.exec(path);
    if (m) {
      const id = +m[1];
      if (method === "GET") return json(await first(env.DB, "SELECT * FROM enrollments WHERE id = ?", id) || { error: "Not found" });
      if (method === "PATCH") {
        const r = await updateEnrollment(env, origin, id, await body(request), who);
        return r ? json({ ok: true, ...r }) : json({ error: "Not found" }, 404);
      }
      if (method === "DELETE") {
        const cur = await first(env.DB, "SELECT * FROM enrollments WHERE id = ?", id);
        if (cur?.seat_counted) await updateEnrollment(env, origin, id, { status: "cancelled" }, who); // give the seat back
        await run(env.DB, "DELETE FROM enrollments WHERE id = ?", id);
        await audit(env.DB, who, "enrollment.delete", { id, reference: cur?.reference });
        return json({ ok: true });
      }
    }
    if (path === "payments") return json({ rows: await all(env.DB, "SELECT * FROM payments ORDER BY created_at DESC LIMIT ? OFFSET ?", limit, offset) });

    // ---------- Payment slips ----------
    if (path === "slips" && method === "GET") return json(await listSlips(env, { status: q.status, limit, offset }));
    m = /^slips\/(\d+)(\/file|\/approve|\/reject)?$/.exec(path);
    if (m) {
      const id = +m[1];
      try {
        if (!m[2] && method === "GET") return json((await getSlip(env, id)) || { error: "Not found" });
        if (m[2] === "/file" && method === "GET") {
          const row = await getSlipFile(env, id);
          return row ? mediaResponse(row, { cache: false }) : json({ error: "Not found" }, 404);
        }
        if (m[2] === "/approve" && method === "POST") return json(await approveSlip(env, origin, id, (await body(request)).amount, who));
        if (m[2] === "/reject" && method === "POST") return json(await rejectSlip(env, id, (await body(request)).note, who));
      } catch (e) {
        if (e instanceof SlipError) return json({ error: e.message }, e.status);
        throw e;
      }
    }

    // ---------- Images ----------
    if (path === "media" && method === "GET") return json({ rows: await listMedia(env) });
    if (path === "media" && method === "POST") {
      try { return json({ ok: true, ...(await saveMedia(env, await body(request), who)) }); }
      catch (e) { return json({ error: e.message }, 400); }
    }
    m = /^media\/([\w.]+?)(\/file)?$/.exec(path);
    if (m && MEDIA_ID.test(m[1])) {
      if (method === "GET" && m[2]) { // the image itself, for the local preview
        const row = await getMedia(env, m[1]);
        return row ? mediaResponse(row, { cache: false }) : json({ error: "Not found" }, 404);
      }
      if (method === "DELETE") return (await deleteMedia(env, m[1], who)) ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }

    // ---------- Activity & backup ----------
    if (path === "audit") return json({ rows: await all(env.DB, "SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?", limit, offset) });
    if (path === "backup") {
      const payload = {
        exported_at: now(),
        content: await all(env.DB, "SELECT * FROM content"),
        leads: await all(env.DB, "SELECT * FROM leads"),
        enrollments: await all(env.DB, "SELECT * FROM enrollments"),
        payments: await all(env.DB, "SELECT * FROM payments"),
        media: await all(env.DB, "SELECT * FROM media"),
        slips: await all(env.DB, "SELECT * FROM slips"),
      };
      return new Response(JSON.stringify(payload, null, 1), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="freelancer-college-backup-${now().slice(0, 10)}.json"` } });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e.message || "Something went wrong" }, 500);
  }
}
