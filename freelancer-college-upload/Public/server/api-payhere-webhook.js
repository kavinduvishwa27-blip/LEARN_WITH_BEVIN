// POST /api/webhooks/payhere  (PayHere notify_url)
// Verifies the md5sig, then hands a verified payment to the automation pipeline
// (n8n -> create account, enroll, welcome message, invoice).
import { md5, dispatch } from "./shared.js";
import { applyPayment } from "./business.js";

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.PAYHERE_SECRET) return new Response("not configured", { status: 501 });
  const f = await request.formData();
  const g = (k) => String(f.get(k) || "");

  const local = md5(g("merchant_id") + g("order_id") + g("payhere_amount") + g("payhere_currency") + g("status_code") + md5(env.PAYHERE_SECRET).toUpperCase()).toUpperCase();
  if (local !== g("md5sig") || g("merchant_id") !== env.PAYHERE_MERCHANT_ID) {
    console.log("PayHere signature mismatch for", g("order_id"));
    return new Response("invalid signature", { status: 400 });
  }

  const status = { "2": "success", "0": "pending", "-1": "cancelled", "-2": "failed", "-3": "chargedback" }[g("status_code")] || "unknown";
  // Record it and mark the enrollment paid (this also updates the seats left)
  await applyPayment(env, new URL(request.url).origin, { reference: g("order_id"), amount: g("payhere_amount"), currency: g("payhere_currency"), provider: "payhere", status, raw: Object.fromEntries(f) });
  waitUntil(dispatch(env, {
    type: "payment",
    provider: "payhere",
    status,
    reference: g("order_id"),
    payment_id: g("payment_id"),
    amount: g("payhere_amount"),
    currency: g("payhere_currency"),
    plan: g("custom_1"),
    code: g("custom_2"),
    method: g("method"),
    ts: new Date().toISOString(),
  }));
  return new Response("ok");
}
