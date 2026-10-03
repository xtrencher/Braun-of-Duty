import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from '../vendor/three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from '../vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from '../vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { buildWorld, animateFlags } from './world.js';
import { buildGraph } from './chamber.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { FoamSystem, FoamSplats } from './particles.js';
import { Politician, Card } from './npc.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';
import { isTouchDevice, setupTouch } from './touch.js';

const ACTS = 3, ACT_TIME = 90, ENERGY_MAX = 105;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- quality
const QUALITIES = ['high', 'medium', 'low'];
const TOUCH = isTouchDevice();
let quality = (() => { try { return localStorage.getItem('bod-quality-v2'); } catch { return null; } })();
if (!QUALITIES.includes(quality) || TOUCH) quality = 'low';
const qualityButtons = [...$('quality').querySelectorAll('button')];
const reflectQuality = () => qualityButtons.forEach(b => b.classList.toggle('on', b.dataset.q === quality));
reflectQuality();

// ---------------------------------------------------------------- renderer & scene
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false;
function applyRendererQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1 : quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1.25));
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.needsUpdate = true;
}
applyRendererQuality();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d4c8);
scene.fog = new THREE.FogExp2(0xcfc9ba, 0.006);
const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 90);
scene.add(camera);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex; scene.environmentIntensity = 0.3;

const world = buildWorld(scene, quality);
const graph = buildGraph();
const player = new Player(camera);
const weapon = new Weapon();
weapon.scene.environment = envTex; weapon.scene.environmentIntensity = 0.6;
const foam = new FoamSystem(scene, camera);
const splats = new FoamSplats(scene, 2500);
const npc = new Politician(scene, graph);
const card = new Card(scene);
const hud = new HUD(camera);
const sfx = new Sfx();
const touch = TOUCH ? setupTouch(player, { onPause: () => pause() }) : null;
if (TOUCH) { $('controls-touch').style.display = ''; $('controls-desktop').style.display = 'none'; $('quality').closest('.quality-row').style.display = 'none'; }
if (touch) touch.show(false);

const sunDir = new THREE.Vector3(3, 40, 14).sub(new THREE.Vector3(0, 0, 12)).normalize();
const G = {
  state: 'start', act: 1, cards: 0, time: ACT_TIME, energy: ENERGY_MAX, idle: 0, emptyPlayed: false,
  streak: 0, combo: 0, comboTimer: 0, hitTextTimer: 0, markerTimer: 0, lastHit: 99,
  cardDropped: false, locked: false, totalTime: 0, impacts: 0, reasumpcje: 0,
  debug: new URLSearchParams(location.search).has('debug'),
};

const overlay = $('overlay'), startBtn = $('start-btn'), overlayText = $('overlay-text'), overlayStats = $('overlay-stats');
const nozPos = new THREE.Vector3(), nozDir = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// ---------------------------------------------------------------- post-processing
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uStrength: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uStrength;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * 0.012 * uStrength;                       // lens chromatic aberration at the edges
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col = (col - 0.5) * 1.06 + 0.5;                                // gentle contrast
      col *= vec3(1.02, 1.0, 0.97);                                  // warm grade
      col *= 1.0 - smoothstep(0.3, 1.0, length(d) * 1.35) * 0.42 * uStrength;   // vignette
      float g = hash(vUv * uRes + fract(uTime)) - 0.5;
      col += g * 0.03 * uStrength;                                   // film grain
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
let composer = null, gtao = null, bloom = null, grade = null;
function buildComposer() {
  if (composer) { composer.dispose(); composer = null; gtao = null; bloom = null; }
  if (quality === 'low') return;
  const w = window.innerWidth, h = window.innerHeight, pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'high') {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1, thickness: 1, distanceFallOff: 1, scale: 1.2, samples: 16, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), quality === 'high' ? 0.3 : 0.22, 0.6, 1.0);
  composer.addPass(bloom);
  const weaponPass = new RenderPass(weapon.scene, weapon.camera);
  weaponPass.clear = false; weaponPass.clearDepth = true;
  composer.addPass(weaponPass);
  composer.addPass(new OutputPass());
  grade = new ShaderPass(GradeShader);
  grade.uniforms.uStrength.value = quality === 'high' ? 1 : 0.7;
  composer.addPass(grade);
}

function applyShadowQuality() {
  const res = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  for (const l of world.lights) {
    if (!l.isDirectionalLight) continue;
    l.shadow.mapSize.set(res, res);
    if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
  }
}

function setQuality(q, persist = true) {
  quality = q; reflectQuality();
  if (persist) { try { localStorage.setItem('bod-quality-v2', q); } catch { /* private mode */ } }
  applyShadowQuality();
  applyRendererQuality();
  buildComposer();
  resize();
}
qualityButtons.forEach(b => b.addEventListener('click', () => { setQuality(b.dataset.q); sfx.init(); sfx.gavel(); }));

