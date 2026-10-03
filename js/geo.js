import * as THREE from 'three';

/**
 * Solid ring sector: radii rIn..rOut, angles a0..a1 (0 = +z, measured toward +x),
 * heights y0..y1. Flat shading on caps and smooth normals on the curved faces.
 * Top/bottom UVs are planar in world space, side UVs follow arc length x height.
 */
export function ringSectorGeometry(rIn, rOut, a0, a1, y0, y1, segs = 24, uvScale = 0.5, faces = {}) {
  const f = { top: true, bottom: false, inner: rIn > 0.001, outer: true, caps: true, ...faces };
  const pos = [], nor = [], uv = [];
  const P = (r, a, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  const push = (p, n, u) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(u[0], u[1]); };
  const quad = (pts, nfn, ufn) => {
    const [p1, p2, p3, p4] = pts;
    // winding from the diagonals: robust even when one edge collapses (inner radius 0)
    const e1 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]], e2 = [p4[0] - p2[0], p4[1] - p2[1], p4[2] - p2[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const n = nfn(p1);
    const order = (cx * n[0] + cy * n[1] + cz * n[2]) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1];
    for (const k of order) push(pts[k], nfn(pts[k]), ufn(pts[k]));
  };
  const planar = p => [p[0] * uvScale, p[2] * uvScale];
  const arcUV = p => [Math.atan2(p[0], p[2]) * Math.hypot(p[0], p[2]) * uvScale, p[1] * uvScale];
  const radUV = p => [Math.hypot(p[0], p[2]) * uvScale, p[1] * uvScale];
  const da = (a1 - a0) / segs;
  for (let s = 0; s < segs; s++) {
    const aa = a0 + s * da, ab = aa + da;
    if (f.top) quad([P(rIn, aa, y1), P(rIn, ab, y1), P(rOut, ab, y1), P(rOut, aa, y1)], () => [0, 1, 0], planar);
    if (f.bottom) quad([P(rIn, aa, y0), P(rIn, ab, y0), P(rOut, ab, y0), P(rOut, aa, y0)], () => [0, -1, 0], planar);
    if (f.outer) quad([P(rOut, aa, y0), P(rOut, ab, y0), P(rOut, ab, y1), P(rOut, aa, y1)],
      p => { const l = Math.hypot(p[0], p[2]) || 1; return [p[0] / l, 0, p[2] / l]; }, arcUV);
    if (f.inner) quad([P(rIn, aa, y0), P(rIn, ab, y0), P(rIn, ab, y1), P(rIn, aa, y1)],
      p => { const l = Math.hypot(p[0], p[2]) || 1; return [-p[0] / l, 0, -p[2] / l]; }, arcUV);
  }
  if (f.caps) {
    const rc = Math.max(rIn, 0.001);
    quad([P(rc, a0, y0), P(rOut, a0, y0), P(rOut, a0, y1), P(rc, a0, y1)], () => [-Math.cos(a0), 0, Math.sin(a0)], radUV);
    quad([P(rc, a1, y0), P(rOut, a1, y0), P(rOut, a1, y1), P(rc, a1, y1)], () => [Math.cos(a1), 0, -Math.sin(a1)], radUV);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Simple box helper returning a mesh positioned at (x, y, z) with its centre there. */
export function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
