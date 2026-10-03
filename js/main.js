import * as THREE from 'three';
import { buildWorld, animateFlags } from './world.js';
import { buildGraph } from './chamber.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { FoamSystem } from './particles.js';
import { Politician, Card } from './npc.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';

const ACTS = 3, ACT_TIME = 90, ENERGY_MAX = 105;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- renderer & scene
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a110c);
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 90);
scene.add(camera);

const world = buildWorld(scene);
const graph = buildGraph();
const player = new Player(camera);
const weapon = new Weapon();
const foam = new FoamSystem(scene, camera);
const npc = new Politician(scene, graph);
const card = new Card(scene);
const hud = new HUD(camera);
const sfx = new Sfx();

const G = {
  state: 'start', act: 1, cards: 0, time: ACT_TIME, energy: ENERGY_MAX, idle: 0, emptyPlayed: false,
  streak: 0, combo: 0, comboTimer: 0, hitTextTimer: 0, markerTimer: 0, lastHit: 99,
  cardDropped: false, locked: false, totalTime: 0, impacts: 0, reasumpcje: 0,
  debug: new URLSearchParams(location.search).has('debug'),
};

const overlay = $('overlay'), startBtn = $('start-btn'), overlayText = $('overlay-text'), overlayStats = $('overlay-stats');
const nozPos = new THREE.Vector3(), nozDir = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  weapon.resize(w / h);
  foam.setViewport(h * renderer.getPixelRatio(), camera.fov);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- game flow
function farNode() {
  let best = graph.nodes[0], bd = -1;
  for (const n of graph.nodes) {
    if (n.t < 1 || n.t > graph.levels - 2) continue;
    const d = Math.hypot(n.x - player.pos.x, n.z - player.pos.z) + Math.random() * 4;
    if (d > bd) { bd = d; best = n; }
  }
  return best;
}

function startAct() {
  G.time = ACT_TIME; G.cardDropped = false; card.take();
  npc.spawnAtNode(farNode());
  hud.setAct(G.act, ACTS, G.time);
  hud.setObjective(G.cards, ACTS);
  hud.toast(`AKT ${G.act}: ZNAJDŹ POSŁA!`, '', 2600);
  sfx.gavel();
}

function newGame() {
  Object.assign(G, { act: 1, cards: 0, energy: ENERGY_MAX, idle: 0, locked: false, streak: 0, combo: 0, comboTimer: 0, lastHit: 99, totalTime: 0, impacts: 0, reasumpcje: 0 });
  player.reset(); foam.clear(); hud.clearAnchored();
  hud.setEnergy(G.energy, ENERGY_MAX); hud.setStreak(0, 0); hud.setCombat(false);
  startAct();
}

function fail() {
  G.reasumpcje++;
  sfx.fail();
  hud.toast('REASUMPCJA! GŁOSUJEMY JESZCZE RAZ', 'bad', 3200);
  card.take(); G.cardDropped = false;
  G.time = ACT_TIME;
  npc.spawnAtNode(farNode());
}

function win() {
  G.state = 'won';
  player.enabled = false; player.firing = false; sfx.hiss(false); sfx.win();
  hud.setCombat(false);
  if (document.pointerLockElement) document.exitPointerLock();
  const m = Math.floor(G.totalTime / 60), s = Math.floor(G.totalTime % 60).toString().padStart(2, '0');
  overlayText.innerHTML = '<b>WIĘKSZOŚĆ ODNALEZIONA!</b> Wszystkie trzy karty wróciły na salę. Głosowanie może się odbyć — do skutku.';
  overlayStats.innerHTML = `Czas: ${m}:${s} &nbsp;&middot;&nbsp; Powalenia: ${G.impacts} &nbsp;&middot;&nbsp; Reasumpcje: ${G.reasumpcje}`;
  overlayStats.classList.remove('hidden');
  startBtn.textContent = 'JESZCZE RAZ';
  hud.show(false); overlay.classList.remove('hidden');
}

function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  player.enabled = false; player.firing = false; sfx.hiss(false); sfx.suspend();
  overlayText.textContent = 'PAUZA — poseł też odpoczywa. Kliknij, aby wrócić do gry.';
  overlayStats.classList.add('hidden');
  startBtn.textContent = 'WRÓĆ DO GRY';
  overlay.classList.remove('hidden');
}

function resumePlay() {
  overlay.classList.add('hidden'); hud.show(true);
  player.enabled = true; G.state = 'playing'; sfx.resume();
}

