/* Free tools: price calculator, USD/LKR visualiser, gig generator, portfolio checklist, skill quiz */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const FC = window.FC || { track() {}, toast() {}, store: { get() {}, set() {} }, SITE: {} };
  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const lkr = (n) => "LKR " + Math.round(n).toLocaleString("en-US");
  let rate = +(FC.SITE.fx?.usd_lkr_fallback || 300);
  const used = new Set();
  const trackUse = (tool) => { if (!used.has(tool)) { used.add(tool); FC.track("tool_used", { tool }); } };

  /* ---------- Tabs (synced with URL hash) ---------- */
  const tabs = $$("[data-tab]");
  const show = (name, focus) => {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      $("#t-" + t.dataset.tab).hidden = !on;
      if (on && focus) t.focus();
    });
    history.replaceState(null, "", "#" + name);
    window.ScrollTrigger?.refresh();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => show(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") show(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length].dataset.tab, true);
    });
  });
  const initial = location.hash.slice(1);
  if (tabs.some((t) => t.dataset.tab === initial)) show(initial);

  const paintRange = (r) => r.style.setProperty("--p", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
  $$('input[type="range"]').forEach((r) => { paintRange(r); r.addEventListener("input", () => paintRange(r)); });

  // Live exchange rate (falls back to the value in site.json)
  fetch("https://open.er-api.com/v6/latest/USD").then((r) => r.json()).then((j) => {
    if (j?.rates?.LKR) { rate = j.rates.LKR; }
    const el = $("[data-fx-rate]");
    if (el) el.textContent = `1 USD = ${rate.toFixed(2)} LKR ${j?.rates?.LKR ? "(live rate, " + new Date(j.time_last_update_unix * 1000).toLocaleDateString() + ")" : "(estimate)"}`;
    calcPrice(); calcFx();
  }).catch(() => { const el = $("[data-fx-rate]"); if (el) el.textContent = `1 USD ≈ ${rate} LKR (estimate)`; });

  /* ---------- Price calculator ---------- */
  let level = 12;
  $$('[data-seg="level"] button').forEach((b) => b.addEventListener("click", () => {
    $$('[data-seg="level"] button').forEach((x) => x.setAttribute("aria-pressed", x === b));
    level = +b.dataset.v; calcPrice(); trackUse("price_calculator");
  }));
  const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
  function calcPrice() {
    const mult = +$("#pc-skill").value, hours = +$("#pc-hours").value, target = +$("#pc-target").value;
    const hourly = level * mult;
    const std = round5(hourly * hours), basic = round5(std * 0.55), prem = round5(std * 1.9);
    $("#pc-hours-o").textContent = hours + " h";
    $("#pc-target-o").textContent = usd(target);
    $('[data-pkg="basic"]').textContent = usd(basic);
    $('[data-pkg="standard"]').textContent = usd(std);
    $('[data-pkg="premium"]').textContent = usd(prem);
    $('[data-out="hourly"]').textContent = usd(hourly) + "/h";
    $('[data-out="hourly-lkr"]').textContent = lkr(hourly * rate) + " per hour";
    const orders = Math.ceil(target / std);
    $('[data-out="orders"]').textContent = orders;
    const hoursNeeded = orders * hours;
    $('[data-out="advice"]').innerHTML = hoursNeeded > 170
      ? `⚠️ That is about <b style="color:#fff">${hoursNeeded} hours</b> a month. Raise your prices or level up your skill instead of working more.`
      : `✓ About <b style="color:#fff">${hoursNeeded} hours</b> of client work a month. Very doable. That is <b style="color:#fff">${lkr(target * rate)}</b> a month.`;
  }
  ["#pc-skill", "#pc-hours", "#pc-target"].forEach((s) => $(s).addEventListener("input", () => { calcPrice(); trackUse("price_calculator"); }));
  $("[data-copy-prices]").addEventListener("click", async () => {
    const t = `Basic ${$('[data-pkg="basic"]').textContent} | Standard ${$('[data-pkg="standard"]').textContent} | Premium ${$('[data-pkg="premium"]').textContent}`;
    try { await navigator.clipboard.writeText(t); FC.toast("Prices copied"); } catch {}
  });
  calcPrice();

  /* ---------- USD to LKR ---------- */
  function calcFx() {
    const u = +$("#fx-usd").value, local = Math.max(0, +$("#fx-local").value || 0);
    const l = u * rate;
    $("#fx-usd-o").textContent = usd(u);
    $('[data-fx="lkr"]').textContent = lkr(l);
    $('[data-fx="x"]').textContent = local ? `That is ${(l / local).toFixed(1)}x the local salary you entered.` : "";
    const max = Math.max(l, local, 1);
    $('[data-bar="local"]').style.width = (local / max) * 100 + "%";
    $('[data-bar="free"]').style.width = (l / max) * 100 + "%";
    $('[data-fx="local"]').textContent = (local / 1000).toFixed(0) + "k";
    $('[data-fx="free"]').textContent = (l / 1000).toFixed(0) + "k";
    $('[data-fx="year"]').textContent = lkr(l * 12);
    $('[data-fx="extra"]').textContent = lkr(Math.max(0, (l - local) * 12));
  }
  ["#fx-usd", "#fx-local"].forEach((s) => $(s).addEventListener("input", () => { calcFx(); trackUse("fx_visualiser"); }));
  calcFx();

  /* ---------- Gig generator ---------- */
  const gigForm = $("#gig-form");
  const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  function localGig({ skill, niche, audience }) {
    const s = skill.toLowerCase().replace(/ui\/ux/g, "UI/UX").replace(/figma/g, "Figma"), n = niche ? niche.toLowerCase() : "", a = audience || "small businesses";
    const titles = [
      `I will design a modern ${s}${n ? " for " + n : ""} that converts`,
      `I will create a clean, user friendly ${s}${/figma/i.test(s) ? "" : " in Figma"}`,
      `I will redesign your ${n || "website or app"} with professional ${s}`,
      `I will deliver ${s} with fast turnaround and unlimited revisions`,
      `I will craft a ${s} that helps ${a.toLowerCase()} win customers`,
    ].map((t) => t.length > 80 ? t.slice(0, 77).replace(/\s+\S*$/, "") : t);
    const desc = `Need ${s}${n ? " for " + n : ""} that looks professional and actually works for your users?\n\nI design clear, modern ${s} built around your goals, not just good looks. You get:\n• A layout based on how your users think\n• Clean, organised Figma files that developers love\n• Mobile and desktop ready designs\n• Clear communication and on time delivery\n\nI focus on ${a.toLowerCase()} who want work that brings results. Message me before ordering and tell me about your project. I will reply with ideas, not a template.`;
    const tags = [s, n || "figma design", "ui ux design", "website design", "app design"].slice(0, 5);
    return { titles, description: desc, tags };
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function renderGig(out, src) {
    $('[data-gig="titles"]').innerHTML = out.titles.map((t) => `<li><span>${esc(t)}</span><button class="copy-btn" type="button" data-t="${esc(t)}">Copy</button></li>`).join("");
    $('[data-gig="desc"]').textContent = out.description;
    $('[data-gig="tags"]').innerHTML = out.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    $('[data-gig="src"]').textContent = src;
    $$('[data-gig="titles"] .copy-btn').forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.t); FC.toast("Title copied"); } catch {} }));
  }
  gigForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(gigForm).entries());
    const msg = $(".form-msg", gigForm), btn = $("button", gigForm);
    if ((data.skill || "").trim().length < 2) { msg.className = "form-msg err"; msg.textContent = "Tell us your skill first."; return; }
    btn.disabled = true; btn.innerHTML = "Writing your gig..."; msg.textContent = "";
    trackUse("gig_generator");
    try {
      const r = await fetch("/api/gig-titles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "fail");
      renderGig(j, "Written by AI. Edit to match your real skills and experience.");
    } catch {
      renderGig(localGig(data), "Generated from proven templates. Edit to match your real skills and experience.");
    }
    btn.disabled = false; btn.innerHTML = 'Generate again <span class="arrow">✨</span>';
  });

  /* ---------- Portfolio checklist ---------- */
  const boxes = $$("[data-checklist] input");
  const saved = FC.store.get("fc_checklist") || [];
  boxes.forEach((b) => { b.checked = saved.includes(b.value); b.addEventListener("change", () => { updateScore(); trackUse("portfolio_checklist"); }); });
  function updateScore() {
    const on = boxes.filter((b) => b.checked);
    FC.store.set("fc_checklist", on.map((b) => b.value));
    const score = Math.round((on.length / boxes.length) * 100);
    $("[data-score]").textContent = score;
    $("[data-ring]").style.strokeDashoffset = 439.8 * (1 - score / 100);
    const [title, text] = score >= 85 ? ["Client ready.", "Your portfolio covers the essentials. Time to pitch with confidence and price higher."]
      : score >= 50 ? ["Getting there.", "Good base. Fill the gaps above and your conversion rate will jump."]
      : score > 0 ? ["Needs work.", "Most buyers decide in seconds. A focused, case study style portfolio changes everything."]
      : ["Let's build it.", "Tick the items your portfolio already has."];
    $("[data-score-title]").textContent = title;
    $("[data-score-text]").textContent = text;
  }
  $("[data-reset-checklist]").addEventListener("click", () => { boxes.forEach((b) => (b.checked = false)); updateScore(); });
  updateScore();

  /* ---------- Skill quiz ---------- */
  const Q = [
    { q: "What sounds most fun on a Saturday?", a: [["Redesigning an app I use every day", { ux: 3 }], ["Making posters and brand logos", { gfx: 3 }], ["Setting up a server or fixing a computer", { tech: 3 }], ["Editing a TikTok or YouTube video", { vid: 3 }]] },
    { q: "Which of these do you notice first?", a: [["Confusing buttons and bad navigation", { ux: 3 }], ["Ugly fonts and clashing colors", { gfx: 2, ux: 1 }], ["A slow website or broken link", { tech: 2, ux: 1 }], ["A boring video intro", { vid: 3 }]] },
    { q: "How do you like to solve problems?", a: [["Talk to people, then find the real problem", { ux: 3 }], ["Try visual ideas until one looks right", { gfx: 3 }], ["Follow logic step by step", { tech: 3 }], ["Tell a story that makes people feel", { vid: 2, gfx: 1 }]] },
    { q: "What kind of client work would you enjoy?", a: [["Designing a startup's mobile app", { ux: 3 }], ["Creating a full brand identity", { gfx: 3 }], ["Managing Linux servers for a company", { tech: 3 }], ["Editing ads for an online store", { vid: 3 }]] },
    { q: "How much time can you give each week?", a: [["10+ hours, I'm serious about this", { ux: 1, tech: 1, commit: 2 }], ["5 to 10 hours", { commit: 1 }], ["Less than 5 hours for now", {}], ["Full time, I want this to be my career", { commit: 3, ux: 1 }]] },
    { q: "What matters most to you?", a: [["High income from international clients", { ux: 2, tech: 1 }], ["Creative freedom", { gfx: 2, vid: 1 }], ["Stable remote job skills", { tech: 3 }], ["Growing my own online brand", { vid: 2, gfx: 1 }]] },
  ];
  const R = {
    ux: { name: "UI/UX Design", emoji: "🎨", text: "You think about people and problems, not just pixels. UI/UX is one of the highest paying design skills on Fiverr and Upwork, and it rewards exactly how you think.", course: "Designer X", url: "/courses/designer-x" },
    gfx: { name: "Visual and Brand Design", emoji: "✏️", text: "You have a strong eye for how things look. The fastest way to turn that into dollars is pairing it with UI/UX, so your visuals solve business problems too.", course: "Designer X", url: "/courses/designer-x" },
    tech: { name: "Linux and Tech Skills", emoji: "💻", text: "You love logic and systems. Linux fundamentals open doors to DevOps, server work and remote tech jobs that pay in USD.", course: "Linux Master", url: "/courses/linux-master" },
    vid: { name: "Video and Content", emoji: "🎬", text: "You are a storyteller. Video is in demand, and designers who understand layout and branding stand out. Start with the design foundations.", course: "the 90 Day UI/UX Path", url: "/learning-paths" },
  };
  let step = 0, score = {};
  const body = $("[data-quiz-body]"), bar = $("[data-quiz-bar]");
  function renderQ() {
    bar.style.width = (step / Q.length) * 100 + "%";
    const item = Q[step];
    body.innerHTML = `<div class="quiz-q"><p class="eyebrow no-line">Question ${step + 1} of ${Q.length}</p><h3 class="mt-1">${item.q}</h3><div class="quiz-opts">${item.a.map((a, i) => `<button type="button" data-i="${i}">${a[0]}</button>`).join("")}</div></div>`;
    $$(".quiz-opts button", body).forEach((b) => b.addEventListener("click", () => {
      Object.entries(item.a[+b.dataset.i][1]).forEach(([k, v]) => (score[k] = (score[k] || 0) + v));
      step++; trackUse("skill_quiz");
      step < Q.length ? renderQ() : renderResult();
    }));
  }
  function renderResult() {
    bar.style.width = "100%";
    const best = ["ux", "gfx", "tech", "vid"].sort((a, b) => (score[b] || 0) - (score[a] || 0))[0];
    const r = R[best];
    body.innerHTML = `<div class="center stack" style="gap:16px">
      <div style="font-size:64px;line-height:1">${r.emoji}</div>
      <p class="eyebrow no-line" style="justify-self:center">Your best fit</p>
      <h2>${r.name}</h2>
      <p class="lead" style="margin-inline:auto">${r.text}</p>
      <div class="row" style="justify-content:center"><a class="btn btn-primary btn-lg" href="${r.url}">Start with ${r.course} →</a><button class="btn btn-ghost btn-lg" type="button" data-restart>Retake quiz</button></div>
      <div class="card mt-3" style="text-align:left" data-form-wrap>
        <form class="form" data-lead-form data-type="quiz" data-magnet="skill-quiz" novalidate>
          <input type="hidden" name="result" value="${r.name}">
          <h4>Get your result + the free roadmap for ${r.name}</h4>
          <div class="form-row">
            <div class="field"><label for="qz-name">Name</label><input id="qz-name" name="name" autocomplete="name"><span class="field-error"></span></div>
            <div class="field"><label for="qz-phone">WhatsApp</label><input id="qz-phone" name="phone" inputmode="tel" placeholder="07X XXX XXXX" required><span class="field-error"></span></div>
          </div>
          <button class="btn btn-primary" type="submit">Send me the roadmap</button>
          <p class="form-msg" role="status" aria-live="polite"></p>
        </form>
        <div class="form-success"><div class="tick">✓</div><h3>Sent!</h3><p class="muted">Check WhatsApp for your roadmap.</p></div>
      </div></div>`;
    $("[data-restart]", body).addEventListener("click", () => { step = 0; score = {}; renderQ(); });
    // Wire the dynamically created lead form through the global handler
    window.FCbindForms?.(body);
    FC.track("tool_used", { tool: "skill_quiz_complete", result: best });
  }
  renderQ();
});
