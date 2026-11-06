// GET /media/<id>: images uploaded in the admin panel, served from the database.
// Cached at Cloudflare's edge after the first view, so the database is read only once per image.
import { ensureSchema } from "./db.js";
import { getMedia, mediaResponse, MEDIA_ID } from "./media.js";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const id = String(params.id || "");
  if (!MEDIA_ID.test(id) || !env.DB) return notFound();

  const edge = globalThis.caches?.default;
  if (edge) {
    const hit = await edge.match(request);
    if (hit) return hit;
  }
  await ensureSchema(env.DB);
  const row = await getMedia(env, id);
  if (!row) return notFound();
  const res = mediaResponse(row);
  if (edge) ctx.waitUntil(edge.put(request, res.clone()));
  return res;
}
