// Runs in front of every request.
// Pages are served from their template, filled with the live content from the database,
// so anything saved in the admin panel shows on the public site within seconds.
// If the database is not connected (or anything fails), the pre-built page is served as is.
import { render, stripTags } from "./template.js";
import { getContent } from "./content.js";

const BYPASS = /^\/(api|admin|assets|media)(\/|$)/;

function templateFor(path, status) {
  if (status === 404) return "/_tpl/404.tpl";
  let p = decodeURIComponent(path);
  if (p.endsWith("/index.html")) p = p.slice(0, -10);
  if (p.endsWith(".html")) p = p.slice(0, -5);
  if (!p.endsWith("/")) p += "/";
  return p === "/" ? "/_tpl/index.tpl" : `/_tpl${p}index.tpl`;
}

async function asset(env, origin, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  return res.ok ? res.text() : null;
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;

  // Templates and raw content are internal
  if (path.startsWith("/_tpl/") || path.startsWith("/_data/")) return new Response("Not found", { status: 404 });
  if (!env.DB || request.method !== "GET" || BYPASS.test(path)) return next();

  const res = await next();
  try {
    if (path === "/search.json" && res.ok) return withPosts(await res.json(), env, url.origin, res);
    if (path === "/sitemap.xml" && res.ok) return sitemapWithPosts(await res.text(), env, url.origin, res);

    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html") || (res.status !== 200 && res.status !== 404)) return res;

    const data = await getContent(env, url.origin);
    let status = res.status;
    let tplPath = templateFor(path, status);
    let ctxData = data;

    // Blog posts come from the database, so new posts work without a rebuild
    const pm = /^\/blog\/([a-z0-9-]+)\/?$/.exec(path);
    if (pm) {
      const post = data.posts.find((p) => p.slug === pm[1]);
      if (post) { tplPath = "/_tpl/blog/_post.tpl"; ctxData = { ...data, post }; status = 200; }
      else { tplPath = "/_tpl/404.tpl"; status = 404; }
    }

    const tpl = await asset(env, url.origin, tplPath);
    if (tpl === null) return res;
    const headers = new Headers(res.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
    headers.delete("Content-Length");
    headers.delete("ETag");
    return new Response(render(tpl, ctxData), { status, headers });
  } catch (e) {
    console.log("live render failed, serving the pre-built page:", e && e.message);
    return res;
  }
}

async function withPosts(index, env, origin, res) {
  const data = await getContent(env, origin);
  const pages = index.filter((e) => e.k !== "Article");
  for (const p of data.posts) {
    pages.push({ t: p.title, d: p.description, u: p.url, h: [], x: stripTags(p.body).slice(0, 600), k: "Article" });
  }
  return new Response(JSON.stringify(pages), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" } });
}

async function sitemapWithPosts(xml, env, origin) {
  const data = await getContent(env, origin);
  const base = (data.site.url || origin).replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);
  const lines = xml.split("\n").filter((l) => !/\/blog\/[^<]+\/<\/loc>/.test(l) && l !== "</urlset>");
  for (const p of data.posts) lines.push(`  <url><loc>${base}${p.url}</loc><lastmod>${today}</lastmod></url>`);
  lines.push("</urlset>");
  return new Response(lines.join("\n"), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" } });
}
