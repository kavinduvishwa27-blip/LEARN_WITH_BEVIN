// POST /api/slip
// The checkout confirmation page uses this to upload a bank slip and to check the payment status.
// Body: { action: "status" | "upload" | "profile", reference, phone, file?: { type, data (base64), name }, profile?: {...} }
// The reference and the WhatsApp number from checkout must match, or nothing is returned.
import { json, clean, dispatch } from "./shared.js";
import { ensureSchema } from "./db.js";
import { findEnrollment, slipStatus, submitSlip, SlipError } from "./slips.js";
import { cleanProfile, saveProfile, syncToSheet } from "./students.js";

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ ok: false, error: "Payments cannot be checked right now. Please send your slip on WhatsApp." }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid request" }, 400); }
  await ensureSchema(env.DB);

  const e = await findEnrollment(env, clean(b.reference, 40), clean(b.phone, 40));
  if (!e) return json({ ok: false, error: "We could not find an enrollment with that reference and WhatsApp number." }, 404);
  const origin = new URL(request.url).origin;

  if (b.action === "profile") {
    if (e.status !== "deposit" && e.status !== "paid") return json({ ok: false, error: "Your payment is not confirmed yet." }, 409);
    const { profile, error } = cleanProfile(b.profile || {});
    if (error) return json({ ok: false, error }, 422);
    const first = !e.profile_at;
    await saveProfile(env, e, profile);
    if (first) waitUntil(syncToSheet(env, origin, e.id).catch((err) => console.log("sheet sync failed", err && err.message)));
    const fresh = await findEnrollment(env, e.reference, e.phone);
    return json({ ok: true, ...(await slipStatus(env, origin, fresh)) });
  }

  if (b.action === "upload") {
    let r;
    try { r = await submitSlip(env, origin, e, b.file, request.headers.get("CF-Connecting-IP") || ""); }
    catch (err) {
      if (err instanceof SlipError) return json({ ok: false, error: err.message }, err.status);
      console.log("slip upload failed", err && err.message);
      return json({ ok: false, error: "Something went wrong. Please try again, or send your slip on WhatsApp." }, 500);
    }
    if (!r.already) {
      waitUntil(dispatch(env, {
        type: "slip", name: e.name, phone: e.phone, email: e.email, reference: e.reference, page: "/checkout/success/",
        message: r.state === "confirmed" ? "Payment slip confirmed automatically." : r.state === "retry" ? "Slip could not be read; the student was asked to upload again." : `Slip needs checking: ${r.reasons.join(" ")}`,
        ts: new Date().toISOString(),
      }).catch(() => {}));
    }
    const fresh = await findEnrollment(env, e.reference, e.phone);
    return json({ ok: true, result: r.state, ...(await slipStatus(env, origin, fresh)) });
  }
  return json({ ok: true, ...(await slipStatus(env, origin, e)) });
}

export const onRequest = () => json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
