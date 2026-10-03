import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function noise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
}
function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function carpetTexture() {
  const w = 256, c = canvas(w, w), g = c.getContext('2d');
  g.fillStyle = '#8f1f1c'; g.fillRect(0, 0, w, w);
  noise(g, w, w, 38);
  g.globalAlpha = 0.18; g.strokeStyle = '#5a0e0c';
  for (let y = 0; y < w; y += 3) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
  g.globalAlpha = 1;
  return tex(c, 1);
}

export function woodTexture(base = '#7a4b25', dark = '#4b2a12', light = '#9c6a3c') {
  const w = 512, h = 512, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * h, amp = 4 + Math.random() * 10, th = 1 + Math.random() * 3;
    g.strokeStyle = Math.random() < 0.5 ? dark : light;
    g.globalAlpha = 0.08 + Math.random() * 0.18; g.lineWidth = th;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + i) * amp);
    g.stroke();
  }
  g.globalAlpha = 1; noise(g, w, h, 18);
  return tex(c, 1);
}

export function fabricTexture(base = '#1f6a3a') {
  const w = 128, c = canvas(w, w), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, w);
  noise(g, w, w, 34);
  g.globalAlpha = 0.12; g.strokeStyle = '#0b3a1e';
  for (let i = 0; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  g.globalAlpha = 1;
  return tex(c, 1);
}

export function plasterTexture(base = '#e6dbc1') {
  const w = 256, c = canvas(w, w), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, w);
  noise(g, w, w, 14);
  return tex(c, 1);
}

export function panelTexture() {
  // Wood wall panelling with raised rectangular panels.
  const w = 512, h = 512, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#6b4123'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = Math.random() < 0.5 ? '#4a2a12' : '#8a5a33'; g.globalAlpha = 0.15; g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 20, h); g.stroke();
  }
  g.globalAlpha = 1;
  for (let px = 0; px < 2; px++) for (let py = 0; py < 2; py++) {
    const x = px * 256 + 28, y = py * 256 + 28, s = 200;
    g.strokeStyle = '#3a1f0c'; g.lineWidth = 6; g.strokeRect(x, y, s, s);
    g.strokeStyle = '#a06a3c'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, s - 12, s - 12);
  }
  noise(g, w, h, 12);
  return tex(c, 1);
}

export function flagPL() {
  const c = canvas(256, 160), g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 80);
  g.fillStyle = '#dc143c'; g.fillRect(0, 80, 256, 80);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function flagEU() {
  const c = canvas(256, 170), g = c.getContext('2d');
  g.fillStyle = '#003399'; g.fillRect(0, 0, 256, 170);
  g.fillStyle = '#ffcc00';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, cx = 128 + Math.cos(a) * 52, cy = 85 + Math.sin(a) * 52;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 4 : 9, an = -Math.PI / 2 + k * Math.PI / 5;
      g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r);
    }
    g.closePath(); g.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function emblemTexture() {
  // Stylised white eagle with spread wings on a red field.
  const w = 512, h = 640, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#b5121b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f7f7f7';
  const wing = (dir) => {
    g.save(); g.translate(256, 300); g.scale(dir, 1);
    g.beginPath(); g.moveTo(20, -40);
    g.quadraticCurveTo(120, -140, 230, -150);
    for (let i = 0; i < 6; i++) { const y = -150 + i * 42; g.lineTo(235 - i * 8, y + 20); g.lineTo(205 - i * 14, y + 12); }
    g.quadraticCurveTo(120, 110, 20, 120);
    g.closePath(); g.fill(); g.restore();
  };
  wing(1); wing(-1);
  g.beginPath(); g.ellipse(256, 320, 58, 130, 0, 0, Math.PI * 2); g.fill();            // body
  g.beginPath(); g.ellipse(256, 150, 40, 46, 0, 0, Math.PI * 2); g.fill();             // head
  g.beginPath(); g.moveTo(216, 450); g.lineTo(296, 450); g.lineTo(330, 520); g.lineTo(256, 500); g.lineTo(182, 520); g.closePath(); g.fill(); // tail
  g.fillStyle = '#ffcc00';
  g.beginPath(); g.moveTo(290, 150); g.lineTo(335, 162); g.lineTo(290, 176); g.closePath(); g.fill();       // beak
  g.beginPath(); g.moveTo(222, 108); g.lineTo(256, 80); g.lineTo(290, 108); g.lineTo(276, 118); g.lineTo(256, 100); g.lineTo(236, 118); g.closePath(); g.fill(); // crown
  g.fillStyle = '#b5121b'; g.beginPath(); g.arc(270, 145, 6, 0, Math.PI * 2); g.fill();
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
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
  blob(64, 64, 60, 0.95);
  blob(44, 52, 34, 0.6);
  blob(82, 58, 32, 0.6);
  blob(60, 86, 30, 0.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
