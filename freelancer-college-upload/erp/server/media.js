// Images uploaded in the admin panel (events, pop-up, anything with an image field).
// They are stored in the database (D1) and served by the website at /media/<id>,
// so there is nothing extra to set up in Cloudflare. The panel shrinks every image
// before uploading, so each one stays well under D1's 2 MB row limit.
import { all, first, run, now, audit } from "./db.js";

export const MEDIA_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/avif": "avif" };
export const MAX_BASE64 = 1_450_000; // about 1 MB of image data
export const MEDIA_ID = /^[a-f0-9]{16}\.(webp|jpg|png|gif|avif)$/;

const randomId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function listMedia(env) {
  return all(env.DB, "SELECT id, name, type, size, width, height, created_at, created_by FROM media ORDER BY created_at DESC LIMIT 500");
}

export async function saveMedia(env, b, who) {
  const type = String(b.type || "").toLowerCase();
  const ext = MEDIA_TYPES[type];
  if (!ext) throw new Error("Please use a JPG, PNG, WebP, GIF or AVIF image.");
  const data = String(b.data || "").replace(/^data:[^,]*,/, "");
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("The image could not be read. Try another file.");
  if (data.length > MAX_BASE64) throw new Error("This image is too large. Please use one under 1 MB.");
  const id = `${randomId()}.${ext}`;
  const size = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  const name = String(b.name || "image").replace(/[\r\n]/g, " ").slice(0, 120);
  const width = Math.max(0, parseInt(b.width, 10) || 0);
  const height = Math.max(0, parseInt(b.height, 10) || 0);
  await run(env.DB,
    "INSERT INTO media (id, name, type, size, width, height, data, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, name, type, size, width, height, data, now(), who || "admin");
  await audit(env.DB, who, "media.upload", { id, name });
  return { id, url: `/media/${id}`, name, type, size, width, height };
}

export async function getMedia(env, id) {
  if (!MEDIA_ID.test(id)) return null;
  return first(env.DB, "SELECT id, type, data FROM media WHERE id = ?", id);
}

export async function deleteMedia(env, id, who) {
  const cur = await first(env.DB, "SELECT id, name FROM media WHERE id = ?", id);
  if (!cur) return false;
  await run(env.DB, "DELETE FROM media WHERE id = ?", id);
  await audit(env.DB, who, "media.delete", { id, name: cur.name });
  return true;
}

/** The image itself. Ids never change, so browsers and Cloudflare may keep it for a year. */
export function mediaResponse(row, { cache = true } = {}) {
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "Content-Type": row.type,
      "Cache-Control": cache ? "public, max-age=31536000, immutable" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
