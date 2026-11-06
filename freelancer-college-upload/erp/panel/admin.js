// Freelancer College admin panel (no build step, plain ES modules).
import { SECTIONS } from "./schema.js";

/* ============================================================ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); };
const fmtDay = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); };
const money = (n, cur = "LKR") => `${cur} ${Number(n || 0).toLocaleString("en-US")}`;
const waLink = (phone) => { const d = String(phone || "").replace(/\D/g, ""); return d ? `https://wa.me/${d}` : ""; };
const LABELS = { new: "New", contacted: "Contacted", interested: "Interested", enrolled: "Enrolled", not_interested: "Not interested", pending: "Awaiting payment", deposit: "Deposit paid", paid: "Paid in full", cancelled: "Cancelled" };
const TYPES = { lead: "Free resource", newsletter: "Newsletter", webinar: "Webinar", contact: "Contact form", business: "Business inquiry", notify: "Waitlist", enroll: "Enrollment", quiz: "Skill quiz", seat: "Booking started" };
const slToday = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
const dueBadge = (e) => {
  if (e.status !== "deposit" || !e.balance_due) return "";
  const days = Math.round((Date.parse(e.balance_due) - Date.parse(slToday())) / 864e5);
  const when = fmtDay(e.balance_due + "T12:00:00");
  if (days < 0) return `<div class="sub" style="color:var(--brand);font-weight:700">Overdue since ${when}</div>`;
  if (days <= 3) return `<div class="sub" style="color:var(--amber);font-weight:700">Balance due ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} (${when})</div>`;
  return `<div class="sub">Balance due ${when}</div>`;
};
const statusBadge = (s) => `<span class="badge s-${esc(s)}">${esc(LABELS[s] || s)}</span>`;

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
  leads: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  enroll: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 4-2 5-4 5zM14 21c3 0 7-1 7-8V5h-7v7h4c0 4-2 5-4 5z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  bank: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-7 10 7z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  chev: '<path d="M9 18l6-6-6-6"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>', menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;

let toastT;
function toast(msg, err) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = "toast"), 3200);
}

/* ============================================================ API */
const state = { token: sessionStorage.getItem("fc_admin_token") || "", demo: null, content: null, dirty: false, stats: null };

async function api(path, { method = "GET", body, raw } = {}) {
  const init = { method, headers: {} };
  if (state.token) init.headers.Authorization = "Bearer " + state.token;
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const req = new Request("/api/admin/" + path, init);
  const res = state.demo ? await state.demo(req) : await fetch(req);
  if (raw) { if (!res.ok) throw new Error("Request failed"); return res; }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(data.methods || {}); throw new Error("Not signed in"); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function download(path, fallbackName) {
  try {
    const res = await api(path, { raw: true });
    const blob = await res.blob();
    const name = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || fallbackName;
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { toast(e.message, true); }
}

/* ============================================================ boot & login */
async function boot() {
  let auth = null;
  try {
    const r = await fetch("/api/admin/auth");
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) auth = await r.json();
  } catch {}
  if (!auth) {
    // No server API here (local preview): run against an in-browser database
    try {
      const { createDemo } = await import("./demo.js");
      state.demo = await createDemo();
      state.token = state.token || "";
      auth = await (await state.demo(new Request("/api/admin/auth"))).json();
    } catch (e) {
      $("#app").innerHTML = `<div class="login"><div class="card"><h1>Admin unavailable</h1><p class="muted">The admin API could not be reached. ${esc(e.message)}</p></div></div>`;
      return;
    }
  }
  try {
    await api("me");
    await start();
  } catch (e) {
    if (e.message !== "Not signed in") $("#app").innerHTML = `<div class="login"><div class="card"><h1>Something went wrong</h1><p class="muted">${esc(e.message)}</p></div></div>`;
  }
}

function showLogin(methods) {
  const noAuth = !methods.password && !methods.access;
  $("#app").innerHTML = `
    <div class="login"><div class="card">
      <div class="brand" style="padding:0">${logoSvg()}<span>Freelancer College<small>Admin panel</small></span></div>
      ${state.demo ? `<div class="notice">Local preview. The password is <b>demo</b>.</div>` : ""}
      ${noAuth ? `<h1>Set up admin access</h1><p class="muted">No login method is configured yet. In Cloudflare Pages, open your project, go to <b>Settings &gt; Variables and Secrets</b> and add a secret named <b>ADMIN_PASSWORD</b>. Then redeploy and reload this page.</p>` : `
        <h1>Sign in</h1>
        ${methods.password ? `<form class="grid" id="login-form">
          <label class="field"><span class="lbl">Admin password</span><input class="input" type="password" name="pw" autocomplete="current-password" required autofocus></label>
          <button class="btn btn-dark" type="submit">Sign in</button>
          <p class="small muted" id="login-msg"></p>
        </form>` : `<p class="muted">This panel is protected by Cloudflare Access. Reload the page to sign in with your email.</p>`}`}
    </div></div>`;
  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.token = e.target.pw.value;
    try {
      await api("me");
      sessionStorage.setItem("fc_admin_token", state.token);
      await start();
    } catch { $("#login-msg").textContent = "Wrong password."; state.token = ""; }
  });
}

const logoSvg = () => `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#c81e27"/><path d="M10 9l12 14M22 9L10 23" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>`;

/* ============================================================ shell */
async function start() {
  state.me = await api("me");
  state.content = await api("content");
  renderShell();
  addEventListener("hashchange", route);
  addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
  route();
  refreshBadges();
}

function renderShell() {
  const groups = {};
  SECTIONS.forEach((s) => (groups[s.group] = groups[s.group] || []).push(s));
  $("#app").innerHTML = `
    ${state.demo ? `<div class="demo-bar"><b>Local preview</b><span>Changes are saved in this browser only. Deploy to Cloudflare to use the real database.</span><button data-demo-seed>Add sample leads & enrollments</button><button data-demo-reset>Reset preview data</button></div>` : ""}
    <div class="app">
      <aside class="side" id="side">
        <a class="brand" href="#/dashboard">${logoSvg()}<span>Freelancer College<small>Admin</small></span></a>
        <a class="nav-a" href="#/dashboard" data-nav="dashboard">${icon("dashboard")}Dashboard</a>
        <a class="nav-a" href="#/leads" data-nav="leads">${icon("leads")}Leads<span class="badge" data-badge="leads" hidden></span></a>
        <a class="nav-a" href="#/enrollments" data-nav="enrollments">${icon("enroll")}Enrollments<span class="badge" data-badge="enrollments" hidden></span></a>
        <a class="nav-a" href="#/media" data-nav="media">${icon("image")}Images</a>
        ${Object.entries(groups).map(([g, list]) => `<div class="nav-group">${esc(g)}</div>${list.map((s) => `<a class="nav-a" href="#/content/${s.id}" data-nav="content/${s.id}">${icon(s.icon)}${esc(s.title)}</a>`).join("")}`).join("")}
        <div class="nav-group">System</div>
        <a class="nav-a" href="#/activity" data-nav="activity">${icon("clock")}Activity log</a>
        <a class="nav-a" href="#/setup" data-nav="setup">${icon("gear")}Setup & backup</a>
        <div class="side-foot"><span>Signed in as <b>${esc(state.me.user)}</b></span><a href="/" target="_blank" rel="noopener">View website ↗</a>${state.me.method === "password" ? `<button class="btn btn-line btn-sm" data-logout>Sign out</button>` : ""}</div>
      </aside>
      <div class="main">
        <header class="top"><button class="menu-btn" data-menu aria-label="Menu">${icon("menu")}</button><h1 id="title">Dashboard</h1><div class="grow"></div><div id="top-actions" class="row"></div></header>
        <div class="page" id="page"></div>
      </div>
    </div>
    <div class="savebar" id="savebar"><span class="msg">You have unsaved changes</span><button class="btn btn-line" data-discard>Discard</button><button class="btn btn-dark" data-save>Save & publish</button></div>`;
  $("[data-menu]").addEventListener("click", () => $("#side").classList.toggle("open"));
  $("[data-logout]")?.addEventListener("click", () => { sessionStorage.removeItem("fc_admin_token"); location.reload(); });
  $("[data-demo-seed]")?.addEventListener("click", async () => { await state.demo.seed(); toast("Sample data added"); route(); refreshBadges(); });
  $("[data-demo-reset]")?.addEventListener("click", async () => { if (confirm("Delete all preview data in this browser?")) { await state.demo.reset(); location.reload(); } });
}

