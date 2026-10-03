import * as THREE from 'three';

// ---------------------------------------------------------------- noise helpers
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
  let v = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); n += amp; amp *= gain; f *= lac; }
  return v / n;
}
/** Tileable fbm (wraps at `period` units). */
function fbmTile(x, y, period, oct = 5) {
  const xa = x % period, ya = y % period;
  const bx = xa / period, by = ya / period;
  const n00 = fbm(xa, ya, oct), n10 = fbm(xa - period, ya, oct), n01 = fbm(xa, ya - period, oct), n11 = fbm(xa - period, ya - period, oct);
  return (n00 * (1 - bx) + n10 * bx) * (1 - by) + (n01 * (1 - bx) + n11 * bx) * by;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/** Height field (Float32Array w*h in 0..1) -> tangent-space normal map canvas (wrapping). */
function heightToNormal(height, w, h, strength = 2) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = height[y * w + ((x - 1 + w) % w)], r = height[y * w + ((x + 1) % w)];
    const u = height[((y - 1 + h) % h) * w + x], dn = height[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function grayCanvas(values, w, h) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) { const v = clamp(values[i], 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
function colorCanvas(w, h, fn) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { fn(x, y, out); const i = (y * w + x) * 4; d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
const mix = (a, b, t) => a + (b - a) * t;
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lerp3 = (a, b, t, out) => { out[0] = mix(a[0], b[0], t); out[1] = mix(a[1], b[1], t); out[2] = mix(a[2], b[2], t); };

// ---------------------------------------------------------------- material texture sets
/** Lacquered hardwood: colour, normal and roughness maps. */
export function woodSet({ base = '#8a4424', dark = '#4e2211', light = '#b0623a', size = 512, grain = 23 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  const cb = hex(base), cd = hex(dark), cl = hex(light), tmp = [0, 0, 0];
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    // grain runs along u; low-frequency waviness + fine lines + knots
    const wave = fbmTile(u * 3 + 11, v * 0.6 + 5, 3, 3) * 2.2;
    const ring = Math.sin((v * grain + wave + fbmTile(u * 6, v * 6, 6, 4) * 1.2) * Math.PI * 2);
    const fine = fbmTile(u * 40, v * 2, 40, 3);
    const t = clamp(0.5 + ring * 0.09 + (fine - 0.5) * 0.55 + (wave - 1.1) * 0.08, 0, 1);
    const knot = fbmTile(u * 2 + 3, v * 2 + 7, 2, 4);
    if (t < 0.5) lerp3(cd, cb, t * 2, tmp); else lerp3(cb, cl, (t - 0.5) * 2, tmp);
    const k = knot > 0.76 ? (knot - 0.76) * 1.6 : 0;
    lerp3(tmp, cd, k, out);
    height[y * w + x] = t * 0.6 + fine * 0.4;
  });
  const normal = heightToNormal(height, w, h, 0.9);
  const rough = grayCanvas(height.map(v => 0.3 + v * 0.18), w, h);
  return { map: tex(color), normalMap: tex(normal, { srgb: false }), roughnessMap: tex(rough, { srgb: false }) };
}

/** Wall panelling: wood with raised rectangular panels and mouldings. One tile = one panel bay. */
export function panelSet({ base = '#6c4022', size = 512 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  const cb = hex(base), cd = hex('#3a1e0c'), cl = hex('#9a6436'), tmp = [0, 0, 0];
  const profile = (u, v) => {
    // 0..1 inside a panel bay: frame at the edges, bevel, recessed field, raised centre panel
    const e = Math.min(u, 1 - u, v, 1 - v);
    if (e < 0.06) return 1.0;                       // stile / rail
    if (e < 0.10) return 1.0 - (e - 0.06) / 0.04 * 0.5; // bevel down
    if (e < 0.16) return 0.5;                       // recess
    if (e < 0.2) return 0.5 + (e - 0.16) / 0.04 * 0.35; // bevel up to the raised field
    return 0.85;
  };
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    const p = profile(u, v);
    const fine = fbmTile(u * 2, v * 36, 36, 3);
    const ring = Math.sin((v * 40 + fbmTile(u * 3, v * 3, 3, 3) * 2) * Math.PI * 2);
    const t = clamp(0.5 + ring * 0.07 + (fine - 0.5) * 0.5, 0, 1);
    if (t < 0.5) lerp3(cd, cb, t * 2, tmp); else lerp3(cb, cl, (t - 0.5) * 2, tmp);
    const shade = p < 0.7 ? 0.78 : p > 0.95 ? 0.92 : 1;
    out[0] = tmp[0] * shade; out[1] = tmp[1] * shade; out[2] = tmp[2] * shade;
    height[y * w + x] = p * 0.85 + fine * 0.15;
  });
  const normal = heightToNormal(height, w, h, 4.0);
  const rough = grayCanvas(height.map(v => 0.3 + (1 - v) * 0.2), w, h);
  return { map: tex(color), normalMap: tex(normal, { srgb: false }), roughnessMap: tex(rough, { srgb: false }) };
}

/** Red wool carpet with visible pile and a faint diamond pattern. */
export function carpetSet({ base = '#2f7d64', dark = '#1a4a3a', light = '#4a9c80', size = 512 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  const cb = hex(base), cd = hex(dark), cl = hex(light), tmp = [0, 0, 0];
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    const pile = fbmTile(u * 90, v * 90, 90, 3);
    const tuft = hash(x, y) * 0.5;
    const diamond = Math.abs(((u * 4 + v * 4) % 1) - 0.5) < 0.02 || Math.abs(((u * 4 - v * 4 + 8) % 1) - 0.5) < 0.02 ? 0.12 : 0;
    const t = clamp(pile * 0.7 + tuft * 0.3 - diamond, 0, 1);
    if (t < 0.5) lerp3(cd, cb, t * 2, tmp); else lerp3(cb, cl, (t - 0.5) * 2, tmp);
    out[0] = tmp[0]; out[1] = tmp[1]; out[2] = tmp[2];
    height[y * w + x] = t;
  });
  const normal = heightToNormal(height, w, h, 1.2);
  return { map: tex(color), normalMap: tex(normal, { srgb: false }) };
}

/** Upholstery leather with a fine grain. */
export function leatherSet({ base = '#2b8068', dark = '#12463a', light = '#49a688', size = 512 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  const cb = hex(base), cd = hex(dark), cl = hex(light), tmp = [0, 0, 0];
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    const cells = fbmTile(u * 60, v * 60, 60, 4);
    const crease = Math.abs(cells - 0.5) < 0.03 ? 0.35 : 0;
    const t = clamp(0.55 + (cells - 0.5) * 0.6 - crease, 0, 1);
    if (t < 0.5) lerp3(cd, cb, t * 2, tmp); else lerp3(cb, cl, (t - 0.5) * 2, tmp);
    out[0] = tmp[0]; out[1] = tmp[1]; out[2] = tmp[2];
    height[y * w + x] = t;
  });
  const normal = heightToNormal(height, w, h, 1.5);
  const rough = grayCanvas(height.map(v => 0.45 + (1 - v) * 0.25), w, h);
  return { map: tex(color), normalMap: tex(normal, { srgb: false }), roughnessMap: tex(rough, { srgb: false }) };
}

