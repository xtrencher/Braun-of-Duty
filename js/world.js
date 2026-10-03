import * as THREE from 'three';
import { L, tierFront, tierHeight, aisleHalfAngle, rowHalfAngle, cart } from './chamber.js';
import { ringSectorGeometry, box } from './geo.js';
import * as T from './textures.js';

/** Builds the Sejm chamber. Returns { group, flags, lights } for animation hooks. */
export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---------------------------------------------------------------- materials
  const carpet = T.carpetTexture();
  const wood = T.woodTexture();
  const woodDark = T.woodTexture('#5a3418', '#361c0a', '#7a4a28');
  const green = T.fabricTexture();
  const plaster = T.plasterTexture();
  const panel = T.panelTexture();
  const M = {
    carpet: new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0.05 }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodDark, roughness: 0.5, metalness: 0.08 }),
    green: new THREE.MeshStandardMaterial({ map: green, roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.9, color: 0xf0e6cf }),
    plasterGreen: new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.9, color: 0x9fb39a }),
    panel: new THREE.MeshStandardMaterial({ map: panel, roughness: 0.55, metalness: 0.05 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4a53a, roughness: 0.3, metalness: 0.9 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd58a, emissiveIntensity: 2.2 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.7 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b2e, roughness: 0.85 }),
    pot: new THREE.MeshStandardMaterial({ color: 0x8b5a3c, roughness: 0.8 }),
    door: new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.6 }),
    ceiling: new THREE.MeshStandardMaterial({ map: plaster, roughness: 1, color: 0xf3ead8 }),
  };
  const add = (geo, mat, { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; group.add(m); return m;
  };
  const HA = L.HALF_ANG;

  // ---------------------------------------------------------------- floors
  add(ringSectorGeometry(0, L.R0, -HA, HA, -0.1, 0, 48, 0.5, { caps: false, inner: false }), M.carpet);
  for (let t = 1; t <= L.NT; t++) {
    const h = tierHeight(t), rf = tierFront(t);
    const rOut = t === L.NT ? L.WALL_R : tierFront(t + 1);
    add(ringSectorGeometry(rf, rOut, -HA, HA, h - 0.1, h, 64, 0.5, { caps: false }), M.carpet);
  }

  // ---------------------------------------------------------------- desks, seats, stairs
  const seatCushion = new THREE.BoxGeometry(0.52, 0.12, 0.5);
  const seatBack = new THREE.BoxGeometry(0.52, 0.58, 0.1);
  const seatFrame = new THREE.BoxGeometry(0.56, 0.42, 0.52);
  const seatTransforms = [];
  const dummy = new THREE.Object3D();

  for (let t = 1; t <= L.NT; t++) {
    const h = tierHeight(t), hPrev = tierHeight(t - 1), rf = tierFront(t);
    const rowHA = rowHalfAngle(rf);
    const hw = aisleHalfAngle(rf);
    // angular spans between aisles
    const bounds = [-rowHA, ...L.AISLES.flatMap(a => [a - hw, a + hw]), rowHA];
    for (let k = 0; k < bounds.length; k += 2) {
      const a0 = bounds[k], a1 = bounds[k + 1];
      if (a1 - a0 < 0.02) continue;
      // desk body (also the riser between tiers) + overhanging top
      add(ringSectorGeometry(rf, rf + L.DESK_D, a0, a1, hPrev - 0.05, h + 0.74, 24, 0.4), M.wood, { cast: true });
      add(ringSectorGeometry(rf - 0.06, rf + L.DESK_D + 0.06, a0, a1, h + 0.74, h + 0.8, 24, 0.4, { bottom: true }), M.woodDark, { cast: true });
      // front rail / modesty strip
      add(ringSectorGeometry(rf - 0.02, rf + 0.02, a0, a1, h + 0.3, h + 0.36, 24, 0.4), M.woodDark);
      // seats along the arc
      const rs = rf + L.DESK_D + 0.45;
      const pitch = 0.64 / rs;
      const n = Math.floor((a1 - a0 - 0.1 / rs) / pitch);
      const start = a0 + ((a1 - a0) - n * pitch) / 2 + pitch / 2;
      for (let s = 0; s < n; s++) seatTransforms.push({ a: start + s * pitch, r: rs, h });
    }
    // stairs in every aisle leading up to this tier
    for (const a of L.AISLES) {
      const rStart = rf - L.STAIR_L, stepD = L.STAIR_L / L.STEPS, stepH = L.TH / L.STEPS;
      for (let s = 0; s < L.STEPS; s++) {
        const r0 = rStart + s * stepD, r1 = rf + 0.02;
        const hwS = aisleHalfAngle(r0) * 1.02;
        add(ringSectorGeometry(r0, r1, a - hwS, a + hwS, hPrev - 0.05, hPrev + stepH * (s + 1), 6, 0.5), M.carpet);
        add(ringSectorGeometry(r0 - 0.01, r0 + 0.03, a - hwS, a + hwS, hPrev + stepH * s + 0.005, hPrev + stepH * (s + 1) + 0.01, 6, 0.5, { top: true }), M.brass);
      }
    }
  }

  const seats = new THREE.InstancedMesh(seatCushion, M.green, seatTransforms.length);
  const backs = new THREE.InstancedMesh(seatBack, M.green, seatTransforms.length);
  const frames = new THREE.InstancedMesh(seatFrame, M.woodDark, seatTransforms.length);
  seatTransforms.forEach(({ a, r, h }, i) => {
    const [x, z] = cart(r, a);
    dummy.position.set(x, h + 0.46, z); dummy.rotation.set(0, a + Math.PI, 0); dummy.updateMatrix();
    seats.setMatrixAt(i, dummy.matrix);
    const [bx, bz] = cart(r + 0.2, a);
    dummy.position.set(bx, h + 0.78, bz); dummy.rotation.set(0.12, a + Math.PI, 0); dummy.updateMatrix();
    backs.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, h + 0.21, z); dummy.rotation.set(0, a + Math.PI, 0); dummy.updateMatrix();
    frames.setMatrixAt(i, dummy.matrix);
  });
  for (const m of [seats, backs, frames]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }

  // ---------------------------------------------------------------- walls, balcony, ceiling
  const topH = tierHeight(L.NT);
  add(ringSectorGeometry(L.WALL_R, L.WALL_R + 0.4, -HA, HA, topH - 0.2, topH + 2.6, 96, 0.25, { top: false, outer: false, caps: false }), M.panel);
  add(ringSectorGeometry(L.WALL_R, L.WALL_R + 0.4, -HA, HA, topH + 2.6, L.CEIL_H, 96, 0.3, { top: false, outer: false, caps: false }), M.plasterGreen);
  // balcony: slab, front panel, railing
  const bH = L.BALCONY_H;
  add(ringSectorGeometry(L.WALL_R - 2.4, L.WALL_R + 0.1, -HA, HA, bH - 0.35, bH, 96, 0.4, { bottom: true }), M.wood);
  add(ringSectorGeometry(L.WALL_R - 2.5, L.WALL_R - 2.4, -HA, HA, bH - 0.9, bH, 96, 0.4, { bottom: true, top: true }), M.panel);
  add(ringSectorGeometry(L.WALL_R - 2.46, L.WALL_R - 2.4, -HA, HA, bH + 0.95, bH + 1.02, 96, 0.4, { bottom: true }), M.brass);
  const postGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6);
  const postCount = Math.floor((2 * HA) * (L.WALL_R - 2.45) / 0.5);
  const posts = new THREE.InstancedMesh(postGeo, M.brass, postCount);
  for (let i = 0; i < postCount; i++) {
    const a = -HA + (i + 0.5) / postCount * 2 * HA;
    const [x, z] = cart(L.WALL_R - 2.43, a);
    dummy.position.set(x, bH + 0.5, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  group.add(posts);
  // balcony benches
  add(ringSectorGeometry(L.WALL_R - 2.0, L.WALL_R - 1.2, -HA, HA, bH, bH + 0.45, 96, 0.4), M.green);
  add(ringSectorGeometry(L.WALL_R - 1.3, L.WALL_R - 1.1, -HA, HA, bH, bH + 0.9, 96, 0.4), M.green);

  // side walls (radial)
  for (const sgn of [-1, 1]) {
    const a = sgn * HA, len = L.WALL_R + 0.6, mid = len / 2 - 0.4;
    const [x, z] = cart(mid, a);
    const lower = box(0.4, 3.0, len, M.panel, x, 1.5, z); lower.rotation.y = a; group.add(lower);
    const upper = box(0.4, L.CEIL_H - 3.0, len, M.plasterGreen, x, 3.0 + (L.CEIL_H - 3.0) / 2, z); upper.rotation.y = a; group.add(upper);
    const ledge = box(0.9, 0.12, len, M.wood, x, 3.0, z); ledge.rotation.y = a; group.add(ledge);
  }
  // ceiling with coffer beams
  add(ringSectorGeometry(0, L.WALL_R + 0.4, -HA, HA, L.CEIL_H, L.CEIL_H + 0.2, 64, 0.3, { top: false, bottom: true, inner: false, caps: false }), M.ceiling);
  for (let r = 6; r < L.WALL_R; r += 5.5) {
    add(ringSectorGeometry(r, r + 0.4, -HA, HA, L.CEIL_H - 0.35, L.CEIL_H, 64, 0.3, { bottom: true, caps: false }), M.plaster);
  }

  // pilasters, doors and sconces on the back wall at every aisle
  for (const a of L.AISLES) {
    const [x, z] = cart(L.WALL_R - 0.25, a);
    const door = box(1.9, 2.6, 0.2, M.door, x, topH + 1.3, z); door.rotation.y = a; group.add(door);
    const frame = box(2.3, 2.95, 0.12, M.woodDark, x, topH + 1.45, z); frame.rotation.y = a; group.add(frame);
    const frameInner = box(2.1, 2.75, 0.14, M.door, x, topH + 1.4, z); frameInner.rotation.y = a; group.add(frameInner);
    for (const sgn of [-1, 1]) {
      const ap = a + sgn * 1.6 / L.WALL_R;
      const [px, pz] = cart(L.WALL_R - 0.3, ap);
      const pil = box(0.5, L.CEIL_H - topH, 0.5, M.panel, px, (L.CEIL_H + topH) / 2, pz); pil.rotation.y = ap; group.add(pil);
      const [sx, sz] = cart(L.WALL_R - 0.6, ap);
      const sconce = box(0.3, 0.45, 0.15, M.brass, sx, topH + 3.1, sz); sconce.rotation.y = ap; group.add(sconce);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.bulb); bulb.position.set(sx, topH + 3.4, sz); group.add(bulb);
    }
  }

  // ---------------------------------------------------------------- presidium
  // apex panel hides the sharp corner behind the dais
  const apex = box(4.2, L.CEIL_H, 0.3, M.panel, 0, L.CEIL_H / 2, -0.35); apex.receiveShadow = false; group.add(apex);
  add(ringSectorGeometry(0, L.DAIS_R, -HA, HA, 0, 0.85, 48, 0.4, { inner: false, caps: false }), M.wood);
  add(ringSectorGeometry(0, L.DAIS_R, -HA, HA, 0.85, 0.86, 48, 0.5, { inner: false, caps: false, outer: false }), M.carpet);
  // presidium bench
  add(ringSectorGeometry(1.75, 2.55, -0.95, 0.95, 0.85, 1.62, 32, 0.4), M.woodDark, { cast: true });
  add(ringSectorGeometry(1.7, 2.62, -0.95, 0.95, 1.62, 1.68, 32, 0.4), M.wood, { cast: true });
  // backdrop with emblem
  const backdrop = box(6.0, 7.0, 0.3, M.panel, 0, 3.5, 0.9); backdrop.castShadow = false; backdrop.receiveShadow = true; group.add(backdrop);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), new THREE.MeshStandardMaterial({ map: T.emblemTexture(), roughness: 0.6 }));
  emblem.position.set(0, 4.3, 1.06); group.add(emblem);
  const emblemFrame = box(1.8, 2.2, 0.06, M.brass, 0, 4.3, 1.03); group.add(emblemFrame);
  // rostrum
  const R = L.ROSTRUM;
  const rostrum = box(R.hw * 2, 1.25, R.hd * 2, M.wood, R.x, 0.625, R.z); rostrum.castShadow = true; rostrum.receiveShadow = true; group.add(rostrum);
  group.add(box(R.hw * 2 + 0.2, 0.06, R.hd * 2 + 0.2, M.woodDark, R.x, 1.28, R.z));
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), M.black); mic.position.set(R.x, 1.55, R.z - 0.15); mic.rotation.x = -0.4; group.add(mic);
  // microphones on desks (first tier, every few seats) are skipped for performance

  // flags
  const flags = [];
  const makeFlag = (texture, x, z, w, h) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 8), M.brass); pole.position.set(x, 0.85 + 1.8, z); group.add(pole);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.brass); finial.position.set(x, 0.85 + 3.65, z); group.add(finial);
    const geo = new THREE.PlaneGeometry(w, h, 10, 6);
    const mat = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.8 });
    const flag = new THREE.Mesh(geo, mat);
    flag.position.set(x + (x < 0 ? 1 : -1) * Math.sin(0.55) * w / 2, 0.85 + 3.6 - h / 2 - 0.05, z - Math.cos(0.55) * w / 2);
    flag.rotation.y = x < 0 ? Math.PI / 2 - 0.55 : Math.PI / 2 + 0.55;
    flag.castShadow = false;
    flag.userData.base = geo.attributes.position.array.slice();
    group.add(flag); flags.push(flag);
  };
  makeFlag(T.flagPL(), -2.45, 1.7, 1.3, 0.82);
  makeFlag(T.flagEU(), 2.45, 1.7, 1.3, 0.86);

  // potted plants by the dais
  const makePlant = (x, z) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 12), M.pot); pot.position.set(x, 0.25, z); pot.castShadow = true; group.add(pot);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.12, 8, 6), M.leaf);
      const a = i / 7 * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 0.22, 0.75 + Math.random() * 0.35, z + Math.sin(a) * 0.22);
      leaf.scale.y = 1.5; leaf.castShadow = true; group.add(leaf);
    }
  };
  makePlant(-3.9, 3.2); makePlant(3.9, 3.2);

  // ---------------------------------------------------------------- lighting
  const lights = [];
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x4a3020, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
  sun.position.set(2, 30, 16); sun.target.position.set(0, 0, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const chandelier = (r, a, h) => {
    const [x, z] = cart(r, a);
    const light = new THREE.PointLight(0xffd9a0, 70, 32, 2);
    light.position.set(x, h, z); scene.add(light); lights.push(light);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, L.CEIL_H - h, 6), M.brass); rod.position.set(x, (L.CEIL_H + h) / 2, z); group.add(rod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 24), M.brass); ring.position.set(x, h, z); ring.rotation.x = Math.PI / 2; group.add(ring);
    for (let i = 0; i < 6; i++) {
      const an = i / 6 * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.bulb); bulb.position.set(x + Math.cos(an) * 0.55, h + 0.12, z + Math.sin(an) * 0.55); group.add(bulb);
    }
  };
  chandelier(5.5, 0, 7.4);
  chandelier(13, -0.75, 7.6); chandelier(13, 0.75, 7.6);
  chandelier(19.5, -0.3, 7.8); chandelier(19.5, 0.3, 7.8);

  return { group, flags, lights, materials: M };
}

/** Gentle flag wave. */
export function animateFlags(flags, time) {
  for (const f of flags) {
    const p = f.geometry.attributes.position, base = f.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      p.array[i * 3 + 2] = Math.sin(x * 6 + time * 3) * 0.03 * (x + 0.45) + Math.sin(y * 8 + time * 2.2) * 0.015;
    }
    p.needsUpdate = true;
    f.geometry.computeVertexNormals();
  }
}
