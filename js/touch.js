/**
 * Touch controls: a virtual joystick on the lower-left, drag-to-look anywhere else,
 * a hold-to-spray button, a sprint toggle, pause and fullscreen buttons. Multi-touch safe:
 * every pointer is tracked by id so looking and moving and spraying can all happen at once,
 * and the finger holding the spray button steers the camera as it slides.
 */
export function isTouchDevice() {
  return (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches;
}

export function setupTouch(player, { onPause, onFullscreen }) {
  const ui = document.getElementById('touch-ui');
  const stick = document.getElementById('stick'), knob = document.getElementById('stick-knob');
  const fire = document.getElementById('btn-fire'), sprint = document.getElementById('btn-sprint'), pause = document.getElementById('btn-pause'), fsBtn = document.getElementById('btn-fs');
  const LOOK = 3.2;   // camera sensitivity multiplier for touch
  ui.classList.remove('hidden');
  const state = { stickId: null, lookId: null, fireId: null, sx: 0, sy: 0, lx: 0, ly: 0, fx: 0, fy: 0, sprintOn: false };
  const RADIUS = 52;
  player.touchMove = { x: 0, y: 0 };

  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  const updateStick = (x, y) => {
    let dx = x - state.sx, dy = y - state.sy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
    setKnob(dx, dy);
    player.touchMove.x = dx / RADIUS;
    player.touchMove.y = -dy / RADIUS;
    player.sprint = state.sprintOn || Math.hypot(dx, dy) > RADIUS * 0.92;
  };
  const endStick = () => { state.stickId = null; player.touchMove.x = 0; player.touchMove.y = 0; setKnob(0, 0); if (!state.sprintOn) player.sprint = false; };

  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !player.enabled) return;
    if (e.target.closest('#overlay') || e.target.closest('.tbtn')) return;
    const w = window.innerWidth, h = window.innerHeight;
    if (state.stickId === null && e.clientX < w * 0.45 && e.clientY > h * 0.4) {
      state.stickId = e.pointerId; state.sx = e.clientX; state.sy = e.clientY;
      stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`; stick.classList.add('live');
      updateStick(e.clientX, e.clientY);
    } else if (state.lookId === null) {
      state.lookId = e.pointerId; state.lx = e.clientX; state.ly = e.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId === state.stickId) updateStick(e.clientX, e.clientY);
    else if (e.pointerId === state.lookId) {
      const dx = e.clientX - state.lx, dy = e.clientY - state.ly;
      state.lx = e.clientX; state.ly = e.clientY;
      player.applyLook(dx * LOOK, dy * LOOK);
    } else if (e.pointerId === state.fireId) {
      // the spraying finger steers the camera as it slides, even off the button
      const dx = e.clientX - state.fx, dy = e.clientY - state.fy;
      state.fx = e.clientX; state.fy = e.clientY;
      player.applyLook(dx * LOOK, dy * LOOK);
    }
  }, { passive: true });
  const release = e => {
    if (e.pointerId === state.stickId) { endStick(); stick.classList.remove('live'); }
    if (e.pointerId === state.lookId) state.lookId = null;
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  // spray: hold the button
  fire.addEventListener('pointerdown', e => { e.preventDefault(); try { fire.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ } state.fireId = e.pointerId; state.fx = e.clientX; state.fy = e.clientY; player.firing = true; fire.classList.add('on'); });
  const fireOff = e => { if (e.pointerId === state.fireId) { state.fireId = null; player.firing = false; fire.classList.remove('on'); } };
  fire.addEventListener('pointerup', fireOff); fire.addEventListener('pointercancel', fireOff); fire.addEventListener('lostpointercapture', fireOff);
  sprint.addEventListener('pointerdown', e => { e.preventDefault(); state.sprintOn = !state.sprintOn; sprint.classList.toggle('on', state.sprintOn); player.sprint = state.sprintOn; });
  pause.addEventListener('pointerdown', e => { e.preventDefault(); onPause(); });
  fsBtn.addEventListener('pointerdown', e => { e.preventDefault(); onFullscreen(); });

  // when the game pauses, drop every held input
  return {
    reset() { endStick(); stick.classList.remove('live'); state.lookId = null; state.fireId = null; player.firing = false; fire.classList.remove('on'); },
    show(on) { ui.classList.toggle('hidden', !on); },
  };
}