/** Soft painted plaster. */
export function plasterSet({ base = '#ece2cc', size = 512 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  const cb = hex(base), tmp = [0, 0, 0];
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    const n = fbmTile(u * 24, v * 24, 24, 4);
    const s = 0.94 + n * 0.1;
    out[0] = cb[0] * s; out[1] = cb[1] * s; out[2] = cb[2] * s;
    height[y * w + x] = n;
  });
  const normal = heightToNormal(height, w, h, 0.6);
  return { map: tex(color), normalMap: tex(normal, { srgb: false }) };
}

/** Veined cream marble. */
export function marbleSet({ base = '#e4d9c4', size = 512 } = {}) {
  const w = size, h = size;
  const cb = hex(base), cv = hex('#9c8a70'), tmp = [0, 0, 0];
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    const warp = fbmTile(u * 4, v * 4, 4, 4) * 6;
    const vein = Math.pow(Math.abs(Math.sin((u * 6 + warp) * Math.PI)), 18);
    const cloud = fbmTile(u * 8 + 3, v * 8 + 9, 8, 4);
    lerp3(cb, cv, clamp(vein * 0.8 + (cloud - 0.5) * 0.4, 0, 1), tmp);
    out[0] = tmp[0]; out[1] = tmp[1]; out[2] = tmp[2];
  });
  return { map: tex(color) };
}

