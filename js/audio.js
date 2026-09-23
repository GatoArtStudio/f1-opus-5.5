// Synthesised engine note and impact thuds via Web Audio (no asset files).
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) return this.ctx.resume();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 3;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.filter.connect(this.engineGain).connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.osc1.start();
    this.osc2.start();

    // Shared noise buffer for impacts and tyre scrub.
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  update(rpm, throttle, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 30 + (rpm / 12600) * 190;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.filter.frequency.setTargetAtTime(700 + throttle * 1800 + rpm * 0.08, t, 0.05);
    this.engineGain.gain.setTargetAtTime(active ? 0.1 + throttle * 0.12 : 0, t, 0.1);
  }

  impact(strength) {
    if (!this.ctx || strength < 2) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(Math.min(1, strength / 15), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, 0.4);
  }
}
