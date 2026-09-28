// POST /api/lead
// Every form on the site posts here: lead magnets, webinar, newsletter, contact,
// business inquiries, course notify lists and enrollment requests.
// Destinations are configured with environment variables (see README).
import { json, clean, normalisePhone, isEmail, verifyTurnstile, rateLimited, dispatch } from "./shared.js";
import { saveLead } from "./business.js";

const TYPES = new Set(["lead", "newsletter", "webinar", "contact", "business", "notify", "enroll", "quiz", "seat"]);

// "Book your seat" answers: { question: answer }, at most 20 pairs, trimmed
function cleanAnswers(v) {
  let o = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { return undefined; } }
  if (!o || typeof o !== "object" || Array.isArray(o)) return undefined;
  const out = {};
  for (const [q, a] of Object.entries(o).slice(0, 20)) out[clean(String(q), 200)] = clean(String(a), 200);
  return Object.keys(out).length ? out : undefined;
}

export async function onRequestPost({ request, env, waitUntil }) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  // Honeypot: real people never fill this hidden field
  if (clean(body.website)) return json({ ok: true });

  if (await rateLimited(env, ip, "lead")) return json({ ok: false, error: "Too many requests. Please try again in a few minutes." }, 429);
  if (!(await verifyTurnstile(env, body["cf-turnstile-response"], ip))) return json({ ok: false, error: "Verification failed. Please refresh and try again." }, 403);

  const type = TYPES.has(body.type) ? body.type : "lead";
  const record = {
    type,
    name: clean(body.name, 120),
    phone: normalisePhone(body.phone),
    email: clean(body.email, 200).toLowerCase(),
    magnet: clean(body.magnet, 80),
    page: clean(body.page, 200),
    message: clean(body.message, 4000),
    company: clean(body.company, 160),
    course: clean(body.course, 60),
    cohort: clean(body.cohort, 60),
    plan: clean(body.plan, 20),
    method: clean(body.method, 20),
    code: clean(body.code, 40).toUpperCase(),
    city: clean(body.city, 80),
    reference: clean(body.reference, 40),
    team_size: clean(body.team_size, 40),
    interest: clean(body.interest, 80),
    result: clean(body.result, 80),
    answers: cleanAnswers(body.answers),
    utm: typeof body.utm === "object" && body.utm ? Object.fromEntries(Object.entries(body.utm).slice(0, 12).map(([k, v]) => [clean(k, 30), clean(String(v), 200)])) : {},
    ip_country: request.headers.get("CF-IPCountry") || "",
    ts: new Date().toISOString(),
  };
  Object.keys(record).forEach((k) => (record[k] === "" || record[k] === undefined) && delete record[k]);

  // Validation: at least one way to reach the person
  if (record.email && !isEmail(record.email)) return json({ ok: false, error: "Invalid email address." }, 422);
  if (body.phone && !record.phone) return json({ ok: false, error: "Invalid WhatsApp number." }, 422);
  if (!record.email && !record.phone) return json({ ok: false, error: "Please add an email or WhatsApp number." }, 422);
  if (["enroll", "contact", "business", "webinar", "seat"].includes(type) && (!record.name || record.name.length < 2)) return json({ ok: false, error: "Please add your name." }, 422);

  // Save to the admin database first (so nothing is lost), then notify other tools in the background
  let saved = false;
  if (env.DB) {
    try { await saveLead(env, new URL(request.url).origin, record); saved = true; }
    catch (e) { console.log("saving lead failed", e && e.message); }
  }
  waitUntil(dispatch(env, record).then((r) => { if (!r.destinations && !saved) console.log("LEAD (no destinations configured)", JSON.stringify(record)); }));
  return json({ ok: true, reference: record.reference || null });
}

export const onRequest = () => json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
