import * as THREE from 'three';

/**
 * First-person viewmodel: two suited hands holding a red fire extinguisher.
 * Lives in its own scene (rendered after the world with a cleared depth buffer)
 * so it never clips through desks or walls. All positions are in camera space.
 */
export class Weapon {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.02, 10);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.basePos = new THREE.Vector3(0, 0, 0);
    this.sway = new THREE.Vector2();
    this.recoil = 0;
    this.time = 0;
    this.pressure = 0;

    const red = new THREE.MeshStandardMaterial({ color: 0xd4181b, roughness: 0.3, metalness: 0.15 });
    const black = new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.55, metalness: 0.2 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.9 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd3a640, roughness: 0.25, metalness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe3b48f, roughness: 0.7 });
    const suit = new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.92 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.8 });
    const label = new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.6 });

    // ---- extinguisher body, tilted so the valve leans up-right toward the player
    const body = new THREE.Group();
    body.position.set(0.13, -0.47, -0.6);
    body.rotation.set(-0.22, 0, -0.32);
    this.rig.add(body);
    const cyl = (r0, r1, h, mat, y, seg = 28) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.y = y; body.add(m); return m; };
    cyl(0.076, 0.076, 0.46, red, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.076, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), red); dome.position.y = 0.23; body.add(dome);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.076, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), red); foot.position.y = -0.23; body.add(foot);
    cyl(0.08, 0.08, 0.03, rubber, -0.29);
    cyl(0.0775, 0.0775, 0.17, label, -0.03);
    cyl(0.03, 0.05, 0.07, brass, 0.33, 16);
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.075), black); valve.position.y = 0.39; body.add(valve);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 16), label); gauge.position.set(0, 0.39, 0.05); gauge.rotation.x = Math.PI / 2; body.add(gauge);
    const gaugeRim = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 16), brass); gaugeRim.position.set(0, 0.39, 0.058); body.add(gaugeRim);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 14), brass); pin.position.set(0.055, 0.41, 0); pin.rotation.y = Math.PI / 2; body.add(pin);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.04), black); handle.position.set(-0.04, 0.425, 0); body.add(handle);
    this.lever = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.016, 0.04), black); this.lever.position.set(-0.045, 0.46, 0); body.add(this.lever);
    const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10), brass); outlet.position.set(0.05, 0.37, 0.0); outlet.rotation.z = Math.PI / 2; body.add(outlet);
    this.body = body;

    // ---- nozzle horn, held out front by the left hand
    const nozzle = new THREE.Group();
    nozzle.position.set(0.05, -0.17, -0.8);
    nozzle.rotation.set(-Math.PI / 2 + 0.06, 0, 0);          // +y -> forward (-z)
    this.rig.add(nozzle);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.1, 12), rubber); grip.position.y = -0.02; nozzle.add(grip);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.02, 0.13, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.55, side: THREE.DoubleSide })); horn.position.y = 0.09; nozzle.add(horn);
    const hornRim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.005, 6, 18), black); hornRim.position.y = 0.155; hornRim.rotation.x = Math.PI / 2; nozzle.add(hornRim);
    this.nozzleTip = new THREE.Object3D(); this.nozzleTip.position.set(0, 0.16, 0); nozzle.add(this.nozzleTip);
    this.nozzle = nozzle;

    // ---- hose from the valve outlet to the nozzle grip
    this.rig.updateMatrixWorld(true);
    const toRig = v => this.rig.worldToLocal(v);
    const outletW = toRig(body.localToWorld(new THREE.Vector3(0.08, 0.37, 0)));
    const gripW = toRig(nozzle.localToWorld(new THREE.Vector3(0, -0.07, 0)));
    const hosePts = [outletW, outletW.clone().add(new THREE.Vector3(0.05, -0.12, -0.02)), new THREE.Vector3(0.0, -0.36, -0.68), gripW.clone().add(new THREE.Vector3(0, -0.06, 0.06)), gripW];
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePts), 32, 0.011, 8, false), rubber);
    this.rig.add(hose);

    // ---- hands
    const basis = (fingers, back) => {
      const z = fingers.clone().normalize();
      const y = back.clone().sub(z.clone().multiplyScalar(back.dot(z))).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      return new THREE.Matrix4().makeBasis(x, y, z);
    };
    const makeHand = (pos, fingers, back, curl = 1.1, scale = 1) => {
      const g = new THREE.Group();
      g.position.copy(pos);
      g.quaternion.setFromRotationMatrix(basis(fingers, back));
      g.scale.setScalar(scale);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.085), skin); palm.position.z = 0.02; g.add(palm);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Group(); f.position.set(-0.031 + i * 0.0207, -0.005, 0.06); f.rotation.x = curl * (0.8 + i * 0.06); g.add(f);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.045), skin); seg.position.z = 0.02; f.add(seg);
        const seg2 = new THREE.Group(); seg2.position.z = 0.042; seg2.rotation.x = curl * 0.9; f.add(seg2);
        const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.016, 0.035), skin); s2.position.z = 0.016; seg2.add(s2);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.05), skin); thumb.position.set(-0.052, -0.012, 0.025); thumb.rotation.set(0.5, 0.6, 0); g.add(thumb);
      return g;
    };
    const sleeve = (from, to, r0, r1) => {
      const dir = to.clone().sub(from), len = dir.length();
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 16), suit);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.12, r0 * 1.12, 0.035, 16), cuff);
      c.position.copy(from).add(dir.clone().multiplyScalar(0.012));
      c.quaternion.copy(m.quaternion);
      g.add(m, c);
      return g;
    };

    // right hand squeezes the lever on top of the valve
    const leverW = toRig(body.localToWorld(new THREE.Vector3(-0.02, 0.5, 0.0)));
    const rFingers = new THREE.Vector3(-1, -0.5, -0.35);
    this.rightHand = makeHand(leverW, rFingers, new THREE.Vector3(0.1, 1, -0.25), 1.05, 1.15);
    this.rig.add(this.rightHand);
    const rWrist = leverW.clone().sub(rFingers.clone().normalize().multiplyScalar(0.045));
    this.rig.add(sleeve(rWrist, rWrist.clone().add(new THREE.Vector3(0.36, -0.5, 0.42)), 0.046, 0.08));

    // left hand wraps around the nozzle grip from below-left
    const gripC = toRig(nozzle.localToWorld(new THREE.Vector3(0, -0.02, 0)));
    const lPos = gripC.clone().add(new THREE.Vector3(-0.045, -0.035, 0.0));
    this.leftHand = makeHand(lPos, new THREE.Vector3(0.75, 0.65, 0.1), new THREE.Vector3(-0.55, 0.2, 0.8), 1.15, 1.12);
    this.rig.add(this.leftHand);
    const lWrist = lPos.clone().sub(new THREE.Vector3(0.75, 0.65, 0.1).normalize().multiplyScalar(0.045));
    this.rig.add(sleeve(lWrist, lWrist.clone().add(new THREE.Vector3(-0.3, -0.55, 0.45)), 0.046, 0.08));

    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2a20, 1.2));
    const key = new THREE.DirectionalLight(0xfff2dc, 1.9); key.position.set(0.6, 1.5, 1.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.7); rim.position.set(-1, 0.8, -1); this.scene.add(rim);

    this._tmp = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  update(dt, { moving, sprint, firing, bobPhase, look }) {
    this.time += dt;
    this.pressure += ((firing ? 1 : 0) - this.pressure) * Math.min(1, 14 * dt);
    this.lever.position.y = 0.46 - this.pressure * 0.022;
    this.lever.rotation.z = this.pressure * 0.1;
    this.sway.x += (look.x * 0.0007 - this.sway.x) * Math.min(1, 9 * dt);
    this.sway.y += (look.y * 0.0007 - this.sway.y) * Math.min(1, 9 * dt);
    const bobAmt = moving ? (sprint ? 0.022 : 0.014) : 0.003;
    const bx = Math.cos(bobPhase * 0.5) * bobAmt * (moving ? 1 : 0.4);
    const by = Math.abs(Math.sin(bobPhase)) * bobAmt * 0.8 + Math.sin(this.time * 1.6) * 0.0025;
    const jx = firing ? (Math.random() - 0.5) * 0.004 : 0, jy = firing ? (Math.random() - 0.5) * 0.004 : 0;
    this.recoil += ((firing ? 0.02 : 0) - this.recoil) * Math.min(1, 8 * dt);
    this.rig.position.set(this.basePos.x + bx + jx - this.sway.x * 0.35, this.basePos.y + by + jy - this.sway.y * 0.35, this.basePos.z + this.recoil);
    this.rig.rotation.set(-this.sway.y * 0.5 + (firing ? Math.sin(this.time * 40) * 0.004 : 0), -this.sway.x * 0.5, Math.sin(bobPhase * 0.5) * (moving ? 0.012 : 0.003));
  }

  /**
   * World-space emitter position/direction for the foam. The nozzle is projected through the
   * viewmodel camera and re-cast through the world camera so the stream starts exactly where
   * the horn appears on screen.
   */
  nozzleWorld(camera, outPos, outDir) {
    this.nozzleTip.getWorldPosition(this._tmp);
    const dist = -this._tmp.z;
    this._ndc.copy(this._tmp).project(this.camera);
    outPos.set(this._ndc.x, this._ndc.y, 0.5).unproject(camera);
    outPos.sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
    outDir.set(0, 0, -7).applyMatrix4(camera.matrixWorld).sub(outPos).normalize();
    return outPos;
  }
}
