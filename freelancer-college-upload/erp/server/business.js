// Leads, enrollments, payments and the seat counter.
import { ensureSchema, all, first, run, now, audit, slDate } from "./db.js";
import { getSetting, saveContent } from "./content.js";

// "15,000" -> 15000, "18500.00" -> 18500, "LKR 5,000" -> 5000
export const toAmount = (v) => {
  if (typeof v === "number") return Math.round(v) || 0;
  const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export const ENROLL_STATUSES = ["pending", "deposit", "paid", "cancelled"];
export const LEAD_STATUSES = ["new", "contacted", "interested", "enrolled", "not_interested"];
const HOLDS_SEAT = new Set(["deposit", "paid"]);

/** Store any form submission. Enrollment requests also create an enrollment. */
export async function saveLead(env, origin, record) {
  if (!env.DB) return null;
  await ensureSchema(env.DB);
  const t = now();
  const { type, name, phone, email, magnet, page, message, ...rest } = record;
  const r = await run(env.DB,
    "INSERT INTO leads (type, name, phone, email, magnet, page, message, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    type || "lead", name || "", phone || "", email || "", magnet || "", page || "", message || "", JSON.stringify(rest), type === "enroll" ? "interested" : "new", t, t);
  if (type === "enroll") await createEnrollment(env, origin, record);
  return r.meta?.last_row_id ?? null;
}

export async function createEnrollment(env, origin, rec, who = "website") {
  await ensureSchema(env.DB);
  const cohort = await getSetting(env, origin, "cohort");
  // Pay in full: early bird minus the extra discount. Deposit plan: the early bird price, paid in two parts.
  const due = rec.amount_due !== undefined ? toAmount(rec.amount_due)
    : rec.plan === "deposit" ? toAmount(cohort.price_early) : toAmount(cohort.price_full || cohort.price_early);
  const reference = rec.reference || "FCX-" + Date.now().toString(36).toUpperCase();
  const t = now();
  const existing = await first(env.DB, "SELECT id FROM enrollments WHERE reference = ?", reference);
  if (existing) return existing.id;
  const r = await run(env.DB,
    "INSERT INTO enrollments (reference, course, cohort, plan, method, name, phone, email, city, code, amount_due, amount_paid, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    reference, rec.course || "designer-x", rec.cohort || cohort.name || "", rec.plan || "full", rec.method || "bank",
    rec.name || "", rec.phone || "", rec.email || "", rec.city || "", rec.code || "",
    due, toAmount(rec.amount_paid), "pending", rec.notes || "", t, t);
  const id = r.meta?.last_row_id ?? null;
  await audit(env.DB, who, "enrollment.create", { id, reference, name: rec.name });
  return id;
}

/** Move the "seats left" counter on the public site by delta (-1 when a seat is taken). */
async function adjustSeats(env, origin, delta, who) {
  const cohort = await getSetting(env, origin, "cohort");
  const left = Math.max(0, toAmount(cohort.seats_left) + delta);
  await saveContent(env, "site.cohort", { ...cohort, seats_left: String(left) }, who);
  return left;
}

/**
 * Update an enrollment. Seats are counted automatically: the first time an enrollment
 * reaches "deposit" or "paid" it takes a seat; cancelling gives the seat back.
 */
export async function updateEnrollment(env, origin, id, changes, who) {
  await ensureSchema(env.DB);
  const cur = await first(env.DB, "SELECT * FROM enrollments WHERE id = ?", id);
  if (!cur) return null;
  const next = { ...cur };
  for (const k of ["name", "phone", "email", "city", "plan", "method", "cohort", "code", "notes"]) if (changes[k] !== undefined) next[k] = String(changes[k]);
  if (changes.amount_due !== undefined) next.amount_due = toAmount(changes.amount_due);
  if (changes.amount_paid !== undefined) next.amount_paid = toAmount(changes.amount_paid);
  if (changes.status !== undefined) {
    if (!ENROLL_STATUSES.includes(changes.status)) throw new Error("Unknown status");
    next.status = changes.status;
  } else if (changes.amount_paid !== undefined && next.status !== "cancelled") {
    next.status = next.amount_paid <= 0 ? "pending" : next.amount_paid >= next.amount_due ? "paid" : "deposit";
  }
  if (changes.balance_due !== undefined) next.balance_due = /^\d{4}-\d{2}-\d{2}$/.test(changes.balance_due) ? changes.balance_due : null;
  else if (next.status === "deposit" && !cur.balance_due) {
    // Deposit paid: the rest is due on the batch's balance date (Designer X batch -> "Balance due by")
    const cohort = await getSetting(env, origin, "cohort");
    next.balance_due = /^\d{4}-\d{2}-\d{2}$/.test(cohort.balance_due_date || "") ? cohort.balance_due_date : slDate(14);
  }
  let seatsLeft = null;
  if (HOLDS_SEAT.has(next.status) && !cur.seat_counted) { next.seat_counted = 1; seatsLeft = await adjustSeats(env, origin, -1, who); }
  if (next.status === "cancelled" && cur.seat_counted) { next.seat_counted = 0; seatsLeft = await adjustSeats(env, origin, +1, who); }
  next.updated_at = now();
  await run(env.DB,
    "UPDATE enrollments SET name=?, phone=?, email=?, city=?, plan=?, method=?, cohort=?, code=?, notes=?, amount_due=?, amount_paid=?, status=?, seat_counted=?, balance_due=?, updated_at=? WHERE id=?",
    next.name, next.phone, next.email, next.city, next.plan, next.method, next.cohort, next.code, next.notes, next.amount_due, next.amount_paid, next.status, next.seat_counted, next.balance_due ?? null, next.updated_at, id);
  await audit(env.DB, who, "enrollment.update", { id, reference: cur.reference, status: next.status, amount_paid: next.amount_paid, ...(next.balance_due && next.status === "deposit" ? { balance_due: next.balance_due } : {}) });
  return { enrollment: next, seatsLeft };
}

/** A verified online payment (PayHere webhook). */
export async function applyPayment(env, origin, { reference, amount, currency, provider, status, raw }) {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  await run(env.DB, "INSERT INTO payments (reference, provider, amount, currency, status, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    reference, provider, toAmount(amount), currency, status, JSON.stringify(raw || {}), now());
  if (status !== "success") return;
  const e = await first(env.DB, "SELECT * FROM enrollments WHERE reference = ?", reference);
  if (!e) return;
  await updateEnrollment(env, origin, e.id, { amount_paid: e.amount_paid + toAmount(amount) }, provider);
}

export async function listLeads(env, { status, type, q, limit = 50, offset = 0 }) {
  await ensureSchema(env.DB);
  const where = [], args = [];
  if (status) { where.push("status = ?"); args.push(status); }
  if (type) { where.push("type = ?"); args.push(type); }
  if (q) { where.push("(name LIKE ? OR phone LIKE ? OR email LIKE ? OR message LIKE ? OR magnet LIKE ?)"); const like = `%${q}%`; args.push(like, like, like, like, like); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = (await first(env.DB, `SELECT COUNT(*) AS n FROM leads ${w}`, ...args))?.n || 0;
  const rows = await all(env.DB, `SELECT * FROM leads ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  return { total, rows };
}

export async function listEnrollments(env, { status, q, limit = 50, offset = 0 }) {
  await ensureSchema(env.DB);
  const where = [], args = [];
  if (status === "overdue") { where.push("status = 'deposit' AND balance_due IS NOT NULL AND balance_due < ?"); args.push(slDate()); }
  else if (status) { where.push("status = ?"); args.push(status); }
  if (q) { where.push("(name LIKE ? OR phone LIKE ? OR email LIKE ? OR reference LIKE ?)"); const like = `%${q}%`; args.push(like, like, like, like); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = (await first(env.DB, `SELECT COUNT(*) AS n FROM enrollments ${w}`, ...args))?.n || 0;
  const rows = await all(env.DB, `SELECT * FROM enrollments ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  return { total, rows };
}

export async function stats(env, origin) {
  await ensureSchema(env.DB);
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since14 = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
  const n = async (sql, ...a) => (await first(env.DB, sql, ...a))?.n || 0;
  const byStatus = Object.fromEntries((await all(env.DB, "SELECT status, COUNT(*) AS n FROM enrollments GROUP BY status")).map((r) => [r.status, r.n]));
  const perDay = await all(env.DB, "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM leads WHERE substr(created_at, 1, 10) >= ? GROUP BY day ORDER BY day", since14);
  const cohort = await getSetting(env, origin, "cohort");
  return {
    leads_total: await n("SELECT COUNT(*) AS n FROM leads"),
    leads_7d: await n("SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?", since7),
    leads_new: await n("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"),
    enrollments: byStatus,
    revenue: await n("SELECT COALESCE(SUM(amount_paid), 0) AS n FROM enrollments WHERE status != 'cancelled'"),
    outstanding: await n("SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS n FROM enrollments WHERE status IN ('pending', 'deposit')"),
    balances_overdue: await n("SELECT COUNT(*) AS n FROM enrollments WHERE status = 'deposit' AND balance_due IS NOT NULL AND balance_due < ?", slDate()),
    balances_due_soon: await n("SELECT COUNT(*) AS n FROM enrollments WHERE status = 'deposit' AND balance_due IS NOT NULL AND balance_due >= ? AND balance_due <= ?", slDate(), slDate(3)),
    seats_left: cohort.seats_left, seats: cohort.seats, cohort: cohort.name, currency: cohort.currency || "LKR",
    leads_per_day: perDay,
    recent_leads: await all(env.DB, "SELECT id, type, name, phone, email, magnet, status, created_at FROM leads ORDER BY created_at DESC, id DESC LIMIT 6"),
    recent_enrollments: await all(env.DB, "SELECT id, reference, name, phone, plan, method, amount_due, amount_paid, status, balance_due, created_at FROM enrollments ORDER BY created_at DESC, id DESC LIMIT 6"),
  };
}

export function toCsv(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // guard against spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n");
}
