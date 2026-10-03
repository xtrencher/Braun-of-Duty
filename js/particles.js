import * as THREE from 'three';
import { floorHeight } from './chamber.js';
import { smokeSprite } from './textures.js';

const MAX = 2600;

/** Dense foam / CO2 cloud emitted from the extinguisher nozzle. */
export class FoamSystem {
  constructor(scene, camera) {
    this.camera = camera;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.hit = new Uint8Array(MAX);
    this.alive = new Uint8Array(MAX);
    this.count = 0;
    this.spawnAcc = 0;
    this.lastHitPoints = [];

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
      uniforms: { uTex: { value: smokeSprite() }, uScale: { value: 500 }, uTint: { value: new THREE.Color(0.93, 0.94, 0.97) }, uLight: { value: new THREE.Vector3(0.3, 0.8, 0.5) } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute float aRot;
        varying float vAlpha; varying float vRot; varying float vDepth;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
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
          float near = smoothstep(0.08, 0.45, vDepth);          // fade when it would cover the lens
          // fake spherical normal per puff, lit by the view-space light direction
          vec3 n = normalize(vec3(c.x * 2.0, -c.y * 2.0, sqrt(max(0.0, 1.0 - dot(c, c) * 4.0))));
          float diff = max(0.0, dot(n, normalize(uLight)));
          float shade = 0.62 + 0.38 * diff + 0.08 * n.y;
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

  /** World-space light direction, converted to view space for the puff shading. */
  setLightDir(dir) {
    this.material.uniforms.uLight.value.copy(dir).transformDirection(this.camera.matrixWorldInverse);
  }

  /** Emit from `origin` along `dir` for `dt` seconds at `rate` particles/second. */
  emit(origin, dir, dt, rate = 950, power = 1) {
    this.spawnAcc += rate * dt;
    const f = this._f;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.count >= MAX) break;
      const i = this.count++;
      const jitter = 0.18;
      f.set(dir.x + (Math.random() - 0.5) * jitter, dir.y + (Math.random() - 0.5) * jitter * 0.8 + 0.03, dir.z + (Math.random() - 0.5) * jitter).normalize();
      const speed = (14 + Math.random() * 6) * power;
      const back = Math.random() * 0.25; // spread along the stream so it looks continuous
      this.pos[i * 3] = origin.x + f.x * back; this.pos[i * 3 + 1] = origin.y + f.y * back; this.pos[i * 3 + 2] = origin.z + f.z * back;
      this.vel[i * 3] = f.x * speed; this.vel[i * 3 + 1] = f.y * speed; this.vel[i * 3 + 2] = f.z * speed;
      this.age[i] = 0; this.life[i] = 0.75 + Math.random() * 0.6;
      this.size0[i] = 0.07 + Math.random() * 0.08;
      this.hit[i] = 0;
    }
  }

  /**
   * Integrate particles. `target` = { x, y, z, radius, height } capsule of the NPC (or null).
   * Returns the number of particles that struck the target this frame; impact points are in lastHitPoints.
   */
  update(dt, target) {
    let hits = 0;
    this.lastHitPoints.length = 0;
    const drag = 2.6, grav = -1.6;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); i--; continue; }
      const k = 1 - drag * dt;
      let vx = this.vel[i * 3] * k, vy = (this.vel[i * 3 + 1] + grav * dt) * k, vz = this.vel[i * 3 + 2] * k;
      let px = this.pos[i * 3] + vx * dt, py = this.pos[i * 3 + 1] + vy * dt, pz = this.pos[i * 3 + 2] + vz * dt;
      const fl = floorHeight(px, pz) + 0.06;
      if (py < fl) { py = fl; vy = Math.abs(vy) * 0.15; vx *= 0.75; vz *= 0.75; }
      if (target && !this.hit[i]) {
        const dx = px - target.x, dz = pz - target.z;
        const dy = py - Math.min(Math.max(py, target.y + 0.2), target.y + target.height);
        if (dx * dx + dz * dz + dy * dy < target.radius * target.radius) {
          this.hit[i] = 1; hits++;
          if (this.lastHitPoints.length < 6) this.lastHitPoints.push([px, py, pz]);
          // billow around the body
          const inv = 1 / (Math.hypot(dx, dz) || 1);
          vx = dx * inv * 2.5 + (Math.random() - 0.5) * 2; vz = dz * inv * 2.5 + (Math.random() - 0.5) * 2; vy = 1.2 + Math.random();
          this.life[i] = Math.min(this.life[i], this.age[i] + 0.6);
        }
      }
      this.pos[i * 3] = px; this.pos[i * 3 + 1] = py; this.pos[i * 3 + 2] = pz;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const t = this.age[i] / this.life[i];
      this.aSize.array[i] = this.size0[i] + this.age[i] * 1.7;
      this.aAlpha.array[i] = (t < 0.1 ? t / 0.1 : 1) * Math.pow(1 - t, 1.4) * 0.72;
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
