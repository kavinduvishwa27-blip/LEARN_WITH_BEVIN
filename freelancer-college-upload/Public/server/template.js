// Template engine used at the edge to fill page templates with live content.
// It must behave exactly like the Python engine in build.py (same syntax, same output).
//
//   {{ path }}  escaped value      {{{ path }}}  raw HTML (tokens inside are rendered too)
//   {{url path}} URL encoded        {{json path}} JSON literal
//   {{#each list}} ... {{else}} ... {{/each}}   (@index @number @first @last, this)
//   {{#if path}} ... {{else}} ... {{/if}}        {{#unless path}} ... {{/unless}}

const TAG = /\{\{\{\s*([\w.@-]+)\s*\}\}\}|\{\{\s*(?:(#each|#if|#unless)\s+([\w.@-]+)|(\/each|\/if|\/unless|else)|(json|url)\s+([\w.@-]+)|([\w.@-]+))\s*\}\}/g;
const MISSING = Symbol("missing");

export function parse(text) {
  const root = [];
  const stack = [{ nodes: root }];
  let pos = 0;
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(text))) {
    if (m.index > pos) stack[stack.length - 1].nodes.push(["text", text.slice(pos, m.index)]);
    pos = TAG.lastIndex;
    const [src, raw, kind, bpath, close, filt, fpath, v] = m;
    const top = stack[stack.length - 1];
    if (raw) top.nodes.push(["var", "raw", raw, src]);
    else if (filt) top.nodes.push(["var", filt, fpath, src]);
    else if (v) top.nodes.push(["var", "esc", v, src]);
    else if (kind) {
      const block = { kind: kind.slice(1), path: bpath, body: [], else: [], start: m.index };
      block.nodes = block.body;
      stack.push(block);
    } else if (close === "else") {
      if (stack.length > 1) top.nodes = top.else;
      else top.nodes.push(["text", src]);
    } else {
      if (stack.length === 1 || top.kind !== close.slice(1)) throw new Error(`Unexpected ${src}`);
      const b = stack.pop();
      stack[stack.length - 1].nodes.push(["block", b.kind, b.path, b.body, b.else, text.slice(b.start, TAG.lastIndex)]);
    }
  }
  if (stack.length > 1) throw new Error(`Unclosed {{#${stack[stack.length - 1].kind} ${stack[stack.length - 1].path}}}`);
  if (pos < text.length) root.push(["text", text.slice(pos)]);
  return root;
}

function resolve(path, scopes) {
  const parts = path.split(".");
  let cur = MISSING;
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) { cur = scopes[i][parts[0]]; break; }
  }
  if (cur === MISSING) return MISSING;
  for (const p of parts.slice(1)) {
    if (cur && typeof cur === "object" && !Array.isArray(cur) && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else if (Array.isArray(cur) && /^\d+$/.test(p) && +p < cur.length) cur = cur[+p];
    else return null;
  }
  return cur;
}

export function truthy(v) {
  if (v === null || v === undefined || v === false || v === "" || v === 0 || v === "false" || v === "0") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function toStr(v) {
  if (v === null || v === undefined) return "";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function renderNodes(nodes, scopes, lenient, depth = 0) {
  let out = "";
  for (const n of nodes) {
    if (n[0] === "text") { out += n[1]; continue; }
    if (n[0] === "var") {
      const [, mode, path, src] = n;
      let v = resolve(path, scopes);
      if (v === MISSING) { if (lenient) out += src; continue; }
      if (typeof v === "string" && (mode === "raw" || mode === "json") && v.includes("{{") && depth < 2) {
        v = renderNodes(parse(v), scopes, lenient, depth + 1);
      }
      if (mode === "raw") out += toStr(v);
      else if (mode === "json") out += JSON.stringify(v === null || v === undefined ? "" : v).replace(/<\//g, "<\\/");
      else if (mode === "url") out += encodeURIComponent(toStr(v));
      else out += esc(toStr(v));
      continue;
    }
    const [, kind, path, body, other, src] = n;
    let v = resolve(path, scopes);
    if (v === MISSING && lenient) { out += src; continue; }
    if (v === MISSING) v = null;
    if (kind === "each") {
      const items = Array.isArray(v) ? v : [];
      if (!items.length) out += renderNodes(other, scopes, lenient, depth);
      items.forEach((item, i) => {
        out += renderNodes(body, [...scopes, { this: item, "@index": i, "@number": i + 1, "@first": i === 0, "@last": i === items.length - 1 }], lenient, depth);
      });
    } else {
      const ok = kind === "if" ? truthy(v) : !truthy(v);
      out += renderNodes(ok ? body : other, scopes, lenient, depth);
    }
  }
  return out;
}

const cache = new Map();
export function render(text, ctx, lenient = false) {
  let tree = cache.get(text);
  if (!tree) {
    tree = parse(text);
    if (cache.size > 200) cache.clear();
    cache.set(text, tree);
  }
  return renderNodes(tree, [ctx], lenient);
}

/* ---------- Content helpers (keep in sync with normalize() in build.py) ---------- */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function unescapeHtml(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    const map = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (map[e.toLowerCase()]) return map[e.toLowerCase()];
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return m;
  });
}

export function stripTags(s) {
  s = String(s || "").replace(/<(script|style)[\s\S]*?<\/\1>/g, " ");
  s = s.replace(/<[^>]+>/g, " ").replace(/\{\{[\s\S]*?\}\}/g, " ");
  return unescapeHtml(s).replace(/\s+/g, " ").trim();
}

export function dateHuman(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m || +m[2] < 1 || +m[2] > 12) return iso || "";
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WHEN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/;

/** "2026-11-20T19:30:00+05:30" or "2026-11-20" (Sri Lanka time when no zone is given). Same as parse_when() in build.py.
 *  The date parts returned are always in Sri Lanka time, whatever zone was written. */
export function parseWhen(s) {
  const m = WHEN.exec(String(s ?? "").trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return null;
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCMonth() !== mo - 1 || day.getUTCFullYear() !== y) return null;
  const timed = m[4] !== undefined;
  const h = timed ? +m[4] : 0, mi = timed ? +m[5] : 0;
  const tz = m[6] || "+05:30";
  const off = tz === "Z" ? 0 : (tz[0] === "+" ? 1 : -1) * (+tz.slice(1, 3) * 60 + +tz.slice(4, 6));
  const ms = day.getTime() + (h * 3600 + mi * 60 - off * 60) * 1000;
  const sl = new Date(ms + 19800000); // Sri Lanka wall clock
  return { ms, y: sl.getUTCFullYear(), mo: sl.getUTCMonth() + 1, d: sl.getUTCDate(), h: sl.getUTCHours(), mi: sl.getUTCMinutes(), timed, wd: (sl.getUTCDay() + 6) % 7 };
}

const slugify = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Published events with display dates, split into upcoming (soonest first) and past (latest first). */
export function normalizeEvents(items, nowMs) {
  const upcoming = [], past = [], used = new Set();
  (Array.isArray(items) ? items : []).forEach((e0, i) => {
    if (!e0 || typeof e0 !== "object" || Array.isArray(e0) || !truthy(e0.published === undefined ? true : e0.published)) return;
    const start = parseWhen(e0.starts_at);
    if (!start) return;
    const end = parseWhen(e0.ends_at);
    const endMs = end && end.ms > start.ms ? end.ms : start.ms + (start.timed ? 3 * 3600000 : 86400000);
    let slug = slugify(e0.title) || `event-${i + 1}`;
    while (used.has(slug)) slug += "-2";
    used.add(slug);
    const e = { ...e0 };
    for (const k of ["type", "place", "image", "summary", "notes", "button", "link"]) if (e[k] == null) e[k] = "";
    e.slug = slug;
    e.date_human = `${WEEKDAYS[start.wd]}, ${start.d} ${FULL_MONTHS[start.mo - 1]} ${start.y}`;
    e.time_human = start.timed ? `${start.h % 12 || 12}.${String(start.mi).padStart(2, "0")} ${start.h < 12 ? "am" : "pm"}` : "";
    e.day = String(start.d);
    e.month = MONTHS[start.mo - 1];
    e.start_ms = String(start.ms);
    e.ends_ms = String(endMs);
    e.past = endMs <= nowMs;
    e.live = start.ms <= nowMs && nowMs < endMs;
    (e.past ? past : upcoming).push(e);
  });
  const byStart = (a, b) => +a.start_ms - +b.start_ms;
  upcoming.sort(byStart); // stable, like Python's sort
  past.sort((a, b) => byStart(b, a));
  return { upcoming, past };
}

export function normalize(data, nowMs = Date.now()) {
  const d = structuredClone(data);
  const posts = [];
  for (const p0 of d.posts || []) {
    if (!truthy(p0.published === undefined ? true : p0.published)) continue;
    const p = { ...p0 };
    const words = stripTags(p.body || "").split(" ").filter(Boolean).length;
    p.url = "/blog/" + (p.slug || "") + "/";
    p.readtime = String(Math.max(1, Math.ceil(words / 220)));
    p.date_human = dateHuman(p.date || "");
    posts.push(p);
  }
  // stable sort, newest first (same as Python's sorted(..., reverse=True) on equal dates keeps order)
  d.posts = posts.map((p, i) => [p, i]).sort((a, b) => (a[0].date || "") < (b[0].date || "") ? 1 : (a[0].date || "") > (b[0].date || "") ? -1 : a[1] - b[1]).map((x) => x[0]);
  const { upcoming, past } = normalizeEvents(d.events, nowMs);
  d.events = upcoming;
  d.events_past = past.slice(0, 12);
  d.events_home = upcoming.filter((e) => truthy(e.featured === undefined ? true : e.featured)).slice(0, 3);
  return d;
}

/** Merge database rows over the defaults. Keys are "site.cohort" style paths or top level names. */
export function mergeContent(defaults, rows) {
  const d = structuredClone(defaults);
  for (const { key, value } of rows) {
    let v;
    try { v = typeof value === "string" ? JSON.parse(value) : value; } catch { continue; }
    const parts = key.split(".");
    let cur = d;
    for (const p of parts.slice(0, -1)) cur = cur[p] = cur[p] && typeof cur[p] === "object" ? cur[p] : {};
    const last = parts[parts.length - 1];
    // settings groups merge field by field so new default fields still appear
    cur[last] = v && typeof v === "object" && !Array.isArray(v) && cur[last] && typeof cur[last] === "object" && !Array.isArray(cur[last]) && parts[0] === "site"
      ? { ...cur[last], ...v }
      : v;
  }
  return d;
}