async function refreshBadges() {
  try {
    const s = await api("stats");
    state.stats = s;
    const set = (k, n) => { const b = $(`[data-badge="${k}"]`); if (b) { b.hidden = !n; b.textContent = n; } };
    set("leads", s.leads_new);
    set("enrollments", s.enrollments.pending || 0);
  } catch {}
}

let lastHash = location.hash;
async function route() {
  if (state.dirty && location.hash !== lastHash) {
    if (!confirm("You have unsaved changes. Leave without saving?")) { history.replaceState(null, "", lastHash); return; }
    setDirty(false);
  }
  lastHash = location.hash;
  const h = location.hash.replace(/^#\/?/, "") || "dashboard";
  $$(".nav-a").forEach((a) => a.classList.toggle("on", a.dataset.nav === h));
  $("#side")?.classList.remove("open");
  $("#top-actions").innerHTML = "";
  const page = $("#page");
  page.innerHTML = `<div class="spinner"></div>`;
  window.scrollTo(0, 0);
  try {
    if (h === "dashboard") await viewDashboard(page);
    else if (h === "leads") await viewLeads(page);
    else if (h === "enrollments") await viewEnrollments(page);
    else if (h === "activity") await viewActivity(page);
    else if (h === "media") await viewMedia(page);
    else if (h === "setup") await viewSetup(page);
    else if (h.startsWith("content/")) viewContent(page, SECTIONS.find((s) => s.id === h.slice(8)));
    else page.innerHTML = `<div class="empty">Page not found.</div>`;
  } catch (e) {
    page.innerHTML = `<div class="notice red">${esc(e.message)}</div>`;
  }
}

const setTitle = (t) => { $("#title").textContent = t; document.title = `${t} | Admin`; };

/* ============================================================ dashboard */
async function viewDashboard(page) {
  setTitle("Dashboard");
  const s = await api("stats");
  state.stats = s;
  const e = s.enrollments || {};
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const per = Object.fromEntries((s.leads_per_day || []).map((r) => [r.day, r.n]));
  const max = Math.max(1, ...days.map((d) => per[d] || 0));
  const seats = +s.seats || 0, left = +s.seats_left || 0;
  page.innerHTML = `
    <div class="kpis">
      <div class="card kpi"><div class="l">Leads, last 7 days</div><div class="n">${s.leads_7d}</div><a href="#/leads">${s.leads_total} total →</a></div>
      <div class="card kpi"><div class="l">New leads to contact</div><div class="n">${s.leads_new}</div><a href="#/leads">Open leads →</a></div>
      <div class="card kpi"><div class="l">Awaiting payment</div><div class="n">${e.pending || 0}</div><a href="#/enrollments">Review →</a></div>
      <div class="card kpi"${s.balances_overdue ? ' style="border-color:rgba(200,30,39,.4)"' : ""}><div class="l">Overdue balances</div><div class="n"${s.balances_overdue ? ' style="color:var(--brand)"' : ""}>${s.balances_overdue || 0}</div><a href="#/enrollments" data-overdue-link>${s.balances_due_soon ? `${s.balances_due_soon} due in 3 days · ` : ""}View →</a></div>
      <div class="card kpi"><div class="l">Collected</div><div class="n" style="font-size:24px">${money(s.revenue, s.currency)}</div><span class="small muted">${money(s.outstanding, s.currency)} outstanding</span></div>
      <div class="card kpi"><div class="l">${esc(s.cohort)} seats</div><div class="n">${left}<span class="muted" style="font-size:16px"> / ${seats} left</span></div><div class="progress"><i style="width:${seats ? Math.round(((seats - left) / seats) * 100) : 0}%"></i></div></div>
    </div>
    <div class="two" style="margin-top:16px">
      <div class="card pad">
        <div class="section-title"><h2>Leads per day</h2><span class="small muted">last 14 days</span></div>
        <div class="bars">${days.map((d) => `<div class="b" style="height:${Math.round(((per[d] || 0) / max) * 100)}%" title="${d}: ${per[d] || 0}"><span>${per[d] || ""}</span></div>`).join("")}</div>
        <div class="bars-x">${days.map((d, i) => `<span>${i % 2 ? "" : +d.slice(8)}</span>`).join("")}</div>
      </div>
      <div class="card pad">
        <div class="section-title"><h2>Quick edits</h2></div>
        <div class="list-rows">
          <a href="#/content/cohort"><span>Batch dates, prices & seats</span><span class="muted">→</span></a>
          <a href="#/content/events"><span>Add or edit an event</span><span class="muted">→</span></a>
          <a href="#/content/popup"><span>Pop-up announcement</span><span class="muted">→</span></a>
          <a href="#/content/webinar"><span>Next webinar</span><span class="muted">→</span></a>
          <a href="#/content/posts"><span>Write a blog post</span><span class="muted">→</span></a>
          <a href="#/content/faqs"><span>FAQs</span><span class="muted">→</span></a>
        </div>
      </div>
    </div>
    <div class="two" style="margin-top:16px">
      <div class="card pad"><div class="section-title"><h2>Latest leads</h2><a class="small" href="#/leads">All →</a></div>
        ${s.recent_leads.length ? `<div class="list-rows">${s.recent_leads.map((l) => `<a href="#/leads" data-open-lead="${l.id}"><span><b>${esc(l.name || l.email || l.phone || "Unknown")}</b><br><span class="small muted">${esc(TYPES[l.type] || l.type)} · ${fmtDate(l.created_at)}</span></span>${statusBadge(l.status)}</a>`).join("")}</div>` : `<div class="empty">No leads yet. Form submissions from the website appear here.</div>`}
      </div>
      <div class="card pad"><div class="section-title"><h2>Latest enrollments</h2><a class="small" href="#/enrollments">All →</a></div>
        ${s.recent_enrollments.length ? `<div class="list-rows">${s.recent_enrollments.map((r) => `<a href="#/enrollments"><span><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.reference)} · ${money(r.amount_paid, s.currency)} of ${money(r.amount_due, s.currency)}</span></span>${statusBadge(r.status)}</a>`).join("")}</div>` : `<div class="empty">No enrollments yet.</div>`}
      </div>
    </div>`;
  $$("[data-open-lead]", page).forEach((a) => a.addEventListener("click", () => sessionStorage.setItem("fc_open_lead", a.dataset.openLead)));
  $("[data-overdue-link]", page)?.addEventListener("click", () => sessionStorage.setItem("fc_enroll_filter", "overdue"));
}

/* ============================================================ leads */
async function viewLeads(page) {
  setTitle("Leads");
  const f = { q: "", status: "", type: "", offset: 0, limit: 50 };
  $("#top-actions").innerHTML = `<button class="btn btn-line btn-sm" data-export>Export CSV</button>`;
  $("[data-export]").addEventListener("click", () => download(`leads.csv?${new URLSearchParams({ q: f.q, status: f.status, type: f.type })}`, "leads.csv"));
  page.innerHTML = `
    <div class="toolbar">
      <input class="input search" type="search" placeholder="Search name, phone, email, message" data-f="q">
      <select class="input" data-f="status" style="width:auto"><option value="">All statuses</option>${["new", "contacted", "interested", "enrolled", "not_interested"].map((s) => `<option value="${s}">${LABELS[s]}</option>`).join("")}</select>
      <select class="input" data-f="type" style="width:auto"><option value="">All sources</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    </div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Received</th><th>Name</th><th>Contact</th><th>Source</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div><div class="pager" id="pager"></div></div>`;
  let t;
  $$("[data-f]", page).forEach((el) => el.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f[el.dataset.f] = el.value.trim(); f.offset = 0; load(); }, 250); }));
  async function load() {
    const r = await api(`leads?${new URLSearchParams(f)}`);
    $("#rows").innerHTML = r.rows.length ? r.rows.map((l) => `
      <tr data-id="${l.id}">
        <td class="small">${fmtDate(l.created_at)}</td>
        <td><b>${esc(l.name || "(no name)")}</b>${l.message ? `<div class="sub">${esc(l.message.slice(0, 80))}${l.message.length > 80 ? "…" : ""}</div>` : ""}</td>
        <td>${esc(l.phone)}<div class="sub">${esc(l.email)}</div></td>
        <td>${esc(TYPES[l.type] || l.type)}<div class="sub">${esc(l.magnet)}</div></td>
        <td>${statusBadge(l.status)}</td>
      </tr>`).join("") : `<tr><td colspan="5"><div class="empty">No leads match.</div></td></tr>`;
    pager($("#pager"), r.total, f, load);
    $$("#rows tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openLead(+tr.dataset.id, load)));
  }
  await load();
  const openId = sessionStorage.getItem("fc_open_lead");
  if (openId) { sessionStorage.removeItem("fc_open_lead"); openLead(+openId, load); }
}

