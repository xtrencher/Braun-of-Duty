import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { L, tierFront, tierHeight, aisleHalfAngle, rowHalfAngle, cart } from './chamber.js';
import { ringSectorGeometry, box, plane, boxUV, radialBox } from './geo.js';
import * as T from './textures.js';

/**
 * The Sejm plenary chamber, modelled on the real hall: teal carpet and upholstery, mahogany
 * benches in concentric arcs, travertine walls with a colonnaded gallery, a straight front
 * wall carrying the vertical white-and-red banner, the Marshal's platform, the horseshoe
 * stenographers' desk with the rostrum, and a ribbed glass dome overhead.
 * Returns { group, flags, lights, materials }.
 */
export function buildWorld(scene, quality = 'high') {
  const group = new THREE.Group();
  scene.add(group);
  const HA = L.HALF_ANG, topH = tierHeight(L.NT), WR = L.WALL_R, CH = L.CEIL_H, bH = L.BALCONY_H;
  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------- materials
  const wood = T.woodSet(), carpet = T.carpetSet(), leather = T.leatherSet(), stone = T.travertineSet();
  const plaster = T.plasterSet({ base: '#e9e7e0' }), panel = T.panelSet({ base: '#5a3220' });
  const phys = (o) => new THREE.MeshPhysicalMaterial(o), std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    wood: phys({ ...wood, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.9 }),
    woodDark: phys({ ...wood, color: 0x7a5a48, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.7 }),
    door: phys({ ...panel, normalScale: new THREE.Vector2(1, 1), roughness: 1, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
    carpet: std({ ...carpet, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, envMapIntensity: 0.1 }),
    leather: phys({ ...leather, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.35 }),
    stone: std({ ...stone, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, envMapIntensity: 0.35 }),
    stoneLight: std({ ...stone, color: 0xe2d6bc, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, envMapIntensity: 0.35 }),
    plaster: std({ ...plaster, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.95, envMapIntensity: 0.3 }),
    ceiling: std({ color: 0xe6e4dd, roughness: 0.9, envMapIntensity: 0.3 }),
    dome: std({ color: 0xf4f2ec, emissive: 0xfff8ee, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.BackSide }),
    rib: std({ color: 0xf6f4ee, roughness: 0.6, envMapIntensity: 0.4 }),
    downlight: std({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 3, roughness: 0.4 }),
    black: std({ color: 0x151310, roughness: 0.6 }),
    grey: std({ color: 0x6a6a6e, roughness: 0.45, metalness: 0.3 }),
    brass: std({ color: 0xd9b25a, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 }),
    banner: std({ map: T.bannerTexture(), roughness: 0.85, envMapIntensity: 0.2 }),
    led: std({ map: T.ledTexture(), emissive: 0xffffff, emissiveMap: T.ledTexture(), emissiveIntensity: 0.9, roughness: 0.4 }),
    paper: std({ color: 0xd9d5c8, roughness: 0.95 }),
    leaf: std({ color: 0x2f6b31, roughness: 0.75 }),
    leaf2: std({ color: 0x4c8a3c, roughness: 0.75 }),
    flower: std({ color: 0xf4f0ea, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.08 }),
    pot: std({ color: 0xd8d2c4, roughness: 0.6 }),
  };
  const add = (geo, mat, { cast = false, receive = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; group.add(m); return m; };
  const addMesh = (m, { cast = false, receive = true } = {}) => { m.castShadow = cast; m.receiveShadow = receive; group.add(m); return m; };
  const UV = { wood: 0.4, carpet: 0.85, stone: 0.42, plaster: 0.5 };

  // ---------------------------------------------------------------- floors
  add(ringSectorGeometry(0, L.R0, -HA, HA, -0.1, 0, 64, UV.carpet, { caps: false, inner: false }), M.carpet);
  for (let t = 1; t <= L.NT; t++) {
    const h = tierHeight(t), rf = tierFront(t);
    const rOut = t === L.NT ? WR : tierFront(t + 1);
    add(ringSectorGeometry(rf, rOut, -HA, HA, h - 0.1, h, 96, UV.carpet, { caps: false }), M.carpet);
  }

  // ---------------------------------------------------------------- benches, stairs
  const seats = [], papers = [], consoles = [];
  const cushionGeo = new RoundedBoxGeometry(0.5, 0.1, 0.46, 4, 0.035);
  for (let t = 1; t <= L.NT; t++) {
    const h = tierHeight(t), hPrev = tierHeight(t - 1), rf = tierFront(t);
    const rowHA = rowHalfAngle(rf), hw = aisleHalfAngle(rf);
    const bounds = [-rowHA, ...L.AISLES.flatMap(a => [a - hw, a + hw]), rowHA];
    for (let k = 0; k < bounds.length; k += 2) {
      const a0 = bounds[k], a1 = bounds[k + 1];
      if (a1 - a0 < 0.02) continue;
      // lacquered desk front (also the tier riser), top with a darker band, continuous padded back behind
      add(ringSectorGeometry(rf, rf + L.DESK_D, a0, a1, hPrev - 0.05, h + 0.7, 32, UV.wood), M.wood, { cast: true });
      add(ringSectorGeometry(rf - 0.08, rf + L.DESK_D + 0.08, a0, a1, h + 0.7, h + 0.76, 32, UV.wood, { bottom: true }), M.wood, { cast: true });
      add(ringSectorGeometry(rf + 0.02, rf + L.DESK_D - 0.02, a0 + 0.002, a1 - 0.002, h + 0.76, h + 0.764, 32, UV.wood), M.woodDark);
      add(ringSectorGeometry(rf - 0.09, rf - 0.06, a0, a1, h + 0.3, h + 0.42, 32, UV.wood), M.woodDark);           // horizontal band on the front
      const rb = rf + L.DESK_D + 0.66;                                                                               // padded bench back
      add(ringSectorGeometry(rb, rb + 0.12, a0, a1, h + 0.42, h + 1.12, 32, 1.2), M.leather, { cast: true });
      add(ringSectorGeometry(rb - 0.02, rb + 0.2, a0, a1, h + 1.12, h + 1.17, 32, UV.wood, { bottom: true }), M.wood);
      add(ringSectorGeometry(rb + 0.12, rb + 0.2, a0, a1, h - 0.02, h + 1.12, 32, UV.wood), M.wood);                // wooden back of the bench
      add(ringSectorGeometry(rf + L.DESK_D + 0.12, rb, a0, a1, h, h + 0.4, 32, UV.wood, { top: false }), M.woodDark); // seat plinth
      const rs = rf + L.DESK_D + 0.4, pitch = 0.6 / rs;
      const n = Math.floor((a1 - a0 - 0.1 / rs) / pitch);
      const start = a0 + ((a1 - a0) - n * pitch) / 2 + pitch / 2;
      for (let s = 0; s < n; s++) {
        const a = start + s * pitch;
        seats.push({ a, r: rs, h });
        consoles.push({ a, r: rf + 0.42, h: h + 0.765 });
        const rnd = Math.sin(a * 997 + t * 131) * 0.5 + 0.5;
        if (rnd < 0.3) papers.push({ a: a + (rnd - 0.15) * 0.03, r: rf + 0.25, h: h + 0.77, yaw: (rnd - 0.15) * 1.5 });
      }
      // wooden end panels at the aisles
      for (const side of [a0, a1]) {
        if (Math.abs(side) >= rowHA - 1e-6) continue;
        const sgn = side === a0 ? -1 : 1;
        const len = L.BAND + 0.05, rc = rf - 0.09 + len / 2, ang = side + sgn * 0.03 / rc;
        const hp = h + 1.17 - (hPrev - 0.05);
        addMesh(radialBox(rc, ang, len, hp, 0.06, hPrev - 0.05 + hp / 2, M.wood, 0.4), { cast: true });
      }
    }
    for (const a of L.AISLES) {
      const rStart = rf - L.STAIR_L, stepD = L.STAIR_L / L.STEPS, stepH = L.TH / L.STEPS;
      for (let s = 0; s < L.STEPS; s++) {
        const r0 = rStart + s * stepD, r1 = rf + 0.02, hwS = aisleHalfAngle(r0) * 1.02;
        add(ringSectorGeometry(r0, r1, a - hwS, a + hwS, hPrev - 0.05, hPrev + stepH * (s + 1), 8, UV.carpet), M.carpet);
        add(ringSectorGeometry(r0 - 0.01, r0 + 0.02, a - hwS, a + hwS, hPrev + stepH * s + 0.004, hPrev + stepH * (s + 1) + 0.006, 8, 0.5, { top: true }), M.grey);
      }
    }
  }
  const seatIM = new THREE.InstancedMesh(cushionGeo, M.leather, seats.length);
  seats.forEach(({ a, r, h }, i) => { const [x, z] = cart(r, a); dummy.position.set(x, h + 0.45, z); dummy.rotation.set(0, a, 0); dummy.updateMatrix(); seatIM.setMatrixAt(i, dummy.matrix); });
  seatIM.castShadow = true; seatIM.receiveShadow = true; group.add(seatIM);
  const consoleIM = new THREE.InstancedMesh(new RoundedBoxGeometry(0.12, 0.025, 0.09, 2, 0.006), M.grey, consoles.length);
  consoles.forEach(({ a, r, h }, i) => { const [x, z] = cart(r, a); dummy.position.set(x, h + 0.018, z); dummy.rotation.set(0, a, 0); dummy.updateMatrix(); consoleIM.setMatrixAt(i, dummy.matrix); });
  consoleIM.castShadow = true; group.add(consoleIM);
  const paperIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.006, 0.21), M.paper, papers.length);
  papers.forEach(({ a, r, h, yaw }, i) => { const [x, z] = cart(r, a); dummy.position.set(x, h, z); dummy.rotation.set(0, a + yaw, 0); dummy.updateMatrix(); paperIM.setMatrixAt(i, dummy.matrix); });
  paperIM.receiveShadow = true; group.add(paperIM);

  // ---------------------------------------------------------------- walls: travertine, gallery colonnade
  const WALL_TOP = CH + 3.8;
  add(ringSectorGeometry(WR, WR + 0.5, -HA, HA, topH - 0.2, WALL_TOP, 128, UV.stone, { top: false, outer: false, caps: false }), M.stone);
  for (const sgn of [-1, 1]) {
    const a = sgn * HA, len = WR + 0.6, mid = len / 2 - 0.4, [x, z] = cart(mid, a);
    const wall = plane(len, WALL_TOP, M.stone, UV.stone); wall.position.set(x, WALL_TOP / 2, z); wall.rotation.y = a + (sgn > 0 ? -Math.PI / 2 : Math.PI / 2); addMesh(wall);
    const nx = -Math.cos(a) * sgn, nz = Math.sin(a) * sgn;
    for (const r of [7, 12, 17, 22]) {
      const [px, pz] = cart(r, a);
      const p = box(0.9, CH, 0.9, M.stoneLight, px + nx * 0.4, CH / 2, pz + nz * 0.4); boxUV(p.geometry, UV.stone); p.rotation.y = a; addMesh(p, { cast: true });
    }
    // voting display board on each side wall
    const [lx, lz] = cart(13.5, a);
    const ledM = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), M.led); ledM.position.set(lx + nx * 0.06, 5.6, lz + nz * 0.06); ledM.rotation.y = a + (sgn > 0 ? -Math.PI / 2 : Math.PI / 2); group.add(ledM);
    const ledFrame = box(3.8, 2.0, 0.1, M.grey, lx + nx * 0.03, 5.6, lz + nz * 0.03); ledFrame.rotation.y = a; group.add(ledFrame);
  }
  // doors at the top of the aisles
  for (const a of L.AISLES) {
    const [x, z] = cart(WR - 0.2, a);
    const door = box(2.0, 2.9, 0.16, M.door, x, topH + 1.45, z); boxUV(door.geometry, 0.95); door.rotation.y = a; group.add(door);
    const frame = box(2.4, 3.15, 0.1, M.stoneLight, x, topH + 1.55, z); boxUV(frame.geometry, UV.stone); frame.rotation.y = a; group.add(frame);
    const frameIn = box(2.2, 3.0, 0.14, M.door, x, topH + 1.5, z); boxUV(frameIn.geometry, 0.95); frameIn.rotation.y = a; group.add(frameIn);
    const split = box(0.03, 2.8, 0.18, M.woodDark, x, topH + 1.45, z); split.rotation.y = a; group.add(split);
  }
  // gallery: stone parapet, wooden cap, square columns up to the ceiling, benches behind
  add(ringSectorGeometry(WR - 2.6, WR + 0.1, -HA, HA, bH - 0.45, bH, 128, UV.stone, { bottom: true }), M.stone);
  add(ringSectorGeometry(WR - 2.75, WR - 2.55, -HA, HA, bH - 1.1, bH + 0.95, 128, UV.stone, { bottom: true }), M.stone);
  add(ringSectorGeometry(WR - 2.8, WR - 2.5, -HA, HA, bH + 0.95, bH + 1.02, 128, UV.wood, { bottom: true }), M.wood);
  const colCount = Math.round((2 * HA) * (WR - 2.3) / 3.1);
  for (let i = 0; i <= colCount; i++) {
    const a = -HA + i / colCount * 2 * HA, [x, z] = cart(WR - 2.2, a);
    const c = box(0.85, CH - bH, 0.85, M.stoneLight, x, (CH + bH) / 2, z); boxUV(c.geometry, UV.stone); c.rotation.y = a; addMesh(c, { cast: true });
  }
  for (const [r0, hh] of [[WR - 2.0, 0], [WR - 1.2, 0.4]]) {
    add(ringSectorGeometry(r0, r0 + 0.55, -HA, HA, bH + hh, bH + hh + 0.42, 128, UV.wood), M.leather);
    add(ringSectorGeometry(r0 + 0.5, r0 + 0.62, -HA, HA, bH + hh, bH + hh + 0.95, 128, UV.wood), M.leather);
    add(ringSectorGeometry(r0 - 0.15, r0, -HA, HA, bH + hh, bH + hh + 0.7, 128, UV.wood), M.wood);
  }
  const corridorLights = [];
  for (let a = -HA + 0.18; a < HA; a += 0.36) { const [x, z] = cart(WR - 1.2, a); corridorLights.push([x, bH - 0.46, z]); }

  // ---------------------------------------------------------------- front wall, banner, platform, horseshoe
  const FW = 18, FZ = 0.2;
  const front = box(FW, WALL_TOP, 0.6, M.stone, 0, WALL_TOP / 2, FZ); boxUV(front.geometry, UV.stone); addMesh(front);
  const bannerM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, CH + 2.2 - 1.0), M.banner); bannerM.position.set(0, (CH + 2.2 + 1.0) / 2, FZ + 0.33); group.add(bannerM);
  const bannerRod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 10), M.brass); bannerRod.position.set(0, CH + 2.2, FZ + 0.33); bannerRod.rotation.z = Math.PI / 2; group.add(bannerRod);
  for (const sgn of [-1, 1]) {
    const dx = sgn * 4.6;
    const d = box(2.2, 3.0, 0.2, M.door, dx, 0.9 + 1.5, FZ + 0.35); boxUV(d.geometry, 0.95); group.add(d);
    const f = box(2.6, 3.25, 0.14, M.stoneLight, dx, 0.9 + 1.6, FZ + 0.32); boxUV(f.geometry, UV.stone); group.add(f);
    const split = box(0.03, 2.9, 0.24, M.woodDark, dx, 0.9 + 1.5, FZ + 0.35); group.add(split);
  }
  group.add(box(0.07, 0.9, 0.06, M.woodDark, -2.4, 5.4, FZ + 0.34));                          // cross
  group.add(box(0.5, 0.07, 0.06, M.woodDark, -2.4, 5.6, FZ + 0.34));
  // Marshal's platform: two steps up, carpeted, with the presidium desk and high-backed chairs
  add(ringSectorGeometry(0, L.DAIS_R - 0.6, -HA, HA, 0, 0.9, 64, UV.wood, { inner: false, caps: false }), M.wood);
  add(ringSectorGeometry(0, L.DAIS_R - 0.6, -HA, HA, 0.9, 0.91, 64, UV.carpet, { inner: false, caps: false, outer: false }), M.carpet);
  add(ringSectorGeometry(L.DAIS_R - 0.6, L.DAIS_R - 0.3, -HA, HA, 0, 0.6, 64, UV.carpet, { inner: false, caps: false }), M.carpet);
  add(ringSectorGeometry(L.DAIS_R - 0.3, L.DAIS_R, -HA, HA, 0, 0.3, 64, UV.carpet, { inner: false, caps: false }), M.carpet);
  add(ringSectorGeometry(1.5, 2.3, -1.05, 1.05, 0.9, 1.65, 48, UV.wood), M.wood, { cast: true });
  add(ringSectorGeometry(1.42, 2.38, -1.06, 1.06, 1.65, 1.72, 48, UV.wood, { bottom: true }), M.wood, { cast: true });
  for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const [x, z] = cart(1.0, a);
    const chair = new THREE.Group(); chair.position.set(x, 0.91, z); chair.rotation.y = a;
    const c1 = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.12, 0.56, 4, 0.04), M.leather); c1.position.y = 0.48; chair.add(c1);
    const c2 = new THREE.Mesh(new RoundedBoxGeometry(0.58, 1.05, 0.12, 4, 0.05), M.leather); c2.position.set(0, 1.0, -0.24); chair.add(c2);
    const c3 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.5), M.woodDark); c3.position.y = 0.21; chair.add(c3);
    chair.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(chair);
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 6), M.black); const [mx, mz] = cart(1.95, a); mic.position.set(mx, 1.86, mz); mic.rotation.x = 0.35; group.add(mic);
  }
  // horseshoe stenographers' desk with the rostrum facing the chamber
  const H = L.HORSESHOE;
  const hs = (geo, mat, o = {}) => { const m = add(geo, mat, o); m.position.set(H.x, 0, H.z); return m; };
  const hsR = 1.75, hsA = 2.35;
  hs(ringSectorGeometry(hsR - 0.65, hsR, -hsA, hsA, -0.02, 0.95, 48, UV.wood), M.wood, { cast: true });
  hs(ringSectorGeometry(hsR - 0.72, hsR + 0.07, -hsA, hsA, 0.95, 1.01, 48, UV.wood, { bottom: true }), M.wood, { cast: true });
  hs(ringSectorGeometry(hsR - 0.1, hsR + 0.25, -hsA, hsA, 0.4, 1.3, 48, UV.wood), M.wood, { cast: true });   // outer rail panel
  hs(ringSectorGeometry(hsR - 0.14, hsR + 0.3, -hsA, hsA, 1.3, 1.36, 48, UV.wood, { bottom: true }), M.wood);
  const rost = box(1.3, 1.25, 0.7, M.wood, H.x, 0.625, H.z + hsR + 0.55); boxUV(rost.geometry, UV.wood); addMesh(rost, { cast: true });
  group.add(box(1.5, 0.07, 0.9, M.wood, H.x, 1.28, H.z + hsR + 0.5));
  const rmic = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 6), M.black); rmic.position.set(H.x + 0.15, 1.5, H.z + hsR + 0.35); rmic.rotation.x = -0.4; group.add(rmic);
  const rostChair = new THREE.Group(); rostChair.position.set(H.x, 0, H.z + hsR - 0.35); rostChair.rotation.y = Math.PI;
  const rc1 = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.12, 0.52, 4, 0.04), M.leather); rc1.position.y = 0.48; rostChair.add(rc1);
  const rc2 = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.9, 0.12, 4, 0.05), M.leather); rc2.position.set(0, 0.95, -0.22); rostChair.add(rc2);
  const rc3 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.48), M.woodDark); rc3.position.y = 0.21; rostChair.add(rc3);
  rostChair.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(rostChair);
  for (const a of [-1.6, -0.8, 0.8, 1.6]) { const [x, z] = cart(hsR - 0.45, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 6), M.black); m.position.set(H.x + x, 1.15, H.z + z); m.rotation.x = 0.3; group.add(m); }

  // flags (both on the left of the Marshal, as in the chamber) and a flower arrangement on the right
  const flags = [];
  const clothN = T.clothNormal();
  const makeFlag = (texture, x, z, w, h) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 3.9, 12), M.brass); pole.position.set(x, 1.95, z); pole.castShadow = true; group.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 20), M.brass); base.position.set(x, 0.04, z); group.add(base);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), M.brass); finial.position.set(x, 3.95, z); group.add(finial);
    const geo = new THREE.PlaneGeometry(w, h, 16, 10);
    const mat = new THREE.MeshStandardMaterial({ map: texture, normalMap: clothN, normalScale: new THREE.Vector2(0.3, 0.3), side: THREE.DoubleSide, roughness: 0.85 });
    const flag = new THREE.Mesh(geo, mat);
    flag.position.set(x - Math.sin(0.35) * w / 2, 3.9 - h / 2 - 0.05, z + Math.cos(0.35) * w / 2);
    flag.rotation.y = -Math.PI / 2 - 0.35 + Math.PI;
    flag.userData.base = geo.attributes.position.array.slice();
    group.add(flag); flags.push(flag);
  };
  makeFlag(T.flagPL(), -4.4, 1.2, 1.3, 0.82);
  makeFlag(T.flagEU(), -3.6, 1.0, 1.3, 0.86);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.5, 16), M.pot); vase.position.set(4.3, 0.25, 1.3); vase.castShadow = true; group.add(vase);
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, rr = 0.1 + (i % 5) * 0.08, y = 0.6 + (i % 7) * 0.09;
    const isFlower = i % 3 === 0;
    const m = new THREE.Mesh(new THREE.SphereGeometry(isFlower ? 0.07 : 0.1, 8, 6), isFlower ? M.flower : (i % 2 ? M.leaf : M.leaf2));
    m.position.set(4.3 + Math.cos(a) * rr, y, 1.3 + Math.sin(a) * rr); if (!isFlower) m.scale.set(0.5, 1.6, 0.25); m.rotation.set(0, -a, 0.5); group.add(m);
  }

  // ---------------------------------------------------------------- ceiling: flat coffered ring + ribbed glass dome
  const RD = 15.2, DH = 3.6, RS = (RD * RD + DH * DH) / (2 * DH), thetaMax = Math.asin(RD / RS), domeY = CH - (RS - DH);
  add(ringSectorGeometry(RD - 0.2, WR + 0.5, -HA, HA, CH, CH + 0.4, 96, UV.plaster, { top: false, bottom: true, inner: true, caps: false }), M.ceiling);
  for (const r of [RD + 2.9, RD + 5.8]) add(ringSectorGeometry(r - 0.18, r + 0.18, -HA, HA, CH - 0.3, CH, 96, UV.plaster, { bottom: true, caps: false }), M.ceiling);
  for (let a = -HA + 0.09; a < HA; a += 0.18) group.add(radialBox((RD + WR) / 2, a, WR - RD + 0.6, 0.3, 0.26, CH - 0.15, M.ceiling));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(RS, 96, 24, 0, Math.PI * 2, 0, thetaMax), M.dome); dome.position.y = domeY; group.add(dome);
  add(ringSectorGeometry(RD - 0.35, RD + 0.45, -HA, HA, CH - 0.25, CH + 0.4, 96, UV.plaster, { bottom: true, caps: false }), M.rib);
  const ribCount = 56;
  for (let i = 0; i < ribCount; i++) {
    const a = -HA + (i + 0.5) / ribCount * 2 * HA;
    const pts = [];
    for (let k = 0; k <= 8; k++) { const th = thetaMax * (1 - k / 8); pts.push(new THREE.Vector3(RS * Math.sin(th) * Math.sin(a), domeY + RS * Math.cos(th) - 0.06, RS * Math.sin(th) * Math.cos(a))); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.09, 8, false), M.rib));
  }
  for (const f of [0.38, 0.7]) {
    const th = thetaMax * f;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RS * Math.sin(th), 0.07, 8, 96, 2 * HA), M.rib);
    ring.position.y = domeY + RS * Math.cos(th) - 0.06; ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 2 - HA; group.add(ring);
  }
  const oculus = new THREE.Mesh(new THREE.SphereGeometry(RS - 0.02, 48, 8, 0, Math.PI * 2, 0, 0.045), std({ color: 0xffffff, emissive: 0xfffaf0, emissiveIntensity: 1.4, side: THREE.BackSide }));
  oculus.position.y = domeY; group.add(oculus);
  // recessed downlights in the flat ceiling and under the gallery
  const dl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), M.downlight, 40 + corridorLights.length);
  let di = 0;
  for (let a = -HA + 0.12; a < HA && di < 40; a += 0.26) { const [x, z] = cart(RD + 4.3, a); dummy.position.set(x, CH - 0.01, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); dl.setMatrixAt(di++, dummy.matrix); }
  for (const [x, y, z] of corridorLights) { if (di >= dl.count) break; dummy.position.set(x, y, z); dummy.updateMatrix(); dl.setMatrixAt(di++, dummy.matrix); }
  dl.count = di; group.add(dl);

  // ---------------------------------------------------------------- lighting: daylight through the dome
  const lights = [];
  scene.add(new THREE.HemisphereLight(0xf6f3ea, 0x3d5a4c, 0.5));
  const sun = new THREE.DirectionalLight(0xfff8ee, 1.5);
  sun.position.set(3, 40, 14); sun.target.position.set(0, 0, 12);
  sun.castShadow = true;
  const res = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  sun.shadow.mapSize.set(res, res);
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 1, far: 80 });
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const spot = new THREE.SpotLight(0xfff0dc, 90, 30, 0.55, 0.7, 2);
  spot.position.set(0, CH - 0.3, 5); spot.target.position.set(0, 0, 4);
  spot.castShadow = quality !== 'low';
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);
  const fill = (r, a, y, i) => { const [x, z] = cart(r, a); const l = new THREE.PointLight(0xfff2e0, i, 34, 2); l.position.set(x, y, z); scene.add(l); lights.push(l); };
  fill(9, -0.6, 8.6, 45); fill(9, 0.6, 8.6, 45);
  fill(17, -0.45, 8.8, 50); fill(17, 0.45, 8.8, 50);
  if (quality !== 'low') { fill(21.5, -1.15, 5.6, 25); fill(21.5, 1.15, 5.6, 25); }
  lights.push(sun, spot);

  return { group, flags, lights, materials: M };
}

/** Gentle flag wave. */
export function animateFlags(flags, time) {
  for (const f of flags) {
    const p = f.geometry.attributes.position, base = f.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      p.array[i * 3 + 2] = Math.sin(x * 6 + time * 3) * 0.03 * (x + 0.7) + Math.sin(y * 8 + time * 2.2) * 0.015;
    }
    p.needsUpdate = true;
    f.geometry.computeVertexNormals();
  }
}
