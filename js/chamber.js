// Layout of the chamber: pure math shared by rendering, player collision, NPC navigation
// and particle physics. The hall is a sector of a circle; the presidium dais sits at the
// origin, tiers of desks rise in concentric arcs toward the back wall.
const D2R = Math.PI / 180;

export const L = {
  R0: 7.5,            // radius of the first tier's desk front
  TW: 2.4,            // radial width of one tier
  TH: 0.42,           // height step between tiers
  NT: 6,              // number of tiers
  DESK_D: 0.7,        // radial depth of a desk
  SEAT_D: 0.75,       // radial depth of the seat band behind a desk
  STAIR_L: 1.3,       // radial length of a flight of stairs
  STEPS: 3,           // steps per flight
  AISLES: [-52, -26, 0, 26, 52].map(d => d * D2R),
  AISLE_W: 1.7,       // aisle width in metres
  HALF_ANG: 80 * D2R, // half opening angle of the hall
  WALL_R: 23.2,       // back wall radius
  DAIS_R: 2.7,        // presidium dais radius
  CEIL_H: 9.6,
  BALCONY_H: 5.0,
  ROSTRUM: { x: 0, z: 3.6, hw: 0.6, hd: 0.4 },
};
L.BAND = L.DESK_D + L.SEAT_D;        // blocked band (desk + seats)
L.TOP_R = L.R0 + L.NT * L.TW;        // outer edge of the last tier's walkway

export const tierFront = t => L.R0 + (t - 1) * L.TW;   // radius of tier t's desk front (t >= 1)
export const tierHeight = t => t * L.TH;
export const polar = (x, z) => ({ r: Math.hypot(x, z), a: Math.atan2(x, z) });
export const cart = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Index of the aisle containing polar (r, a) or -1. `shrink` narrows the aisle (body radius). */
export function aisleIndexAt(r, a, shrink = 0) {
  const hw = Math.max(0, L.AISLE_W / 2 - shrink) / Math.max(r, 0.01);
  for (let i = 0; i < L.AISLES.length; i++) if (Math.abs(angDiff(a, L.AISLES[i])) < hw) return i;
  return -1;
}
export const aisleHalfAngle = r => L.AISLE_W / 2 / r;

/** Tier whose floor covers radius r (0 = the well). */
export function tierAt(r) {
  if (r < L.R0) return 0;
  return Math.min(L.NT, Math.floor((r - L.R0) / L.TW) + 1);
}

/** Walkable floor height at world (x, z); stair ramps are smooth inside aisles. */
export function floorHeight(x, z) {
  const { r, a } = polar(x, z);
  if (r < L.R0 - L.STAIR_L) return 0;
  const t = tierAt(r);
  let h = tierHeight(t);
  if (t < L.NT && aisleIndexAt(r, a) >= 0) {
    const rf = tierFront(t + 1);
    if (r > rf - L.STAIR_L) h += ((r - (rf - L.STAIR_L)) / L.STAIR_L) * L.TH;
  }
  return h;
}

/** True when a body of radius pr centred at (x, z) overlaps something solid. */
export function isBlocked(x, z, pr = 0.35) {
  const { r, a } = polar(x, z);
  if (r < L.DAIS_R + pr) return true;
  if (r > L.WALL_R - 0.4 - pr) return true;
  if (Math.abs(a) > L.HALF_ANG - (pr + 0.15) / Math.max(r, 1)) return true;
  const R = L.ROSTRUM;
  if (Math.abs(x - R.x) < R.hw + pr && Math.abs(z - R.z) < R.hd + pr) return true;
  if (r < L.R0 - pr) return false;
  if (aisleIndexAt(r, a, pr) >= 0) return false;
  for (let t = 1; t <= L.NT; t++) {
    const rf = tierFront(t);
    if (r > rf - pr && r < rf + L.BAND + pr) return true;
  }
  return false;
}

/** Move from (px,pz) toward (nx,nz) with sliding along radial / angular axes. */
export function resolveMove(px, pz, nx, nz, pr = 0.35) {
  if (!isBlocked(nx, nz, pr) || isBlocked(px, pz, pr)) return [nx, nz];
  const p0 = polar(px, pz), p1 = polar(nx, nz);
  let [x, z] = cart(p1.r, p0.a);          // radial component only
  if (!isBlocked(x, z, pr)) return [x, z];
  [x, z] = cart(p0.r, p1.a);              // angular component only
  if (!isBlocked(x, z, pr)) return [x, z];
  return [px, pz];
}

/** Angular half-extent of a tier at radius r (rows stop just short of the side walls). */
export const rowHalfAngle = r => L.HALF_ANG - 0.35 / r;

// ---------------------------------------------------------------- navigation graph
// Nodes live at the centre of each aisle for every level: 0 = well, 1..NT = tier walkways,
// NT+1 = the corridor behind the last tier. Edges run along aisles (radial) or walkways (arcs).
export function buildGraph() {
  const nodes = [], edges = [];
  const levels = L.NT + 2;
  const id = (i, t) => i * levels + t;
  const levelRadius = t => t === 0 ? L.R0 - 2.3 : t === L.NT + 1 ? (L.TOP_R + L.WALL_R - 0.4) / 2 : tierFront(t) + L.BAND + (L.TW - L.BAND) / 2;
  for (let i = 0; i < L.AISLES.length; i++) {
    for (let t = 0; t < levels; t++) {
      const r = levelRadius(t), a = L.AISLES[i];
      const [x, z] = cart(r, a);
      nodes.push({ id: id(i, t), i, t, r, a, x, z, y: floorHeight(x, z), adj: [] });
    }
  }
  const link = (n1, n2, type, cost) => {
    edges.push({ a: n1, b: n2, type, cost });
    nodes[n1].adj.push({ to: n2, type, cost });
    nodes[n2].adj.push({ to: n1, type, cost });
  };
  for (let i = 0; i < L.AISLES.length; i++) {
    for (let t = 0; t < levels - 1; t++) {
      const n1 = nodes[id(i, t)], n2 = nodes[id(i, t + 1)];
      link(n1.id, n2.id, 'radial', Math.abs(n2.r - n1.r) * 1.25);
    }
  }
  for (let t = 0; t < levels; t++) {
    for (let i = 0; i < L.AISLES.length - 1; i++) {
      const n1 = nodes[id(i, t)], n2 = nodes[id(i + 1, t)];
      link(n1.id, n2.id, 'arc', Math.abs(n2.a - n1.a) * n1.r);
    }
  }
  return { nodes, edges, id, levels };
}

/** Dijkstra over the small graph; returns node ids from `from` to `to` (inclusive). */
export function findPath(graph, from, to) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[from] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of graph.nodes[u].adj) {
      const nd = dist[u] + e.cost;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
    }
  }
  const path = [];
  for (let v = to; v !== -1; v = prev[v]) { path.push(v); if (v === from) break; }
  return path.reverse();
}

export function nearestNode(graph, x, z) {
  let best = null, bd = Infinity;
  for (const nd of graph.nodes) {
    const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
    if (d < bd) { bd = d; best = nd; }
  }
  return best;
}
