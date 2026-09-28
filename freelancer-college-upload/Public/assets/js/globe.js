// About page: rotating globe with red arcs from Sri Lanka to client markets. Drag to spin.
import * as THREE from "three";

const host = document.querySelector("[data-globe]");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ok = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();

const HOME = { lat: 7.87, lon: 80.77 }; // Sri Lanka
const MARKETS = [
  ["United States", 39.8, -98.6], ["United Kingdom", 54, -2], ["Australia", -25.3, 133.8], ["Canada", 56, -106],
  ["Germany", 51.2, 10.4], ["UAE", 24, 54], ["Singapore", 1.35, 103.8], ["Netherlands", 52.1, 5.3], ["New Zealand", -41, 174], ["Norway", 60.5, 8.5],
];

if (host && ok) start();

function vec(lat, lon, r) {
  const phi = (90 - lat) * (Math.PI / 180), theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 5.4;

  const globe = new THREE.Group();
  scene.add(globe);
  const R = 1.6;

  // Dark sphere (the red atmosphere glow is CSS, see .globe-wrap::before)
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 64, 64), new THREE.MeshBasicMaterial({ color: 0x0a0a0a })));

  // Land dots sampled from a world map texture (falls back to an even dot sphere)
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-dark.jpg";
  const addDots = (isLand) => {
    const pts = [], N = 14000;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      const v = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      const lat = 90 - Math.acos(v.y) * 180 / Math.PI;
      const lon = ((Math.atan2(v.z, -v.x) * 180 / Math.PI) - 180 + 540) % 360 - 180;
      if (isLand && !isLand(lat, lon)) continue;
      pts.push(...vec(lat, lon, R).toArray());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    globe.add(new THREE.Points(g, new THREE.PointsMaterial({ color: isLand ? 0x9a9a9a : 0x3a3a3a, size: isLand ? 0.022 : 0.018, transparent: true, opacity: 0.9 })));
  };
  img.onload = () => {
    try {
      const c = document.createElement("canvas"); c.width = 720; c.height = 360;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, 720, 360);
      const d = ctx.getImageData(0, 0, 720, 360).data;
      addDots((lat, lon) => {
        const x = Math.floor(((lon + 180) / 360) * 719), y = Math.floor(((90 - lat) / 180) * 359);
        const k = (y * 720 + x) * 4;
        return d[k] + d[k + 1] + d[k + 2] < 24; // in this map land is black and ocean is dark grey
      });
    } catch { addDots(null); }
  };
  img.onerror = () => addDots(null);

  // Home marker + arcs
  const home = vec(HOME.lat, HOME.lon, R);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0xc81e27 }));
  pin.position.copy(home); globe.add(pin);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 32), new THREE.MeshBasicMaterial({ color: 0xe5484f, side: THREE.DoubleSide, transparent: true }));
  ring.position.copy(home.clone().multiplyScalar(1.001)); ring.lookAt(0, 0, 0); globe.add(ring);

  const comets = [];
  MARKETS.forEach(([, lat, lon], i) => {
    const end = vec(lat, lon, R);
    const mid = home.clone().add(end).multiplyScalar(0.5);
    mid.setLength(R + home.distanceTo(end) * 0.45);
    const curve = new THREE.QuadraticBezierCurve3(home, mid, end);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), new THREE.LineBasicMaterial({ color: 0xe5484f, transparent: true, opacity: 0.45 }));
    globe.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    globe.add(dot);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe5484f }));
    m.position.copy(end); globe.add(m);
    comets.push({ curve, dot, t: i / MARKETS.length });
  });

  // Face Sri Lanka toward the camera at start
  globe.rotation.y = Math.atan2(-home.x, home.z) + 0.6;
  globe.rotation.x = 0.25;

  // Drag to rotate
  let drag = false, px = 0, py = 0, vy = 0.0025, vx = 0;
  host.addEventListener("pointerdown", (e) => { drag = true; px = e.clientX; py = e.clientY; host.setPointerCapture(e.pointerId); });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    vy = (e.clientX - px) * 0.005; vx = (e.clientY - py) * 0.003;
    globe.rotation.y += vy; globe.rotation.x = Math.max(-0.8, Math.min(0.8, globe.rotation.x + vx));
    px = e.clientX; py = e.clientY;
  });
  host.addEventListener("pointerup", () => { drag = false; });

  const resize = () => { const s = host.clientWidth; renderer.setSize(s, s, false); camera.aspect = 1; camera.updateProjectionMatrix(); };
  resize(); addEventListener("resize", resize);

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host);
  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    const dt = clock.getDelta();
    if (!drag) { vy += (0.0025 - vy) * 0.03; if (!reduce) globe.rotation.y += vy; }
    comets.forEach((c) => { c.t = (c.t + dt * 0.25) % 1; c.dot.position.copy(c.curve.getPoint(c.t)); });
    ring.scale.setScalar(1 + ((clock.elapsedTime * 0.8) % 1) * 1.5);
    ring.material.opacity = 1 - ((clock.elapsedTime * 0.8) % 1);
    renderer.render(scene, camera);
  })();
  host.closest(".globe-wrap")?.classList.add("globe-ready");
}
