import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createHuman } from './human.js';
import { floorHeight, resolveMove, findPath, nearestNode, cart, angDiff } from './chamber.js';

const MAX_HP = 100;

/** The fleeing MP: dark suit, white shirt, red tie. Navigates the aisle/walkway graph. */
export class Politician {
  constructor(scene, graph) {
    this.graph = graph;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.state = 'hidden';
    this.hp = MAX_HP; this.maxHp = MAX_HP;
    this.glow = 0;
    this.sinceHit = 99;
    this.hitAccum = 0;
    this.stunTimer = 0;
    this.panic = 0;
    this.runPhase = 0;
    this.edge = null; this.path = []; this.goal = -1; this.replan = 0; this.planCooldown = 0;
    this.lastNode = graph.nodes[0];
    this.speedScale = 1;
    this._build();
  }

  _build() {
    const human = createHuman({ tone: '#e2b08c', suit: '#1b2640', hair: '#2a1c13' });
    this.body = human.root;                      // pivot at the feet, faces +z
    this.group.add(this.body);
    this.bones = human.bones;
    this.mats = human.mats;
    this.skinned = human.mesh;
    this.group.visible = false;
  }

  get height() { return 1.9; }

  spawnAtNode(node) {
    this.lastNode = node;
    this.pos.set(node.x, node.y, node.z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp; this.glow = 0; this.sinceHit = 99; this.hitAccum = 0; this.panic = 0;
    this.state = 'idle'; this.edge = null; this.path = []; this.goal = -1; this.replan = 0;
    this.group.visible = true;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
    this.bones.hips.position.y = 0.95; this.bones.head.rotation.set(0, 0, 0); this.bones.spine.rotation.set(0, 0, 0);
  }

  hide() { this.state = 'hidden'; this.group.visible = false; }

  /** Pick a destination and route there. far=true flees the player, otherwise strolls. */
  plan(playerPos, far = true) {
    const g = this.graph;
    const from = nearestNode(g, this.pos.x, this.pos.z);
    let best = null, bs = -Infinity;
    const dPlayerNow = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    for (const n of g.nodes) {
      if (n.id === from.id) continue;
      const dp = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
      const dn = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      let score;
      if (far) {
        if (dn < 6) continue;
        score = Math.min(dp, 18) + dn * 0.25 + (dp < dPlayerNow * 0.8 ? -12 : 0) + Math.random() * 6;
      } else {
        score = -Math.abs(dn - 9) + Math.random() * 6;
      }
      if (score > bs) { bs = score; best = n; }
    }
    if (!best) best = g.nodes[(from.id + 1) % g.nodes.length];
    this.goal = best.id;
    const ids = findPath(g, from.id, best.id);
    this.path = ids.slice(ids[0] === from.id ? 1 : 0);
    this.edge = { type: 'direct', ax: this.pos.x, az: this.pos.z, node: from, s: 0, len: Math.max(0.01, Math.hypot(from.x - this.pos.x, from.z - this.pos.z)) };
    if (this.edge.len < 0.25) { this.lastNode = from; this._nextEdge(); }
    this.replan = 2.5 + Math.random() * 2;
    this.planCooldown = 0.6;
  }

  _nextEdge() {
    if (!this.path.length) { this.edge = null; return; }
    const to = this.graph.nodes[this.path.shift()];
    const from = this.lastNode;
    let type = 'direct';
    if (from && from.i === to.i) type = 'radial';
    else if (from && from.t === to.t) type = 'arc';
    const len = type === 'arc' ? Math.abs(angDiff(to.a, from.a)) * from.r : Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
    this.edge = { type, from, node: to, ax: this.pos.x, az: this.pos.z, s: 0, len: Math.max(0.01, len) };
  }

  /** Apply `hits` particle strikes this frame. Returns { impact } when a knockback fired. */
  onHit(hits, playerPos, dt) {
    if (this.state === 'hidden' || this.state === 'down') return { impact: false };
    const intensity = Math.min(1, hits / 4);
    this.hp = Math.max(0, this.hp - 15 * intensity * dt);
    this.glow = 1; this.sinceHit = 0; this.panic = 5;
    this.hitAccum += dt * (0.5 + intensity);
    let impact = false;
    if (this.hitAccum > 0.5 && this.state !== 'airborne') {
      this.hitAccum = 0; impact = true;
      const dx = this.pos.x - playerPos.x, dz = this.pos.z - playerPos.z, inv = 1 / (Math.hypot(dx, dz) || 1);
      this.vel.set(dx * inv * 3.4 + (Math.random() - 0.5), 3.2, dz * inv * 3.4 + (Math.random() - 0.5));
      this.state = 'airborne';
    }
    if (this.hp <= 0 && this.state !== 'airborne') this._fall();
    return { impact };
  }

  _fall() { this.state = 'down'; this.downTimer = 0; this.vel.set(0, 0, 0); }

  /**
   * Drive the skeleton. legSwing/armSwing in radians (positive = left limb forward),
   * kneeBend/elbowBend flexion, armsUp = panicked arms-out pose.
   */
  _pose(legSwing, kneeBend, armSwing, elbowBend, armsUp) {
    const B = this.bones;
    B.upperLegL.rotation.x = -legSwing; B.upperLegR.rotation.x = legSwing;
    B.lowerLegL.rotation.x = Math.max(0, kneeBend); B.lowerLegR.rotation.x = Math.max(0, -kneeBend);
    B.footL.rotation.x = -Math.max(0, kneeBend) * 0.5; B.footR.rotation.x = -Math.max(0, -kneeBend) * 0.5;
    if (armsUp) {
      const flap = Math.sin(this.runPhase * 2) * 0.25;
      B.upperArmL.rotation.set(-0.55 + flap, 0.2, -1.05); B.upperArmR.rotation.set(-0.55 - flap, -0.2, 1.05);
      B.forearmL.rotation.set(-0.9, 0.3, -0.2); B.forearmR.rotation.set(-0.9, -0.3, 0.2);
    } else {
      B.upperArmL.rotation.set(armSwing, 0, -0.12); B.upperArmR.rotation.set(-armSwing, 0, 0.12);
      B.forearmL.rotation.set(-elbowBend, 0, 0); B.forearmR.rotation.set(-elbowBend, 0, 0);
    }
  }

  update(dt, playerPos) {
    if (this.state === 'hidden') return;
    this.sinceHit += dt;
    this.glow = Math.max(0, this.glow - dt * 2.2);
    for (const m of this.mats) m.emissiveIntensity = this.glow * 1.4;
    this.panic = Math.max(0, this.panic - dt);
    const dPlayer = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);

    if (this.state === 'airborne') {
      this.vel.y -= 11 * dt;
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      const [rx, rz] = resolveMove(this.pos.x, this.pos.z, nx, nz, 0.3);
      this.pos.x = rx; this.pos.z = rz; this.pos.y += this.vel.y * dt;
      const fl = floorHeight(this.pos.x, this.pos.z);
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, -0.9, Math.min(1, 6 * dt));
      this._pose(0.5, 0.8, 0, 0, true);
      this.bones.spine.rotation.x = -0.2;
      if (this.pos.y <= fl && this.vel.y < 0) {
        this.pos.y = fl; this.vel.set(0, 0, 0);
        if (this.hp <= 0) this._fall(); else { this.state = 'stunned'; this.stunTimer = 0.45; }
      }
      this.group.position.copy(this.pos);
      return;
    }
    if (this.state === 'down') {
      this.downTimer += dt;
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, -Math.PI / 2 + 0.12, Math.min(1, 5 * dt));
      this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.22, Math.min(1, 5 * dt));
      this._pose(0.15, 0.3, 0, 0.4, false);
      this.bones.upperArmL.rotation.set(-1.3, 0, -0.9); this.bones.upperArmR.rotation.set(-1.6, 0, 0.7);
      this.bones.head.rotation.set(0.3, 0.4, 0);
      this.group.position.copy(this.pos);
      return;
    }
    if (this.state === 'stunned') {
      this.stunTimer -= dt;
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, Math.min(1, 8 * dt));
      this._pose(0, 0.2, Math.sin(this.sinceHit * 30) * 0.3, 0, true);
      if (this.stunTimer <= 0) { this.state = 'flee'; this.plan(playerPos, true); }
      this.pos.y = floorHeight(this.pos.x, this.pos.z);
      this.group.position.copy(this.pos);
      return;
    }

    // ---- idle / flee navigation (hysteresis keeps him from dithering at the threat radius)
    this.planCooldown = Math.max(0, this.planCooldown - dt);
    const canPlan = this.planCooldown <= 0;
    if (this.state !== 'flee' && (dPlayer < 14 || this.panic > 0)) { this.state = 'flee'; this.plan(playerPos, true); }
    else if (this.state === 'flee' && dPlayer > 22 && this.panic <= 0 && this.sinceHit > 6 && canPlan) { this.state = 'idle'; this.plan(playerPos, false); }
    this.replan -= dt;
    if (!this.edge && !this.path.length && canPlan) this.plan(playerPos, this.state === 'flee');
    if (this.state === 'flee' && this.replan <= 0 && dPlayer < 7 && canPlan) this.plan(playerPos, true);
    if (!this.edge) this._nextEdge();

    const base = this.state === 'flee' ? (this.panic > 0 ? 5.1 : 4.4) : 1.8;
    const speed = base * (this.sinceHit < 0.3 ? 0.45 : 1) * this.speedScale;
    if (this.edge) {
      const e = this.edge;
      e.s = Math.min(1, e.s + speed / e.len * dt);
      let nx, nz;
      if (e.type === 'arc') { const a = e.from.a + angDiff(e.node.a, e.from.a) * e.s; [nx, nz] = cart(e.from.r, a); }
      else if (e.type === 'radial') { const r = e.from.r + (e.node.r - e.from.r) * e.s; [nx, nz] = cart(r, e.from.a); }
      else { nx = e.ax + (e.node.x - e.ax) * e.s; nz = e.az + (e.node.z - e.az) * e.s; }
      const dx = nx - this.pos.x, dz = nz - this.pos.z;
      if (dx * dx + dz * dz > 1e-8) this.facing = Math.atan2(dx, dz);
      this.pos.x = nx; this.pos.z = nz;
      if (e.s >= 1) { this.lastNode = e.node; this.edge = null; if (!this.path.length && this.state === 'idle') this.replan = 0; }
    }
    this.pos.y = floorHeight(this.pos.x, this.pos.z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    // run / walk cycle with knee and elbow bend
    const gait = Math.min(1, speed / 3.2);
    this.runPhase += dt * speed * 2.4;
    const s = Math.sin(this.runPhase), c = Math.cos(this.runPhase);
    const legSwing = s * (0.35 + 0.5 * gait);
    const kneeBend = (0.3 + 0.9 * gait) * Math.max(0, -c) + 0.1 * gait;   // tuck the trailing leg
    this._pose(legSwing, kneeBend, s * (0.3 + 0.5 * gait), 0.4 + 0.7 * gait, this.panic > 0 && this.state === 'flee');
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0.04 + 0.08 * gait, Math.min(1, 6 * dt));
    this.bones.spine.rotation.x = 0.04 * gait; this.bones.hips.rotation.y = s * 0.08 * gait; this.bones.chest.rotation.y = -s * 0.1 * gait;
    this.bones.hips.position.y = 0.95 + Math.abs(s) * 0.045 * gait - 0.02 * gait;
    this.bones.head.rotation.set(0.05 * gait, Math.sin(this.runPhase * 0.5) * 0.12 * gait, 0);
  }

  /** Capsule used by the particle system. */
  target() {
    if (this.state === 'hidden' || this.state === 'down') return null;
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, radius: 0.62, height: 1.85 };
  }

  headPosition(out) { return out.set(this.pos.x, this.pos.y + (this.state === 'down' ? 0.6 : 2.05), this.pos.z); }
  chestPosition(out) { return out.set(this.pos.x, this.pos.y + 1.25, this.pos.z); }
}

/** Dropped voting card pickup. */
export class Card {
  constructor(scene) {
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x88aaff, emissiveIntensity: 0.6 });
    const card = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.02, 0.24, 2, 0.008), mat);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.05), new THREE.MeshStandardMaterial({ color: 0xc8161c, emissive: 0xc8161c, emissiveIntensity: 0.5 }));
    stripe.position.z = -0.08;
    this.group.add(card, stripe);
    const glow = new THREE.PointLight(0x88aaff, 6, 4, 2); glow.position.y = 0.4; this.group.add(glow);
    this.group.visible = false;
    scene.add(this.group);
    this.active = false; this.t = 0;
    this.pos = new THREE.Vector3();
  }
  drop(x, y, z) { this.pos.set(x, y, z); this.active = true; this.group.visible = true; this.t = 0; }
  take() { this.active = false; this.group.visible = false; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.group.position.set(this.pos.x, this.pos.y + 0.45 + Math.sin(this.t * 3) * 0.08, this.pos.z);
    this.group.rotation.y = this.t * 2.2; this.group.rotation.x = 0.4;
  }
}