function pager(el, total, f, load) {
  const from = total ? f.offset + 1 : 0, to = Math.min(total, f.offset + f.limit);
  el.innerHTML = `<span>${from} to ${to} of ${total}</span><span class="row"><button class="btn btn-line btn-sm" data-p="-1" ${f.offset <= 0 ? "disabled" : ""}>Previous</button><button class="btn btn-line btn-sm" data-p="1" ${to >= total ? "disabled" : ""}>Next</button></span>`;
  $$("[data-p]", el).forEach((b) => b.addEventListener("click", () => { f.offset = Math.max(0, f.offset + +b.dataset.p * f.limit); load(); }));
}

function drawer(title, bodyHtml, footHtml) {
  $$(".drawer, .drawer-back").forEach((d) => d.remove());
  const back = Object.assign(document.createElement("div"), { className: "drawer-back" });
  const d = Object.assign(document.createElement("aside"), { className: "drawer" });
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-label", title);
  d.innerHTML = `<div class="drawer-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div><div class="drawer-body">${bodyHtml}</div><div class="drawer-foot">${footHtml}</div>`;
  document.body.append(back, d);
  requestAnimationFrame(() => { back.classList.add("show"); d.classList.add("show"); });
  const close = () => { back.classList.remove("show"); d.classList.remove("show"); setTimeout(() => { back.remove(); d.remove(); }, 300); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", close);
  $("[data-close]", d).addEventListener("click", close);
  return { el: d, close };
}

async function openLead(id, reload) {
  const l = await api(`leads/${id}`);
  let extra = {};
  try { extra = JSON.parse(l.data || "{}"); } catch {}
  const extraRows = Object.entries(extra).filter(([k, v]) => v && !["ts", "website", "ip_country"].includes(k) && typeof v !== "object");
  const wa = waLink(l.phone);
  const d = drawer(l.name || "Lead", `
    <dl class="kv">
      <dt>Received</dt><dd>${fmtDate(l.created_at)}</dd>
      <dt>Source</dt><dd>${esc(TYPES[l.type] || l.type)}${l.magnet ? ` · ${esc(l.magnet)}` : ""}</dd>
      <dt>Phone</dt><dd>${esc(l.phone) || "-"}</dd>
      <dt>Email</dt><dd>${esc(l.email) || "-"}</dd>
      <dt>Page</dt><dd>${esc(l.page) || "-"}</dd>
      ${l.message ? `<dt>Message</dt><dd style="white-space:pre-wrap">${esc(l.message)}</dd>` : ""}
      ${extraRows.map(([k, v]) => `<dt>${esc(k.replace(/_/g, " "))}</dt><dd>${esc(v)}</dd>`).join("")}
      ${extra.answers && typeof extra.answers === "object" ? `<dt style="grid-column:1/-1;margin-top:6px;color:var(--text);font-weight:700">Their answers</dt>${Object.entries(extra.answers).map(([q, a]) => `<dt>${esc(q)}</dt><dd><b>${esc(a)}</b></dd>`).join("")}` : ""}
      ${extra.utm && Object.keys(extra.utm).length ? `<dt>Campaign</dt><dd class="small">${esc(Object.entries(extra.utm).map(([k, v]) => `${k}: ${v}`).join(", "))}</dd>` : ""}
    </dl>
    <div class="row">${wa ? `<a class="btn btn-line btn-sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${l.email ? `<a class="btn btn-line btn-sm" href="mailto:${esc(l.email)}">Email</a>` : ""}${l.phone ? `<a class="btn btn-line btn-sm" href="tel:${esc(l.phone)}">Call</a>` : ""}</div>
    <label class="field"><span class="lbl">Status</span><select class="input" data-k="status">${["new", "contacted", "interested", "enrolled", "not_interested"].map((s) => `<option value="${s}" ${s === l.status ? "selected" : ""}>${LABELS[s]}</option>`).join("")}</select></label>
    <label class="field"><span class="lbl">Notes</span><textarea class="input" data-k="notes" rows="5" placeholder="Follow-up notes">${esc(l.notes)}</textarea></label>`,
    `<button class="btn btn-dark" data-save>Save</button><button class="btn btn-danger" data-del>Delete</button>`);
  $("[data-save]", d.el).addEventListener("click", async () => {
    try {
      await api(`leads/${id}`, { method: "PATCH", body: { status: $("[data-k=status]", d.el).value, notes: $("[data-k=notes]", d.el).value } });
      toast("Lead updated"); d.close(); reload(); refreshBadges();
    } catch (e) { toast(e.message, true); }
  });
  $("[data-del]", d.el).addEventListener("click", async () => {
    if (!confirm("Delete this lead permanently?")) return;
    try { await api(`leads/${id}`, { method: "DELETE" }); toast("Lead deleted"); d.close(); reload(); refreshBadges(); } catch (e) { toast(e.message, true); }
  });
}

/* ============================================================ enrollments */
async function viewEnrollments(page) {
  setTitle("Enrollments");
  const f = { q: "", status: "", offset: 0, limit: 50 };
  const cur = state.content.data.site.cohort.currency || "LKR";
  $("#top-actions").innerHTML = `<button class="btn btn-line btn-sm" data-export>Export CSV</button><button class="btn btn-dark btn-sm" data-new>New enrollment</button>`;
  $("[data-export]").addEventListener("click", () => download(`enrollments.csv?${new URLSearchParams({ q: f.q, status: f.status })}`, "enrollments.csv"));
  $("[data-new]").addEventListener("click", () => openEnrollment(null, load));
  page.innerHTML = `
    <div class="notice" style="margin-bottom:14px">When a student pays, open their enrollment and record the payment. The seat count on the website updates automatically.</div>
    <div class="toolbar">
      <input class="input search" type="search" placeholder="Search name, phone, email, reference" data-f="q">
      <select class="input" data-f="status" style="width:auto"><option value="">All statuses</option>${["pending", "deposit", "paid", "cancelled"].map((s) => `<option value="${s}">${LABELS[s]}</option>`).join("")}<option value="overdue">Overdue balances</option></select>
    </div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Reference</th><th>Plan</th><th>Paid</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div><div class="pager" id="pager"></div></div>`;
  let t;
  $$("[data-f]", page).forEach((el) => el.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f[el.dataset.f] = el.value.trim(); f.offset = 0; load(); }, 250); }));
  const preset = sessionStorage.getItem("fc_enroll_filter");
  if (preset) { sessionStorage.removeItem("fc_enroll_filter"); f.status = preset; $("[data-f=status]", page).value = preset; }
  async function load() {
    const r = await api(`enrollments?${new URLSearchParams(f)}`);
    $("#rows").innerHTML = r.rows.length ? r.rows.map((e) => `
      <tr data-id="${e.id}">
        <td class="small">${fmtDay(e.created_at)}</td>
        <td><b>${esc(e.name)}</b><div class="sub">${esc(e.phone)}</div></td>
        <td class="small">${esc(e.reference)}<div class="sub">${esc(e.cohort)}</div></td>
        <td>${e.plan === "deposit" ? "Deposit" : "Full"}<div class="sub">${e.method === "card" ? "Card" : "Bank transfer"}</div></td>
        <td>${money(e.amount_paid, cur)}<div class="sub">of ${money(e.amount_due, cur)}</div></td>
        <td>${statusBadge(e.status)}${dueBadge(e)}</td>
      </tr>`).join("") : `<tr><td colspan="6"><div class="empty">No enrollments match.</div></td></tr>`;
    pager($("#pager"), r.total, f, load);
    $$("#rows tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openEnrollment(+tr.dataset.id, load)));
  }
  await load();
}

async function openEnrollment(id, reload) {
  const cohort = state.content.data.site.cohort;
  const cur = cohort.currency || "LKR";
  const e = id ? await api(`enrollments/${id}`) : { name: "", phone: "", email: "", city: "", plan: "full", method: "bank", cohort: cohort.name, amount_due: +String(cohort.price_full || cohort.price_early).replace(/\D/g, ""), amount_paid: 0, status: "pending", notes: "", code: "" };
  const wa = waLink(e.phone);
  const input = (k, label, type = "text", half = true) => `<label class="field${half ? " half" : ""}"><span class="lbl">${label}</span><input class="input" type="${type}" data-k="${k}" value="${esc(e[k])}"></label>`;
  const d = drawer(id ? e.name : "New enrollment", `
    ${id ? `<dl class="kv"><dt>Reference</dt><dd><b>${esc(e.reference)}</b></dd><dt>Created</dt><dd>${fmtDate(e.created_at)}</dd><dt>Status</dt><dd>${statusBadge(e.status)}</dd><dt>Balance</dt><dd><b>${money(Math.max(0, e.amount_due - e.amount_paid), cur)}</b> still due${e.balance_due && e.status === "deposit" ? `<br><span class="small">by <b>${fmtDay(e.balance_due + "T12:00:00")}</b>${e.balance_due < slToday() ? ' <span class="badge s-interested">Overdue</span>' : ""}</span>` : ""}</dd></dl>
    <div class="row">${wa ? `<a class="btn btn-line btn-sm" href="${wa}?text=${encodeURIComponent(`Hi ${e.name.split(" ")[0]}, this is Freelancer College about your Designer X seat (${e.reference}).`)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${e.email ? `<a class="btn btn-line btn-sm" href="mailto:${esc(e.email)}">Email</a>` : ""}</div>
    <div class="card pad" style="background:#fcfbfa"><div class="lbl" style="font-weight:600;margin-bottom:8px">Record a payment</div><div class="money-row"><input class="input" type="number" min="0" step="100" placeholder="Amount received (${cur})" data-pay><button class="btn btn-dark" data-record>Record</button></div><p class="small muted" style="margin-top:6px">Adds to the amount paid and updates the status and seats automatically.</p></div>` : ""}
    <div class="form">
      ${input("name", "Full name", "text", false)}
      ${input("phone", "WhatsApp")}${input("email", "Email", "email")}
      ${input("city", "City")}${input("cohort", "Batch")}
      <label class="field half"><span class="lbl">Plan</span><select class="input" data-k="plan"><option value="full" ${e.plan === "full" ? "selected" : ""}>Pay in full</option><option value="deposit" ${e.plan === "deposit" ? "selected" : ""}>Seat deposit</option></select></label>
      <label class="field half"><span class="lbl">Method</span><select class="input" data-k="method"><option value="bank" ${e.method === "bank" ? "selected" : ""}>Bank transfer</option><option value="card" ${e.method === "card" ? "selected" : ""}>Card</option><option value="cash" ${e.method === "cash" ? "selected" : ""}>Cash</option></select></label>
      ${input("amount_due", `Course fee (${cur})`, "number")}${input("amount_paid", `Paid so far (${cur})`, "number")}
      ${input("code", "Coupon / referral")}
      ${id ? `<label class="field half"><span class="lbl">Balance due date</span><input class="input" type="date" data-k="balance_due" value="${esc(e.balance_due || "")}"><span class="hint">Set automatically to the batch balance date (${esc(cohort.balance_due_human || "")}). Change it here for this student only.</span></label>` : ""}
      <label class="field half"><span class="lbl">Status</span><select class="input" data-k="status">${["pending", "deposit", "paid", "cancelled"].map((s) => `<option value="${s}" ${s === e.status ? "selected" : ""}>${LABELS[s]}</option>`).join("")}</select></label>
      <label class="field"><span class="lbl">Notes</span><textarea class="input" data-k="notes" rows="4">${esc(e.notes)}</textarea></label>
    </div>`,
    `<button class="btn btn-dark" data-save>${id ? "Save changes" : "Create enrollment"}</button>${id ? `<button class="btn btn-danger" data-del>Delete</button>` : ""}`);
  const collect = () => Object.fromEntries($$("[data-k]", d.el).map((el) => [el.dataset.k, el.value]));
  const done = (msg, r) => { toast(msg + (r?.seatsLeft !== null && r?.seatsLeft !== undefined ? ` · ${r.seatsLeft} seats left on the website` : "")); d.close(); reload(); refreshBadges(); reloadContent(); };
  $("[data-save]", d.el).addEventListener("click", async () => {
    const body = collect();
    if (!body.name.trim()) return toast("Name is required", true);
    try {
      if (id) {
        // Only send what changed: a new paid amount recalculates the status, a manual status wins
        if (body.status === e.status) delete body.status;
        if (+body.amount_paid === +e.amount_paid) delete body.amount_paid;
        if ((body.balance_due || "") === (e.balance_due || "")) delete body.balance_due;
        done("Enrollment saved", await api(`enrollments/${id}`, { method: "PATCH", body }));
      } else {
        await api("enrollments", { method: "POST", body });
        done("Enrollment created");
      }
    } catch (err) { toast(err.message, true); }
  });
  $("[data-record]", d.el)?.addEventListener("click", async () => {
    const amt = +$("[data-pay]", d.el).value;
    if (!(amt > 0)) return toast("Enter the amount received", true);
    try { done(`Payment of ${money(amt, cur)} recorded`, await api(`enrollments/${id}`, { method: "PATCH", body: { amount_paid: e.amount_paid + amt } })); }
    catch (err) { toast(err.message, true); }
  });
  $("[data-del]", d.el)?.addEventListener("click", async () => {
    if (!confirm("Delete this enrollment? If it held a seat, the seat is given back.")) return;
    try { await api(`enrollments/${id}`, { method: "DELETE" }); done("Enrollment deleted"); } catch (err) { toast(err.message, true); }
  });
}

async function reloadContent() { try { state.content = await api("content"); } catch {} }

/* ============================================================ activity & setup */
async function viewActivity(page) {
  setTitle("Activity log");
  const r = await api("audit?limit=200");
  const NAMES = { "content.save": "Updated website content", "content.reset": "Reset content to default", "lead.update": "Updated a lead", "lead.delete": "Deleted a lead", "enrollment.create": "New enrollment", "enrollment.update": "Updated an enrollment", "enrollment.delete": "Deleted an enrollment", "media.upload": "Uploaded an image", "media.delete": "Deleted an image" };
  page.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>${r.rows.map((a) => {
    let det = a.detail;
    try { const o = JSON.parse(a.detail); det = typeof o === "object" ? Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(", ") : o; } catch {}
    if (a.action.startsWith("content.")) det = SECTIONS.find((s) => s.key === a.detail)?.title || det;
    return `<tr style="cursor:default"><td class="small">${fmtDate(a.at)}</td><td>${esc(a.who)}</td><td>${esc(NAMES[a.action] || a.action)}</td><td class="small muted">${esc(det)}</td></tr>`;
  }).join("") || `<tr><td colspan="4"><div class="empty">Nothing yet.</div></td></tr>`}</tbody></table></div></div>`;
}

async function viewSetup(page) {
  setTitle("Setup & backup");
  page.innerHTML = `
    <div class="grid" style="max-width:760px">
      <div class="card pad grid">
        <h2 style="font-size:17px">How publishing works</h2>
        <p class="muted">When you save a section, the website shows the change within about 10 seconds. There is no rebuild and nothing to upload. Sections you never edited keep using the built-in content.</p>
        <p class="muted">Tip: in FAQ answers, the Designer X intro and other text fields you can insert live values like <code>{{ site.cohort.price_early }}</code> or <code>{{ site.cohort.seats_left }}</code>, which stay in sync automatically.</p>
      </div>
      <div class="card pad grid">
        <h2 style="font-size:17px">Backup</h2>
        <p class="muted">Download everything (website content, leads, enrollments and payments) as one file. Keep a copy every month.</p>
        <div><button class="btn btn-dark" data-backup>Download backup</button></div>
      </div>
      <div class="card pad grid">
        <h2 style="font-size:17px">Signed in</h2>
        <p class="muted">You are signed in as <b>${esc(state.me.user)}</b> using ${state.me.method === "access" ? "Cloudflare Access" : "the admin password"}.</p>
      </div>
    </div>`;
  $("[data-backup]").addEventListener("click", () => download("backup", "backup.json"));
}

/* ============================================================ images */
// Images are made smaller in the browser before upload: at most 1600px wide and about 900 KB.
const MAX_BYTES = 900_000;
async function shrinkImage(file) {
  if (!/^image\//.test(file.type)) throw new Error("Please choose an image file (JPG, PNG, WebP or GIF).");
  // keep small GIFs as they are, so animations still play
  if (file.type === "image/gif" && file.size <= MAX_BYTES) return { blob: file, width: 0, height: 0 };
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("This image could not be opened. Try saving it as JPG or PNG first."));
      im.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  let max = 1600, q = 0.86, out = null, w = w0, h = h0;
  for (let i = 0; i < 7; i++) {
    const s = Math.min(1, max / Math.max(w0, h0));
    w = Math.max(1, Math.round(w0 * s)); h = Math.max(1, Math.round(h0 * s));
    const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
    const g = c.getContext("2d");
    const toBlob = (type) => new Promise((r) => c.toBlob(r, type, q));
    g.drawImage(src, 0, 0, w, h);
    out = await toBlob("image/webp");
    if (!out || out.type !== "image/webp") { // older Safari cannot make WebP
      g.globalCompositeOperation = "destination-over"; g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      out = await toBlob("image/jpeg");
    }
    if (out && out.size <= MAX_BYTES) break;
    q = Math.max(0.5, q - 0.08); max = Math.round(max * 0.85);
  }
  if (!out || out.size > MAX_BYTES * 1.5) throw new Error("This image is too large even after shrinking. Try a smaller one.");
  return { blob: out, width: w, height: h };
}
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => reject(new Error("The image could not be read."));
  r.readAsDataURL(blob);
});
async function uploadImage(file) {
  const { blob, width, height } = await shrinkImage(file);
  const name = file.name.replace(/\.[a-z0-9]+$/i, "") || "image";
  return api("media", { method: "POST", body: { name, type: blob.type, data: await blobToBase64(blob), width, height } });
}
// Local preview: /media/... only exists on Cloudflare, so previews load through the in-browser API
const previewUrls = new Map();
async function setImgSrc(img, url) {
  if (!(state.demo && /^\/media\//.test(url))) { img.src = url; return; }
  if (!previewUrls.has(url)) {
    try { previewUrls.set(url, URL.createObjectURL(await (await api(`media/${url.slice(7)}/file`, { raw: true })).blob())); }
    catch { return; }
  }
  img.src = previewUrls.get(url);
}
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const inUse = (url) => JSON.stringify(state.content?.data || {}).includes(url);

function mediaGrid(rows, { pickable } = {}) {
  return rows.length ? `<div class="media-grid">${rows.map((m) => `
    <figure class="media-item${pickable ? " pickable" : ""}" data-id="${esc(m.id)}" ${pickable ? 'tabindex="0" role="button"' : ""}>
      <div class="media-thumb"><img alt="" data-src="/media/${esc(m.id)}" loading="lazy"></div>
      <figcaption><b title="${esc(m.name)}">${esc(m.name || m.id)}</b><span class="small muted">${m.width ? `${m.width}×${m.height} · ` : ""}${kb(m.size)} · ${fmtDay(m.created_at)}</span>
      ${pickable ? "" : `<span class="row">${inUse(`/media/${m.id}`) ? `<span class="badge s-paid">In use</span>` : ""}<button class="btn btn-line btn-sm" data-copy="/media/${esc(m.id)}">Copy link</button><button class="btn btn-danger btn-sm" data-del="${esc(m.id)}">Delete</button></span>`}</figcaption>
    </figure>`).join("")}</div>` : `<div class="empty">No images yet. Upload one here, or with any image field (Events, Pop-up announcement).</div>`;
}
const loadThumbs = (root) => $$("img[data-src]", root).forEach((img) => setImgSrc(img, img.dataset.src));

async function viewMedia(page) {
  setTitle("Images");
  $("#top-actions").innerHTML = `<label class="btn btn-dark btn-sm">${icon("upload")}Upload images<input type="file" accept="image/*" multiple hidden data-up></label>`;
  const draw = async () => {
    const { rows } = await api("media");
    page.innerHTML = `<p class="muted" style="margin-bottom:16px">Every image you upload is stored here. Use them in Events and the Pop-up announcement, or copy a link to use anywhere on the site.</p><div class="card pad" data-drop-all>${mediaGrid(rows)}</div>`;
    loadThumbs(page);
    $$("[data-copy]", page).forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.origin + b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", location.origin + b.dataset.copy); }
    }));
    $$("[data-del]", page).forEach((b) => b.addEventListener("click", async () => {
      const used = inUse(`/media/${b.dataset.del}`);
      if (!confirm(used ? "This image is used on the website. Delete it anyway? It will disappear from those places." : "Delete this image?")) return;
      try { await api(`media/${b.dataset.del}`, { method: "DELETE" }); toast("Deleted"); draw(); } catch (e) { toast(e.message, true); }
    }));
  };
  const upAll = async (files) => {
    for (const f of files) {
      try { await uploadImage(f); toast(`Uploaded ${f.name}`); } catch (e) { toast(`${f.name}: ${e.message}`, true); }
    }
    draw();
  };
  $("[data-up]").addEventListener("change", (e) => { upAll([...e.target.files]); e.target.value = ""; });
  page.addEventListener("dragover", (e) => e.preventDefault());
  page.addEventListener("drop", (e) => { e.preventDefault(); upAll([...e.dataTransfer.files]); });
  await draw();
}

async function pickFromLibrary(onPick) {
  const d = drawer("Choose an image", `<div class="spinner"></div>`, `<span class="small muted">Click an image to use it.</span>`);
  try {
    const { rows } = await api("media");
    const body = $(".drawer-body", d.el);
    body.innerHTML = mediaGrid(rows, { pickable: true });
    loadThumbs(body);
    $$(".media-item", body).forEach((el) => {
      const go = () => { onPick(`/media/${el.dataset.id}`); d.close(); };
      el.addEventListener("click", go);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  } catch (e) { $(".drawer-body", d.el).innerHTML = `<div class="notice red">${esc(e.message)}</div>`; }
}

/* ============================================================ content editor */
const getAt = (data, key) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), data);

function setDirty(v) {
  state.dirty = v;
  $("#savebar")?.classList.toggle("show", v);
}

function viewContent(page, section) {
  if (!section) { page.innerHTML = `<div class="empty">Unknown section.</div>`; return; }
  setTitle(section.title);
  const original = getAt(state.content.data, section.key);
  let draft = clone(original) ?? (section.type === "list" ? [] : {});
  const upd = state.content.updated[section.key];
  if (section.view) $("#top-actions").innerHTML = `<a class="btn btn-line btn-sm" href="${section.view}" target="_blank" rel="noopener">View on website ${icon("ext").replace("<svg", '<svg width="14" height="14"')}</a>`;
  page.innerHTML = `
    <div class="section-meta">
      <div>${section.help ? `<p class="muted">${esc(section.help)}</p>` : ""}<p class="small dim" style="margin-top:4px">${upd ? `Last saved ${fmtDate(upd.at)} by ${esc(upd.by)}` : "Using the built-in content (never edited)."}</p></div>
      ${upd ? `<button class="btn btn-line btn-sm" data-reset>Restore original content</button>` : ""}
    </div>
    <div id="editor"></div>`;
  const ctx = { onChange: () => setDirty(true) };
  const editor = $("#editor");
  if (section.type === "list") editor.append(listEditor({ ...section, label: "" }, draft, ctx, section.derive));
  else {
    const card = document.createElement("div");
    card.className = "card pad";
    card.append(formFor(section.fields, draft, ctx, section.derive));
    editor.append(card);
  }

  $("[data-reset]", page)?.addEventListener("click", async () => {
    if (!confirm("Restore the original built-in content for this section? Your saved changes here will be removed.")) return;
    try { await api(`content/${section.key}`, { method: "DELETE" }); await reloadContent(); setDirty(false); toast("Restored"); route(); } catch (e) { toast(e.message, true); }
  });
  const bar = $("#savebar");
  bar.querySelector("[data-save]").onclick = async () => {
    const problem = validate(section, draft);
    if (problem) return toast(problem, true);
    const btn = bar.querySelector("[data-save]");
    btn.disabled = true; btn.textContent = "Publishing...";
    try {
      await api(`content/${section.key}`, { method: "PUT", body: { value: draft } });
      await reloadContent();
      setDirty(false);
      toast("Published. Live on the website within 10 seconds.");
      const u = state.content.updated[section.key];
      const meta = $(".section-meta .dim", page);
      if (meta && u) meta.textContent = `Last saved ${fmtDate(u.at)} by ${u.by}`;
    } catch (e) { toast(e.message, true); }
    btn.disabled = false; btn.textContent = "Save & publish";
  };
  bar.querySelector("[data-discard]").onclick = () => { setDirty(false); route(); };
}

function validate(section, v) {
  if (section.id === "events") {
    for (const e of v) {
      if (!e.title) return "Every event needs a name.";
      if (!e.starts_at) return `"${e.title}": please set when it starts.`;
      if (e.ends_at && e.ends_at < e.starts_at) return `"${e.title}": it ends before it starts.`;
    }
  }
  if (section.id === "posts") {
    const seen = new Set();
    for (const p of v) {
      if (!p.title) return "Every blog post needs a title.";
      if (!/^[a-z0-9-]+$/.test(p.slug || "")) return `"${p.title}": the URL slug may only use lowercase letters, numbers and dashes.`;
      if (seen.has(p.slug)) return `Two posts use the slug "${p.slug}".`;
      seen.add(p.slug);
    }
  }
  return null;
}

/* ----- form builder ----- */
function formFor(fields, obj, ctx, derive, deriveCtx) {
  const form = document.createElement("div");
  form.className = "form";
  const touched = deriveCtx?.touched || new Set();
  const refresh = () => {
    $$(":scope > .field[data-k]", form).forEach((el) => {
      const f = fields.find((x) => x.k === el.dataset.k);
      if (f?.showIf) el.hidden = !f.showIf(obj);
      const inp = el.querySelector(":scope > [data-input]");
      if (inp && document.activeElement !== inp && ["text", "number", "email", "url", "date", "textarea", "select", undefined].includes(f?.type)) {
        const val = obj[f.k] ?? "";
        if (inp.value !== String(val)) inp.value = val;
      }
    });
  };
  const fieldCtx = {
    onChange: (k) => {
      if (k) touched.add(k);
      if (derive && k) derive(obj, k, { touched, fresh: !!deriveCtx?.fresh });
      refresh();
      ctx.onChange(k);
    },
  };
  for (const f of fields) form.append(fieldEl(f, obj, fieldCtx, ctx));
  refresh();
  return form;
}

function fieldEl(f, obj, fctx, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "field" + (f.half ? " half" : "");
  wrap.dataset.k = f.k;
  const id = "f" + Math.random().toString(36).slice(2, 9);
  const label = f.label ? `<label for="${id}">${esc(f.label)}</label>` : "";
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : "";
  const val = obj[f.k];
  const set = (v) => { obj[f.k] = v; fctx.onChange(f.k); };

  switch (f.type) {
    case "list": {
      if (!Array.isArray(obj[f.k])) obj[f.k] = [];
      wrap.append(listEditor(f, obj[f.k], ctx));
      return wrap;
    }
    case "group": {
      if (!obj[f.k] || typeof obj[f.k] !== "object") obj[f.k] = {};
      const fs = document.createElement("div");
      fs.className = "fieldset";
      fs.innerHTML = `<div class="legend">${esc(f.label)}</div>`;
      fs.append(formFor(f.fields, obj[f.k], ctx));
      wrap.append(fs);
      return wrap;
    }
    case "bool": {
      wrap.innerHTML = `<span class="lbl">&nbsp;</span><label class="toggle"><input type="checkbox" id="${id}" ${val === true || val === "true" ? "checked" : ""}><span class="sw"></span><span>${esc(f.label)}</span></label>${hint}`;
      $("input", wrap).addEventListener("change", (e) => set(e.target.checked));
      return wrap;
    }
    case "textarea": {
      wrap.innerHTML = `${label}<textarea class="input" id="${id}" data-input rows="${f.rows || 3}" placeholder="${esc(f.placeholder || "")}"></textarea>${hint}`;
      const ta = $("textarea", wrap); ta.value = val ?? "";
      ta.addEventListener("input", () => set(ta.value));
      return wrap;
    }
    case "select": {
      const opts = [...new Set([...(f.options || []), ...(val && !(f.options || []).includes(val) ? [val] : [])])];
      wrap.innerHTML = `${label}<select class="input" id="${id}" data-input>${opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>${hint}`;
      const s = $("select", wrap); s.value = val ?? opts[0] ?? "";
      s.addEventListener("change", () => set(s.value));
      return wrap;
    }
    case "datetime": {
      wrap.innerHTML = `${label}<input class="input" type="datetime-local" id="${id}">${f.hint ? hint : `<span class="hint">Sri Lanka time</span>`}`;
      const inp = $("input", wrap); inp.value = String(val || "").slice(0, 16);
      inp.addEventListener("change", () => set(inp.value ? inp.value + ":00+05:30" : ""));
      return wrap;
    }
    case "color": {
      wrap.innerHTML = `${label}<div class="color-row"><input type="color" id="${id}"><input class="input" type="text" data-hex></div>${hint}`;
      const c = $("input[type=color]", wrap), t = $("[data-hex]", wrap);
      c.value = /^#[0-9a-f]{6}$/i.test(val) ? val : "#7f1d1d"; t.value = val || "";
      c.addEventListener("input", () => { t.value = c.value; set(c.value); });
      t.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; set(t.value); });
      return wrap;
    }
    case "tags": {
      if (!Array.isArray(obj[f.k])) obj[f.k] = [];
      wrap.innerHTML = `${label}<div class="tags-input"></div><span class="hint">${esc(f.hint || "Type and press Enter to add.")}</span>`;
      const box = $(".tags-input", wrap);
      const draw = () => {
        box.innerHTML = obj[f.k].map((t, i) => `<span class="tg">${esc(t)}<button type="button" data-i="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("") + `<input id="${id}" placeholder="Add tag">`;
        $$("button", box).forEach((b) => b.addEventListener("click", () => { obj[f.k].splice(+b.dataset.i, 1); draw(); fctx.onChange(f.k); }));
        const inp = $("input", box);
        inp.addEventListener("keydown", (e) => {
          if ((e.key === "Enter" || (e.key === "," && !f.allowCommas)) && inp.value.trim()) { e.preventDefault(); obj[f.k].push(inp.value.trim()); draw(); fctx.onChange(f.k); $("input", box).focus(); }
          if (e.key === "Backspace" && !inp.value && obj[f.k].length) { obj[f.k].pop(); draw(); fctx.onChange(f.k); $("input", box).focus(); }
        });
      };
      draw();
      return wrap;
    }
    case "image": {
      wrap.innerHTML = `${label}<div class="img-field">
          <div class="img-prev" data-drop tabindex="-1"><img alt="" hidden><span class="img-empty">${icon("image")}<span>Drop an image here, or upload one</span></span><span class="img-busy" hidden><span class="spinner sm"></span>Uploading...</span></div>
          <div class="img-side">
            <div class="row">
              <label class="btn btn-dark btn-sm">${icon("upload")}Upload image<input type="file" accept="image/*" hidden></label>
              <button type="button" class="btn btn-line btn-sm" data-lib>${icon("image")}Choose from library</button>
              <button type="button" class="btn btn-line btn-sm" data-rm>Remove</button>
            </div>
            <input class="input" type="text" id="${id}" data-url placeholder="Or paste an image link: https://...">
            ${hint}
          </div>
        </div>`;
      const img = $(".img-prev img", wrap), empty = $(".img-empty", wrap), busy = $(".img-busy", wrap), urlIn = $("[data-url]", wrap), rm = $("[data-rm]", wrap);
      const draw = () => {
        const v = obj[f.k] || "";
        urlIn.value = v;
        rm.hidden = !v;
        empty.hidden = !!v;
        img.hidden = !v;
        if (v) setImgSrc(img, v); else img.removeAttribute("src");
      };
      const pick = (url) => { set(url); draw(); };
      const upload = async (file) => {
        if (!file) return;
        busy.hidden = false;
        try { const r = await uploadImage(file); pick(r.url); toast("Image uploaded. Click Save & publish to put it on the website."); }
        catch (e) { toast(e.message, true); }
        busy.hidden = true;
      };
      $("input[type=file]", wrap).addEventListener("change", (e) => { upload(e.target.files[0]); e.target.value = ""; });
      $("[data-lib]", wrap).addEventListener("click", () => pickFromLibrary(pick));
      rm.addEventListener("click", () => pick(""));
      urlIn.addEventListener("change", () => pick(urlIn.value.trim()));
      const drop = $("[data-drop]", wrap);
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload(e.dataTransfer.files[0]); });
      draw();
      return wrap;
    }
    case "html": {
      wrap.innerHTML = `${label}`;
      wrap.append(richText(val || "", (html) => set(html)));
      if (hint) wrap.insertAdjacentHTML("beforeend", hint);
      return wrap;
    }
    default: {
      const type = { number: "number", email: "email", url: "url", date: "date" }[f.type] || "text";
      wrap.innerHTML = `${label}<input class="input" type="${type}" id="${id}" data-input placeholder="${esc(f.placeholder || "")}">${hint}`;
      const inp = $("input", wrap); inp.value = val ?? "";
      inp.addEventListener(f.format === "money" ? "change" : "input", () => {
        const v = f.type === "number" ? inp.value : inp.value;
        set(v === "" ? "" : String(v));
        if (f.pattern) wrap.classList.toggle("invalid", !new RegExp(f.pattern).test(inp.value));
      });
      if (f.format === "money") inp.addEventListener("input", () => { obj[f.k] = inp.value; ctx.onChange(); });
      return wrap;
    }
  }
}

