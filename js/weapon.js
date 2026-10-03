import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { skinTile } from './human.js';

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

    const red = new THREE.MeshPhysicalMaterial({ map: T.extinguisherLabel(), roughness: 0.32, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
    const redPlain = new THREE.MeshPhysicalMaterial({ color: 0xd4181b, roughness: 0.32, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
    const black = new THREE.MeshStandardMaterial({ color: 0x17161b, roughness: 0.45, metalness: 0.35, envMapIntensity: 0.8 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.85, normalMap: T.hoseNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8b25c, roughness: 0.22, metalness: 1, envMapIntensity: 1.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8cad0, roughness: 0.3, metalness: 1, envMapIntensity: 1.2 });
    const skinT = skinTile('#e4b894');
    const skin = new THREE.MeshPhysicalMaterial({ ...skinT, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.58, sheen: 0.3, sheenRoughness: 0.8, sheenColor: 0xffd0b8, clearcoat: 0.06, clearcoatRoughness: 0.6, envMapIntensity: 0.5 });
    const suit = new THREE.MeshPhysicalMaterial({ color: 0x1b2640, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.7, sheenColor: 0x4a5a86 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.75 });
    const gaugeMat = new THREE.MeshStandardMaterial({ map: gaugeTexture(), roughness: 0.3 });

    // ---- extinguisher body, tilted so the valve leans up-right toward the player
    const body = new THREE.Group();
    body.position.set(0.13, -0.41, -0.62);
    body.rotation.set(-0.22, 0, -0.32);
    red.map.offset.x = 0.325;
    this.rig.add(body);
    const cyl = (r0, r1, h, mat, y, seg = 48) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.y = y; body.add(m); return m; };
    cyl(0.076, 0.076, 0.46, red, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.076, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), redPlain); dome.position.y = 0.23; body.add(dome);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.076, 48, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), redPlain); foot.position.y = -0.23; body.add(foot);
    cyl(0.082, 0.082, 0.03, black, -0.29);
    cyl(0.028, 0.05, 0.07, brass, 0.33, 24);
    cyl(0.034, 0.034, 0.02, steel, 0.365, 24);
    const valve = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.075, 0.08, 3, 0.012), black); valve.position.y = 0.4; body.add(valve);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, 24), gaugeMat); gauge.position.set(0, 0.4, 0.052); gauge.rotation.x = Math.PI / 2; body.add(gauge);
    const gaugeRim = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 24), brass); gaugeRim.position.set(0, 0.4, 0.061); body.add(gaugeRim);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 8, 20), steel); pin.position.set(0.058, 0.425, 0); pin.rotation.y = Math.PI / 2; body.add(pin);
    const pinRod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8), steel); pinRod.position.set(0.02, 0.425, 0); pinRod.rotation.z = Math.PI / 2; body.add(pinRod);
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.022, 0.04, 2, 0.008), black); handle.position.set(-0.04, 0.435, 0); body.add(handle);
    this.lever = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.018, 0.04, 2, 0.007), black); this.lever.position.set(-0.045, 0.468, 0); body.add(this.lever);
    const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), brass); outlet.position.set(0.05, 0.38, 0.0); outlet.rotation.z = Math.PI / 2; body.add(outlet);
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 8, 40), black); clamp.position.y = -0.12; clamp.rotation.x = Math.PI / 2; body.add(clamp);
    this.body = body;

    // ---- nozzle horn, held out front by the left hand
    const nozzle = new THREE.Group();
    nozzle.position.set(0.05, -0.17, -0.8);
    nozzle.rotation.set(-Math.PI / 2 + 0.06, 0, 0);
    this.rig.add(nozzle);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.1, 16), rubber); grip.position.y = -0.02; nozzle.add(grip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.02, 16), brass); collar.position.y = 0.035; nozzle.add(collar);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.02, 0.13, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x17161b, roughness: 0.5, side: THREE.DoubleSide })); horn.position.y = 0.1; nozzle.add(horn);
    const hornRim = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.006, 8, 28), black); hornRim.position.y = 0.165; hornRim.rotation.x = Math.PI / 2; nozzle.add(hornRim);
    this.nozzleTip = new THREE.Object3D(); this.nozzleTip.position.set(0, 0.17, 0); nozzle.add(this.nozzleTip);
    this.nozzle = nozzle;

    // ---- hose from the valve outlet to the nozzle grip
    this.rig.updateMatrixWorld(true);
    const toRig = v => this.rig.worldToLocal(v);
    const outletW = toRig(body.localToWorld(new THREE.Vector3(0.08, 0.38, 0)));
    const gripW = toRig(nozzle.localToWorld(new THREE.Vector3(0, -0.07, 0)));
    const hosePts = [outletW, outletW.clone().add(new THREE.Vector3(0.05, -0.12, -0.02)), new THREE.Vector3(0.0, -0.36, -0.68), gripW.clone().add(new THREE.Vector3(0, -0.06, 0.06)), gripW];
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePts), 48, 0.012, 12, false), rubber);
    this.rig.add(hose);

    // ---- hands: rounded palm, three-segment capsule fingers, thumb; sleeves with cuff and cufflink
    const basis = (fingers, back) => {
      const z = fingers.clone().normalize();
      const y = back.clone().sub(z.clone().multiplyScalar(back.dot(z))).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      return new THREE.Matrix4().makeBasis(x, y, z);
    };
    const finger = (parent, x, len, curl, r = 0.009) => {
      let p = parent, pos = new THREE.Vector3(x, -0.004, 0.045);
      const segs = [len * 0.42, len * 0.32, len * 0.26];
      for (let i = 0; i < 3; i++) {
        const j = new THREE.Group(); j.position.copy(pos); j.rotation.x = curl * (i === 0 ? 0.75 : 0.95); p.add(j);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - i * 0.1), segs[i], 3, 10), skin);
        seg.rotation.x = Math.PI / 2; seg.position.z = segs[i] / 2; j.add(seg);
        p = j; pos = new THREE.Vector3(0, 0, segs[i]);
      }
    };
    const makeHand = (pos, fingers, back, curl = 1.1, scale = 1) => {
      const g = new THREE.Group();
      g.position.copy(pos);
      g.quaternion.setFromRotationMatrix(basis(fingers, back));
      g.scale.setScalar(scale);
      const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.03, 0.09, 3, 0.012), skin); palm.position.z = 0.012; g.add(palm);
      const knuckles = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.026, 0.03, 3, 0.012), skin); knuckles.position.set(0, 0.002, 0.045); g.add(knuckles);
      [-0.031, -0.01, 0.011, 0.031].forEach((x, i) => finger(g, x, 0.075 - Math.abs(i - 1.5) * 0.008, curl));
      const th = new THREE.Group(); th.position.set(-0.048, -0.006, 0.0); th.rotation.set(0.4, 0.9, 0.2); g.add(th);
      const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 3, 10), skin); t1.rotation.x = Math.PI / 2; t1.position.z = 0.015; th.add(t1);
      const th2 = new THREE.Group(); th2.position.z = 0.032; th2.rotation.x = 0.7; th.add(th2);
      const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.025, 3, 10), skin); t2.rotation.x = Math.PI / 2; t2.position.z = 0.013; th2.add(t2);
      return g;
    };
    const sleeve = (from, to, r0, r1) => {
      const g = new THREE.Group();
      const dir = to.clone().sub(from), len = dir.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 24), suit);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.14, r0 * 1.1, 0.04, 24), cuff);
      c.position.copy(from).add(dir.clone().normalize().multiplyScalar(0.014));
      c.quaternion.copy(m.quaternion);
      const link = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), brass);
      link.position.copy(c.position).add(new THREE.Vector3(0, 0, r0 * 1.1));
      const seam = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.02, 0.003, 6, 24), suit);
      seam.position.copy(from).add(dir.clone().normalize().multiplyScalar(0.05)); seam.quaternion.copy(m.quaternion); seam.rotateX(Math.PI / 2);
      g.add(m, c, link, seam);
      return g;
    };

    // right hand squeezes the lever on top of the valve
    const leverW = toRig(body.localToWorld(new THREE.Vector3(-0.02, 0.5, 0.0)));
    const rFingers = new THREE.Vector3(-1, -0.5, -0.35);
    this.rightHand = makeHand(leverW, rFingers, new THREE.Vector3(0.1, 1, -0.25), 1.05, 1.15);
    this.rig.add(this.rightHand);
    const rWrist = leverW.clone().sub(rFingers.clone().normalize().multiplyScalar(0.045));
    this.rig.add(sleeve(rWrist, rWrist.clone().add(new THREE.Vector3(0.36, -0.5, 0.42)), 0.046, 0.072));

    // left hand wraps around the nozzle grip from below-left
    const gripC = toRig(nozzle.localToWorld(new THREE.Vector3(0, -0.02, 0)));
    const lPos = gripC.clone().add(new THREE.Vector3(-0.045, -0.035, 0.0));
    this.leftHand = makeHand(lPos, new THREE.Vector3(0.75, 0.65, 0.1), new THREE.Vector3(-0.55, 0.2, 0.8), 1.15, 1.12);
    this.rig.add(this.leftHand);
    const lWrist = lPos.clone().sub(new THREE.Vector3(0.75, 0.65, 0.1).normalize().multiplyScalar(0.045));
    this.rig.add(sleeve(lWrist, lWrist.clone().add(new THREE.Vector3(-0.3, -0.55, 0.45)), 0.046, 0.072));

    this.rig.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2a20, 0.9));
    const key = new THREE.DirectionalLight(0xfff2dc, 1.6); key.position.set(0.6, 1.5, 1.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.6); rim.position.set(-1, 0.8, -1); this.scene.add(rim);

    this._tmp = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  update(dt, { moving, sprint, firing, bobPhase, look }) {
    this.time += dt;
    this.pressure += ((firing ? 1 : 0) - this.pressure) * Math.min(1, 14 * dt);
    this.lever.position.y = 0.468 - this.pressure * 0.022;
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

  /** World-space emitter position/direction: the horn's screen position re-cast through the world camera. */
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

function gaugeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  const arc = (a0, a1, col) => { g.strokeStyle = col; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 46, a0, a1); g.stroke(); };
  arc(Math.PI * 0.75, Math.PI * 1.1, '#d4181b'); arc(Math.PI * 1.1, Math.PI * 1.9, '#2e9a44'); arc(Math.PI * 1.9, Math.PI * 2.25, '#d4181b');
  g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(Math.PI * 1.5) * 40, 64 + Math.sin(Math.PI * 1.5) * 40); g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
