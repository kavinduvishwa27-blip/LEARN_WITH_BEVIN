// Admin authentication. Two ways in (set at least one in Cloudflare settings):
//
//  1. Cloudflare Access (recommended): protect /admin* and /api/admin* with an Access
//     application, then set ACCESS_TEAM_DOMAIN (e.g. "yourteam.cloudflareaccess.com")
//     and ACCESS_AUD (the application's AUD tag). Optionally ADMIN_EMAILS="a@x.com,b@y.com".
//  2. Admin password: set the secret ADMIN_PASSWORD. The panel asks for it on login.

const enc = new TextEncoder();

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** Compare secrets without leaking timing information. */
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

let certs = null;
async function accessKeys(team) {
  if (certs && Date.now() - certs.at < 3600_000) return certs.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  const { keys } = await res.json();
  certs = { at: Date.now(), keys };
  return keys;
}

async function verifyAccessJwt(token, env) {
  try {
    const [h, p, s] = token.split(".");
    const header = JSON.parse(new TextDecoder().decode(b64url(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
    const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), enc.encode(`${h}.${p}`));
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!ok || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    return payload.email || null;
  } catch {
    return null;
  }
}

function emailAllowed(email, env) {
  if (!env.ADMIN_EMAILS) return true;
  return env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).includes(String(email).toLowerCase());
}

/** Returns { user, method } for a signed-in admin, otherwise null. */
export async function verifyAdmin(request, env) {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (jwt && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const email = await verifyAccessJwt(jwt, env);
    if (email && emailAllowed(email, env)) return { user: email, method: "access" };
  }
  const auth = request.headers.get("Authorization") || "";
  if (env.ADMIN_PASSWORD && auth.startsWith("Bearer ")) {
    if (await safeEqual(auth.slice(7), env.ADMIN_PASSWORD)) return { user: "admin", method: "password" };
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
  }
  return null;
}

export function authMethods(env) {
  return {
    access: !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
    password: !!env.ADMIN_PASSWORD,
  };
}