startBtn.addEventListener('click', () => {
  sfx.init();
  if (G.state === 'start' || G.state === 'won') newGame();
  if (G.debug || !canvas.requestPointerLock) { resumePlay(); return; }
  const p = canvas.requestPointerLock({ unadjustedMovement: true });
  if (p && p.catch) p.catch(() => canvas.requestPointerLock());
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) resumePlay();
  else pause();
});
document.addEventListener('pointerlockerror', () => {
  overlayText.textContent = 'Nie udało się przechwycić myszy. Kliknij jeszcze raz, aby spróbować ponownie.';
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('keydown', e => { if (e.code === 'Escape' && G.debug) pause(); });

// ---------------------------------------------------------------- simulation step
function step(dt) {
  G.totalTime += dt;
  player.update(dt);
  if (player.stepEvent) sfx.step(player.sprint);

  // keep the player from walking through the MP
  if (npc.state !== 'hidden') {
    const dx = player.pos.x - npc.pos.x, dz = player.pos.z - npc.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 1e-4) { player.pos.x += dx / d * (0.8 - d); player.pos.z += dz / d * (0.8 - d); }
  }

  // energy / firing: the tank drains while spraying, recharges after a short pause and,
  // once emptied, must recover to a minimum pressure before it sprays again
  if (G.energy <= 0) G.locked = true;
  if (G.locked && G.energy >= ENERGY_MAX * 0.2) G.locked = false;
  const wantFire = player.firing && G.energy > 0 && !G.locked;
  if (wantFire) { G.energy = Math.max(0, G.energy - 9.5 * dt); G.idle = 0; }
  else { G.idle += dt; if (G.idle > 0.7 || G.locked) G.energy = Math.min(ENERGY_MAX, G.energy + 9 * dt); }
  if (player.firing && !wantFire && !G.emptyPlayed) { sfx.empty(); G.emptyPlayed = true; }
  if (!player.firing) G.emptyPlayed = false;
  sfx.hiss(wantFire, 0.6 + 0.4 * Math.min(1, G.energy / 30));

  const look = player.takeLookDelta();
  weapon.update(dt, { moving: player.speed > 0.6, sprint: player.sprint, firing: wantFire, bobPhase: player.bobPhase, look });
  weapon.rig.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  if (wantFire) {
    weapon.nozzleWorld(camera, nozPos, nozDir);
    const power = 0.75 + 0.25 * Math.min(1, G.energy / 30);
    foam.emit(nozPos, nozDir, dt, 950, power);
  }

  // particles, NPC, hits
  const hits = foam.update(dt, npc.target());
  npc.update(dt, player.pos);
  if (hits > 0) {
    const r = npc.onHit(hits, player.pos, dt);
    G.lastHit = 0; G.streak = 1;
    G.comboTimer += dt;
    if (G.comboTimer > 0.4) { G.comboTimer = 0; G.combo++; if (G.combo >= 3) sfx.combo(G.combo); }
    G.hitTextTimer -= dt; G.markerTimer -= dt;
    const pts = foam.lastHitPoints;
    if (G.markerTimer <= 0 && pts.length) {
      G.markerTimer = 0.09;
      const p = pts[Math.floor(Math.random() * pts.length)];
      hud.marker(tmp.set(p[0], p[1], p[2]));
    }
    if (G.hitTextTimer <= 0 && pts.length) {
      const combo = G.combo >= 3;
      G.hitTextTimer = combo ? 0.5 : 0.32;
      const p = pts[Math.floor(Math.random() * pts.length)];
      hud.popup(combo ? 'COMBO!' : 'HIT!', tmp.set(p[0] + (Math.random() - 0.5) * 0.6, p[1] + 0.2 + Math.random() * 0.4, p[2] + (Math.random() - 0.5) * 0.6), combo ? 'combo' : 'hit');
      sfx.hit();
    }
    if (r.impact) { hud.popup('IMPACT!', npc.chestPosition(tmp), 'impact'); sfx.impact(); G.impacts++; }
  } else {
    G.lastHit += dt;
    G.streak = Math.max(0, G.streak - 0.45 * dt);
    if (G.streak <= 0) { G.combo = 0; G.comboTimer = 0; }
    G.hitTextTimer = 0; G.markerTimer = 0;
  }

  // defeat -> card drop -> pickup
  if (npc.state === 'down' && !G.cardDropped) {
    G.cardDropped = true;
    card.drop(npc.pos.x, npc.pos.y, npc.pos.z);
    sfx.fall();
    hud.toast('POSEŁ UGASZONY! ZABIERZ KARTĘ', 'good', 2600);
  }
  if (npc.state === 'down' && npc.downTimer > 3) npc.hide();
  card.update(dt);
  if (card.active && Math.hypot(player.pos.x - card.pos.x, player.pos.z - card.pos.z) < 1.15) {
    card.take();
    G.cards++;
    hud.setObjective(G.cards, ACTS);
    hud.popup('+1 KARTA', tmp.copy(card.pos).add(tmp2.set(0, 1.2, 0)), 'pickup');
    sfx.pickup();
    if (G.cards >= ACTS) { win(); return; }
    G.act++;
    startAct();
  }

  // act timer
  G.time -= dt;
  if (G.time <= 0) fail();

  // HUD
  const dNpc = npc.state === 'hidden' ? 99 : Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z);
  hud.setEnergy(G.energy, ENERGY_MAX);
  hud.setStreak(G.streak, G.combo);
  hud.setCombat(G.lastHit < 3 || dNpc < 11, G.lastHit < 2.5);
  hud.setAct(G.act, ACTS, G.time);
  const showHealth = npc.state !== 'hidden' && npc.state !== 'down' && npc.sinceHit < 3.5;
  hud.update(dt, npc.headPosition(tmp), npc.hp / npc.maxHp, showHealth);
  animateFlags(world.flags, G.totalTime);
}

// ---------------------------------------------------------------- loop
player.update(0);                 // place the camera so the menu backdrop shows the chamber
camera.rotation.x = 0.08;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state === 'playing') step(dt);
  else {
    weapon.update(dt, { moving: false, sprint: false, firing: false, bobPhase: 0, look: { x: 0, y: 0 } });
    animateFlags(world.flags, now / 1000);
    hud.update(dt, null, 0, false);
  }
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weapon.scene, weapon.camera);
}
requestAnimationFrame(frame);

// Small debug surface for automated checks (?debug=1 also skips pointer lock).
window.__game = {
  G, player, npc, foam, hud, card, scene, world, renderer,
  start: () => startBtn.click(),
  setView: (x, z, yaw, pitch) => { player.pos.x = x; player.pos.z = z; player.yaw = yaw; player.pitch = pitch; },
  fire: on => { player.firing = on; },
  advance: (seconds, h = 1 / 60) => { for (let t = 0; t < seconds; t += h) if (G.state === 'playing') step(h); },
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, particles: foam.count }),
};
