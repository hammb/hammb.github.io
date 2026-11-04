/* Perfuse-lite: a small, playful nod to contrast-free DCE-MRI synthesis
   (Anguinus Sculpturae, MAMA-SYNTH 2026) and breast lesion kinetics (ODELIA 2025).
   A glass breast, raymarched in WebGL, cut cleanly at the chest wall. The raw scan is
   quiet greyscale tissue inside the glass; "Synthesize" sweeps a slice plane through it,
   turning the tissue warm, then a virtual bolus streams through the vessel tree and the
   two lesions enhance with their own kinetics: A fast + washout, B slow + persistent.
   No real model here. Debug: #pf=<seconds> freezes motion at that time (0 = raw),
   #pfwipe=<0..1> freezes the sweep, #pftheme=dark forces dark mode, #pfnogl = 2D fallback,
   #pfyaw=<rad> sets the base view angle, #pfseed=<n> regrows the vessel tree. */
(function () {
  'use strict';

  const root = document.getElementById('perfuse');
  if (!root) return;
  const view = root.querySelector('canvas.pf-view');
  const chart = root.querySelector('canvas.pf-chart');
  const cctx = chart.getContext('2d');
  const statusEl = root.querySelector('.pf-status');
  const playBtn = root.querySelector('[data-play]');
  const playLabel = playBtn.querySelector('span');
  const tagA = root.querySelector('[data-tag="a"]');
  const tagB = root.querySelector('[data-tag="b"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------------- kinetics (normalised signal enhancement) ---------------- */
  const KA = { A: 1.8, tau: 13, k: 0.0062, t0: 18 };  // fast wash-in, washout  -> type III
  const KB = { A: 1.0, tau: 95, k: 0, t0: 28 };        // slow, persistent       -> type I
  function enh(c, t) {
    const dt = t - c.t0;
    if (dt <= 0) return 0;
    return c.A * (1 - Math.exp(-dt / c.tau)) * Math.exp(-c.k * dt);
  }

  /* ---------------- vector helpers ---------------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (v) => mul(v, 1 / (len(v) || 1));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const f3 = (v) => `vec3(${v.map((x) => x.toFixed(4)).join(',')})`;

  /* ---------------- anatomy (object space: chest wall plane at x = BASE_X, dome towards +x) ---------------- */
  const BASE_X = -0.6;
  const E1C = [BASE_X, -0.02, 0], E1R = [0.5, 0.5, 0.5];
  const E2C = [-0.24, -0.13, 0], E2R = [0.36, 0.34, 0.38];
  const SK = 0.16;
  function sdEll(p, r) { const k0 = Math.hypot(p[0] / r[0], p[1] / r[1], p[2] / r[2]); const k1 = Math.hypot(p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])); return k0 * (k0 - 1) / k1; }
  const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
  const sdMound = (p) => smin(sdEll(sub(p, E1C), E1R), sdEll(sub(p, E2C), E2R), SK);
  // nipple: tip of the mound along a slightly dropped axis
  const NAX = norm([1, -0.22, 0]);
  const NIP = (() => { const c = [-0.3, -0.08, 0]; let s = 0; while (sdMound(add(c, mul(NAX, s))) < 0) s += 0.001; return add(c, mul(NAX, s)); })();
  const NIPC = add(NIP, mul(NAX, -0.006)), NIPR = 0.026;
  const sdDomeJS = (p) => smin(sdMound(p), len(sub(p, NIPC)) - NIPR, 0.03);
  const sdBodyJS = (p) => Math.max(sdDomeJS(p), BASE_X - p[0]);
  const gradJS = (p) => { const e = 0.003; return norm([0, 1, 2].map((i) => { const q = p.slice(), r = p.slice(); q[i] += e; r[i] -= e; return sdBodyJS(q) - sdBodyJS(r); })); };
  // fibroglandular cone from the chest wall to the nipple
  const C0 = [BASE_X, -0.05, 0];
  const GAX = norm(sub(NIP, C0)), GLEN = len(sub(NIP, C0));

  const LA = [-0.24, 0.1, 0.17], RA = 0.064;
  const LB = [-0.36, -0.24, -0.15], LBR = [0.078, 0.056, 0.062];
  const PIVOT = [-0.28, -0.06, 0];
  const FLOOR_Y = -0.585;

  /* ---------------- vessel tree: grown procedurally (seeded), tapering to sub-pixel twigs ---------------- */
  const VEL = 0.0135; // bolus speed (units per simulated second)
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const SEEDD = location.hash.match(/pfseed=(\d+)/);
  const rnd = mulberry32(SEEDD ? +SEEDD[1] : 11);
  const jit = (s) => [(rnd() - 0.5) * s, (rnd() - 0.5) * s, (rnd() - 0.5) * s];
  const LES = [{ c: LA, r: RA + 0.012 }, { c: LB, r: 0.085 }];
  const SEGS = [];
  function perp(d) { const u = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); const v = cross(d, u); const a = rnd() * Math.PI * 2; return add(mul(u, Math.cos(a)), mul(v, Math.sin(a))); }
  function grow(o) {
    let p = o.p, d = o.d, t = o.t, s = o.s;
    const pts = [{ p, r: o.r0, t, s, d }];
    for (let i = 1; i <= o.steps; i++) {
      const to = o.target ? norm(sub(o.target, p)) : d;
      d = norm(add(add(d, mul(to, o.pull || 0)), jit(o.wob)));
      for (const L of LES) {   // keep clear of lesions that this branch does not feed
        if (L === o.feed) continue;
        const v = sub(p, L.c), dl = len(v), keep = L.r + 0.07;
        if (dl < keep) d = norm(add(d, mul(v, (3 * (keep - dl)) / (dl * keep))));
      }
      let q = add(p, mul(d, o.step));
      const sd = sdBodyJS(q);
      if (sd > -0.045) { const g = gradJS(q); d = norm(sub(d, mul(g, Math.max(0, dot(d, g)) * 1.15 + 0.15))); q = add(p, mul(d, o.step)); }
      if (q[0] < BASE_X + 0.012) q[0] = BASE_X + 0.012;
      const l = len(sub(q, p));
      t += l / VEL; s += l; p = q;
      pts.push({ p, r: o.r0 + (o.r1 - o.r0) * (i / o.steps), t, s, d });
      if (o.feed && len(sub(p, o.feed.c)) < o.feed.r + 0.006) break;
    }
    for (let it = 0; it < 2; it++) for (let i = 1; i + 1 < pts.length; i++) pts[i].p = add(mul(pts[i].p, 0.5), mul(add(pts[i - 1].p, pts[i + 1].p), 0.25));
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      SEGS.push({ a: A.p, b: B.p, ra: A.r, rb: B.r, ta: A.t, tb: B.t, lvl: o.lvl });
    }
    return pts;
  }
  const LV = [null,
    { steps: 4, step: 0.065, r1: 0.0022, k: 0.72, kids: 2 },
    { steps: 3, step: 0.055, r1: 0.001, k: 0.68, kids: 1 },
    { steps: 2, step: 0.045, r1: 0.00025, k: 0.66, kids: 0 }];
  function branches(pts, lvl, n) {
    const cfg = LV[lvl];
    if (!cfg || pts.length < 3) return;
    for (let j = 0; j < n; j++) {
      const f = (j + 0.5 + (rnd() - 0.5) * 0.5) / n;
      const k = pts[clamp(Math.round(f * (pts.length - 1)), 1, pts.length - 2)];
      const dir = norm(add(add(mul(k.d, 0.9), mul(perp(k.d), 0.6)), [0.15, 0, 0]));
      const kid = grow({ p: k.p, d: dir, r0: k.r * cfg.k, r1: cfg.r1, steps: cfg.steps, step: cfg.step, wob: 0.22, t: k.t, s: k.s, lvl });
      branches(kid, lvl + 1, cfg.kids);
    }
  }
  (function buildTree() {
    const NIP_IN = add(NIP, mul(NAX, -0.09));
    const trunks = [
      { p: [BASE_X + 0.012, 0.3, -0.1], target: NIP_IN, t: 9 },
      { p: [BASE_X + 0.012, 0.06, 0.33], target: [-0.02, 0.0, 0.26], t: 10, feedA: 0.35 },
      { p: [BASE_X + 0.012, -0.36, 0.06], target: [0.0, -0.25, 0.02], t: 9.5 },
    ];
    for (const tr of trunks) {
      const d0 = norm(add(sub(tr.target, tr.p), [0.3, 0, 0]));
      const pts = grow({ p: tr.p, d: d0, r0: 0.0078, r1: 0.0042, steps: 7, step: 0.078, target: tr.target, pull: 0.45, wob: 0.28, t: tr.t, s: 0, lvl: 0 });
      branches(pts, 1, 3);
      for (const [key, L] of [['feedA', LES[0]], ['feedB', LES[1]]]) {
        if (tr[key] == null) continue;
        const k = pts[clamp(Math.round(tr[key] * (pts.length - 1)), 1, pts.length - 2)];
        const fd = grow({ p: k.p, d: norm(sub(L.c, k.p)), r0: k.r * 0.75, r1: 0.0028, steps: 7, step: 0.045, target: L.c, pull: 0.9, wob: 0.25, t: k.t, s: k.s, lvl: 1, feed: L });
        if (key === 'feedA') {
          // a few fine neovascular twigs hugging the suspicious lesion
          const e = fd[fd.length - 1];
          for (let j = 0; j < 3; j++) {
            const side = norm(add(perp(norm(sub(L.c, e.p))), mul(norm(sub(e.p, L.c)), 0.3)));
            grow({ p: e.p, d: side, r0: 0.0022, r1: 0.0004, steps: 3, step: 0.035, target: add(L.c, mul(side, RA + 0.01)), pull: 0.5, wob: 0.3, t: e.t, s: e.s, lvl: 2, feed: L });
          }
        }
      }
    }
  })();
  SEGS.sort((a, b) => a.lvl - b.lvl);
   // truncation (on small GPUs) drops the finest twigs first
  // lesion onsets follow the tree: contrast reaches a lesion when its nearest vessel fills
  function arrivalNear(P, rad) {
    let best = Infinity;
    for (const s of SEGS) for (const [q, tq] of [[s.a, s.ta], [s.b, s.tb]]) if (len(sub(q, P)) < rad) best = Math.min(best, tq);
    return best;
  }
  { const a = arrivalNear(LA, RA + 0.05), b = arrivalNear(LB, 0.2); if (isFinite(a)) KA.t0 = a + 0.5; if (isFinite(b)) KB.t0 = b + 4; }

  /* ---------------- camera (shared by shader and JS projection) ---------------- */
  const CAM = [0, 0.95, 3.0], TARGET = [0.0, 0.0, 0], FL = 2.2;
  const YAWD = location.hash.match(/pfyaw=(-?[\d.]+)/);
  const YAW0 = YAWD ? +YAWD[1] : -0.3, TURN = 0.62, PITCH = 0.07;
  const WW = norm(sub(TARGET, CAM));
  const UU = norm(cross(WW, [0, 1, 0])), VV = cross(UU, WW);
  function rotation(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const Ry = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]];
    const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += Rx[i][k] * Ry[k][j];
    return R;
  }
  function projUV(R, p) {
    const q = sub(p, PIVOT);
    const wp = [0, 1, 2].map((i) => R[i][0] * q[0] + R[i][1] * q[1] + R[i][2] * q[2]);
    const d = sub(wp, CAM);
    const z = dot(d, WW);
    return [dot(d, UU) * FL / z, dot(d, VV) * FL / z, FL / z];
  }
  // framing: centre on the pivot, fit the silhouette over the whole turntable range
  const FIT = (() => {
    const pts = [], c0 = [-0.32, -0.08, 0], N = 400;
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      const dir = [Math.cos(a) * r, y, Math.sin(a) * r];
      let s = 0; while (s < 1.3 && sdBodyJS(add(c0, mul(dir, s))) < 0) s += 0.004;
      pts.push(add(c0, mul(dir, s)));
    }
    const R0 = rotation(YAW0, 0), c = projUV(R0, PIVOT);
    const hw = (yr) => {
      let hu = 0, v0 = Infinity, v1 = -Infinity;
      for (let k = -1; k <= 1; k += 0.125) {
        const R = rotation(YAW0 + k * yr, 0);
        for (const p of pts) { const q = projUV(R, p); hu = Math.max(hu, Math.abs(q[0] - c[0])); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
      }
      return { hu, v0, v1 };
    };
    const a = hw(TURN * 0.8);
    return { cu: c[0], cv: (a.v0 + a.v1) / 2, hu: a.hu, hv: (a.v1 - a.v0) / 2 };
  })();
  let ZOOM = 1;
  function project(R, p, w, h) {
    const q = projUV(R, p);
    return [w / 2 + (q[0] - FIT.cu) * ZOOM * h, h / 2 - (q[1] - FIT.cv) * ZOOM * h, q[2] * ZOOM * h];
  }

  /* ---------------- theme colours ---------------- */
  function parseColor(s, fb) {
    s = (s || '').trim();
    let m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map((v) => +v / 255);
    return fb;
  }
  let TH = null;
  function readTheme() {
    const cs = getComputedStyle(root);
    const dark = document.documentElement.dataset.theme === 'dark';
    const v = (n, fb) => parseColor(cs.getPropertyValue(n), fb);
    const rose = v('--pf-a', dark ? [1, 0.36, 0.56] : [0.84, 0.2, 0.42]);
    const vio = v('--pf-b', dark ? [0.62, 0.6, 1] : [0.36, 0.36, 0.84]);
    TH = {
      dark, rose, vio,
      ink: v('--ink', dark ? [0.93, 0.91, 0.89] : [0.106, 0.102, 0.122]),
      ink2: v('--ink-2', [0.29, 0.28, 0.32]),
      ink3: v('--ink-3', [0.52, 0.51, 0.55]),
      paper: v('--paper', dark ? [0.094, 0.09, 0.114] : [1, 1, 1]),
      rule: v('--rule', dark ? [0.16, 0.16, 0.19] : [0.9, 0.88, 0.85]),
      hot: dark ? [1, 0.9, 0.94] : [1, 0.86, 0.91],
      deepA: dark ? [0.86, 0.2, 0.42] : [0.6, 0.04, 0.24],
      hotB: dark ? [0.86, 0.86, 1] : [0.6, 0.6, 1],
      deepB: dark ? [0.36, 0.34, 0.8] : [0.2, 0.19, 0.55],
      tissue: dark ? [0.74, 0.74, 0.78] : [0.46, 0.45, 0.48],
      warm: dark ? [1, 0.5, 0.64] : [0.9, 0.55, 0.5],
      rim: dark ? [0.96, 0.88, 0.9] : [0.33, 0.26, 0.24],
      glint: dark ? [1, 0.95, 0.96] : [1, 1, 1],
      milk: dark ? [0.7, 0.68, 0.76] : [1, 0.995, 0.985],
      ghost: dark ? [0.66, 0.67, 0.74] : [0.42, 0.42, 0.47],
      deepV: dark ? [0.42, 0.44, 0.6] : [0.55, 0.57, 0.68],
      shadow: dark ? [0, 0, 0] : [0.3, 0.22, 0.17],
    };
    const hex = (c) => '#' + c.map((x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
    TH.css = { rose: hex(rose), vio: hex(vio), ink: hex(TH.ink), ink2: hex(TH.ink2), ink3: hex(TH.ink3), paper: hex(TH.paper), rule: hex(TH.rule) };
  }

  /* ---------------- WebGL ---------------- */
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = (NSEG) => `
precision highp float;
#define NSEG ${NSEG}
uniform vec2 uRes, uOff;
uniform mat3 uR;
uniform vec3 uPivot, uCam, uTa, uLight;
uniform float uFL, uZoom, uT, uWipe, uPlaneA, uEA, uWash, uEB, uDark, uBpe;
uniform vec3 uRose, uHot, uDeepA, uVio, uHotB, uDeepB, uTissue, uWarm, uRim, uGlint, uMilk, uGhost, uDeepV, uShadow;
uniform sampler2D uNoise;
uniform vec4 uS0[NSEG];
uniform vec4 uS1[NSEG];
uniform vec4 uS2[NSEG];
uniform int uN;

const vec3 LA = ${f3(LA)};
const float RA = ${RA.toFixed(4)};
const vec3 LB = ${f3(LB)};
const vec3 LBR = ${f3(LBR)};
const vec3 NIPC = ${f3(NIPC)};
const vec3 NAX = ${f3(NAX)};
const vec3 C0 = ${f3(C0)};
const vec3 GAX = ${f3(GAX)};
const float GLEN = ${GLEN.toFixed(4)};
const float BASE_X = ${BASE_X.toFixed(4)};

float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdDome(vec3 p){
  float d = smin(sdEll(p - ${f3(E1C)}, ${f3(E1R)}), sdEll(p - ${f3(E2C)}, ${f3(E2R)}), ${SK.toFixed(3)});
  return smin(d, length(p - NIPC) - ${NIPR.toFixed(4)}, 0.03);
}
float sdBody(vec3 p){ return max(sdDome(p), BASE_X - p.x); }
vec3 nBody(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float e = 0.0015;
  return normalize(k.xyy * sdBody(p + k.xyy * e) + k.yyx * sdBody(p + k.yyx * e) + k.yxy * sdBody(p + k.yxy * e) + k.xxx * sdBody(p + k.xxx * e));
}
// 3D value noise from a 2D texture (G channel = R shifted by (37,17) per z step)
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  vec2 uv = i.xy + vec2(37.0, 17.0) * i.z + f.xy;
  vec2 rg = texture2D(uNoise, (uv + 0.5) / 256.0).rg;
  return mix(rg.x, rg.y, f.z);
}
// fibroglandular tissue: a lobulated cone of streaks from the chest wall towards the nipple
float gland(vec3 p, float sd){
  vec3 q = p - C0; float ax = dot(q, GAX); float u = clamp(ax / GLEN, 0.0, 1.0);
  float rr = length(q - GAX * ax);
  float rad = mix(0.4, 0.06, u * u);
  float env = smoothstep(rad, rad * 0.35, rr) * smoothstep(-0.012, -0.06, sd);
  if (env < 0.002) return 0.0;
  vec3 s = p * vec3(4.2, 11.0, 11.0);
  float lo = noise(s * 0.45 + 9.3);
  float r1 = 1.0 - abs(2.0 * noise(s + 1.7) - 1.0);
  float r2 = 1.0 - abs(2.0 * noise(s * 2.3 + 5.1) - 1.0);
  float n = r1 * 0.65 + r2 * 0.35;
  return smoothstep(0.74, 0.95, n) * smoothstep(0.25, 0.65, lo) * env * mix(1.0, 0.6, u);
}
// lesion A: lobulated mass (malignant-looking margin)
float sdA(vec3 q){
  float r = length(q); vec3 n = q / max(r, 1e-4);
  float lob = 0.008 * sin(n.x * 4.0 + 1.3) * sin(n.y * 5.0 + 0.4) + 0.006 * sin(n.z * 6.0 + n.x * 3.0 + 0.5) + 0.004 * sin(n.y * 8.0 - n.z * 5.0 + 2.0);
  return r - RA - lob;
}
vec3 nA(vec3 q){
  const vec2 k = vec2(1.0, -1.0); const float e = 0.001;
  return normalize(k.xyy * sdA(q + k.xyy * e) + k.yyx * sdA(q + k.yyx * e) + k.yxy * sdA(q + k.yxy * e) + k.xxx * sdA(q + k.xxx * e));
}
float sdB(vec3 q){ return sdEll(q, LBR); }

vec4 over(vec4 top, vec4 under){ return top + under * (1.0 - top.a); }   // premultiplied
vec4 pm(vec3 c, float a){ a = clamp(a, 0.0, 1.0); return vec4(c * a, a); }
float syn(float x){ return 1.0 - smoothstep(uWipe - 0.015, uWipe + 0.015, x); }

// the synthesis slice plane at x = uWipe: a thin rose contour of the body cross-section
vec4 planeAt(vec3 ro, vec3 rd, float pix, out float tp){
  tp = (uWipe - ro.x) / rd.x;
  if (uPlaneA <= 0.0 || tp <= 0.0) { tp = -1.0; return vec4(0.0); }
  vec3 q = ro + rd * tp;
  float fp = pix * tp / max(abs(rd.x), 0.25);
  float sb = sdBody(q);
  float inside = 1.0 - smoothstep(-fp, fp, sb);
  float cont = 1.0 - smoothstep(0.5 * fp, 1.8 * fp, abs(sb));
  return pm(uRose, (0.14 * inside + cont * 0.95) * uPlaneA);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (uRes.y * uZoom) + uOff;
  vec3 ww = normalize(uTa - uCam), uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0))), vv = cross(uu, ww);
  vec3 rdw = normalize(uv.x * uu + uv.y * vv + uFL * ww);
  vec3 ro = uCam * uR + uPivot;
  vec3 rd = rdw * uR;
  float pix = 1.0 / (uRes.y * uFL * uZoom);
  vec3 L = uLight * uR, V = -rd;
  float dith = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  // soft contact shadow, tucked right under the body
  vec4 col = vec4(0.0);
  {
    float tf = (${FLOOR_Y.toFixed(3)} - ro.y) / rd.y;
    if (tf > 0.0) {
      vec3 q = ro + rd * tf;
      vec2 d = (q.xz - vec2(-0.3, 0.0)) / vec2(0.36, 0.3);
      float r2 = dot(d, d);
      col = pm(uShadow, (exp(-r2 * 2.6) * 0.55 + exp(-r2 * 9.0) * 0.45) * mix(0.16, 0.6, uDark));
    }
  }

  vec3 bc = vec3(-0.3, -0.07, 0.0); float brad = 0.72;
  vec3 oc = ro - bc; float bb = dot(oc, rd); float cc = dot(oc, oc) - brad * brad; float hh = bb * bb - cc;
  if (hh < 0.0) { gl_FragColor = col; return; }
  float tn = max(-bb - sqrt(hh), 0.0), tfar = -bb + sqrt(hh);

  float t = tn, hit = -1.0, minR = 1e9;
  for (int i = 0; i < 90; i++) {
    float d = sdBody(ro + rd * t);
    if (d < 0.25 * pix * t) { hit = t; break; }
    minR = min(minR, d / (pix * t));
    t += d * 0.95;
    if (t > tfar) break;
  }

  float tp;
  vec4 plane = planeAt(ro, rd, pix, tp);

  if (hit < 0.0) {
    // crisp anti-aliased silhouette line on the miss side (warm ink; a soft glow in dark mode)
    float a = clamp(1.0 - minR / 1.15, 0.0, 1.0);
    col = over(pm(uRim, a * a * mix(0.5, 0.4, uDark)), col);
    gl_FragColor = over(plane, col);
    return;
  }

  vec3 p1 = ro + rd * hit;
  vec3 n1 = nBody(p1);
  float tx = hit + 0.01;
  for (int i = 0; i < 48; i++) { float d = sdBody(ro + rd * tx); if (d > -0.0008) break; tx += max(-d, 0.006); }
  vec3 p2 = ro + rd * tx;
  vec3 n2 = nBody(p2);
  float th = tx - hit;
  bool cut = p1.x < BASE_X + 0.002 && n1.x < -0.9;

  float ndv = clamp(abs(dot(n1, V)), 0.0, 1.0);
  float F1 = pow(1.0 - ndv, 2.5);
  float F2 = pow(1.0 - clamp(abs(dot(n2, V)), 0.0, 1.0), 3.0);
  float lam = clamp(dot(n1, L) * 0.5 + 0.5, 0.0, 1.0);

  // ---- lesion A: sphere-traced iso-surface
  vec4 layA = vec4(0.0); float tA = 1e9; float haloA = 0.0;
  {
    vec3 o = p1 - LA; float b = dot(o, rd), c = dot(o, o) - (RA + 0.03) * (RA + 0.03), h = b * b - c;
    float dd = dot(o, o) - b * b;
    float sA = syn(LA.x);
    float e = uEA * sA;
    haloA = e * (1.0 - 0.6 * uWash) * exp(-dd / (RA * RA * 3.5));
    if (h > 0.0) {
      float ts = max(-b - sqrt(h), 0.0), te = -b + sqrt(h), tt = ts, ht = -1.0;
      for (int i = 0; i < 28; i++) { float d = sdA(p1 + rd * tt - LA); if (d < 0.0004) { ht = tt; break; } tt += d * 0.9; if (tt > te) break; }
      if (ht >= 0.0 && hit + ht < tx) {
        tA = hit + ht;
        vec3 n = nA(p1 + rd * ht - LA);
        float nv = clamp(dot(n, V), 0.0, 1.0);
        float dif = clamp(dot(n, L), 0.0, 1.0);
        float sp = pow(clamp(dot(reflect(rd, n), L), 0.0, 1.0), 48.0);
        float rimL = pow(1.0 - nv, 1.6);
        // raw: a barely-there grey ghost
        vec4 ghost = pm(uGhost * (0.8 + 0.25 * dif), 0.07 + 0.08 * rimL);
        // enhanced: a saturated, glowing core that washes out to a rim-enhancing shell
        vec3 ec = mix(uDeepA, uRose, 0.25 + 0.75 * dif);
        ec = mix(ec, uHot, clamp(pow(nv, 4.0) * (1.0 - uWash) * 0.22 * uEA, 0.0, 1.0));
        float shell = smoothstep(0.3, 0.8, 1.0 - nv);
        ec = mix(ec, mix(uMilk, uRose, 0.55), uWash * (1.0 - shell) * 0.75);
        ec = mix(ec, uRose, uWash * shell * 0.8);
        ec += uGlint * sp * 0.5;
        float ea = clamp(mix(0.95, 0.4 + 0.6 * shell, uWash), 0.0, 1.0);
        layA = mix(ghost, pm(ec, ea), clamp(max(e * 1.6, uWash * sA), 0.0, 1.0));
      }
    }
  }

  // ---- lesion B: smooth glossy ellipsoid that fills slowly
  vec4 layB = vec4(0.0); float tB = 1e9; float haloB = 0.0;
  {
    vec3 o = p1 - LB; float br = max(LBR.x, max(LBR.y, LBR.z)) + 0.01;
    float b = dot(o, rd), c = dot(o, o) - br * br, h = b * b - c;
    float dd = dot(o, o) - b * b;
    float e = uEB * syn(LB.x);
    haloB = e * exp(-dd / (br * br * 2.6));
    if (h > 0.0) {
      float ts = max(-b - sqrt(h), 0.0), te = -b + sqrt(h), tt = ts, ht = -1.0;
      for (int i = 0; i < 24; i++) { float d = sdB(p1 + rd * tt - LB); if (d < 0.0004) { ht = tt; break; } tt += d * 0.9; if (tt > te) break; }
      if (ht >= 0.0 && hit + ht < tx) {
        tB = hit + ht;
        vec3 q = p1 + rd * ht - LB;
        vec3 n = normalize(q / (LBR * LBR));
        float nv = clamp(dot(n, V), 0.0, 1.0);
        float dif = clamp(dot(n, L), 0.0, 1.0);
        float sp = pow(clamp(dot(reflect(rd, n), L), 0.0, 1.0), 70.0);
        float fr = pow(1.0 - nv, 2.5);
        vec4 ghost = pm(uGhost * (0.8 + 0.25 * dif), 0.06 + 0.07 * fr);
        // fills from the inside out: the core brightens with the slowly rising signal
        vec3 ec = mix(uDeepB, uVio, 0.15 + 0.85 * dif);
        ec = mix(ec, uHotB, clamp(pow(nv, 2.0) * e * 0.5, 0.0, 1.0));
        ec = mix(ec, uDeepB, fr * 0.5);
        ec += uGlint * (sp * 0.95 + pow(1.0 - nv, 5.0) * 0.25);
        layB = mix(ghost, pm(ec, mix(0.55, 0.95, e)), clamp(e * 1.5, 0.0, 1.0));
      }
    }
  }

  // ---- vessels: nearest covering tube segment, shaded as a lit cylinder
  float bCov = 0.0, bT = 1e9, bH = 0.0, bDq = 0.0, bR = 0.0;
  vec3 bPq = vec3(0.0), bAx = vec3(1.0, 0.0, 0.0);
  vec2 bArr = vec2(0.0);
  float vG = 0.0;
  for (int i = 0; i < NSEG; i++) {
    if (i >= uN) break;
    vec4 S0 = uS0[i], S1 = uS1[i];
    vec3 ba = S1.xyz - S0.xyz, oa = ro - S0.xyz;
    float bbv = dot(ba, ba), brr = dot(ba, rd), bo = dot(ba, oa), rdo = dot(rd, oa);
    float hq = clamp((bo - rdo * brr) / max(bbv - brr * brr, 1e-7), 0.0, 1.0);
    float tq = hq * brr - rdo;
    vec3 pq = oa + rd * tq - ba * hq;
    float dq = length(pq);
    float r = mix(S0.w, S1.w, hq);
    float fp = pix * tq;
    float re = max(r, fp * 0.75);
    if (dq > re + fp * 4.0 + r * 3.0 || tq < hit || tq > tx) continue;
    float cov = clamp((re - dq) / fp + 0.5, 0.0, 1.0) * (r / re);
    // bolus front glow (only near the travelling front)
    float arr = mix(uS2[i].x, uS2[i].y, hq);
    float dt = uT - arr;
    if (dt > -0.8 && dt < 6.0) {
      float fr = smoothstep(-0.8, 0.0, dt) * exp(-max(dt, 0.0) / 1.3);
      vG = max(vG, fr * exp(-dq * dq / (r * r * 10.0 + fp * fp * 4.0)) * syn(S0.x));
    }
    if (cov > 0.01 && (tq < bT || cov > bCov * 1.8) && cov > bCov * 0.5) {
      bCov = cov; bT = tq; bH = hq; bDq = dq; bR = r; bPq = pq; bAx = ba;
      bArr = uS2[i].xy;
    }
  }
  vec4 layV = vec4(0.0);
  if (bCov > 0.0) {
    vec3 ax = normalize(bAx);
    vec3 e = bDq > 1e-6 ? bPq / bDq : vec3(0.0);
    vec3 w = V - ax * dot(V, ax); w = normalize(w + 1e-5);
    float x = clamp(bDq / max(bR, 1e-5), 0.0, 1.0);
    vec3 n = normalize(e * x + w * sqrt(1.0 - x * x));
    float dif = clamp(dot(n, L), 0.0, 1.0);
    float sp = pow(clamp(dot(reflect(rd, n), L), 0.0, 1.0), 36.0);
    vec3 pw = ro + rd * bT;
    float depth = max(-sdDome(pw), 0.0);
    float shallow = 1.0 - smoothstep(0.02, 0.3, depth);
    float arr = mix(bArr.x, bArr.y, bH);
    float dt = uT - arr;
    float sy = syn(pw.x);
    float on = smoothstep(-0.6, 0.0, dt) * sy;
    float front = on * exp(-max(dt, 0.0) / 1.3);
    float rest = 1.0 - 0.3 * smoothstep(40.0, 260.0, dt);
    vec3 cE = mix(uDeepA, uRose, 0.45 + 0.55 * dif);
    cE = mix(cE, uHot, front * 0.85);
    cE += uGlint * sp * 0.6;
    cE = mix(mix(uDeepV, uRose, 0.35), cE, 0.35 + 0.65 * shallow);   // deeper vessels: fainter, bluer-grey
    vec3 cG = uGhost * (0.75 + 0.35 * dif);
    vec3 c = mix(cG, cE, on);
    float a = mix(0.13 + 0.05 * sy, 0.95 * rest, on) * mix(0.4, 1.0, shallow);
    layV = pm(c, a * bCov);
  }

  // ---- fibroglandular volume: front/back of the nearest object, so tissue veils what is behind it
  float tObj = min(min(tA, tB), bCov > 0.35 ? bT : 1e9);
  vec4 tisF = vec4(0.0), tisB = vec4(0.0);
  {
    const float NS = 22.0;
    float st = th / NS;
    for (int i = 0; i < 22; i++) {
      float ts = hit + (float(i) + dith) * st;
      vec3 p = ro + rd * ts;
      float dn = gland(p, sdBody(p));
      if (dn <= 0.0) continue;
      float sy = syn(p.x);
      vec3 c = mix(uTissue, uWarm, sy);
      float a = dn * st * mix(5.0, 3.0 + 2.5 * uBpe, sy) * mix(1.0, 0.8, uDark);
      vec4 s = pm(c, a);
      if (ts < tObj) tisF = over(tisF, s); else tisB = over(tisB, s);
    }
  }

  // ---- compose back to front
  bool pBack = tp > tx, pIn = tp > hit && tp <= tx, pFront = tp > 0.0 && tp <= hit;
  if (pBack) col = over(plane, col);
  float s1 = syn(p1.x);
  // milky glass body and back-face edge
  col = over(pm(uRim, F2 * 0.12), col);
  col = over(pm(uMilk, mix(0.42, 0.07, uDark) * (1.0 - exp(-th * 3.0)) * (0.85 + 0.25 * lam)), col);
  if (p2.x < BASE_X + 0.002) {   // the chest-wall cut seen from the front, through the glass
    float g = gland(p2 + vec3(0.003, 0.0, 0.0), -0.1);
    col = over(pm(mix(uTissue, uWarm, syn(p2.x)), g * 0.18), col);
    col = over(pm(uMilk, mix(0.3, 0.08, uDark)), col);
  }
  col = over(tisB, col);
  col = over(pm(uRose, clamp(haloA, 0.0, 1.0) * mix(0.28, 0.42, uDark)), col);
  col = over(pm(uVio, clamp(haloB, 0.0, 1.0) * mix(0.22, 0.38, uDark)), col);
  col = over(pm(uRose, clamp(vG, 0.0, 1.0) * mix(0.55, 0.8, uDark)), col);
  // painter's order for the three solid layers
  vec4 l0 = layA, l1 = layB, l2 = layV; float d0 = tA, d1 = tB, d2 = bCov > 0.0 ? bT : 1e9;
  if (d0 < d1) { vec4 tv = l0; l0 = l1; l1 = tv; float td = d0; d0 = d1; d1 = td; }
  if (d1 < d2) { vec4 tv = l1; l1 = l2; l2 = tv; float td = d1; d1 = d2; d2 = td; }
  if (d0 < d1) { vec4 tv = l0; l0 = l1; l1 = tv; float td = d0; d0 = d1; d1 = td; }
  col = over(l0, col); col = over(l1, col); col = over(l2, col);
  col = over(tisF, col);
  if (pIn) col = over(plane, col);

  // the clean chest-wall cut: a flat slice face showing the tissue, outlined in rose
  {
    float tr = (BASE_X - ro.x) / rd.x;
    if (tr > 0.0) {
      vec3 q = ro + rd * tr;
      float fpr = pix * tr / max(abs(rd.x), 0.22);
      float dd = sdDome(q);
      float ring = 1.0 - smoothstep(0.35 * fpr, 1.35 * fpr, abs(dd));
      float behind = tr > hit + 0.004 ? 0.6 : 1.0;
      if (cut) {
        float g = gland(q + vec3(0.002, 0.0, 0.0), dd);
        vec3 fc = mix(uMilk, mix(uTissue, uWarm, s1), clamp(g * 0.4, 0.0, 1.0));
        col = over(pm(fc, mix(0.26, 0.12, uDark) + g * 0.08), col);
      }
      col = over(pm(mix(uRose, uGhost, 0.55 * (1.0 - s1)), ring * 0.9 * behind), col);
    }
  }

  // areola: a soft tinted disc around the nipple
  {
    vec3 q = p1 - NIPC; float ax = dot(q, NAX); float rr = length(q - NAX * ax);
    float ar = (1.0 - smoothstep(0.05, 0.068, rr)) * step(-0.08, ax);
    col = over(pm(mix(uGhost, uWarm, s1), ar * 0.14), col);
  }

  // glass rim: warm ink falloff plus a thin bright fresnel edge
  if (!cut) {
    col = over(pm(uRim, F1 * mix(0.26, 0.2, uDark) * (1.0 - 0.4 * lam)), col);
    col = over(pm(uGlint, pow(1.0 - ndv, 9.0) * mix(0.75, 0.55, uDark)), col);
    vec3 Hh = normalize(L + V);
    float nh = clamp(dot(n1, Hh), 0.0, 1.0);
    float sp = pow(nh, 140.0) * mix(0.85, 0.5, uDark) + pow(nh, 18.0) * mix(0.07, 0.015, uDark);
    col = over(pm(uGlint, sp), col);
  }
  if (pFront) col = over(plane, col);
  gl_FragColor = col;
}`;

  let gl = null, prog = null, U = {}, NSEG = 0;
  function initGL() {
    try {
      gl = view.getContext('webgl', { antialias: false, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false });
    } catch (e) { gl = null; }
    if (!gl) return false;
    const maxV = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 224;
    NSEG = Math.max(16, Math.min(SEGS.length, Math.floor((maxV - 48) / 3)));
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('perfuse-lite shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS(NSEG));
    if (!vs || !fs) { gl = null; return false; }
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('perfuse-lite link:', gl.getProgramInfoLog(prog)); gl = null; return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(prog, i); const name = info.name.replace(/\[0\]$/, ''); U[name] = gl.getUniformLocation(prog, info.name); }
    // vessel segments
    const N = Math.min(NSEG, SEGS.length);
    const s0 = new Float32Array(NSEG * 4), s1 = new Float32Array(NSEG * 4), s2 = new Float32Array(NSEG * 4);
    for (let i = 0; i < N; i++) {
      const s = SEGS[i];
      s0.set([s.a[0], s.a[1], s.a[2], s.ra], i * 4);
      s1.set([s.b[0], s.b[1], s.b[2], s.rb], i * 4);
      s2.set([s.ta, s.tb, 0, 0], i * 4);
    }
    gl.uniform4fv(U.uS0, s0); gl.uniform4fv(U.uS1, s1); gl.uniform4fv(U.uS2, s2);
    gl.uniform1i(U.uN, N);
    // noise texture
    const R = new Uint8Array(256 * 256), rn = mulberry32(7);
    for (let i = 0; i < R.length; i++) R[i] = Math.floor(rn() * 256);
    const px = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const o = (y * 256 + x) * 4;
      px[o] = R[y * 256 + x];
      px[o + 1] = R[((y + 17) & 255) * 256 + ((x + 37) & 255)];
      px[o + 3] = 255;
    }
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(U.uNoise, 0);
    gl.uniform3fv(U.uPivot, PIVOT); gl.uniform3fv(U.uCam, CAM); gl.uniform3fv(U.uTa, TARGET);
    gl.uniform1f(U.uFL, FL);
    gl.uniform2f(U.uOff, FIT.cu, FIT.cv);
    gl.uniform3fv(U.uLight, norm([0.45, 0.85, 0.5]));
    view.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; kick(); });
    return true;
  }
  function applyTheme() {
    readTheme();
    if (!gl) return;
    const set = (n, v) => U[n] && gl.uniform3fv(U[n], v);
    set('uRose', TH.rose); set('uHot', TH.hot); set('uDeepA', TH.deepA);
    set('uVio', TH.vio); set('uHotB', TH.hotB); set('uDeepB', TH.deepB);
    set('uTissue', TH.tissue); set('uWarm', TH.warm); set('uRim', TH.rim); set('uGlint', TH.glint);
    set('uMilk', TH.milk); set('uGhost', TH.ghost); set('uDeepV', TH.deepV); set('uShadow', TH.shadow);
    gl.uniform1f(U.uDark, TH.dark ? 1 : 0);
  }

  /* ---------------- 2D fallback (no WebGL): projected outline + vessel tree + lesions ---------------- */
  function draw2D(R, w, h, wipeX) {
    const c = view.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    const P = (p) => project(R, p, w, h);
    const rgba = (v, a) => `rgba(${v.map((x) => Math.round(clamp(x, 0, 1) * 255)).join(',')},${a})`;
    const synth = wipeX > 5;
    const sc = P([-0.3, FLOOR_Y, 0]);
    c.save(); c.translate(sc[0], sc[1]); c.scale(1, 0.3);
    const sg = c.createRadialGradient(0, 0, 0, 0, 0, 0.42 * sc[2]);
    sg.addColorStop(0, rgba(TH.shadow, TH.dark ? 0.5 : 0.14)); sg.addColorStop(1, rgba(TH.shadow, 0));
    c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 0.42 * sc[2], 0, 7); c.fill(); c.restore();
    c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let r = 0;
      while (r < 1.2 && sdBodyJS([-0.3 + dx * r, -0.08 + dy * r, 0]) < 0) r += 0.002;
      const q = P([-0.3 + dx * r, -0.08 + dy * r, 0]);
      i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
    }
    c.closePath();
    c.fillStyle = rgba(TH.milk, TH.dark ? 0.08 : 0.5); c.fill();
    c.strokeStyle = rgba(TH.rim, 0.45); c.lineWidth = 1.2; c.stroke();
    c.lineCap = 'round';
    for (const s of SEGS) {
      const a = P(s.a), b = P(s.b);
      const filled = synth && state.t > s.tb;
      c.strokeStyle = filled ? TH.css.rose : rgba(TH.ghost, 0.15);
      c.lineWidth = Math.max(0.5, s.ra * a[2] * 1.4);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    if (!synth) return;
    const la = P(LA), lb = P(LB);
    c.globalAlpha = clamp(enh(KA, state.t) / PEAK_A, 0, 1); c.fillStyle = TH.css.rose; c.beginPath(); c.arc(la[0], la[1], RA * la[2], 0, 7); c.fill();
    c.globalAlpha = clamp(enh(KB, state.t), 0, 1); c.fillStyle = TH.css.vio; c.beginPath(); c.ellipse(lb[0], lb[1], LBR[0] * lb[2], LBR[1] * lb[2], 0, 0, 7); c.fill();
    c.globalAlpha = 1;
  }

  /* ---------------- state ---------------- */
  const TMAX = 360, WIPE_MS = 2000, PLAY_MS = 12500, T_SWEEP = 8;
  const WIPE_FROM = BASE_X - 0.04, WIPE_TO = NIP[0] + 0.05;
  const state = { mode: 'raw', t: 0 };   // raw | synth | play | hold
  let phaseStart = 0;
  let clock = 0, lastNow = 0;
  let frozen = false, wipeOverride = -1;
  let userYaw = 0, yawVel = 0, dragging = false;
  let visible = true, raf = 0, userTook = false;
  // first 45% of the play covers the vascular phase (8-60 s), the rest the slow kinetics
  const simTime = (r) => (r < 0.45 ? T_SWEEP + (60 - T_SWEEP) * (r / 0.45) : 60 + (TMAX - 60) * Math.pow((r - 0.45) / 0.55, 1.2));
  const PEAK_A = (() => { let m = 0; for (let s = 0; s <= TMAX; s++) m = Math.max(m, enh(KA, s)); return m; })();

  const phaseEl = document.createElement('span'); phaseEl.className = 'pf-phase';
  const timeEl = document.createElement('span'); timeEl.className = 'pf-t'; timeEl.setAttribute('aria-hidden', 'true');
  statusEl.textContent = ''; statusEl.append(phaseEl, timeEl);
  statusEl.removeAttribute('aria-live'); phaseEl.setAttribute('aria-live', 'polite');

  function phaseHtml() {
    const { mode, t } = state;
    if (mode === 'raw') return 'Non-contrast scan. Nothing stands out.';
    if (mode === 'synth') return 'Synthesizing the contrast scan, no gadolinium…';
    if (t < KA.t0 + 2) return 'Arterial phase: contrast flows in through the vessels.';
    if (t < 120) return 'Lesion <b class="a">A</b> lights up fast, <b class="b">B</b> slowly.';
    if (t < 220) return '<b class="a">A</b> has peaked, <b class="b">B</b> keeps rising.';
    return '<b class="a">A</b> washes out: suspicious. <b class="b">B</b> persists: benign.';
  }
  let lastPhase = '', lastTime = '';
  function setStatus() {
    const h = phaseHtml();
    if (h !== lastPhase) { phaseEl.innerHTML = h; lastPhase = h; }
    const tt = state.mode === 'play' || state.mode === 'hold' ? `${Math.round(state.t)} s` : '';
    if (tt !== lastTime) { timeEl.textContent = tt; lastTime = tt; }
  }
  const setPlayLabel = (txt) => { playLabel.textContent = txt; };
  function startSynth() { state.mode = 'synth'; state.t = 0; phaseStart = performance.now(); setPlayLabel('Synthesizing'); kick(); }
  function setT(v) { state.t = clamp(v, 0, TMAX); state.mode = 'hold'; setPlayLabel('Replay'); kick(); }
  function toRaw() { state.mode = 'raw'; state.t = 0; setPlayLabel('Synthesize'); kick(); }

  /* ---------------- sizing ---------------- */
  let cw = 0, ch = 0, cssW = 1, cssH = 1, kw = 0, kh = 0, dpr = 1;
  let scale = 1, slowFrames = 0;
  const MARGIN = 0.05;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = view.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    const base = clamp(Math.max(dpr, 1.5), 1, 2);
    const s = Math.max(base * scale, Math.min(base, 1.25));
    cw = Math.max(1, Math.round(cssW * s)); ch = Math.max(1, Math.round(cssH * s));
    if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
    const asp = cssW / cssH, avail = 0.5 - MARGIN;
    ZOOM = Math.min((avail * asp) / FIT.hu, avail / FIT.hv);
    const q = chart.getBoundingClientRect();
    kw = Math.max(1, Math.round(q.width * dpr)); kh = Math.max(1, Math.round(q.height * dpr));
    if (chart.width !== kw || chart.height !== kh) { chart.width = kw; chart.height = kh; }
  }

  /* ---------------- frame ---------------- */
  function frame(now) {
    raf = 0;
    now = now || performance.now();
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    if (lastNow && !frozen && dt > 0.026) { if (++slowFrames > 40 && scale > 0.66) { scale = Math.max(0.65, scale * 0.85); slowFrames = 0; resize(); } } else slowFrames = Math.max(0, slowFrames - 1);
    lastNow = now;
    const moving = !frozen && !reduceMotion;
    if (moving) clock += dt;

    if (!dragging) { userYaw += yawVel; yawVel *= 0.93; if (Math.abs(yawVel) < 1e-4) yawVel = 0; }
    let wipe = -10, planeA = 0;
    if (state.mode === 'synth') {
      const r = wipeOverride >= 0 ? wipeOverride : (now - phaseStart) / WIPE_MS;
      if (r >= 1) { state.mode = 'play'; phaseStart = now; }
      else { const e = ease(r); wipe = WIPE_FROM + (WIPE_TO - WIPE_FROM) * e; planeA = Math.pow(Math.sin(Math.PI * Math.min(1, r * 1.04)), 0.4); state.t = T_SWEEP * r; }
    }
    if (state.mode === 'play') {
      const r = clamp((now - phaseStart) / PLAY_MS, 0, 1);
      state.t = simTime(r);
      if (r >= 1) { state.mode = 'hold'; setPlayLabel('Replay'); onPlayEnd(); }
    }
    const showEnh = state.mode === 'play' || state.mode === 'hold';
    if (showEnh) wipe = 10;
    const t = state.mode === 'raw' ? 0 : state.t;

    // slow eased turntable (about +-35 deg) with a gentle nod, so the volume reveals its depth
    const ph = (clock * 2 * Math.PI) / 22;
    const auto = moving ? TURN * Math.sin(ph) : 0;
    const lo = YAW0 - TURN - 0.15, hi = YAW0 + TURN + 0.15;
    let yaw = YAW0 + auto + userYaw;
    if (yaw < lo || yaw > hi) { yaw = clamp(yaw, lo, hi); userYaw = yaw - YAW0 - auto; yawVel = 0; }
    const pitch = moving ? PITCH * Math.sin(ph * 1.7 + 0.6) : 0;
    const R = rotation(yaw, pitch);
    const eA = enh(KA, t) / PEAK_A, eB = enh(KB, t);
    const tPeak = KA.t0 + 30;
    const wash = sstep(tPeak + 20, TMAX - 60, t);

    if (gl) {
      gl.viewport(0, 0, cw, ch);
      gl.uniform2f(U.uRes, cw, ch);
      gl.uniform1f(U.uZoom, ZOOM);
      gl.uniformMatrix3fv(U.uR, false, new Float32Array([R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]]));
      gl.uniform1f(U.uT, t);
      gl.uniform1f(U.uWipe, wipe);
      gl.uniform1f(U.uPlaneA, planeA);
      gl.uniform1f(U.uEA, eA);
      gl.uniform1f(U.uWash, wash);
      gl.uniform1f(U.uEB, eB);
      gl.uniform1f(U.uBpe, sstep(10, 240, t));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      draw2D(R, cw, ch, wipe);
    }

    placeTag(tagA, R, LA, RA + 0.03, clamp((t - KA.t0 - 3) / 8, 0, 1), showEnh);
    placeTag(tagB, R, LB, 0.1, clamp((t - KB.t0 - 25) / 25, 0, 1), showEnh);

    drawChart();
    setStatus();
    schedule();
  }
  // tags sit just outside each lesion, pushed away from the chest wall (where the vessels come from)
  function placeTag(el, R, P, rad, e, on) {
    if (!el) return;
    const q = project(R, P, cssW, cssH);
    const c = project(R, [BASE_X, P[1] * 0.6, P[2] * 0.4], cssW, cssH);
    let dx = q[0] - c[0], dy = q[1] - c[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const off = rad * q[2] + 8;
    const x = q[0] + dx * off, y = q[1] + dy * off;
    const tx = dx < -0.3 ? '-100%' : dx > 0.3 ? '0%' : '-50%';
    const ty = dy < -0.3 ? '-100%' : dy > 0.3 ? '0%' : '-50%';
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${tx}, ${ty})`;
    el.style.opacity = (on ? e : 0).toFixed(2);
  }

  /* ---------------- kinetic chart = timeline ---------------- */
  const CH_PAD = { l: 4, r: 22, t: 12, b: 22 };
  const YMAX = 1.5;
  const chartX = (s) => (CH_PAD.l + (s / TMAX) * (kw / dpr - CH_PAD.l - CH_PAD.r)) * dpr;
  function drawChart() {
    const c = cctx, C = TH.css;
    const pt = CH_PAD.t * dpr, plotH = kh - pt - CH_PAD.b * dpr, yb = pt + plotH;
    const Y = (v) => yb - (v / YMAX) * plotH;
    c.clearRect(0, 0, kw, kh);
    const shown = state.mode === 'raw' ? 0 : state.t;
    const xc = chartX(shown);
    c.fillStyle = C.ink;
    c.globalAlpha = TH.dark ? 0.07 : 0.06;
    for (let m = 1; m <= 5; m++) c.fillRect(Math.round(chartX(m * 60)), pt, dpr, plotH);
    c.globalAlpha = TH.dark ? 0.28 : 0.22;
    c.fillRect(chartX(0), Math.round(yb), chartX(TMAX) - chartX(0), dpr);
    c.globalAlpha = 1;
    c.font = `500 ${Math.round(10.5 * dpr)}px "IBM Plex Mono", ui-monospace, monospace`;
    c.fillStyle = C.ink2; c.textBaseline = 'alphabetic';
    for (let m = 0; m <= 6; m++) {
      c.textAlign = m === 0 ? 'left' : m === 6 ? 'right' : 'center';
      c.fillText(m === 6 ? '6 min' : String(m), m === 6 ? chartX(TMAX) + CH_PAD.r * dpr * 0.9 : chartX(m * 60), kh - 5 * dpr);
    }

    const path = (k, from, to) => {
      c.beginPath();
      let first = true;
      for (let s = from; s <= to + 0.001; s += 1.5) { const x = chartX(s), y = Y(enh(k, s)); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; }
      c.lineTo(chartX(to), Y(enh(k, to)));
    };
    c.lineJoin = 'round'; c.lineCap = 'round';
    const curves = [[KB, C.vio], [KA, C.rose]];
    // ghost of what is to come: faint dashed curves ahead of the playhead
    c.setLineDash([2 * dpr, 4 * dpr]); c.lineWidth = 1.25 * dpr; c.globalAlpha = TH.dark ? 0.35 : 0.3;
    for (const [k, col] of curves) { c.strokeStyle = col; path(k, shown, TMAX); c.stroke(); }
    c.setLineDash([]); c.globalAlpha = 1;
    if (shown > 0) {
      for (const [k, col] of curves) {
        path(k, 0, shown);
        c.lineTo(chartX(shown), yb); c.lineTo(chartX(0), yb); c.closePath();
        const g = c.createLinearGradient(0, pt, 0, yb);
        g.addColorStop(0, col + (TH.dark ? '40' : '30')); g.addColorStop(1, col + '00');
        c.fillStyle = g; c.fill();
      }
      for (const [k, col] of curves) {
        c.strokeStyle = col; c.lineWidth = 2 * dpr;
        path(k, 0, shown); c.stroke();
      }
    }
    const xl = Math.round(xc) + 0.5;
    c.strokeStyle = C.ink; c.lineWidth = dpr; c.globalAlpha = TH.dark ? 0.4 : 0.3;
    c.beginPath(); c.moveTo(xl, pt - 6 * dpr); c.lineTo(xl, yb); c.stroke();
    c.globalAlpha = 1;
    c.font = `600 ${Math.round(11 * dpr)}px "IBM Plex Mono", ui-monospace, monospace`;
    c.textBaseline = 'middle';
    if (shown > KA.t0 - 2) {
      const ya = Y(enh(KA, shown)), ybb = Y(enh(KB, shown));
      let la = ya, lb = ybb;
      const gap = 13 * dpr;
      if (Math.abs(la - lb) < gap) { const m = (la + lb) / 2; const s = la <= lb ? -1 : 1; la = m + s * gap / 2; lb = m - s * gap / 2; }
      for (const [y, ly, col, lab] of [[ybb, lb, C.vio, 'B'], [ya, la, C.rose, 'A']]) {
        c.fillStyle = C.paper; c.beginPath(); c.arc(xc, y, 5 * dpr, 0, 7); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(xc, y, 3.4 * dpr, 0, 7); c.fill();
        const right = xc + 18 * dpr < chartX(TMAX) + CH_PAD.r * dpr;
        c.textAlign = right ? 'left' : 'right';
        c.fillText(lab, right ? xc + 9 * dpr : xc - 9 * dpr, ly);
      }
    }
    c.fillStyle = C.paper; c.strokeStyle = C.rose; c.lineWidth = 2 * dpr;
    c.beginPath(); c.arc(xc, yb, 5 * dpr, 0, 7); c.fill(); c.stroke();
  }

  function schedule() {
    const anim = (!frozen && !reduceMotion) || dragging || yawVel !== 0 || state.mode === 'synth' || state.mode === 'play';
    if (!raf && visible && !document.hidden && anim) raf = requestAnimationFrame(frame);
    if (!anim) lastNow = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  /* ---------------- interaction ---------------- */
  let lastX = 0;
  view.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; yawVel = 0; view.setPointerCapture(e.pointerId); kick(); });
  view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const d = (e.clientX - lastX) * 0.009; lastX = e.clientX;
    userYaw += d; yawVel = yawVel * 0.5 + d * 0.5; kick();
  });
  const end = () => { if (dragging) { dragging = false; kick(); } };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  let scrubbing = false;
  const scrubTo = (e) => {
    const r = chart.getBoundingClientRect();
    setT(clamp((e.clientX - r.left - CH_PAD.l) / (r.width - CH_PAD.l - CH_PAD.r), 0, 1) * TMAX);
  };
  chart.addEventListener('pointerdown', (e) => { takeOver(); scrubbing = true; chart.setPointerCapture(e.pointerId); scrubTo(e); });
  chart.addEventListener('pointermove', (e) => { if (scrubbing) scrubTo(e); });
  chart.addEventListener('pointerup', () => { scrubbing = false; });
  chart.addEventListener('pointercancel', () => { scrubbing = false; });
  chart.setAttribute('tabindex', '0');
  chart.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); takeOver(); setT((state.mode === 'raw' ? 0 : state.t) + (e.key === 'ArrowRight' ? 10 : -10)); }
  });
  playBtn.addEventListener('click', () => { takeOver(); startSynth(); });
  new MutationObserver(() => { applyTheme(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------------- self-running demo ---------------- */
  let demoTimer = 0;
  function takeOver() { userTook = true; clearTimeout(demoTimer); }
  function onPlayEnd() {
    if (userTook) return;
    demoTimer = setTimeout(() => { if (!userTook) { toRaw(); demoTimer = setTimeout(() => { if (!userTook) startSynth(); }, 2600); } }, 5000);
  }

  /* ---------------- lifecycle ---------------- */
  if (/pftheme=dark/.test(location.hash)) document.documentElement.dataset.theme = 'dark';
  if (!/pfnogl/.test(location.hash)) initGL();
  applyTheme();
  const ro = new ResizeObserver(() => { resize(); kick(); });
  ro.observe(view); ro.observe(chart);
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(view);
  document.addEventListener('visibilitychange', () => { lastNow = 0; if (!document.hidden) kick(); });
  resize();
  setPlayLabel('Synthesize');
  const dbg = location.hash.match(/pf=(\d+(?:\.\d+)?)/);
  const dbgWipe = location.hash.match(/pfwipe=(\d*\.?\d+)/);
  if (dbgWipe) { frozen = true; userTook = true; state.mode = 'synth'; phaseStart = Infinity; wipeOverride = +dbgWipe[1]; setPlayLabel('Synthesizing'); }
  else if (dbg) { frozen = true; userTook = true; if (+dbg[1] > 0) setT(+dbg[1]); }
  else if (reduceMotion) setT(120);
  else demoTimer = setTimeout(startSynth, 1800);
  setStatus();
  kick();
})();
