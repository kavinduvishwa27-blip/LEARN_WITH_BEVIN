// Database (Cloudflare D1) schema and small helpers.
// Tables are created automatically on first use, so there is nothing to run by hand.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS content (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     updated_by TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS leads (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     type TEXT, name TEXT, phone TEXT, email TEXT, magnet TEXT, page TEXT, message TEXT,
     data TEXT,
     status TEXT NOT NULL DEFAULT 'new',
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at)`,
  `CREATE TABLE IF NOT EXISTS enrollments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     reference TEXT UNIQUE,
     course TEXT, cohort TEXT, plan TEXT, method TEXT,
     name TEXT, phone TEXT, email TEXT, city TEXT, code TEXT,
     amount_due INTEGER NOT NULL DEFAULT 0,
     amount_paid INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'pending',
     seat_counted INTEGER NOT NULL DEFAULT 0,
     balance_due TEXT,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS enrollments_created ON enrollments(created_at)`,
  `CREATE TABLE IF NOT EXISTS payments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     reference TEXT, provider TEXT, amount INTEGER, currency TEXT, status TEXT, raw TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL, who TEXT, action TEXT, detail TEXT
   )`,
];

// Columns added after the first release. Adding one that already exists fails harmlessly.
const MIGRATIONS = [
  "ALTER TABLE enrollments ADD COLUMN balance_due TEXT",
];

let ready = null;
export function ensureSchema(db) {
  if (!ready) {
    ready = (async () => {
      for (const sql of SCHEMA) await db.prepare(sql).run();
      for (const sql of MIGRATIONS) { try { await db.prepare(sql).run(); } catch {} }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** Today's date in Sri Lanka (YYYY-MM-DD), optionally plus some days. */
export function slDate(plusDays = 0) {
  return new Date(Date.now() + 5.5 * 36e5 + plusDays * 864e5).toISOString().slice(0, 10);
}

export const now = () => new Date().toISOString();

export async function all(db, sql, ...args) {
  const r = await db.prepare(sql).bind(...args).all();
  return r.results || [];
}

export async function first(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).first()) || null;
}

export async function run(db, sql, ...args) {
  return db.prepare(sql).bind(...args).run();
}

export async function audit(db, who, action, detail) {
  try { await run(db, "INSERT INTO audit (at, who, action, detail) VALUES (?, ?, ?, ?)", now(), who || "system", action, typeof detail === "string" ? detail : JSON.stringify(detail)); } catch {}
}
