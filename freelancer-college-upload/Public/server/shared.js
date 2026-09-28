// Shared helpers for Cloudflare Pages Functions (not a route: exports no onRequest handler).

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

export const clean = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalisePhone(v) {
  const s = clean(v, 30).replace(/[\s\-()]/g, "");
  if (/^(?:\+94|0094|94|0)?7\d{8}$/.test(s)) return "+94" + s.slice(-9);
  if (/^\+\d{8,15}$/.test(s)) return s;
  return "";
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");

/** Optional Cloudflare Turnstile check. Skipped when TURNSTILE_SECRET is not set. */
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  return !!j.success;
}

/** Simple per-IP rate limit using the optional LEADS KV binding. */
export async function rateLimited(env, ip, key, limit = 8, windowSec = 600) {
  if (!env.LEADS || !ip) return false;
  const k = `rl:${key}:${ip}`;
  const n = parseInt((await env.LEADS.get(k)) || "0", 10);
  if (n >= limit) return true;
  await env.LEADS.put(k, String(n + 1), { expirationTtl: windowSec });
  return false;
}

/** Fan out an event to every configured destination. Each one is optional. */
export async function dispatch(env, record) {
  const jobs = [];

  if (env.N8N_WEBHOOK_URL) {
    jobs.push(fetch(env.N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(env.N8N_WEBHOOK_SECRET ? { "X-Webhook-Secret": env.N8N_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify(record),
    }));
  }

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const table = record.type === "payment" ? "payments" : "leads";
    jobs.push(fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(table === "leads"
        ? { name: record.name, phone: record.phone, email: record.email || null, source: record.type, magnet: record.magnet, utm: record.utm, tags: [record.type, record.magnet].filter(Boolean), raw: record }
        : { provider: record.provider, amount: record.amount, currency: record.currency, status: record.status, raw: record }),
    }));
  }

  if (env.LEADS) {
    jobs.push(env.LEADS.put(`${record.type}:${record.ts}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 180 }));
  }

  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    const rows = Object.entries(record)
      .filter(([k]) => !["utm", "raw"].includes(k))
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`)
      .join("");
    jobs.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.FROM_EMAIL || "Freelancer College <onboarding@resend.dev>",
        to: env.NOTIFY_EMAIL.split(",").map((s) => s.trim()),
        subject: `New ${record.type}: ${record.name || record.email || record.phone || ""} (${record.magnet || record.page || ""})`,
        html: `<table style="font-family:sans-serif;font-size:14px">${rows}</table><pre style="font-size:12px;color:#666">${esc(JSON.stringify(record.utm || {}))}</pre>`,
      }),
    }));
  }

  const results = await Promise.allSettled(jobs);
  return { destinations: jobs.length, failed: results.filter((r) => r.status === "rejected" || (r.value && r.value.ok === false)).length };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* MD5 (needed for PayHere hashes; Web Crypto has no MD5). Public domain algorithm. */
export function md5(str) {
  const bytes = new TextEncoder().encode(str);
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const len = bytes.length, nBlocks = ((len + 8) >> 6) + 1;
  const M = new Uint32Array(nBlocks * 16);
  for (let i = 0; i < len; i++) M[i >> 2] |= bytes[i] << ((i % 4) * 8);
  M[len >> 2] |= 0x80 << ((len % 4) * 8);
  M[nBlocks * 16 - 2] = (len * 8) >>> 0;
  M[nBlocks * 16 - 1] = Math.floor((len * 8) / 2 ** 32);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let b = 0; b < nBlocks; b++) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const s = S[(i >> 4) * 4 + (i % 4)];
      const tmp = D; D = C; C = B;
      const x = (A + F + K[i] + M[b * 16 + g]) >>> 0;
      B = (B + ((x << s) | (x >>> (32 - s)))) >>> 0;
      A = tmp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
}
