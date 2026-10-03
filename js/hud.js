import * as THREE from 'three';

const $ = id => document.getElementById(id);

/** DOM HUD: panels, streak meter, headers, toasts and world-anchored popups. */
export class HUD {
  constructor(camera) {
    this.camera = camera;
    this.root = $('hud');
    this.el = {
      energyLabel: $('energy-label'), energyCount: $('energy-count'), energyFill: $('energy-fill'),
      streak: $('streak'), streakWord: $('streak-word'), streakFill: $('streak-fill'),
      combat: $('combat-title'), act: $('act-line'), objective: $('objective-count'),
      elapsed: $('elapsed'), toast: $('toast'), health: $('npc-health'), healthFill: $('npc-health-fill'), layer: $('world-layer'),
    };
    this.anchored = [];    // { node, pos: Vector3, life, drift }
    this._v = new THREE.Vector3();
    this._toastTimer = null;
    this._lastWord = '';
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  setEnergy(v, max) {
    const low = v < max * 0.34;
    this.el.energyCount.textContent = `${Math.ceil(v)} / ${max}`;
    this.el.energyLabel.textContent = low ? 'ENERGIA — MAŁO!' : 'ENERGIA';
    this.el.energyLabel.classList.toggle('low', low);
    this.el.energyFill.style.width = `${Math.max(0, v / max * 100)}%`;
    this.el.energyFill.classList.toggle('low', low);
  }

  setStreak(value, combo) {
    const on = value > 0;
    this.el.streak.classList.toggle('active', on);
    if (!on) { this._lastWord = ''; return; }
    const word = combo >= 3 ? `COMBO! x${combo}` : 'HIT';
    if (word !== this._lastWord) {
      this._lastWord = word;
      this.el.streakWord.textContent = word;
      this.el.streakWord.classList.toggle('combo', combo >= 3);
      this.el.streak.classList.remove('pop'); void this.el.streak.offsetWidth; this.el.streak.classList.add('pop');
    }
    this.el.streakFill.style.width = `${value * 100}%`;
  }

  setCombat(on, hot) { this.el.combat.classList.toggle('on', on); this.el.combat.classList.toggle('hot', !!hot); }

  setAct(act, total, seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60), ss = Math.floor(s % 60).toString().padStart(2, '0');
    this.el.act.innerHTML = `AKT ${act} / ${total} &bull; ${m}:${ss}`;
    this.el.act.classList.toggle('urgent', s < 15);
  }

  setElapsed(seconds) {
    const s = Math.max(0, Math.floor(seconds)), m = Math.floor(s / 60);
    const txt = `${m}:${(s % 60).toString().padStart(2, '0')}`;
    if (txt !== this._elapsedTxt) { this._elapsedTxt = txt; this.el.elapsed.textContent = txt; }
  }

  setObjective(n, total) { this.el.objective.innerHTML = `${n} / ${total} &bull; KARTA`; }

  toast(text, kind = '', ms = 2200) {
    const t = this.el.toast;
    t.textContent = text; t.className = `toast show ${kind}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /** Comic popup anchored to a world position. kind: hit | impact | combo | pickup */
  popup(text, worldPos, kind = 'hit') {
    const node = document.createElement('div');
    node.className = `popup ${kind}`; node.textContent = text;
    node.style.setProperty('--r', `${(Math.random() - 0.5) * 10}deg`);
    this.el.layer.appendChild(node);
    this.anchored.push({ node, pos: worldPos.clone(), life: 0.9, drift: 0.6 + Math.random() * 0.5 });
  }

  marker(worldPos) {
    if (this.anchored.length > 60) return;
    const node = document.createElement('div');
    node.className = 'marker';
    this.el.layer.appendChild(node);
    this.anchored.push({ node, pos: worldPos.clone(), life: 0.8, drift: 0 });
  }

  /** Project anchored overlays and the NPC health bar every frame. */
  update(dt, npcHead, npcHpFrac, showHealth) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.anchored.length - 1; i >= 0; i--) {
      const a = this.anchored[i];
      a.life -= dt;
      if (a.life <= 0) { a.node.remove(); this.anchored.splice(i, 1); continue; }
      a.pos.y += a.drift * dt;
      const p = this._v.copy(a.pos).project(this.camera);
      if (p.z > 1) { a.node.style.display = 'none'; continue; }
      a.node.style.display = '';
      a.node.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      a.node.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    }
    if (showHealth && npcHead) {
      const p = this._v.copy(npcHead).project(this.camera);
      const visible = p.z < 1 && p.x > -1.2 && p.x < 1.2 && p.y > -1.2 && p.y < 1.2;
      this.el.health.classList.toggle('show', visible);
      if (visible) {
        this.el.health.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
        this.el.health.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
        this.el.healthFill.style.width = `${Math.max(0, npcHpFrac * 100)}%`;
      }
    } else this.el.health.classList.remove('show');
  }

  clearAnchored() { for (const a of this.anchored) a.node.remove(); this.anchored.length = 0; }
}
