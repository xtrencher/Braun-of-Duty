/** Web Audio sound effects, all synthesised: no files needed. */
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.hissGain = null; this.enabled = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    this.enabled = true;

    // reusable noise buffer (2 s white noise)
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // extinguisher hiss: looping noise through band-pass + high-pass, gated by hissGain
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lfoG = ctx.createGain(); lfoG.gain.value = 500; lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    src.connect(bp); bp.connect(hp); hp.connect(this.hissGain); this.hissGain.connect(this.master); src.start();

    // room tone
    const room = ctx.createBufferSource(); room.buffer = buf; room.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const rg = ctx.createGain(); rg.gain.value = 0.05;
    room.connect(lp); lp.connect(rg); rg.connect(this.master); room.start();
    this._murmur();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  _murmur() {
    // occasional distant chatter: short filtered noise bursts at random
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 500; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.2);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 1.3);
    setTimeout(() => this._murmur(), 2500 + Math.random() * 5000);
  }

  hiss(on, power = 1) {
    if (!this.hissGain) return;
    const g = this.hissGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0.5 * power : 0, t, on ? 0.04 : 0.12);
  }

  _tone(type, f0, f1, dur, vol, when = 0, filterF) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = o;
    if (filterF) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterF; o.connect(f); last = f; }
    last.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  _burst(dur, vol, freq, q = 1, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }

  hit() { if (!this.enabled) return; this._burst(0.08, 0.25, 1800, 1.5); this._tone('triangle', 420, 180, 0.09, 0.12); }
  impact() { if (!this.enabled) return; this._tone('sine', 110, 38, 0.28, 0.6); this._burst(0.2, 0.5, 500, 0.8); this.yelp(); }
  combo(n) { if (!this.enabled) return; const b = 520 + Math.min(n, 12) * 40; this._tone('square', b, b, 0.08, 0.1); this._tone('square', b * 1.5, b * 1.5, 0.1, 0.1, 0.08); }
  yelp() { if (!this.enabled) return; const f = 260 + Math.random() * 120; this._tone('sawtooth', f, f * 2.2, 0.16, 0.14, 0, 1400); this._tone('sawtooth', f * 2.2, f * 0.7, 0.22, 0.12, 0.16, 1200); }
  step(sprint) { if (!this.enabled) return; this._burst(0.07, sprint ? 0.14 : 0.09, 240 + Math.random() * 80, 0.7); }
  empty() { if (!this.enabled) return; this._burst(0.12, 0.18, 900, 2); }
  pickup() { if (!this.enabled) return; [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.18, 0.18, i * 0.08)); }
  fall() { if (!this.enabled) return; this._tone('sine', 160, 50, 0.4, 0.5); this._burst(0.3, 0.5, 300, 0.6); this._burst(0.2, 0.3, 200, 0.6, 0.12); }
  sting() { if (!this.enabled) return; [392, 523, 659].forEach((f, i) => this._tone('square', f, f, 0.25, 0.12, i * 0.12)); }
  fail() { if (!this.enabled) return; this._tone('sawtooth', 220, 110, 0.7, 0.25, 0, 900); this._tone('sawtooth', 165, 82, 0.9, 0.2, 0.15, 900); }
  win() { if (!this.enabled) return; [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this._tone('triangle', f, f, 0.3, 0.2, i * 0.13)); }
  gavel() { if (!this.enabled) return; for (let i = 0; i < 3; i++) { this._tone('sine', 900, 300, 0.07, 0.3, i * 0.22); this._burst(0.05, 0.3, 2500, 1, i * 0.22); } }
}
