/* Home hero scene: a mobile app screen gets designed, a client order arrives, the payment lands.
   Loops while visible. Reduced motion shows the finished state without animation. */
(() => {
  const studio = document.querySelector("[data-studio]");
  if (!studio) return;
  const $ = (s) => studio.querySelector(s);
  const tilt = $("[data-studio-tilt]");
  const canvas = $(".canvas");
  const slots = [...studio.querySelectorAll("[data-step]")];
  const sel = $("[data-sel]");
  const selSize = $("[data-sel-size]");
  const cursor = $("[data-cursor-you]");
  const order = $("[data-note-order]");
  const paid = $("[data-note-paid]");
  const tools = [...studio.querySelectorAll("[data-tool]")];
  const TOOL = { head: "frame", hero: "rect", stats: "rect", list: "pen", btn: "text" };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setTool = (name) => tools.forEach((t) => t.classList.toggle("on", t.dataset.tool === name));

  // Position of el relative to an ancestor, in untransformed layout pixels
  const offsetTo = (el, ancestor) => {
    let x = 0, y = 0;
    for (let n = el; n && n !== ancestor; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };

  const moveCursor = (el, dx = 0.7, dy = 0.55) => {
    const r = offsetTo(el, tilt);
    cursor.style.setProperty("--cx", `${Math.round(r.x + r.w * dx)}px`);
    cursor.style.setProperty("--cy", `${Math.round(r.y + r.h * dy)}px`);
  };

  const select = (slot) => {
    const r = offsetTo(slot, canvas);
    sel.style.transform = `translate(${r.x - 3}px, ${r.y - 3}px)`;
    sel.style.width = `${r.w + 6}px`;
    sel.style.height = `${r.h + 6}px`;
    selSize.textContent = `W ${r.w} · H ${r.h}`;
    sel.classList.add("show");
  };

  if (reduce) {
    slots.forEach((s) => s.classList.add("built"));
    order.classList.add("show");
    paid.classList.add("show");
    cursor.hidden = true;
    return;
  }

  // Pause the loop while the hero is off screen or the tab is hidden
  let visible = true;
  let wake = null;
  const setVisible = (v) => { visible = v; if (v && wake) { wake(); wake = null; } };
  new IntersectionObserver(([e]) => setVisible(e.isIntersecting)).observe(studio);
  document.addEventListener("visibilitychange", () => setVisible(!document.hidden));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = async (ms) => {
    await sleep(ms);
    if (!visible) await new Promise((r) => (wake = r));
  };

  async function loop() {
    for (;;) {
      slots.forEach((s) => s.classList.remove("built"));
      order.classList.remove("show");
      paid.classList.remove("show");
      sel.classList.remove("show");
      setTool("move");
      await pause(900);
      for (const slot of slots) {
        setTool(TOOL[slot.dataset.step] || "rect");
        moveCursor(slot);
        await pause(750);
        select(slot);
        slot.classList.add("built");
        await pause(850);
      }
      sel.classList.remove("show");
      setTool("move");
      moveCursor($(".win-share"), 0.5, 0.6);
      await pause(900);
      order.classList.add("show");
      await pause(1900);
      paid.classList.add("show");
      await pause(3600);
    }
  }
  // Start once layout (fonts) is ready so measurements are right
  (document.fonts?.ready || Promise.resolve()).then(() => setTimeout(loop, 700));

  // Gentle tilt toward the mouse (desktop only)
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const hero = studio.closest(".hero") || document;
    hero.addEventListener("pointermove", (e) => {
      const x = e.clientX / innerWidth - 0.5;
      const y = e.clientY / innerHeight - 0.5;
      tilt.style.setProperty("--ry", `${(-10 + x * 10).toFixed(2)}deg`);
      tilt.style.setProperty("--rx", `${(6 - y * 8).toFixed(2)}deg`);
    });
    hero.addEventListener("pointerleave", () => { tilt.style.removeProperty("--ry"); tilt.style.removeProperty("--rx"); });
  }
})();
