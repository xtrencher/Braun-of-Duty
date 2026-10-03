import * as THREE from 'three';
import { floorHeight } from './chamber.js';
import { smokeSprite } from './textures.js';

const MAX = 6000;

/** Dense, long-lingering extinguisher cloud. */
export class FoamSystem {
  constructor(scene, camera) {
    this.camera = camera;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.hit = new Uint8Array(MAX);      // bit 1: struck the target, bit 2: touched the floor
    this.count = 0;
    this.spawnAcc = 0;
    this.lastHitPoints = [];
    this.floorHits = [];                 // [x, y, z] positions where particles settled this frame

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(MAX), 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(MAX), 1); this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setAttribute('aRot', this.aRot);
    geo.setDrawRange(0, 0);
    for (let i = 0; i < MAX; i++) this.aRot.array[i] = Math.random() * Math.PI * 2;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: smokeSprite() }, uScale: { value: 500 }, uTint: { value: new THREE.Color(0.95, 0.95, 0.97) }, uLight: { value: new THREE.Vector3(0.3, 0.8, 0.5) } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute float aRot;
        varying float vAlpha; varying float vRot; varying float vDepth;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(aSize * uScale / max(-mv.z, 0.05), 300.0);
          gl_Position = projectionMatrix * mv;
          vAlpha = aAlpha; vRot = aRot; vDepth = -mv.z;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform vec3 uTint; uniform vec3 uLight;
        varying float vAlpha; varying float vRot; varying float vDepth;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float s = sin(vRot), co = cos(vRot);
          vec2 uv = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;
          vec4 t = texture2D(uTex, uv);
          float near = smoothstep(0.08, 0.45, vDepth);
          vec3 n = normalize(vec3(c.x * 2.0, -c.y * 2.0, sqrt(max(0.0, 1.0 - dot(c, c) * 4.0))));
          float diff = max(0.0, dot(n, normalize(uLight)));
          float shade = 0.66 + 0.34 * diff + 0.06 * n.y;
          gl_FragColor = vec4(uTint * shade, t.a * vAlpha * near);
          if (gl_FragColor.a < 0.004) discard;
        }`,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this._f = new THREE.Vector3();
  }

  setViewport(height, fovDeg) {
    this.material.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  setLightDir(dir) {
    this.material.uniforms.uLight.value.copy(dir).transformDirection(this.camera.matrixWorldInverse);
  }

  /** Emit from `origin` along `dir` for `dt` seconds at `rate` particles/second. */
  emit(origin, dir, dt, rate = 1700, power = 1) {
    this.spawnAcc += rate * dt;
    const f = this._f;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.count >= MAX) { this._kill(Math.floor(Math.random() * this.count)); } // recycle a random old puff
      const i = this.count++;
      const jitter = 0.2;
      f.set(dir.x + (Math.random() - 0.5) * jitter, dir.y + (Math.random() - 0.5) * jitter * 0.8 + 0.03, dir.z + (Math.random() - 0.5) * jitter).normalize();
      const speed = (14 + Math.random() * 6) * power;
      const back = Math.random() * 0.25;
      this.pos[i * 3] = origin.x + f.x * back; this.pos[i * 3 + 1] = origin.y + f.y * back; this.pos[i * 3 + 2] = origin.z + f.z * back;
      this.vel[i * 3] = f.x * speed; this.vel[i * 3 + 1] = f.y * speed; this.vel[i * 3 + 2] = f.z * speed;
      this.age[i] = 0; this.life[i] = 3.5 + Math.random() * 4.5;   // lingers for seconds
      this.size0[i] = 0.07 + Math.random() * 0.08;
      this.hit[i] = 0;
    }
  }

  /**
   * Integrate particles. `target` = { x, y, z, radius, height } capsule of the NPC (or null).
   * Returns the number of particles that struck the target this frame.
   */
  update(dt, target) {
    let hits = 0;
    this.lastHitPoints.length = 0;
    this.floorHits.length = 0;
    const drag = 2.4, grav = -0.9, turb = 0.9;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); i--; continue; }
      const k = 1 - drag * dt;
      let vx = this.vel[i * 3] * k + (Math.random() - 0.5) * turb * dt;
      let vy = (this.vel[i * 3 + 1] + grav * dt) * k + (Math.random() - 0.2) * turb * 0.5 * dt;
      let vz = this.vel[i * 3 + 2] * k + (Math.random() - 0.5) * turb * dt;
      let px = this.pos[i * 3] + vx * dt, py = this.pos[i * 3 + 1] + vy * dt, pz = this.pos[i * 3 + 2] + vz * dt;
      const fl = floorHeight(px, pz) + 0.06;
      if (py < fl) {
        py = fl; vy = Math.abs(vy) * 0.1; vx *= 0.7; vz *= 0.7;
        if (!(this.hit[i] & 2)) { this.hit[i] |= 2; if (this.floorHits.length < 40) this.floorHits.push([px, fl - 0.05, pz]); }
      }
      if (target && !(this.hit[i] & 1)) {
        const dx = px - target.x, dz = pz - target.z;
        const dy = py - Math.min(Math.max(py, target.y + 0.2), target.y + target.height);
        if (dx * dx + dz * dz + dy * dy < target.radius * target.radius) {
          this.hit[i] |= 1; hits++;
          if (this.lastHitPoints.length < 6) this.lastHitPoints.push([px, py, pz]);
          const inv = 1 / (Math.hypot(dx, dz) || 1);
          vx = dx * inv * 2.5 + (Math.random() - 0.5) * 2; vz = dz * inv * 2.5 + (Math.random() - 0.5) * 2; vy = 1.2 + Math.random();
        }
      }
      this.pos[i * 3] = px; this.pos[i * 3 + 1] = py; this.pos[i * 3 + 2] = pz;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const t = this.age[i] / this.life[i];
      this.aSize.array[i] = this.size0[i] + Math.min(this.age[i], 2.5) * 0.7 + Math.max(0, this.age[i] - 2.5) * 0.12;
      const fadeIn = t < 0.04 ? t / 0.04 : 1, fadeOut = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      this.aAlpha.array[i] = fadeIn * fadeOut * 0.62;
    }
    this.points.geometry.setDrawRange(0, this.count);
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
    return hits;
  }

  _kill(i) {
    const last = --this.count;
    if (i !== last) {
      for (let c = 0; c < 3; c++) { this.pos[i * 3 + c] = this.pos[last * 3 + c]; this.vel[i * 3 + c] = this.vel[last * 3 + c]; }
      this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.size0[i] = this.size0[last]; this.hit[i] = this.hit[last];
      this.aSize.array[i] = this.aSize.array[last]; this.aAlpha.array[i] = this.aAlpha.array[last];
    }
  }

  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); }
}

/** Persistent white foam residue on floors and stairs: a ring buffer of flat instanced splats. */
export class FoamSplats {
  constructor(scene, max = 2500) {
    this.max = max; this.next = 0; this.used = 0;
    this.spawnTime = new Float32Array(max);
    this.base = new Float32Array(max * 5);      // x, y, z, yaw, size
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.7})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); };
    blob(64, 64, 58, 1); blob(40, 50, 30, 0.9); blob(88, 70, 28, 0.9); blob(60, 90, 26, 0.8); blob(80, 40, 20, 0.8);
    const alpha = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.95, alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geo = new THREE.CircleGeometry(0.5, 14);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.time = 0;
  }
  add(x, y, z) {
    const i = this.next; this.next = (this.next + 1) % this.max; this.used = Math.min(this.max, this.used + 1);
    const b = this.base; b[i * 5] = x; b[i * 5 + 1] = y + 0.012 + Math.random() * 0.004; b[i * 5 + 2] = z; b[i * 5 + 3] = Math.random() * Math.PI * 2; b[i * 5 + 4] = 0.35 + Math.random() * 0.55;
    this.spawnTime[i] = this.time;
    this._write(i, 0.15);
    this.mesh.count = this.used;
  }
  _write(i, grow) {
    const b = this.base;
    this._p.set(b[i * 5], b[i * 5 + 1], b[i * 5 + 2]);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b[i * 5 + 3]);
    const s = b[i * 5 + 4] * grow; this._s.set(s, 1, s);
    this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
  }
  update(dt) {
    this.time += dt;
    // grow the splats spawned in the last 1.2 s
    for (let k = 0; k < this.used; k++) {
      const age = this.time - this.spawnTime[k];
      if (age < 1.2) this._write(k, 0.15 + 0.85 * Math.min(1, age / 1.2));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.used = 0; this.next = 0; this.mesh.count = 0; }
}