/* ----- repeatable items ----- */
function listEditor(f, arr, ctx, derive) {
  const box = document.createElement("div");
  box.className = "list";
  const fresh = new WeakSet();
  const draw = (openIndex) => {
    box.innerHTML = `<div class="list-head">${f.label ? `<span class="lbl" style="font-weight:600">${esc(f.label)}</span>` : "<span></span>"}<span class="small muted">${arr.length} item${arr.length === 1 ? "" : "s"}</span></div>`;
    arr.forEach((item, i) => {
      const det = document.createElement("details");
      det.className = "item";
      if (i === openIndex) det.open = true;
      const title = () => (f.itemTitle ? f.itemTitle(item) : `Item ${i + 1}`);
      const sub = () => (f.itemSub ? f.itemSub(item) : "");
      det.innerHTML = `<summary><span class="chev">${icon("chev").replace("<svg", '<svg width="16" height="16"')}</span><span class="t"><b></b><small></small></span>
        <span class="acts"><button class="icon-btn" type="button" data-a="up" title="Move up" ${i === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-btn" type="button" data-a="down" title="Move down" ${i === arr.length - 1 ? "disabled" : ""}>${icon("down")}</button><button class="icon-btn" type="button" data-a="dup" title="Duplicate">${icon("copy")}</button><button class="icon-btn" type="button" data-a="del" title="Delete">${icon("trash")}</button></span></summary>`;
      const setHead = () => { $(".t b", det).textContent = title() || "(untitled)"; $(".t small", det).textContent = sub() || ""; };
      setHead();
      let built = false;
      const body = document.createElement("div");
      body.className = "item-body";
      det.append(body);
      const build = () => {
        if (built) return;
        built = true;
        body.append(formFor(f.fields, item, { onChange: () => { setHead(); ctx.onChange(); } }, derive, { fresh: fresh.has(item), touched: new Set() }));
      };
      if (det.open) build();
      det.addEventListener("toggle", () => det.open && build());
      $$("[data-a]", det).forEach((b) => b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const a = b.dataset.a;
        if (a === "up" && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(i - 1); }
        if (a === "down" && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; draw(i + 1); }
        if (a === "dup") { const c = clone(item); if (c.slug) c.slug += "-copy"; arr.splice(i + 1, 0, c); draw(i + 1); }
        if (a === "del") { if (!confirm(`Delete "${title() || "this item"}"?`)) return; arr.splice(i, 1); draw(); }
        ctx.onChange();
      }));
      box.append(det);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-line btn-sm add";
    add.textContent = "+ Add " + (f.addLabel || "item");
    add.addEventListener("click", () => {
      const n = f.newItem ? f.newItem() : {};
      fresh.add(n);
      arr.push(n);
      draw(arr.length - 1);
      ctx.onChange();
      box.lastElementChild.previousElementSibling?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    box.append(add);
  };
  draw();
  return box;
}

/* ----- rich text editor ----- */
function richText(html, onChange) {
  const box = document.createElement("div");
  box.className = "rte";
  box.innerHTML = `<div class="rte-bar">
      <button type="button" data-c="formatBlock" data-v="p" title="Paragraph">¶</button>
      <button type="button" data-c="formatBlock" data-v="h2" title="Heading">H2</button>
      <button type="button" data-c="formatBlock" data-v="h3" title="Subheading">H3</button>
      <span class="sep"></span>
      <button type="button" data-c="bold" title="Bold"><b>B</b></button>
      <button type="button" data-c="italic" title="Italic"><i>I</i></button>
      <button type="button" data-c="link" title="Link">🔗</button>
      <span class="sep"></span>
      <button type="button" data-c="insertUnorderedList" title="Bullet list">• List</button>
      <button type="button" data-c="insertOrderedList" title="Numbered list">1. List</button>
      <button type="button" data-c="formatBlock" data-v="blockquote" title="Quote">❝</button>
      <button type="button" data-c="callout" title="Highlight box">Box</button>
      <span class="sep"></span>
      <button type="button" data-c="removeFormat" title="Clear formatting">Clear</button>
      <button type="button" data-c="source" title="Edit HTML">&lt;/&gt; HTML</button>
    </div>
    <div class="rte-edit" contenteditable="true"></div>
    <textarea class="rte-src" hidden spellcheck="false"></textarea>`;
  const ed = $(".rte-edit", box), src = $(".rte-src", box);
  ed.innerHTML = html;
  const emit = () => onChange(ed.innerHTML.replace(/<p><br><\/p>/g, "").trim());
  ed.addEventListener("input", emit);
  ed.addEventListener("paste", (e) => {
    // paste as plain text to keep the site's styling clean
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  src.addEventListener("input", () => { ed.innerHTML = src.value; onChange(src.value); });
  $$("[data-c]", box).forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  $$("[data-c]", box).forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    if (c === "source") {
      const show = src.hidden;
      if (show) src.value = ed.innerHTML;
      src.hidden = !show; ed.hidden = show; b.classList.toggle("on", show);
      return;
    }
    ed.focus();
    if (c === "link") {
      const url = prompt("Link address (https://... or /page)");
      if (url) document.execCommand("createLink", false, url);
    } else if (c === "callout") {
      const text = window.getSelection()?.toString() || "Your highlighted note";
      document.execCommand("insertHTML", false, `<div class="callout">${esc(text)}</div><p></p>`);
    } else {
      document.execCommand(c, false, b.dataset.v ? `<${b.dataset.v}>` : null);
    }
    emit();
  }));
  return box;
}

boot();
