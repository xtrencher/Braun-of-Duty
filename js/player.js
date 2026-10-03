import * as THREE from 'three';
import { floorHeight, resolveMove } from './chamber.js';

const EYE = 1.65, RADIUS = 0.35;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(2.6, 0, 5.9);
    this.yaw = Math.PI; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.firing = false;
    this.sprint = false;
    this.speed = 0;               // horizontal speed, for bobbing / footsteps
    this.bobPhase = 0;
    this.lookDelta = { x: 0, y: 0 };
    this.eyeY = EYE;
    this.stepEvent = false;
    this._lastStep = 0;
    this.camera.rotation.order = 'YXZ';
    this.enabled = false;

    window.addEventListener('keydown', e => { if (!e.repeat) this.keys.add(e.code); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true; });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; this.sprint = false; });
    this.touchMove = null;
    document.addEventListener('pointermove', e => {
      if (!this.enabled || e.pointerType === 'touch') return;
      this.applyLook(e.movementX, e.movementY);
    });
    document.addEventListener('pointerdown', e => { if (this.enabled && e.pointerType !== 'touch' && e.button === 0 && !e.target.closest('#overlay')) this.firing = true; });
    document.addEventListener('pointerup', e => { if (e.pointerType !== 'touch' && e.button === 0) this.firing = false; });
    document.addEventListener('contextmenu', e => { if (this.enabled) e.preventDefault(); });
  }

  /** Rotate the view by a mouse/touch delta in pixels. */
  applyLook(dx, dy) {
    const s = 0.0022;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.35, 1.35);
    this.lookDelta.x += dx; this.lookDelta.y += dy;
  }

  reset() {
    this.pos.set(2.6, 0, 5.9); this.yaw = Math.PI; this.pitch = 0; this.vel.set(0, 0, 0); this.eyeY = EYE;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt) {
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (this.touchMove) { fx += this.touchMove.x; fz += this.touchMove.y; }
    const want = new THREE.Vector3();
    if (this.enabled && (fx || fz)) {
      const len = Math.max(1, Math.hypot(fx, fz)); fx /= len; fz /= len;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
      want.x = -sy * fz + cy * fx;
      want.z = -cy * fz - sy * fx;
      want.multiplyScalar(this.sprint ? 7.2 : 4.6);
    }
    const accel = (fx || fz) ? 14 : 18;
    this.vel.x += (want.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, accel * dt);
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const [rx, rz] = resolveMove(this.pos.x, this.pos.z, nx, nz, RADIUS);
    // if we got clipped, kill the velocity component that was blocked
    if (Math.abs(rx - nx) > 1e-4) this.vel.x = 0;
    if (Math.abs(rz - nz) > 1e-4) this.vel.z = 0;
    this.pos.x = rx; this.pos.z = rz;
    const floor = floorHeight(this.pos.x, this.pos.z);
    this.pos.y += (floor - this.pos.y) * Math.min(1, 16 * dt);

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.speed > 0.6;
    this.bobPhase += dt * (moving ? (this.sprint ? 13 : 9.5) : 0);
    const bobY = moving ? Math.sin(this.bobPhase) * 0.035 : 0;
    this.stepEvent = false;
    if (moving) {
      const phase = Math.floor(this.bobPhase / Math.PI);
      if (phase !== this._lastStep) { this._lastStep = phase; this.stepEvent = true; }
    }
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  /** Consume accumulated mouse delta (for viewmodel sway). */
  takeLookDelta() { const d = { ...this.lookDelta }; this.lookDelta.x = 0; this.lookDelta.y = 0; return d; }
}
