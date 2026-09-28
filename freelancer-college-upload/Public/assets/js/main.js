/* Freelancer College · global interactions
   Every feature degrades gracefully: if GSAP/Lenis fail to load, content still shows. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  let SITE = {};
  try { SITE = JSON.parse($("#fc-config")?.dataset.json || "{}"); } catch {}
  window.FC = { SITE, store, track, toast, reduce };
  window.FCbindForms = (root) => initForms(root);

  /* ---------- Analytics (after consent) ---------- */
  function track(event, params = {}) {
    try {
      if (window.gtag) window.gtag("event", event, params);
      if (window.fbq) {
        const map = { lead_submit: "Lead", webinar_register: "CompleteRegistration", begin_checkout: "InitiateCheckout", view_course: "ViewContent" };
        map[event] ? window.fbq("track", map[event], params) : window.fbq("trackCustom", event, params);
      }
      if (window.ttq) window.ttq.track(event, params);
    } catch {}
  }

  function loadAnalytics() {
    const a = SITE.analytics || {};
    const add = (src, cb) => { const s = document.createElement("script"); s.async = true; s.src = src; if (cb) s.onload = cb; document.head.appendChild(s); };
    if (a.ga4_id) {
      add(`https://www.googletagmanager.com/gtag/js?id=${a.ga4_id}`);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      gtag("js", new Date()); gtag("config", a.ga4_id);
    }
    if (a.meta_pixel_id) {
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", a.meta_pixel_id); fbq("track", "PageView");
    }
    if (a.clarity_id) {
      (function(c,l,a2,r,i,t,y){c[a2]=c[a2]||function(){(c[a2].q=c[a2].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",a.clarity_id);
    }
    if (a.tiktok_pixel_id) {
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=n;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(a.tiktok_pixel_id);ttq.page();}(window,document,"ttq");
    }
  }

  function initCookies() {
    const box = $("[data-cookie]");
    const choice = store.get("fc_consent");
    if (choice === "all") loadAnalytics();
    if (!choice && box) setTimeout(() => (box.hidden = false), 1200);
    $$("[data-cookie-choice]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.cookieChoice;
      store.set("fc_consent", v);
      box.hidden = true;
      if (v === "all") loadAnalytics();
    }));
    $$("[data-cookie-settings]").forEach((b) => b.addEventListener("click", () => { box.hidden = false; }));
  }

  /* ---------- UTM capture (first touch) ---------- */
  function captureUtm() {
    const p = new URLSearchParams(location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "fbclid", "ttclid"].forEach((k) => { if (p.get(k)) utm[k] = p.get(k).slice(0, 120); });
    if (Object.keys(utm).length && !store.get("fc_utm")) store.set("fc_utm", { ...utm, landing: location.pathname, at: new Date().toISOString() });
  }

  /* ---------- Toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $("[data-toast]");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- Nav ---------- */
  function initNav() {
    const nav = $("[data-nav]");
    if (!nav) return;
    let last = scrollY;
    const onScroll = () => {
      const y = scrollY;
      nav.classList.toggle("is-scrolled", y > 20);
      const menuOpen = document.body.classList.contains("menu-open");
      nav.classList.toggle("is-hidden", !menuOpen && y > 400 && y > last + 4);
      if (y < last - 4) nav.classList.remove("is-hidden");
      last = y;
      const bar = $(".scroll-progress span");
      if (bar) {
        const h = document.documentElement.scrollHeight - innerHeight;
        bar.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Active link
    const path = location.pathname.replace(/\/$/, "") || "/";
    $$(".nav-link[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (href !== "/" && path.startsWith(href)) a.setAttribute("aria-current", "page");
    });

    // Mega menu: hover on desktop, click for keyboard/touch
    $$(".has-menu").forEach((item) => {
      const btn = $("[data-menu-btn]", item);
      let t;
      const open = (v) => { item.classList.toggle("open", v); btn.setAttribute("aria-expanded", v); };
      item.addEventListener("mouseenter", () => { clearTimeout(t); open(true); });
      item.addEventListener("mouseleave", () => { t = setTimeout(() => open(false), 160); });
      btn.addEventListener("click", () => open(!item.classList.contains("open")));
      item.addEventListener("keydown", (e) => { if (e.key === "Escape") { open(false); btn.focus(); } });
      document.addEventListener("click", (e) => { if (!item.contains(e.target)) open(false); });
    });

    const burger = $("[data-burger]");
    burger?.addEventListener("click", () => {
      const open = !document.body.classList.contains("menu-open");
      document.body.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", open);
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      window.__lenis && (open ? window.__lenis.stop() : window.__lenis.start());
    });
    $$("[data-mobile-menu] a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));
  }

  /* ---------- Cursor ---------- */
  function initCursor() {
    if (!finePointer || reduce) return;
    document.body.classList.add("has-cursor");
    const c = $(".cursor"), dot = $(".cursor-dot"), ring = $(".cursor-ring");
    let x = -100, y = -100, rx = x, ry = y;
    addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; dot.style.transform = `translate3d(${x}px,${y}px,0)`; }, { passive: true });
    addEventListener("pointerdown", () => c.classList.add("is-down"));
    addEventListener("pointerup", () => c.classList.remove("is-down"));
    document.addEventListener("pointerover", (e) => { c.classList.toggle("is-hover", !!e.target.closest("a,button,summary,label,[data-cursor]")); });
    document.addEventListener("mouseleave", () => { x = y = -100; });
    (function loop() { rx += (x - rx) * 0.18; ry += (y - ry) * 0.18; ring.style.transform = `translate3d(${rx}px,${ry}px,0)`; requestAnimationFrame(loop); })();
  }

  /* ---------- Magnetic, tilt, spotlight ---------- */
  function initPointerFx() {
    if (!finePointer || reduce) return;
    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) * 0.3;
        const my = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = `translate(${mx}px, ${my}px)`;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transition = "transform .6s cubic-bezier(.2,1.6,.4,1)";
        el.style.transform = "";
        setTimeout(() => (el.style.transition = ""), 600);
      });
    });
    $$("[data-tilt]").forEach((el) => {
      const max = +el.dataset.tilt || 8;
      el.classList.add("tilt");
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateZ(0)`;
      });
      el.addEventListener("pointerleave", () => (el.style.transform = ""));
    });
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest?.(".spotlight");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- Reveals ----------
     Robust by design: an element is shown as soon as its top has reached the
     screen, or it is already above the screen. Checked on every scroll, so no
     pre-calculated positions can go stale and leave content hidden. */
  const HERO = ".hero, .dx-hero, .page-hero, .nf";
  function initReveals() {
    const pending = [];
    const add = (el, delay) => {
      el.classList.add("rv");
      if (delay) el.style.transitionDelay = delay + "s";
      pending.push(el);
    };
    $$("[data-reveal]").forEach((el) => add(el, +(el.dataset.reveal || 0)));
    $$("[data-stagger]").forEach((wrap) => [...wrap.children].forEach((c, i) => add(c, Math.min(i, 8) * 0.08)));
    // Hero headlines get a word by word animation later; every other headline fades up
    $$("[data-split]").forEach((el) => {
      if (el.closest(HERO) && window.SplitText && window.gsap && !reduce) el.classList.add("split-pending");
      else add(el, 0);
    });

    const finish = (el) => {
      el.classList.add("in");
      // After the fade, hand the element back to its normal styles (hover effects etc.)
      setTimeout(() => { el.classList.remove("rv", "in"); el.style.transitionDelay = ""; }, 1800);
    };
    if (reduce) {
      pending.forEach((el) => { el.classList.remove("rv"); el.style.transitionDelay = ""; });
    } else {
      const check = () => {
        const limit = innerHeight - 24;
        for (let i = pending.length - 1; i >= 0; i--) {
          const el = pending[i];
          if (el.getBoundingClientRect().top < limit) { finish(el); pending.splice(i, 1); }
        }
      };
      // Throttled check that runs directly in the scroll event (no animation frame needed)
      let last = 0, trailing;
      const schedule = () => {
        if (!pending.length) return;
        const now = Date.now();
        clearTimeout(trailing);
        if (now - last > 60) { last = now; check(); }
        trailing = setTimeout(check, 120);
      };
      addEventListener("scroll", schedule, { passive: true });
      addEventListener("resize", schedule);
      addEventListener("load", schedule);
      document.addEventListener("fc:lenis", (e) => e.detail.on("scroll", schedule));
      // Safety net: keep checking while anything is still waiting to appear
      const safety = setInterval(() => { if (pending.length) check(); else clearInterval(safety); }, 400);
      check();
    }
    document.documentElement.classList.remove("motion-pending");
    // Safety net: never leave a hero headline hidden
    setTimeout(() => $$(".split-pending").forEach((el) => el.classList.remove("split-pending")), 2500);
  }

  /* ---------- Smooth scroll, hero headline, LEAP (runs after fonts load) ---------- */
  function initMotion() {
    const G = window.gsap, ST = window.ScrollTrigger;
    if (G && ST) G.registerPlugin(ST);
    if (G && window.SplitText) G.registerPlugin(window.SplitText);

    if (!reduce && window.Lenis) {
      const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
      window.__lenis = lenis;
      document.dispatchEvent(new CustomEvent("fc:lenis", { detail: lenis }));
      if (G && ST) {
        lenis.on("scroll", ST.update);
        G.ticker.add((t) => lenis.raf(t * 1000));
        G.ticker.lagSmoothing(0);
      } else {
        (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      }
      $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id.length < 2) return;
        const t = $(id);
        if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: -80 }); history.replaceState(null, "", id); }
      }));
    }

    // Hero headlines: word by word, plays immediately (no scroll trigger)
    $$(".split-pending").forEach((el) => {
      const split = new SplitText(el, { type: "lines,words", linesClass: "split-line" });
      el.classList.remove("split-pending");
      G.fromTo(split.words, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: "power4.out", stagger: 0.04 });
    });

    // Flip cards flip themselves near the middle of the screen on touch devices
    if (!finePointer && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((en) => en.forEach((e) => e.target.classList.toggle("is-flipped", e.isIntersecting)), { rootMargin: "-40% 0px -40% 0px" });
      $$(".flip").forEach((el) => io.observe(el));
    }

    initPrism(G, ST);
    initCarousels();
    if (ST) {
      const refresh = () => ST.refresh();
      if (document.readyState === "complete") setTimeout(refresh, 50);
      else addEventListener("load", refresh);
      setTimeout(refresh, 1500);
    }
  }

  /* ---------- Testimonial carousel: native swipe + arrows + mouse drag ---------- */
  function initCarousels() {
    $$("[data-hscroll]").forEach((wrap) => {
      const track = $(".h-track", wrap);
      if (!track) return;
      const step = () => ($(".t-card", track)?.getBoundingClientRect().width || 400) + 20;
      const section = wrap.closest("section") || document;
      const prev = $("[data-carousel-prev]", section), next = $("[data-carousel-next]", section);
      const update = () => {
        if (prev) prev.disabled = wrap.scrollLeft < 8;
        if (next) next.disabled = wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - 8;
      };
      // Own easing animation (native smooth scrolling is unreliable next to the page smooth-scroller)
      let anim;
      const glide = (dir) => {
        cancelAnimationFrame(anim);
        const from = wrap.scrollLeft;
        const to = Math.max(0, Math.min(wrap.scrollWidth - wrap.clientWidth, Math.round((from + dir * step()) / step()) * step()));
        if (reduce) { wrap.scrollLeft = to; return; }
        wrap.style.scrollSnapType = "none";
        const t0 = performance.now(), dur = 550;
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          wrap.scrollLeft = from + (to - from) * e;
          if (p < 1) anim = requestAnimationFrame(tick);
          else { wrap.style.scrollSnapType = ""; update(); }
        };
        anim = requestAnimationFrame(tick);
      };
      prev?.addEventListener("click", () => glide(-1));
      next?.addEventListener("click", () => glide(1));
      wrap.addEventListener("scroll", update, { passive: true });
      addEventListener("resize", update);
      update();
      let down = false, startX = 0, startLeft = 0, moved = false;
      wrap.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; down = true; moved = false; startX = e.clientX; startLeft = wrap.scrollLeft; wrap.classList.add("is-dragging"); });
      addEventListener("pointermove", (e) => { if (!down) return; const dx = e.clientX - startX; if (Math.abs(dx) > 4) moved = true; wrap.scrollLeft = startLeft - dx; });
      addEventListener("pointerup", () => { if (!down) return; down = false; wrap.classList.remove("is-dragging"); });
      wrap.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
  }

  /* ---------- LEAP prism (4 faces, 90deg per step) ----------
     Turns as the section scrolls past. No pinning, so it never changes page length. */
  function initPrism(G, ST) {
    $$("[data-prism-section]").forEach((sec) => {
      const prism = $("[data-prism]", sec);
      const steps = $$(".leap-step", sec);
      const bars = $$(".prism-progress i", sec);
      let current = -1, manual = false;
      const setStep = (i) => {
        if (i === current) return;
        current = i;
        steps.forEach((s, k) => { s.classList.toggle("is-active", k === i); s.setAttribute("aria-current", k === i ? "step" : "false"); });
        bars.forEach((b, k) => b.classList.toggle("on", k <= i));
      };
      const go = (k) => {
        prism.style.transition = "transform .9s cubic-bezier(.22,1,.36,1)";
        prism.style.transform = `rotateX(-12deg) rotateY(${-k * 90}deg)`;
        setStep(k);
      };
      setStep(0);
      steps.forEach((s, k) => s.addEventListener("click", () => { manual = true; go(k); }));

      if (G && ST && !reduce) {
        ST.create({
          trigger: sec, start: "top 65%", end: "bottom 45%",
          onUpdate: (self) => { if (!manual) go(Math.min(3, Math.floor(self.progress * 4))); },
          onLeaveBack: () => { manual = false; },
        });
      } else if (!reduce) {
        let k = 0;
        setInterval(() => { if (!manual) { k = (k + 1) % 4; go(k); } }, 3200);
      }
    });
  }

  /* ---------- Story chapters ---------- */
  function initStory() {
    const chapters = $$("[data-chapter]");
    const counter = $("[data-story-counter]");
    if (!chapters.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          chapters.forEach((c) => c.classList.remove("is-active"));
          e.target.classList.add("is-active");
          if (counter) counter.textContent = e.target.dataset.chapter;
        }
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    chapters.forEach((c) => io.observe(c));
    chapters[0].classList.add("is-active");
  }

  /* ---------- Counters ---------- */
  function initCounters() {
    const els = $$("[data-count]");
    if (!els.length) return;
    const run = (el) => {
      const end = parseFloat(el.dataset.count);
      if (reduce) { el.textContent = end.toLocaleString(); return; }
      const dur = 1800, t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(end * e).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Countdowns & local time ---------- */
  function initCountdowns() {
    $$("[data-countdown]").forEach((el) => {
      const end = new Date(el.dataset.countdown).getTime();
      const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
      const labels = el.hasAttribute("data-long") ? { d: "Days", h: "Hours", m: "Minutes", s: "Seconds" } : { d: "Days", h: "Hours", m: "Mins", s: "Secs" };
      el.innerHTML = Object.keys(units).map((k) => `<div class="cd-unit"><b data-u="${k}">00</b><span>${labels[k]}</span></div>`).join("");
      const tick = () => {
        let diff = Math.max(0, end - Date.now());
        Object.entries(units).forEach(([k, ms]) => {
          const v = Math.floor(diff / ms); diff -= v * ms;
          const b = el.querySelector(`[data-u="${k}"]`); if (b) b.textContent = String(v).padStart(2, "0");
        });
        if (end - Date.now() <= 0) {
          clearInterval(iv);
          if (el.dataset.expired) el.outerHTML = `<p class="muted">${el.dataset.expired}</p>`;
        }
      };
      tick();
      const iv = setInterval(tick, 1000);
    });
    $$("[data-localtime]").forEach((el) => {
      try {
        const d = new Date(el.dataset.localtime);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz === "Asia/Colombo") { el.textContent = "Sri Lanka time"; return; }
        el.textContent = "Your time: " + d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      } catch {}
    });
  }

  /* ---------- Sticky mobile bar ---------- */
  function initStickyBar() {
    const bar = $("[data-sticky-bar]");
    if (!bar) return;
    document.body.classList.add("has-sticky-bar");
    const hideAt = $(bar.dataset.hideAt || "#pricing");
    const onScroll = () => {
      let show = scrollY > innerHeight * 0.8;
      if (hideAt) { const r = hideAt.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) show = false; }
      bar.classList.toggle("show", show);
    };
    addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Lead forms ---------- */
  const PHONE_LK = /^(?:\+94|0094|94|0)?7\d{8}$/;
  const PHONE_INTL = /^\+\d{8,15}$/;
  function normalisePhone(v) {
    const s = v.replace(/[\s\-()]/g, "");
    if (PHONE_LK.test(s)) return "+94" + s.slice(-9);
    if (PHONE_INTL.test(s)) return s;
    return null;
  }

  function initForms(root = document) {
    $$("form[data-lead-form]", root).forEach((form) => {
      if (form.dataset.bound) return;
      form.dataset.bound = "1";
      form.insertAdjacentHTML("beforeend", '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">');
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = $(".form-msg", form);
        const btn = $('[type="submit"]', form);
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        let ok = true;

        $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
        $$(".field-error", form).forEach((i) => (i.textContent = ""));
        const fail = (name, text) => {
          ok = false;
          const input = form.elements[name];
          if (input) { input.setAttribute("aria-invalid", "true"); const err = input.closest(".field")?.querySelector(".field-error"); if (err) err.textContent = text; }
        };

        if (form.elements.name && (data.name || "").trim().length < 2) fail("name", "Please enter your name.");
        if (form.elements.phone) {
          const p = normalisePhone(data.phone || "");
          if (!p && (form.elements.phone.required || data.phone)) fail("phone", "Enter a valid WhatsApp number, like 07X XXX XXXX.");
          else data.phone = p || "";
        }
        if (form.elements.email && (form.elements.email.required || data.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email || "")) fail("email", "Enter a valid email address.");
        if (form.elements.message && form.elements.message.required && (data.message || "").trim().length < 5) fail("message", "Tell us a little more.");
        if (form.elements.consent && !form.elements.consent.checked) fail("consent", "Please agree so we can contact you.");

        if (!ok) { if (msg) { msg.className = "form-msg err"; msg.textContent = "Please fix the highlighted fields."; } $('[aria-invalid="true"]', form)?.focus(); return; }

        const payload = {
          ...data,
          type: form.dataset.type || "lead",
          magnet: form.dataset.magnet || data.magnet || "",
          page: location.pathname,
          utm: store.get("fc_utm") || {},
          ts: new Date().toISOString(),
        };
        btn && (btn.disabled = true);
        const btnText = btn?.innerHTML;
        if (btn) btn.innerHTML = "Sending...";
        if (msg) { msg.className = "form-msg"; msg.textContent = ""; }

        let saved = false;
        try {
          const res = await fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          saved = res.ok;
          if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Request failed"); }
        } catch (err) {
          // Keep a local copy so nothing is lost, then offer WhatsApp as a backup channel
          const q = store.get("fc_pending") || []; q.push(payload); store.set("fc_pending", q.slice(-10));
          if (!saved && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
            if (msg) { msg.className = "form-msg err"; msg.innerHTML = `Could not send right now. <a href="https://wa.me/${SITE.contact?.whatsapp}" target="_blank" rel="noopener" style="text-decoration:underline">Message us on WhatsApp</a> instead.`; }
            btn && (btn.disabled = false); if (btn) btn.innerHTML = btnText;
            return;
          }
        }

        const ev = { lead: "lead_submit", newsletter: "lead_submit", webinar: "webinar_register", enroll: "begin_checkout", notify: "lead_submit" }[payload.type] || "form_submit";
        track(ev, { magnet: payload.magnet, form: payload.type });
        store.set("fc_contact", { name: data.name, email: data.email, phone: data.phone });

        if (form.dataset.redirect) { location.href = form.dataset.redirect; return; }
        const wrap = form.closest("[data-form-wrap]");
        if (wrap) { wrap.classList.add("is-done"); if (form.dataset.download) setTimeout(() => window.open(form.dataset.download, "_blank"), 500); }
        else { if (msg) { msg.className = "form-msg ok"; msg.textContent = form.dataset.success || "Thanks! You are on the list."; } form.reset(); }
        btn && (btn.disabled = false); if (btn) btn.innerHTML = btnText;
        form.dispatchEvent(new CustomEvent("fc:submitted", { detail: payload }));
      });
    });

    // Prefill from a previous submission
    const known = store.get("fc_contact");
    if (known) $$("form[data-lead-form]", root).forEach((f) => ["name", "email", "phone"].forEach((k) => { if (f.elements[k] && !f.elements[k].value && known[k]) f.elements[k].value = known[k]; }));
  }

  /* ---------- Command palette search ---------- */
  function initSearch() {
    const pal = $("[data-palette]");
    if (!pal) return;
    const input = $("[data-search-input]", pal), list = $("[data-search-results]", pal);
    let index = null, sel = 0, items = [];
    const quick = [
      { t: "Designer X", d: "Live UI/UX + freelancing cohort", u: "/courses/designer-x", k: "Course" },
      { t: "Free webinar", d: SITE.webinar?.title || "", u: "/webinar", k: "Event" },
      { t: "Freelance price calculator", d: "Price your gigs in USD", u: "/tools#price", k: "Tool" },
      { t: "Skill quiz", d: "Which freelance skill fits you?", u: "/tools#quiz", k: "Tool" },
      { t: "LEAP Method", d: "Learn, Execute, Assemble, Pitch", u: "/leap-method", k: "Page" },
    ];
    const open = async () => {
      pal.hidden = false; input.value = ""; render(quick); input.focus();
      window.__lenis?.stop();
      if (!index) { try { index = await (await fetch("/search.json")).json(); } catch { index = []; } }
    };
    const close = () => { pal.hidden = true; window.__lenis?.start(); };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const render = (arr) => {
      items = arr; sel = 0;
      list.innerHTML = arr.length ? arr.map((r, i) => `<li class="${i === 0 ? "is-sel" : ""}" role="option"><a href="${r.u}"><span class="k">${esc(r.k || "Page")}</span><b>${esc(r.t)}</b><small>${esc(r.d || "")}</small></a></li>`).join("") : `<li class="empty">No results. Try "Figma", "pricing" or "Fiverr".</li>`;
    };
    const search = (q) => {
      q = q.trim().toLowerCase();
      if (!q) return render(quick);
      const terms = q.split(/\s+/);
      const scored = (index || []).map((r) => {
        const t = r.t.toLowerCase(), d = (r.d || "").toLowerCase(), h = (r.h || []).join(" ").toLowerCase(), x = (r.x || "").toLowerCase();
        let s = 0;
        for (const w of terms) {
          if (t.includes(w)) s += 10; if (d.includes(w)) s += 4; if (h.includes(w)) s += 3; if (x.includes(w)) s += 1;
          if (!t.includes(w) && !d.includes(w) && !h.includes(w) && !x.includes(w)) return { r, s: 0 };
        }
        return { r, s };
      }).filter((o) => o.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((o) => o.r);
      render(scored);
    };
    input.addEventListener("input", () => search(input.value));
    input.addEventListener("keydown", (e) => {
      const lis = $$("li", list);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + lis.length) % Math.max(1, lis.length);
        lis.forEach((l, i) => l.classList.toggle("is-sel", i === sel));
        lis[sel]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && items[sel]) { location.href = items[sel].u; }
    });
    $$("[data-open-search]").forEach((b) => b.addEventListener("click", open));
    $$("[data-close-search]").forEach((b) => b.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.hidden ? open() : close(); }
      else if (e.key === "Escape" && !pal.hidden) close();
      else if (e.key === "/" && pal.hidden && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); open(); }
    });
  }

  /* ---------- Misc ---------- */

  /* ---------- "Book your seat": one question per step, then contact details ---------- */
  function initSeatBooking() {
    const modal = $("[data-seat-modal]");
    if (!modal) return;
    const form = $("form", modal);
    const wrap = $("[data-form-wrap]", modal);
    const steps = $$("[data-seat-step]", modal);
    const questions = steps.filter((s) => !s.hasAttribute("data-seat-details"));
    const bar = $("[data-seat-bar]", modal), label = $("[data-seat-step-label]", modal), count = $("[data-seat-count]", modal);
    const prev = $("[data-seat-prev]", modal), intro = $("[data-seat-intro]", modal);
    let current = 0, lastFocus = null;
    // each question gets its own radio group
    questions.forEach((st, i) => $$('input[type="radio"]', st).forEach((r) => (r.name = "q" + i)));

    const show = (i) => {
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((st, k) => (st.hidden = k !== current));
      const isDetails = steps[current].hasAttribute("data-seat-details");
      label.textContent = isDetails ? "Last step" : `Question ${current + 1} of ${questions.length}`;
      count.textContent = isDetails ? "" : "Tap an answer to continue";
      bar.style.width = `${((current + (isDetails ? 1 : 0)) / questions.length) * 100}%`;
      prev.hidden = current === 0;
      intro.hidden = current !== 0;
      const focusable = steps[current].querySelector("input:checked, input");
      setTimeout(() => focusable?.focus({ preventScroll: true }), 60);
    };

    const open = () => {
      lastFocus = document.activeElement;
      if (wrap.classList.contains("is-done")) { wrap.classList.remove("is-done"); form.reset(); }
      modal.hidden = false;
      document.body.classList.add("seat-open");
      window.__lenis?.stop();
      show(0);
      track("begin_seat_booking", { page: location.pathname });
    };
    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("seat-open");
      window.__lenis?.start();
      lastFocus?.focus?.();
    };

    document.addEventListener("click", (e) => { if (e.target.closest("[data-book-seat]")) { e.preventDefault(); open(); } });
    $$("[data-seat-close]", modal).forEach((b) => b.addEventListener("click", close));
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        // keep keyboard focus inside the dialog
        const f = $$('button, a[href], input:not([type="hidden"])', modal).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    questions.forEach((st, i) => st.addEventListener("change", () => setTimeout(() => show(i + 1), 220)));
    prev.addEventListener("click", () => show(current - 1));

    // Before the shared form handler runs: every question answered, answers bundled with their questions
    form.addEventListener("submit", (e) => {
      const missing = questions.findIndex((st) => !$("input:checked", st));
      if (missing >= 0) { e.preventDefault(); e.stopImmediatePropagation(); show(missing); return; }
      const answers = {};
      questions.forEach((st) => { answers[$("legend", st).textContent.trim()] = $("input:checked", st).value; });
      $("[data-seat-answers]", modal).value = JSON.stringify(answers);
      // Next stop: a seat is only secured by paying, so continue to checkout with the chosen plan.
      // Linux Master is not open yet (waitlist). "Not sure" goes to the free webinar.
      const picked = Object.values(answers).map((a) => a.toLowerCase());
      const program = picked[0] || "";
      const plan = picked.some((a) => a.includes("deposit")) ? "deposit" : "full";
      const wantsToTalk = picked.some((a) => a.includes("discuss"));
      const wa = `https://wa.me/${SITE.contact?.whatsapp || ""}?text=${encodeURIComponent("Hi! I'm interested in Designer X and would like to discuss the payment options.")}`;
      form.dataset.redirect = program.includes("linux") ? "/courses/linux-master/"
        : program.includes("not sure") ? "/webinar/"
        : wantsToTalk ? wa
        : `/checkout/designer-x/?plan=${plan}`;
    }, true);
    form.addEventListener("fc:submitted", () => { bar.style.width = "100%"; label.textContent = "Booked"; });
  }

  function initMisc() {
    $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied to clipboard"); } catch {}
    }));
    $$("[data-share]").forEach((b) => b.addEventListener("click", async () => {
      const data = { title: document.title, url: location.href };
      if (navigator.share) { try { await navigator.share(data); } catch {} }
      else { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch {} }
    }));
    $$("[data-track]").forEach((el) => el.addEventListener("click", () => track(el.dataset.track, { page: location.pathname })));
    if (document.body.dataset.event) track(document.body.dataset.event, { page: location.pathname });
    // Exclusive FAQ accordions (one open at a time within a group)
    $$(".faq[data-exclusive]").forEach((g) => $$("details", g).forEach((d) => d.addEventListener("toggle", () => { if (d.open) $$("details", g).forEach((o) => o !== d && (o.open = false)); })));
    // Refresh ScrollTrigger when details open/close (page height changes)
    $$("details").forEach((d) => d.addEventListener("toggle", () => window.ScrollTrigger?.refresh()));
  }

  function boot() {
    captureUtm();
    initNav();
    initCursor();
    initPointerFx();
    initStory();
    initCounters();
    initCountdowns();
    initStickyBar();
    initForms();
    initSearch();
    initCookies();
    initMisc();
    initSeatBooking();
    initReveals();
    // Split hero headlines only after web fonts load, so line breaks are measured correctly
    const fontsReady = document.fonts?.ready || Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(initMotion);
    document.dispatchEvent(new Event("fc:ready"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
