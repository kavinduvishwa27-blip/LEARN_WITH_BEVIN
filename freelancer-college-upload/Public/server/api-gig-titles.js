// POST /api/gig-titles
// Free tool: generates Fiverr gig titles, a description and tags with Claude.
// Needs the ANTHROPIC_API_KEY secret. Without it the page falls back to a local template generator.
import { json, clean, rateLimited } from "./shared.js";

const SCHEMA = {
  type: "object",
  properties: {
    titles: { type: "array", items: { type: "string" }, description: "5 Fiverr gig titles, each starting with 'I will', max 80 characters" },
    description: { type: "string", description: "A gig description of 120 to 180 words" },
    tags: { type: "array", items: { type: "string" }, description: "5 search tags, lowercase, 1 to 3 words each" },
  },
  required: ["titles", "description", "tags"],
  additionalProperties: false,
};

const SYSTEM = `You write Fiverr gig copy for new freelancers from Sri Lanka who sell to international clients.
Rules:
- Titles start with "I will", stay under 80 characters, and name a concrete outcome the buyer gets.
- Be specific about the niche and deliverable. No hype words like "best", "amazing", "top quality", and no emoji.
- Never use em dashes.
- The description speaks to the buyer's problem first, then what they get, then why this seller, then a clear call to message.
- Write in clear, simple international English.`;

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "AI generator not configured" }, 501);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, ip, "gig", 10, 3600)) return json({ ok: false, error: "Hourly limit reached. Try again later." }, 429);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const skill = clean(b.skill, 80), niche = clean(b.niche, 80), audience = clean(b.audience, 80), extra = clean(b.extra, 300);
  if (skill.length < 2) return json({ ok: false, error: "Tell us your skill." }, 422);

  const prompt = `Skill: ${skill}\nNiche: ${niche || "any"}\nIdeal buyer: ${audience || "small businesses and startups"}\nExtra details: ${extra || "none"}\n\nWrite 5 gig titles, one gig description and 5 tags.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": String(env.ANTHROPIC_API_KEY).trim(), // a pasted key may carry a stray space or line break
      "anthropic-version": "2023-06-01",
      // Server-side fallback: if a request is declined, the API retries on a fallback model in the same call
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.log("Claude API error", res.status, await res.text().catch(() => ""));
    return json({ ok: false, error: "Generator is busy. Try again in a moment." }, 502);
  }
  const msg = await res.json();
  if (msg.stop_reason === "refusal") return json({ ok: false, error: "Could not generate for that input. Try rewording it." }, 422);

  const text = (msg.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  try {
    const out = JSON.parse(text);
    return json({
      ok: true,
      titles: (out.titles || []).slice(0, 5).map((t) => String(t).replace(/—/g, ",")),
      description: String(out.description || "").replace(/—/g, ","),
      tags: (out.tags || []).slice(0, 5),
    });
  } catch {
    return json({ ok: false, error: "Could not read the result. Try again." }, 502);
  }
}

export const onRequest = () => json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
