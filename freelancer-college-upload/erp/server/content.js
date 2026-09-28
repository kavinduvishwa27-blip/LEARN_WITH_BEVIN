// Live website content: defaults from the build, overridden by what was saved in the admin panel.
import { ensureSchema, all, first, run, now } from "./db.js";
import { mergeContent, normalize } from "./template.js";

const TTL_MS = 10_000; // other visitors see an edit within ~10 seconds
let cache = null; // { at, raw, data }
let defaultsCache = null;

export function invalidateContent() { cache = null; }

async function loadDefaults(env, origin) {
  if (defaultsCache) return defaultsCache;
  const url = new URL("/_data/defaults.json", origin);
  const res = env.ASSETS ? await env.ASSETS.fetch(new Request(url)) : await fetch(url);
  if (!res.ok) throw new Error("defaults.json not found");
  defaultsCache = await res.json();
  return defaultsCache;
}

/** Raw content (for the admin panel). */
export async function getRawContent(env, origin) {
  const defaults = await loadDefaults(env, origin);
  if (!env.DB) return { defaults, raw: defaults, rows: [] };
  await ensureSchema(env.DB);
  const rows = await all(env.DB, "SELECT key, value, updated_at, updated_by FROM content");
  return { defaults, raw: mergeContent(defaults, rows), rows };
}

/** Content ready for templates (derived fields added). Cached briefly. */
export async function getContent(env, origin) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const { raw } = await getRawContent(env, origin);
  const data = normalize(raw);
  cache = { at: Date.now(), data };
  return data;
}

/** Which keys the admin may write: "site.<group>" for settings, or a collection name. */
export function isEditableKey(key, defaults) {
  if (/^site\.[a-z_]+$/.test(key)) return Object.prototype.hasOwnProperty.call(defaults.site, key.slice(5));
  return key !== "site" && Object.prototype.hasOwnProperty.call(defaults, key);
}

export async function saveContent(env, key, value, who) {
  await ensureSchema(env.DB);
  await run(env.DB,
    "INSERT INTO content (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    key, JSON.stringify(value), now(), who || "admin");
  invalidateContent();
}

export async function resetContent(env, key) {
  await ensureSchema(env.DB);
  await run(env.DB, "DELETE FROM content WHERE key = ?", key);
  invalidateContent();
}

/** Current value of one settings group, e.g. getSetting(env, origin, "cohort"). */
export async function getSetting(env, origin, group) {
  const { raw } = await getRawContent(env, origin);
  return raw.site[group] || {};
}

export async function readContentRow(env, key) {
  await ensureSchema(env.DB);
  return first(env.DB, "SELECT key, value, updated_at, updated_by FROM content WHERE key = ?", key);
}
