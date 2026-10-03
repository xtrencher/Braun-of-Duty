import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Procedural skinned humanoid in a business suit. Limbs and torso are smooth tubes
 * bound to a 15-bone skeleton with blended weights at the joints, the suit is painted
 * (lapels, shirt, tie, buttons, pockets, cloth weave) and the head is a sculpted
 * profile with a painted face and a hair cap.
 */

// ---------------------------------------------------------------- small canvas helpers
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const hashf = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
function texOf(c, srgb = true, wrap = THREE.RepeatWrapping) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = wrap; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; }
function normalFromHeight(h, w, hh, strength) {
  const c = canvas(w, hh), g = c.getContext('2d'), img = g.createImageData(w, hh), d = img.data;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const l = h[y * w + ((x - 1 + w) % w)], r = h[y * w + ((x + 1) % w)], u = h[((y - 1 + hh) % hh) * w + x], dn = h[((y + 1) % hh) * w + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const len = Math.hypot(nx, ny, nz);
    const i = (y * w + x) * 4; d[i] = (nx / len * 0.5 + 0.5) * 255; d[i + 1] = (ny / len * 0.5 + 0.5) * 255; d[i + 2] = (nz / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
function grayFromArray(v, w, h) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) { const k = Math.max(0, Math.min(1, v[i])) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = k; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
/** Fine cloth weave: tiny checker in a height array. */
function weave(height, w, h, amp = 0.03) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) height[y * w + x] += (((x >> 1) + (y >> 1)) & 1 ? amp : -amp) + (hashf(x, y) - 0.5) * amp;
}
function rasterize(g, w, h, fn) {
  // Reads back the colour canvas as a mask helper: returns the alpha of a region painted into an offscreen canvas.
  const img = g.getImageData(0, 0, w, h).data; return (x, y) => fn(img, ((y * w + x) | 0) * 4);
}

// ---------------------------------------------------------------- suit textures
export function suitTextures(base = '#1b2640') {
  const W = 1024, H = 1024;
  const navy = base, navyLight = '#2a3756', navyDark = '#121a2e';
  // ---- jacket (torso): u around the body with the front centre at u = 0.5, v from hem (0) to collar (1)
  const c = canvas(W, H), g = c.getContext('2d');
  const X = u => u * W, Y = v => (1 - v) * H;
  g.fillStyle = navy; g.fillRect(0, 0, W, H);
  // fabric variation
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`; const x = Math.random() * W, y = Math.random() * H; g.fillRect(x, y, 2 + Math.random() * 40, 1); }
  const height = new Float32Array(W * H).fill(0.5), rough = new Float32Array(W * H).fill(0.88);
  const mask = canvas(W, H), mg = mask.getContext('2d');   // regions encoded by colour channel for height/roughness
  // seams: centre back, sides, shoulders
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
  for (const u of [0.0, 1.0]) { g.beginPath(); g.moveTo(X(u), Y(0)); g.lineTo(X(u), Y(0.92)); g.stroke(); }
  for (const u of [0.25, 0.75]) { g.strokeStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(X(u), Y(0)); g.lineTo(X(u), Y(0.9)); g.stroke(); }
  // back vent and hem stitch
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, Y(0.03)); g.lineTo(W, Y(0.03)); g.stroke();
  // flap pockets
  for (const sgn of [-1, 1]) {
    const u0 = 0.5 + sgn * 0.1, u1 = 0.5 + sgn * 0.25;
    g.fillStyle = navyDark; g.fillRect(Math.min(X(u0), X(u1)), Y(0.235), Math.abs(X(u1) - X(u0)), 6);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(Math.min(X(u0), X(u1)), Y(0.235), Math.abs(X(u1) - X(u0)), Y(0.19) - Y(0.235));
    mg.fillStyle = '#ff0000'; mg.fillRect(Math.min(X(u0), X(u1)), Y(0.235), Math.abs(X(u1) - X(u0)), Y(0.19) - Y(0.235));
  }
  // breast pocket with a white pocket square
  g.fillStyle = navyDark; g.fillRect(X(0.5 - 0.2), Y(0.64), X(0.08), 5);
  g.fillStyle = '#eeeeea'; g.beginPath(); g.moveTo(X(0.5 - 0.19), Y(0.64)); g.lineTo(X(0.5 - 0.14), Y(0.64)); g.lineTo(X(0.5 - 0.165), Y(0.665)); g.closePath(); g.fill();
  // shirt inside the V opening
  const V = [[0.5 - 0.05, 1.0], [0.5 + 0.05, 1.0], [0.5 + 0.003, 0.43], [0.5 - 0.003, 0.43]];
  const poly = (ctx, pts, fill) => { ctx.beginPath(); pts.forEach(([u, v], i) => i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  poly(g, V, '#efefec'); poly(mg, V, '#00ff00');
  const sh = g.createLinearGradient(X(0.45), 0, X(0.55), 0); sh.addColorStop(0, 'rgba(0,0,0,0.25)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
  poly(g, V, sh);
  // tie: knot at the collar, blade widening to v=0.5, tucked behind the jacket below 0.43
  const tieTop = 0.96, knotW = 0.016, tieW = 0.034;
  poly(g, [[0.5 - knotW, tieTop], [0.5 + knotW, tieTop], [0.5 + knotW * 0.9, tieTop - 0.05], [0.5 - knotW * 0.9, tieTop - 0.05]], '#a30f18');
  poly(g, [[0.5 - knotW * 0.7, tieTop - 0.05], [0.5 + knotW * 0.7, tieTop - 0.05], [0.5 + tieW, 0.5], [0.5, 0.4], [0.5 - tieW, 0.5]], '#c01420');
  poly(mg, [[0.5 - knotW, tieTop], [0.5 + knotW, tieTop], [0.5 + tieW, 0.5], [0.5, 0.4], [0.5 - tieW, 0.5]], '#0000ff');
  g.save(); g.beginPath(); g.moveTo(X(0.5 - knotW), Y(tieTop - 0.05)); g.lineTo(X(0.5 + knotW), Y(tieTop - 0.05)); g.lineTo(X(0.5 + tieW), Y(0.5)); g.lineTo(X(0.5), Y(0.4)); g.lineTo(X(0.5 - tieW), Y(0.5)); g.closePath(); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 4;
  for (let k = -30; k < 30; k++) { g.beginPath(); g.moveTo(X(0.5 - 0.1) + k * 26, Y(1.0)); g.lineTo(X(0.5 + 0.1) + k * 26, Y(0.3)); g.stroke(); }
  const tg = g.createLinearGradient(X(0.5 - tieW), 0, X(0.5 + tieW), 0); tg.addColorStop(0, 'rgba(0,0,0,0.35)'); tg.addColorStop(0.35, 'rgba(255,255,255,0.12)'); tg.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = tg; g.fillRect(X(0.4), Y(1), X(0.2), H); g.restore();
  // lapels (satin), with a notch
  for (const sgn of [-1, 1]) {
    const L = [[0.5 + sgn * 0.05, 1.0], [0.5 + sgn * 0.105, 0.86], [0.5 + sgn * 0.08, 0.83], [0.5 + sgn * 0.012, 0.43], [0.5 + sgn * 0.003, 0.43]];
    poly(g, L, navyLight); poly(mg, L, '#ffff00');
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.beginPath(); L.forEach(([u, v], i) => i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))); g.stroke();
  }
  // shirt collar band and points
  g.fillStyle = '#f3f3f0'; g.fillRect(X(0.38), 0, X(0.24), Y(0.965));
  for (const sgn of [-1, 1]) poly(g, [[0.5 + sgn * 0.02, 0.985], [0.5 + sgn * 0.075, 0.985], [0.5 + sgn * 0.05, 0.93]], '#f3f3f0');
  g.fillStyle = navyDark; g.fillRect(0, 0, X(0.38), Y(0.95)); g.fillRect(X(0.62), 0, X(0.38), Y(0.95));   // jacket collar at the back
  // front edge below the button, buttons
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(0.5), Y(0.43)); g.lineTo(X(0.5), Y(0)); g.stroke();
  for (const v of [0.43, 0.3]) {
    g.fillStyle = '#0d0d12'; g.beginPath(); g.arc(X(0.508), Y(v), 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.stroke();
    mg.fillStyle = '#00ffff'; mg.beginPath(); mg.arc(X(0.508), Y(v), 11, 0, Math.PI * 2); mg.fill();
  }
  // ---- height / roughness from the region mask
  const md = mg.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) {
    const r = md[i * 4], gg = md[i * 4 + 1], b = md[i * 4 + 2];
    if (r && gg && !b) { height[i] = 0.58; rough[i] = 0.72; }            // lapel (yellow)
    else if (gg && !r && !b) { height[i] = 0.47; rough[i] = 0.6; }       // shirt (green)
    else if (b && !r && !gg) { height[i] = 0.53; rough[i] = 0.32; }       // tie (blue)
    else if (gg && b && !r) { height[i] = 0.62; rough[i] = 0.3; }         // buttons (cyan)
    else if (r && !gg && !b) { height[i] = 0.54; }                         // pocket flaps (red)
  }
  weave(height, W, H, 0.012);
  const jacket = { map: texOf(c), normalMap: texOf(normalFromHeight(height, W, H, 3.0), false), roughnessMap: texOf(grayFromArray(rough, W, H), false) };
  // ---- trousers tile: weave + front/back creases
  const tw = 512, th = 512, tc = canvas(tw, th), tg2 = tc.getContext('2d');
  tg2.fillStyle = navy; tg2.fillRect(0, 0, tw, th);
  for (let i = 0; i < 700; i++) { tg2.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.02})`; tg2.fillRect(Math.random() * tw, Math.random() * th, 1, 2 + Math.random() * 30); }
  const theight = new Float32Array(tw * th).fill(0.5);
  for (let y = 0; y < th; y++) for (const cx of [0, tw / 2]) for (let k = -4; k <= 4; k++) theight[y * tw + ((cx + k + tw) % tw)] += 0.06 * (1 - Math.abs(k) / 5);
  tg2.fillStyle = 'rgba(255,255,255,0.07)'; tg2.fillRect(tw / 2 - 2, 0, 4, th); tg2.fillRect(0, 0, 2, th); tg2.fillRect(tw - 2, 0, 2, th);
  weave(theight, tw, th, 0.015);
  const trousers = { map: texOf(tc), normalMap: texOf(normalFromHeight(theight, tw, th, 3.0), false) };
  // ---- sleeve tile: navy with the shirt cuff showing at the wrist (v near 1) and a cuff button
  const sc = canvas(512, 512), sg = sc.getContext('2d');
  sg.fillStyle = navy; sg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) { sg.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.02})`; sg.fillRect(Math.random() * 512, Math.random() * 512, 1, 2 + Math.random() * 30); }
  sg.fillStyle = '#f2f2ef'; sg.fillRect(0, 0, 512, 18);
  sg.fillStyle = navyDark; sg.fillRect(0, 18, 512, 4);
  sg.fillStyle = '#0d0d12'; for (const x of [120, 140, 160]) { sg.beginPath(); sg.arc(x, 34, 5, 0, Math.PI * 2); sg.fill(); }
  const sheight = new Float32Array(512 * 512).fill(0.5); weave(sheight, 512, 512, 0.015);
  const sleeve = { map: texOf(sc), normalMap: texOf(normalFromHeight(sheight, 512, 512, 3.0), false) };
  return { jacket, trousers, sleeve };
}

// ---------------------------------------------------------------- skin and face
export function skinTile(tone = '#e2b08c') {
  const w = 256, c = canvas(w, w), g = c.getContext('2d');
  g.fillStyle = tone; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,60,40' : '255,230,210'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * w, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  const height = new Float32Array(w * w); for (let i = 0; i < w * w; i++) height[i] = 0.5 + (hashf(i % w, (i / w) | 0) - 0.5) * 0.08;
  return { map: texOf(c), normalMap: texOf(normalFromHeight(height, w, w, 1.2), false) };
}

/** Head profile (radius, height) from chin to crown, resampled by arc length so texture v is metric. */
export function headProfile() {
  const ctrl = [[0.0, -0.125], [0.045, -0.122], [0.078, -0.1], [0.096, -0.06], [0.106, -0.012], [0.109, 0.04], [0.106, 0.085], [0.09, 0.122], [0.058, 0.147], [0.0, 0.157]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'catmullrom', 0.5);
  const pts = curve.getSpacedPoints(48).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const S = s[s.length - 1];
  const vOf = y => { for (let i = 1; i < pts.length; i++) if (pts[i].y >= y) { const t = (y - pts[i - 1].y) / Math.max(1e-6, pts[i].y - pts[i - 1].y); return (s[i - 1] + t * (s[i] - s[i - 1])) / S; } return 1; };
  const rOf = y => { for (let i = 1; i < pts.length; i++) if (pts[i].y >= y) { const t = (y - pts[i - 1].y) / Math.max(1e-6, pts[i].y - pts[i - 1].y); return pts[i - 1].x + t * (pts[i].x - pts[i - 1].x); } return 0; };
  return { pts, vOf, rOf };
}

export function faceTextures(profile, { tone = '#e2b08c', hair = '#2a1c13' } = {}) {
  const W = 1024, H = 1024, c = canvas(W, H), g = c.getContext('2d');
  const { vOf, rOf } = profile;
  const py = ym => (1 - vOf(ym)) * H;
  const px = (xm, ym) => W / 2 + xm / (2 * Math.PI * Math.max(0.02, rOf(ym))) * W;
  // skin base with a vertical tone gradient and pores
  const base = g.createLinearGradient(0, 0, 0, H); base.addColorStop(0, '#e9bd9a'); base.addColorStop(0.45, tone); base.addColorStop(1, '#c99270');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,60,40' : '255,235,215'},${0.025 + Math.random() * 0.045})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  const blush = (xm, ym, r, col) => { const gr = g.createRadialGradient(px(xm, ym), py(ym), 0, px(xm, ym), py(ym), r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  blush(-0.05, -0.02, 150, 'rgba(205,90,80,0.16)'); blush(0.05, -0.02, 150, 'rgba(205,90,80,0.16)');
  blush(0, 0.07, 180, 'rgba(255,240,220,0.18)');                         // forehead sheen
  blush(0, -0.11, 220, 'rgba(60,30,30,0.18)');                           // under-chin shadow
  // beard shadow on the jaw
  g.save(); g.beginPath(); g.rect(px(-0.1, -0.08), py(-0.045), px(0.1, -0.08) - px(-0.1, -0.08), H); g.clip();
  g.fillStyle = 'rgba(70,70,95,0.13)'; g.fillRect(0, 0, W, H); g.restore();
  // eye sockets
  for (const s of [-1, 1]) blush(s * 0.034, 0.018, 95, 'rgba(90,50,45,0.22)');
  // nose: bridge highlight, side shading, nostrils
  const ng = g.createLinearGradient(px(-0.02, 0), 0, px(0.02, 0), 0); ng.addColorStop(0, 'rgba(90,45,35,0.3)'); ng.addColorStop(0.5, 'rgba(255,240,230,0.25)'); ng.addColorStop(1, 'rgba(90,45,35,0.3)');
  g.fillStyle = ng; g.fillRect(px(-0.02, 0), py(0.03), px(0.02, 0) - px(-0.02, 0), py(-0.035) - py(0.03));
  for (const s of [-1, 1]) { g.fillStyle = 'rgba(60,25,20,0.55)'; g.beginPath(); g.ellipse(px(s * 0.011, -0.037), py(-0.037), 9, 6, 0, 0, Math.PI * 2); g.fill(); }
  blush(0, -0.032, 40, 'rgba(90,40,35,0.25)');
  // eyes
  for (const s of [-1, 1]) {
    const ex = px(s * 0.033, 0.02), ey = py(0.02), rx = px(0.016, 0.02) - px(0, 0.02), ry = (py(0.012) - py(0.028)) / 2;
    g.fillStyle = '#f4f1ee'; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); g.fill();
    const ir = ry * 0.95;
    const ig = g.createRadialGradient(ex, ey, 1, ex, ey, ir); ig.addColorStop(0, '#5a3a1e'); ig.addColorStop(0.7, '#3a2412'); ig.addColorStop(1, '#1e1208');
    g.fillStyle = ig; g.beginPath(); g.arc(ex, ey, ir, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0806'; g.beginPath(); g.arc(ex, ey, ir * 0.45, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(ex - ir * 0.35, ey - ir * 0.35, ir * 0.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a1812'; g.lineWidth = 7; g.beginPath(); g.ellipse(ex, ey, rx * 1.02, ry * 1.05, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();   // upper lid + lashes
    g.strokeStyle = 'rgba(120,70,60,0.6)'; g.lineWidth = 3; g.beginPath(); g.ellipse(ex, ey, rx * 1.02, ry * 1.05, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    // eyebrow
    g.strokeStyle = '#2c1d14'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath();
    g.moveTo(px(s * 0.012, 0.046), py(0.046)); g.quadraticCurveTo(px(s * 0.035, 0.056), py(0.056), px(s * 0.058, 0.047), py(0.047)); g.stroke();
  }
  // mouth
  const my = py(-0.072), mw = px(0.027, -0.072) - px(0, -0.072);
  g.fillStyle = '#a85a52'; g.beginPath(); g.moveTo(W / 2 - mw, my); g.quadraticCurveTo(W / 2 - mw * 0.4, my - 12, W / 2 - mw * 0.15, my - 7); g.quadraticCurveTo(W / 2, my - 11, W / 2 + mw * 0.15, my - 7); g.quadraticCurveTo(W / 2 + mw * 0.4, my - 12, W / 2 + mw, my); g.closePath(); g.fill();
  g.fillStyle = '#c47a6c'; g.beginPath(); g.moveTo(W / 2 - mw, my); g.quadraticCurveTo(W / 2, my + 26, W / 2 + mw, my); g.closePath(); g.fill();
  g.strokeStyle = '#4a2420'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2 - mw, my); g.quadraticCurveTo(W / 2, my + 4, W / 2 + mw, my); g.stroke();
  blush(0, -0.063, 60, 'rgba(255,230,220,0.2)');
  // hair: hairline high at the front, down to the nape at the back
  const hairline = u => { const f = (Math.cos((u - 0.5) * Math.PI * 2) + 1) / 2; return -0.045 + 0.145 * Math.pow(smooth01(f), 0.75) + (Math.abs(u - 0.5) > 0.06 && Math.abs(u - 0.5) < 0.13 ? -0.012 : 0); };
  g.fillStyle = hair; g.beginPath(); g.moveTo(0, 0);
  for (let i = 0; i <= 200; i++) { const u = i / 200; g.lineTo(u * W, py(hairline(u))); }
  g.lineTo(W, 0); g.closePath(); g.fill();
  g.save(); g.beginPath(); g.moveTo(0, 0); for (let i = 0; i <= 200; i++) { const u = i / 200; g.lineTo(u * W, py(hairline(u)) + 6); } g.lineTo(W, 0); g.closePath(); g.clip();
  for (let i = 0; i < 9000; i++) { const x = Math.random() * W, y = Math.random() * H * 0.6; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '10,6,4' : '110,80,55'},${0.15 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + 10 + Math.random() * 30); g.stroke(); }
  g.restore();
  // roughness: lips and T-zone a bit shinier, hair matte
  const rough = new Float32Array(W * H).fill(0.58);
  const img = g.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) { const r = img[i * 4], gg = img[i * 4 + 1], b = img[i * 4 + 2]; if (r < 90 && gg < 70 && b < 60) rough[i] = 0.72; }
  return { map: texOf(c, true, THREE.ClampToEdgeWrapping), roughnessMap: texOf(grayFromArray(rough, W, H), false, THREE.ClampToEdgeWrapping) };
}

// ---------------------------------------------------------------- skinned mesh builder
function segWeights(y, segs, r = 0.065) {
  const out = []; let sum = 0;
  for (const s of segs) {
    const d = y > s.hi ? y - s.hi : y < s.lo ? s.lo - y : 0;
    const w = smooth01(1 - d / r);
    if (w > 0) { out.push([s.bone, w]); sum += w; }
  }
  if (!sum) { let best = segs[0], bd = Infinity; for (const s of segs) { const d = Math.min(Math.abs(y - s.hi), Math.abs(y - s.lo)); if (d < bd) { bd = d; best = s; } } return [[best.bone, 1]]; }
  return out.slice(0, 4).map(([b, w]) => [b, w / sum]);
}

class SkinBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.groups = []; this.count = 0; }
  _vertex(x, y, z, nx, ny, nz, u, v, weights) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v);
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    weights.forEach(([b, w], i) => { si[i] = b; sw[i] = w; });
    this.si.push(...si); this.sw.push(...sw);
    return this.count++;
  }
  /** rings bottom -> top: { y, cx, cz, rx, rz, v, w }. Ring seam at the back; the front centre is u = 0.5. */
  tube(rings, segs, material, { capTop = false, capBottom = false } = {}) {
    const start = this.idx.length;
    const rows = rings.map((ring, k) => {
      const prev = rings[Math.max(0, k - 1)], next = rings[Math.min(rings.length - 1, k + 1)];
      const slope = (((next.rx + next.rz) - (prev.rx + prev.rz)) / 2) / Math.max(1e-4, next.y - prev.y);
      const row = [];
      for (let j = 0; j <= segs; j++) {
        const phi = Math.PI + j / segs * Math.PI * 2, s = Math.sin(phi), co = Math.cos(phi);
        let nx = s / ring.rx, nz = co / ring.rz; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
        const ny = -slope, nl = Math.hypot(nx, ny, nz);
        row.push(this._vertex(ring.cx + ring.rx * s, ring.y, ring.cz + ring.rz * co, nx / nl, ny / nl, nz / nl, j / segs, ring.v, ring.w));
      }
      return row;
    });
    for (let k = 0; k < rings.length - 1; k++) for (let j = 0; j < segs; j++) {
      const a = rows[k][j], b = rows[k][j + 1], c = rows[k + 1][j + 1], d = rows[k + 1][j];
      this.idx.push(a, b, d, b, c, d);
    }
    if (capTop) this._cap(rings[rings.length - 1], rows[rows.length - 1], segs, 1);
    if (capBottom) this._cap(rings[0], rows[0], segs, -1);
    this.groups.push({ start, count: this.idx.length - start, material });
  }
  _cap(ring, row, segs, dir) {
    const centre = this._vertex(ring.cx, ring.y, ring.cz, 0, dir, 0, 0.5, ring.v, ring.w);
    for (let j = 0; j < segs; j++) { if (dir > 0) this.idx.push(centre, row[j], row[j + 1]); else this.idx.push(centre, row[j + 1], row[j]); }
  }
  build(materials) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    for (const grp of this.groups) g.addGroup(grp.start, grp.count, materials.indexOf(grp.material));
    return g;
  }
}

/**
 * Build the character. Returns { root (Group, feet at origin, faces +z), bones, mats, mesh, headGroup }.
 * Bone rotation conventions (local x axis): legs/arms swing forward with negative x, knees and
 * elbows flex with positive / negative x respectively; arms lift sideways with rotation z.
 */
export function createHuman({ tone = '#e2b08c', suit = '#1b2640', hair = '#2a1c13' } = {}) {
  const em = { emissive: 0xff2a1a, emissiveIntensity: 0 };
  const suitT = suitTextures(suit), skin = skinTile(tone), profile = headProfile(), face = faceTextures(profile, { tone, hair });
  const sheen = { sheen: 0.45, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x4a5a86) };
  const mats = {
    jacket: new THREE.MeshPhysicalMaterial({ ...suitT.jacket, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, ...sheen, envMapIntensity: 0.45, side: THREE.DoubleSide, ...em }),
    trousers: new THREE.MeshPhysicalMaterial({ ...suitT.trousers, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.88, ...sheen, envMapIntensity: 0.4, ...em }),
    sleeve: new THREE.MeshPhysicalMaterial({ ...suitT.sleeve, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.88, ...sheen, envMapIntensity: 0.4, ...em }),
    skin: new THREE.MeshPhysicalMaterial({ ...skin, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.56, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffd0b8), clearcoat: 0.06, clearcoatRoughness: 0.6, envMapIntensity: 0.4, ...em }),
    face: new THREE.MeshPhysicalMaterial({ map: face.map, roughnessMap: face.roughnessMap, normalMap: skin.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffd0b8), clearcoat: 0.08, clearcoatRoughness: 0.5, envMapIntensity: 0.4, ...em }),
    hair: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hair), roughness: 0.5, anisotropy: 0.7, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x8a6a4a), envMapIntensity: 0.5, ...em }),
    shoe: new THREE.MeshPhysicalMaterial({ color: 0x0c0a09, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9, ...em }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7, ...em }),
  };
  const matList = [mats.jacket, mats.trousers, mats.sleeve, mats.skin];

  // ---- skeleton (bind pose: standing, arms at the sides)
  const bones = {}, order = [];
  const bone = (name, x, y, z, parent) => {
    const b = new THREE.Bone(); b.name = name;
    if (parent) { parent.add(b); b.position.set(x - parent.userData.wx, y - parent.userData.wy, z - parent.userData.wz); } else b.position.set(x, y, z);
    b.userData.wx = x; b.userData.wy = y; b.userData.wz = z; b.userData.index = order.length;
    bones[name] = b; order.push(b); return b;
  };
  const hips = bone('hips', 0, 0.95, 0, null);
  const spine = bone('spine', 0, 1.08, 0, hips);
  const chest = bone('chest', 0, 1.28, 0, spine);
  const neck = bone('neck', 0, 1.52, 0, chest);
  const head = bone('head', 0, 1.6, 0, neck);
  for (const [side, sgn] of [['L', -1], ['R', 1]]) {
    const ua = bone('upperArm' + side, sgn * 0.21, 1.49, 0, chest);
    const fa = bone('forearm' + side, sgn * 0.225, 1.18, 0, ua);
    bone('hand' + side, sgn * 0.245, 0.92, 0, fa);
    const ul = bone('upperLeg' + side, sgn * 0.1, 0.95, 0, hips);
    const ll = bone('lowerLeg' + side, sgn * 0.1, 0.5, 0, ul);
    bone('foot' + side, sgn * 0.1, 0.08, 0, ll);
  }
  const I = name => bones[name].userData.index;

  // ---- tubes
  const sb = new SkinBuilder();
  const torsoSegs = [{ bone: I('chest'), lo: 1.28, hi: 1.6 }, { bone: I('spine'), lo: 1.08, hi: 1.28 }, { bone: I('hips'), lo: 0.6, hi: 1.08 }];
  const torso = [[0.78, 0.215, 0.14], [0.86, 0.22, 0.142], [0.96, 0.21, 0.136], [1.06, 0.212, 0.138], [1.16, 0.22, 0.142], [1.26, 0.232, 0.148], [1.36, 0.242, 0.15], [1.43, 0.252, 0.148], [1.475, 0.262, 0.142], [1.5, 0.232, 0.125], [1.53, 0.125, 0.095], [1.55, 0.085, 0.08]];
  sb.tube(torso.map(([y, rx, rz]) => ({ y, cx: 0, cz: 0, rx, rz, v: (y - 0.78) / 0.77, w: segWeights(y, torsoSegs) })), 32, mats.jacket, { capBottom: true, capTop: true });
  const neckSegs = [{ bone: I('head'), lo: 1.6, hi: 1.95 }, { bone: I('neck'), lo: 1.5, hi: 1.6 }, { bone: I('chest'), lo: 1.28, hi: 1.5 }];
  const neckR = [[1.47, 0.07, 0.068], [1.53, 0.065, 0.064], [1.59, 0.062, 0.062], [1.64, 0.064, 0.064]];
  sb.tube(neckR.map(([y, rx, rz]) => ({ y, cx: 0, cz: -0.004, rx, rz, v: (y - 1.47) / 0.17, w: segWeights(y, neckSegs, 0.05) })), 20, mats.skin, { capTop: true });
  for (const [side, sgn] of [['L', -1], ['R', 1]]) {
    const armSegs = [{ bone: I('upperArm' + side), lo: 1.18, hi: 1.55 }, { bone: I('forearm' + side), lo: 0.92, hi: 1.18 }, { bone: I('hand' + side), lo: 0.6, hi: 0.92 }];
    const arm = [[0.9, 0.2465, 0.046], [0.94, 0.244, 0.049], [1.0, 0.238, 0.055], [1.1, 0.23, 0.059], [1.18, 0.225, 0.063], [1.27, 0.22, 0.068], [1.36, 0.215, 0.072], [1.44, 0.21, 0.076], [1.5, 0.2, 0.072]];
    sb.tube(arm.map(([y, cx, r]) => ({ y, cx: sgn * cx, cz: 0, rx: r, rz: r * 1.02, v: (1.5 - y) / 0.6, w: segWeights(y, armSegs) })), 20, mats.sleeve, { capBottom: true });
    const legSegs = [{ bone: I('upperLeg' + side), lo: 0.5, hi: 1.0 }, { bone: I('lowerLeg' + side), lo: 0.08, hi: 0.5 }, { bone: I('foot' + side), lo: -0.1, hi: 0.08 }];
    const leg = [[0.09, 0.058, 0.06], [0.16, 0.063, 0.066], [0.28, 0.07, 0.074], [0.4, 0.076, 0.08], [0.5, 0.08, 0.084], [0.6, 0.087, 0.092], [0.72, 0.097, 0.102], [0.85, 0.106, 0.112], [0.95, 0.11, 0.116]];
    sb.tube(leg.map(([y, rx, rz]) => ({ y, cx: sgn * 0.1, cz: 0, rx, rz, v: (y - 0.09) / 0.86 * 1.4, w: segWeights(y, legSegs) })), 24, mats.trousers);
  }
  const geometry = sb.build(matList);
  const mesh = new THREE.SkinnedMesh(geometry, matList);
  mesh.add(hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(order));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;

  // ---- rigid parts: head, hair, ears, nose, hands, shoes
  const headGroup = new THREE.Group(); headGroup.position.set(0, 0.135, 0.012); head.add(headGroup);
  const headMesh = new THREE.Mesh(new THREE.LatheGeometry(profile.pts, 48), mats.face); headMesh.rotation.y = Math.PI; headMesh.scale.set(1, 1, 1.08); headMesh.castShadow = true; headGroup.add(headMesh);
  // hair cap: open across the face (phi 0 is +z, the front), wraps the sides and back down to the nape
  const hairPts = profile.pts.filter(p => p.y > -0.03).map(p => new THREE.Vector2(p.x * 1.05 + 0.004, p.y + 0.004));
  const hairMesh = new THREE.Mesh(new THREE.LatheGeometry(hairPts, 48, Math.PI * 0.36, Math.PI * 1.28), mats.hair); hairMesh.scale.set(1, 1, 1.1); hairMesh.castShadow = true; headGroup.add(hairMesh);
  // crown: covers the top down to the painted hairline on the forehead
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.36), mats.hair); hairTop.position.set(0, 0.062, -0.014); hairTop.scale.set(1.12, 1.0, 1.16); headGroup.add(hairTop);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), mats.skin); ear.position.set(s * 0.108, 0.0, 0.0); ear.scale.set(0.45, 1.3, 0.9); headGroup.add(ear); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), mats.skin); nose.position.set(0, -0.022, 0.108); nose.scale.set(1, 1.35, 1.1); headGroup.add(nose);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), mats.skin); chin.position.set(0, -0.105, 0.075); chin.scale.set(1.1, 0.8, 0.9); headGroup.add(chin);
  const makeHand = (sgn) => {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.082, 0.026, 0.09, 3, 0.012), mats.skin); palm.position.z = 0.02; g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group(); f.position.set(-0.03 + i * 0.02, 0, 0.065); f.rotation.x = 0.55 + i * 0.05; g.add(f);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.05, 3, 8), mats.skin); seg.rotation.x = Math.PI / 2; seg.position.z = 0.025; f.add(seg);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 8), mats.skin); th.position.set(sgn * -0.045, 0, 0.02); th.rotation.set(Math.PI / 2 - 0.6, 0, sgn * 0.5); g.add(th);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  };
  for (const [side, sgn] of [['L', -1], ['R', 1]]) {
    const hand = makeHand(sgn); hand.position.set(0, -0.085, 0.0);
    hand.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, sgn * -Math.PI / 2, 0, 'YXZ'));
    bones['hand' + side].add(hand);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.29, 3, 0.025), mats.shoe); shoe.position.set(0, -0.045, 0.06); shoe.castShadow = true; bones['foot' + side].add(shoe);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.054, 0.07, 14), mats.dark); sock.position.set(0, 0.0, 0); bones['foot' + side].add(sock);
  }
  // card held in the left hand
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.006), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6688ff, emissiveIntensity: 0.25 }));
  card.position.set(-0.01, -0.12, 0.07); card.rotation.x = 0.3; bones.handL.add(card);

  const root = new THREE.Group(); root.add(mesh);
  const matArray = [mats.jacket, mats.trousers, mats.sleeve, mats.skin, mats.face, mats.hair, mats.shoe, mats.dark];
  return { root, bones, mats: matArray, mesh, headGroup };
}
