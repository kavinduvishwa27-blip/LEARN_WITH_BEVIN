// POST /api/payhere-checkout
// Returns signed fields for a PayHere hosted checkout. The amount is decided here
// from the plan, never trusted from the browser.
// Prices come from the live content (admin panel -> Designer X batch).
// Env: PAYHERE_MERCHANT_ID, PAYHERE_SECRET, PAYHERE_SANDBOX ("true" for testing), SITE_URL.
import { json, clean, md5, normalisePhone } from "./shared.js";
import { getSetting } from "./content.js";
import { toAmount } from "./business.js";

export async function onRequestPost({ request, env }) {
  if (!env.PAYHERE_MERCHANT_ID || !env.PAYHERE_SECRET) return json({ ok: false, error: "Card payments not configured" }, 501);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const plan = b.plan === "deposit" ? "deposit" : "full";
  const cohort = await getSetting(env, new URL(request.url).origin, "cohort");
  const amount = toAmount(plan === "deposit" ? cohort.deposit : (cohort.price_full || cohort.price_early)).toFixed(2);
  if (amount === "0.00") return json({ ok: false, error: "Price not set" }, 500);
  const currency = "LKR";
  const orderId = clean(b.reference, 40) || "FCX-" + Date.now().toString(36).toUpperCase();
  const site = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const [first, ...rest] = clean(b.name, 120).split(" ");

  const hash = md5(env.PAYHERE_MERCHANT_ID + orderId + amount + currency + md5(env.PAYHERE_SECRET).toUpperCase()).toUpperCase();

  return json({
    ok: true,
    action: env.PAYHERE_SANDBOX === "true" ? "https://sandbox.payhere.lk/pay/checkout" : "https://www.payhere.lk/pay/checkout",
    fields: {
      merchant_id: env.PAYHERE_MERCHANT_ID,
      return_url: `${site}/checkout/success?paid=1&order_id=${encodeURIComponent(orderId)}`,
      cancel_url: `${site}/checkout/designer-x?cancelled=1`,
      notify_url: `${site}/api/webhooks/payhere`,
      order_id: orderId,
      items: `Designer X ${plan === "deposit" ? "seat deposit" : "full enrollment"}`,
      currency,
      amount,
      first_name: first || "Student",
      last_name: rest.join(" ") || "-",
      email: clean(b.email, 200),
      phone: normalisePhone(b.phone),
      address: "-",
      city: clean(b.city, 80) || "Colombo",
      country: "Sri Lanka",
      custom_1: plan,
      custom_2: clean(b.code, 40),
      hash,
    },
  });
}
