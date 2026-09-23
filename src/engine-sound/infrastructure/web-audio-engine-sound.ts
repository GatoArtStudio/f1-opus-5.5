import type { EngineSound } from "@/race/application/ports";

const MASTER_VOLUME = 0.5;

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  engineGain: GainNode;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  noise: AudioBuffer;
}

/** Synthesised engine note and impact thuds (no audio files needed). */
export class WebAudioEngineSound implements EngineSound {
  muted = false;
  private graph: AudioGraph | null = null;

  start(): void {
    if (this.graph) {
      void this.graph.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 3;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    filter.connect(engineGain).connect(master);

    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    const harmonic = ctx.createGain();
    harmonic.gain.value = 0.35;
    osc1.connect(filter);
    osc2.connect(harmonic).connect(filter);
    osc1.start();
    osc2.start();

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.graph = { ctx, master, filter, engineGain, osc1, osc2, noise };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.graph) this.graph.master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  update(rpm: number, throttle: number, active: boolean): void {
    const g = this.graph;
    if (!g) return;
    const t = g.ctx.currentTime;
    const f = 30 + (rpm / 12600) * 190;
    g.osc1.frequency.setTargetAtTime(f, t, 0.03);
    g.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    g.filter.frequency.setTargetAtTime(700 + throttle * 1800 + rpm * 0.08, t, 0.05);
    g.engineGain.gain.setTargetAtTime(active ? 0.1 + throttle * 0.12 : 0, t, 0.1);
  }

  impact(strength: number): void {
    const g = this.graph;
    if (!g || strength < 2) return;
    const src = g.ctx.createBufferSource();
    src.buffer = g.noise;
    const filter = g.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = g.ctx.createGain();
    const t = g.ctx.currentTime;
    gain.gain.setValueAtTime(Math.min(1, strength / 15), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filter).connect(gain).connect(g.master);
    src.start(t, Math.random() * 0.5, 0.4);
  }

  dispose(): void {
    void this.graph?.ctx.close();
    this.graph = null;
  }
}