function resize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  weapon.resize(w / h);
  foam.setViewport(h * renderer.getPixelRatio(), camera.fov);
  if (composer) { composer.setSize(w, h); if (gtao) gtao.setSize(w, h); if (bloom) bloom.setSize(w, h); if (grade) grade.uniforms.uRes.value.set(w, h); }
}
window.addEventListener('resize', resize);
buildComposer();
resize();
// Compile every shader up front (politician, card and foam included) so nothing stalls mid-game.
npc.group.visible = true; card.group.visible = true; foam.points.visible = true; splats.mesh.count = 1;
renderer.compile(scene, camera); renderer.compile(weapon.scene, weapon.camera);
npc.group.visible = false; card.group.visible = false; splats.mesh.count = 0;
startBtn.disabled = false; startBtn.textContent = 'KLIKNIJ, ABY ZACZĄĆ';

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
  player.reset(); foam.clear(); splats.clear(); hud.clearAnchored();
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
  if (touch) { touch.reset(); touch.show(false); }
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
  if (touch) { touch.reset(); touch.show(false); }
  overlayText.textContent = 'PAUZA — poseł też odpoczywa. Kliknij, aby wrócić do gry.';
  overlayStats.classList.add('hidden');
  startBtn.textContent = 'WRÓĆ DO GRY';
  overlay.classList.remove('hidden');
}

function resumePlay() {
  overlay.classList.add('hidden'); hud.show(true);
  player.enabled = true; G.state = 'playing'; sfx.resume();
  if (touch) touch.show(true);
}

startBtn.addEventListener('click', () => {
  sfx.init();
  if (G.state === 'start' || G.state === 'won') newGame();
  if (TOUCH) {
    // phones: no pointer lock; go fullscreen and try to lock landscape, then play
    const el = document.documentElement;
    const fs = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
    if (fs && fs.catch) fs.catch(() => {});
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch { /* unsupported */ }
    resumePlay(); return;
  }
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
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); hud.toast('UTRACONO KONTEKST GRAFIKI', 'bad', 3000); });
canvas.addEventListener('webglcontextrestored', () => { applyShadowQuality(); buildComposer(); resize(); });
window.addEventListener('error', e => console.error('Braun of Duty:', e.message));
window.addEventListener('keydown', e => { if (e.code === 'Escape' && G.debug) pause(); });

// ---------------------------------------------------------------- simulation step
function step(dt) {
  G.totalTime += dt;
  player.update(dt);
  if (player.stepEvent) sfx.step(player.sprint);

  if (npc.state !== 'hidden') {
    const dx = player.pos.x - npc.pos.x, dz = player.pos.z - npc.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 1e-4) { player.pos.x += dx / d * (0.8 - d); player.pos.z += dz / d * (0.8 - d); }
  }

  // energy / firing: drains while spraying, recharges after a pause; an emptied tank must
  // recover to a minimum pressure before it sprays again
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
    foam.emit(nozPos, nozDir, dt, TOUCH ? 1000 : 1700, power);
  }

  const hits = foam.update(dt, npc.target());
  for (const [x, y, z] of foam.floorHits) if (Math.random() < 0.35) splats.add(x, y, z);
  splats.update(dt);
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

  G.time -= dt;
  if (G.time <= 0) fail();

  const dNpc = npc.state === 'hidden' ? 99 : Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z);
  hud.setEnergy(G.energy, ENERGY_MAX);
  hud.setStreak(G.streak, G.combo);
  hud.setCombat(G.lastHit < 3 || dNpc < 11, G.lastHit < 2.5);
  hud.setAct(G.act, ACTS, G.time);
  const showHealth = npc.state !== 'hidden' && npc.state !== 'down' && npc.sinceHit < 3.5;
  hud.update(dt, npc.headPosition(tmp), npc.hp / npc.maxHp, showHealth);
  animateFlags(world.flags, G.totalTime);
}

// ---------------------------------------------------------------- loop with a frame-rate watchdog
player.update(0);
camera.rotation.x = 0.08;
let last = performance.now();
const watch = { frames: 0, time: 0, checked: false };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state === 'playing') {
    step(dt);
    if (!watch.checked && !G.debug && !TOUCH) {
      watch.frames++; watch.time += dt;
      if (watch.time > 6) {
        watch.checked = true;
        const fps = watch.frames / watch.time;
        if (fps < 28 && quality !== 'low') {
          setQuality(quality === 'high' ? 'medium' : 'low');
          hud.toast('OBNIŻONO JAKOŚĆ GRAFIKI', '', 2600);
        }
      }
    }
  } else {
    weapon.update(dt, { moving: false, sprint: false, firing: false, bobPhase: 0, look: { x: 0, y: 0 } });
    animateFlags(world.flags, now / 1000);
    hud.update(dt, null, 0, false);
  }
  renderer.info.reset();
  if (grade) grade.uniforms.uTime.value = now / 1000;
  foam.setLightDir(sunDir);
  if (composer) composer.render();
  else {
    renderer.autoClear = true; renderer.render(scene, camera);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(weapon.scene, weapon.camera);
  }
}
requestAnimationFrame(frame);

// Small debug surface for automated checks (?debug=1 also skips pointer lock).
window.__game = {
  G, player, npc, foam, splats, hud, card, scene, world, renderer,
  start: () => startBtn.click(),
  setView: (x, z, yaw, pitch) => { player.pos.x = x; player.pos.z = z; player.yaw = yaw; player.pitch = pitch; },
  fire: on => { player.firing = on; },
  advance: (seconds, h = 1 / 60) => { for (let t = 0; t < seconds; t += h) if (G.state === 'playing') step(h); },
  setQuality,
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, particles: foam.count, quality }),
};
