import { clamp, type RandomSource } from "@/shared/domain/math";

export const START_LIGHT_COUNT = 5;

/** F1 start: one red light per second, a random hold, then lights out. */
export class StartSequence {
  private elapsed = 0;
  private readonly hold: number;

  constructor(random: RandomSource = Math.random) {
    this.hold = 0.6 + random() * 1.6;
  }

  advance(dt: number): { lit: number; lightsOut: boolean } {
    this.elapsed += dt;
    const t = this.elapsed;
    const lightsOut = t > START_LIGHT_COUNT + 0.5 + this.hold;
    const lit = lightsOut || t <= 1 ? 0 : clamp(Math.floor(t - 0.5) + 1, 0, START_LIGHT_COUNT);
    return { lit, lightsOut };
  }
}
