// Local preview only. When there is no server API (e.g. `py build.py serve`), the admin panel
// runs the real admin API code in the browser against an SQLite database (sql.js),
// saved in this browser's localStorage. Nothing here runs on the live site.

const SQLJS = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/";
const KEY = "fc_admin_preview_db";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement("script"), { src, onload: resolve, onerror: () => reject(new Error("Could not load " + src)) });
    document.head.append(s);
  });
}

// Minimal Cloudflare D1 lookalike on top of sql.js
function d1(db) {
  const clean = (args) => args.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, clean(a)),
    async all() {
      const st = db.prepare(sql);
      st.bind(args);
      const results = [];
      while (st.step()) results.push(st.getAsObject());
      st.free();
      return { results, success: true };
    },
    async first() { return (await this.all()).results[0] || null; },
    async run() {
      db.run(sql, args);
      const id = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] ?? null;
      return { success: true, meta: { last_row_id: id, changes: db.getRowsModified() } };
    },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

export async function createDemo() {
  const [{ handleAdmin }, business] = await Promise.all([import("./dev/admin-api.js"), import("./dev/business.js")]);
  await loadScript(SQLJS + "sql-wasm.js");
  const SQL = await window.initSqlJs({ locateFile: (f) => SQLJS + f });
  let db;
  try {
    const saved = localStorage.getItem(KEY);
    db = saved ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0))) : new SQL.Database();
  } catch { db = new SQL.Database(); }
  const env = { DB: d1(db), ADMIN_PASSWORD: "demo" };
  const persist = () => {
    const bytes = db.export();
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    try { localStorage.setItem(KEY, btoa(s)); } catch {}
  };

  const handle = async (request) => {
    const res = await handleAdmin(request, env, location.origin);
    if (request.method !== "GET") persist();
    return res;
  };

  handle.seed = async () => {
    const o = location.origin;
    const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
    const samples = [
      { type: "webinar", name: "Kasun Perera", phone: "+94771234567", email: "kasun@example.com", magnet: "webinar", page: "/webinar/" },
      { type: "lead", name: "Nadeesha Silva", phone: "+94712345678", email: "nadeesha@example.com", magnet: "roadmap", page: "/free-resources/" },
      { type: "contact", name: "Ruwan Jayasinghe", phone: "+94751112233", email: "ruwan@example.com", message: "Can I join Designer X if I only have a phone and a slow laptop?", page: "/contact/" },
      { type: "quiz", name: "Tharushi Fernando", phone: "+94769876543", magnet: "skill-quiz", result: "UI/UX Design", page: "/tools/" },
      { type: "notify", phone: "+94701231234", magnet: "linux-master", page: "/courses/linux-master/" },
      { type: "business", name: "Chamath Wickramasinghe", email: "chamath@company.lk", company: "Acme Digital", team_size: "11 to 30", message: "We want a 2 day Figma workshop for our product team.", page: "/for-business/" },
    ];
    for (const s of samples) await business.saveLead(env, o, { ...s, ts: day(Math.random() * 10) });
    const enrolls = [
      { type: "enroll", name: "Dilshan Rathnayake", phone: "+94772223344", email: "dilshan@example.com", plan: "full", method: "bank", reference: "FCX-DEMO1", course: "designer-x" },
      { type: "enroll", name: "Ishara Madushani", phone: "+94713334455", email: "ishara@example.com", plan: "deposit", method: "bank", reference: "FCX-DEMO2", course: "designer-x" },
      { type: "enroll", name: "Sachini Gunawardena", phone: "+94764445566", email: "sachini@example.com", plan: "full", method: "card", reference: "FCX-DEMO3", course: "designer-x" },
    ];
    for (const e of enrolls) await business.saveLead(env, o, e);
    persist();
  };
  handle.reset = async () => { localStorage.removeItem(KEY); };
  return handle;
}