/** Travertine cladding: horizontal banding, pitted surface, large ashlar blocks (tile = 2 x 4 blocks). */
export function travertineSet({ base = '#cdb892', size = 512 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  const cb = hex(base), cd = hex('#9d8a66'), cl = hex('#e6d8b8'), tmp = [0, 0, 0];
  const color = colorCanvas(w, h, (x, y, out) => {
    const u = x / w, v = y / h;
    const bx = u * 2, by = v * 4;
    const jointX = Math.abs((bx % 1) - 0.5) > 0.49 ? 1 : 0, jointY = Math.abs((by % 1) - 0.5) > 0.485 ? 1 : 0;
    const blockId = Math.floor(bx) + Math.floor(by) * 2;
    const tint = (hash(blockId * 17 + 3, 7) - 0.5) * 0.12;
    const band = fbmTile(u * 3 + blockId, v * 28, 28, 4);
    const pits = fbmTile(u * 70, v * 70, 70, 3);
    const pit = pits > 0.64 ? (pits - 0.64) * 4 : 0;
    let t = clamp(0.55 + (band - 0.5) * 0.5 + tint - pit * 0.6, 0, 1);
    if (t < 0.5) lerp3(cd, cb, t * 2, tmp); else lerp3(cb, cl, (t - 0.5) * 2, tmp);
    const joint = jointX || jointY;
    out[0] = joint ? tmp[0] * 0.6 : tmp[0]; out[1] = joint ? tmp[1] * 0.6 : tmp[1]; out[2] = joint ? tmp[2] * 0.6 : tmp[2];
    height[y * w + x] = joint ? 0.2 : 0.7 - pit * 0.5 + (band - 0.5) * 0.1;
  });
  const normal = heightToNormal(height, w, h, 2.2);
  const rough = grayCanvas(height.map(v => 0.55 + (1 - v) * 0.3), w, h);
  return { map: tex(color), normalMap: tex(normal, { srgb: false }), roughnessMap: tex(rough, { srgb: false }) };
}

/** The tall vertical white-and-red banner behind the Marshal, with the crowned eagle on a red shield. */
export function bannerTexture() {
  const w = 512, h = 2048, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, w / 2, h);
  g.fillStyle = '#d31f33'; g.fillRect(w / 2, 0, w / 2, h);
  // subtle fabric folds
  for (let x = 0; x < w; x += 2) { const s = 0.92 + 0.08 * Math.sin(x * 0.11) * Math.sin(x * 0.023); g.fillStyle = `rgba(0,0,0,${(1 - s) * 0.9})`; g.fillRect(x, 0, 2, h); }
  // shield
  const cx = 256, top = 150, sw = 330, sh = 420;
  const shield = () => { g.beginPath(); g.moveTo(cx - sw / 2, top); g.lineTo(cx + sw / 2, top); g.lineTo(cx + sw / 2, top + sh * 0.62); g.quadraticCurveTo(cx + sw / 2, top + sh, cx, top + sh); g.quadraticCurveTo(cx - sw / 2, top + sh, cx - sw / 2, top + sh * 0.62); g.closePath(); };
  shield(); g.fillStyle = '#c9102a'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#e8c860'; g.stroke();
  g.save(); g.translate(cx, top + 215); g.scale(0.58, 0.58);
  g.fillStyle = '#f7f7f7';
  const wing = (dir) => { g.save(); g.scale(dir, 1); g.beginPath(); g.moveTo(20, -40); g.quadraticCurveTo(120, -140, 230, -150); for (let i = 0; i < 6; i++) { const y = -150 + i * 42; g.lineTo(235 - i * 8, y + 20); g.lineTo(205 - i * 14, y + 12); } g.quadraticCurveTo(120, 110, 20, 120); g.closePath(); g.fill(); g.restore(); };
  wing(1); wing(-1);
  g.beginPath(); g.ellipse(0, 20, 58, 130, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(0, -150, 40, 46, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-40, 150); g.lineTo(40, 150); g.lineTo(74, 220); g.lineTo(0, 200); g.lineTo(-74, 220); g.closePath(); g.fill();
  g.fillStyle = '#e8c860';
  g.beginPath(); g.moveTo(34, -150); g.lineTo(79, -138); g.lineTo(34, -124); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-34, -192); g.lineTo(0, -222); g.lineTo(34, -192); g.lineTo(20, -182); g.lineTo(0, -200); g.lineTo(-20, -182); g.closePath(); g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** Green-on-black voting display board. */
export function ledTexture() {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#0b1a12'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7dff9a'; g.font = 'bold 64px "Courier New", monospace'; g.textAlign = 'left';
  const lines = ['GLOSOWANIE NR 12', 'ZA         231', 'PRZECIW    198', 'WSTRZYM.    11', 'REASUMPCJA ...'];
  lines.forEach((l, i) => g.fillText(l, 60, 100 + i * 86));
  for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- decals
export function flagPL() {
  const c = canvas(512, 320), g = c.getContext('2d');
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#d4213d'; g.fillRect(0, 160, 512, 160);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function flagEU() {
  const c = canvas(512, 340), g = c.getContext('2d');
  g.fillStyle = '#003399'; g.fillRect(0, 0, 512, 340);
  g.fillStyle = '#ffcc00';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, cx = 256 + Math.cos(a) * 104, cy = 170 + Math.sin(a) * 104;
    g.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 8 : 19, an = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    g.closePath(); g.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Cloth normal map for the flags (fine weave). */
export function clothNormal() {
  const w = 256, h = 256, height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) height[y * w + x] = ((x % 4 < 2) ^ (y % 4 < 2)) ? 0.6 : 0.4;
  return tex(heightToNormal(height, w, h, 0.8), { srgb: false });
}

export function emblemTexture() {
  const w = 512, h = 640, c = canvas(w, h), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#c4161e'); grad.addColorStop(1, '#9d0f16');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f7f7f7';
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; g.shadowOffsetY = 6;
  const wing = (dir) => {
    g.save(); g.translate(256, 300); g.scale(dir, 1);
    g.beginPath(); g.moveTo(20, -40);
    g.quadraticCurveTo(120, -140, 230, -150);
    for (let i = 0; i < 6; i++) { const y = -150 + i * 42; g.lineTo(235 - i * 8, y + 20); g.lineTo(205 - i * 14, y + 12); }
    g.quadraticCurveTo(120, 110, 20, 120);
    g.closePath(); g.fill(); g.restore();
  };
  wing(1); wing(-1);
  g.beginPath(); g.ellipse(256, 320, 58, 130, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(256, 150, 40, 46, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(216, 450); g.lineTo(296, 450); g.lineTo(330, 520); g.lineTo(256, 500); g.lineTo(182, 520); g.closePath(); g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = '#ffcc00';
  g.beginPath(); g.moveTo(290, 150); g.lineTo(335, 162); g.lineTo(290, 176); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(222, 108); g.lineTo(256, 80); g.lineTo(290, 108); g.lineTo(276, 118); g.lineTo(256, 100); g.lineTo(236, 118); g.closePath(); g.fill();
  g.fillStyle = '#9d0f16'; g.beginPath(); g.arc(270, 145, 6, 0, Math.PI * 2); g.fill();
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Printed extinguisher label (wraps around the cylinder). */
export function extinguisherLabel() {
  const w = 1024, h = 512, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#d4181b'; g.fillRect(0, 0, w, h);
  // white label on the front third only
  const lx = 120, lw = 420;
  g.fillStyle = '#f3efe4'; g.fillRect(lx, 14, lw, h - 54);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 72px Oswald, Impact, sans-serif'; g.textAlign = 'center';
  g.fillText('GAŚNICA', lx + lw / 2, 84);
  g.font = 'bold 40px Oswald, Impact, sans-serif'; g.fillText('PROSZKOWA 6 kg', lx + lw / 2, 134);
  g.fillStyle = '#d4181b'; g.fillRect(lx + 30, 154, lw - 60, 8);
  // pictograms: four squares with simple glyphs
  for (let i = 0; i < 4; i++) {
    const px = lx + 40 + i * 90, py = 190;
    g.fillStyle = '#1a1a1a'; g.fillRect(px, py, 70, 70);
    g.fillStyle = '#f3efe4'; g.font = 'bold 44px sans-serif'; g.fillText(String.fromCharCode(65 + i), px + 35, py + 52);
  }
  g.fillStyle = '#1a1a1a'; g.font = '22px sans-serif';
  const lines = ['1. Wyciągnij zawleczkę', '2. Skieruj na ogień', '3. Naciśnij dźwignię', 'PN-EN 3  ·  ABC 27A 144B C'];
  lines.forEach((l, i) => g.fillText(l, lx + lw / 2, 300 + i * 30));
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Ribbed rubber hose normal map. */
export function hoseNormal() {
  const w = 64, h = 64, height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) height[y * w + x] = 0.5 + 0.5 * Math.sin(x / w * Math.PI * 8);
  const t = tex(heightToNormal(height, w, h, 1.5), { srgb: false }); t.repeat.set(12, 1); return t;
}

export function smokeSprite() {
  const w = 128, c = canvas(w, w), g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.45, `rgba(255,255,255,${a * 0.55})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  };
  blob(64, 64, 60, 0.95); blob(44, 52, 34, 0.6); blob(82, 58, 32, 0.6); blob(60, 86, 30, 0.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
