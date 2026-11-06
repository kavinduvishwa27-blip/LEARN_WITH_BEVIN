// Student details. This replaced the Google Form sent after payment: once a payment is confirmed,
// the student answers a few questions on their checkout page, and the batch group link unlocks.
// The answers are saved on the enrollment, listed in the admin panel (Students, with a CSV
// export), and added as a row to the Google Sheet through a small Apps Script web app
// (admin panel > Students > Google Sheet shows the script to paste).
import { all, first, run, now, audit } from "./db.js";
import { getRawContent, saveContent } from "./content.js";
import { isEmail } from "./shared.js";

export const GENDERS = ["Female", "Male", "Prefer not to say"];
export const SOURCES = ["TikTok", "Facebook", "YouTube", "Instagram", "WhatsApp", "Friend or family", "Google", "Other"];

const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Check the answers. Returns { profile } or { error }. */
export function cleanProfile(b) {
  const p = {
    name: s(b.name, 120), email: s(b.email, 200).toLowerCase(), age: s(b.age, 3), city: s(b.city, 80),
    gender: s(b.gender, 30), studying: s(b.studying, 3), university: s(b.university, 120), source: s(b.source, 40),
  };
  if (p.name.length < 2) return { error: "Please enter your full name." };
  if (!isEmail(p.email)) return { error: "Please enter a valid email address." };
  const age = parseInt(p.age, 10);
  if (!(age >= 13 && age <= 80)) return { error: "Please enter your age." };
  p.age = String(age);
  if (p.city.length < 2) return { error: "Please enter your home town." };
  if (!GENDERS.includes(p.gender)) return { error: "Please choose your gender." };
  if (!["Yes", "No"].includes(p.studying)) return { error: "Please tell us if you are studying at a university." };
  if (p.studying === "Yes" && p.university.length < 2) return { error: "Please enter your university." };
  if (p.studying === "No") p.university = "";
  if (!SOURCES.includes(p.source)) return { error: "Please tell us how you found us." };
  return { profile: p };
}

export async function saveProfile(env, e, p) {
  await run(env.DB,
    "UPDATE enrollments SET name = ?, email = ?, age = ?, city = ?, gender = ?, studying = ?, university = ?, source = ?, profile_at = ?, updated_at = ? WHERE id = ?",
    p.name, p.email, p.age, p.city, p.gender, p.studying, p.university, p.source, now(), now(), e.id);
  await audit(env.DB, "student", "student.profile", { id: e.id, reference: e.reference });
}

/* ---------------------------------------------------------------- Google Sheet */
async function sheetSettings(env, origin) {
  return (await getRawContent(env, origin)).raw.students || {};
}

/** The code shared with the Apps Script, created the first time the admin opens the setup. */
export async function sheetSetup(env, origin, who) {
  const st = await sheetSettings(env, origin);
  if (!st.sheet_token) {
    st.sheet_token = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await saveContent(env, "students", st, who);
  }
  return { token: st.sheet_token, url: st.sheet_url || "" };
}

async function postToSheet(url, body) {
  const res = await fetch(url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let out = null;
  try { out = JSON.parse(text); } catch {}
  if (!out) throw new Error(res.ok ? "The Google Sheet did not answer correctly. Check that the script is deployed as a web app with access for Anyone." : `The Google Sheet answered ${res.status}.`);
  if (!out.ok) throw new Error(out.error === "wrong token" ? "The code in the Google Sheet script does not match. Copy the script again." : out.error || "The Google Sheet refused the row.");
  return out;
}

/** Save the web app address and check that the script answers. Adds no row. */
export async function testSheet(env, origin, url, who) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(url || "").trim())) throw new Error("Paste the web app address from Apps Script. It looks like https://script.google.com/macros/s/.../exec");
  const st = await sheetSettings(env, origin);
  if (!st.sheet_token) throw new Error("Open the setup steps first.");
  st.sheet_url = String(url).trim();
  await saveContent(env, "students", st, who);
  await postToSheet(st.sheet_url, { token: st.sheet_token, test: true });
  return { ok: true };
}

export const sheetRow = (e, slipId) => [
  e.email, e.name, e.age, e.phone, e.city, e.gender, e.studying, e.university || "", e.source,
  slipId ? `Checked on the website (slip #${slipId})` : e.method === "card" ? "Card payment" : "Recorded in the admin panel",
  e.reference, e.plan === "deposit" ? "Seat deposit" : "Pay in full", e.amount_paid,
];

/** Add one student to the Google Sheet (does nothing if the sheet is not connected). */
export async function syncToSheet(env, origin, id) {
  const e = await first(env.DB, "SELECT * FROM enrollments WHERE id = ?", id);
  if (!e || !e.profile_at) return { ok: false, error: "This student has not filled in their details yet." };
  const st = await sheetSettings(env, origin);
  if (!st.sheet_url || !st.sheet_token) return { ok: false, error: "The Google Sheet is not connected yet." };
  const slip = await first(env.DB, "SELECT id FROM slips WHERE enrollment_id = ? AND status IN ('confirmed', 'approved') ORDER BY id LIMIT 1", id);
  try {
    await postToSheet(st.sheet_url, { token: st.sheet_token, row: sheetRow(e, slip?.id) });
    await run(env.DB, "UPDATE enrollments SET sheet_status = 'added', sheet_at = ? WHERE id = ?", now(), id);
    return { ok: true };
  } catch (err) {
    await run(env.DB, "UPDATE enrollments SET sheet_status = ?, sheet_at = ? WHERE id = ?", "error: " + String(err.message).slice(0, 200), now(), id);
    return { ok: false, error: err.message };
  }
}

/* ---------------------------------------------------------------- admin list */
export async function listStudents(env, { q, limit = 50, offset = 0 }) {
  const where = ["status IN ('deposit', 'paid')"], args = [];
  if (q) { where.push("(name LIKE ? OR phone LIKE ? OR email LIKE ? OR reference LIKE ? OR city LIKE ? OR university LIKE ?)"); const like = `%${q}%`; args.push(like, like, like, like, like, like); }
  const w = "WHERE " + where.join(" AND ");
  const total = (await first(env.DB, `SELECT COUNT(*) AS n FROM enrollments ${w}`, ...args))?.n || 0;
  const rows = await all(env.DB, `SELECT * FROM enrollments ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  return { total, rows };
}

export const STUDENT_CSV = ["created_at", "reference", "name", "email", "phone", "age", "city", "gender", "studying", "university", "source", "plan", "amount_paid", "amount_due", "status", "profile_at", "sheet_status"];
