import type { RaceCar } from "@/race-car/domain/race-car";
import { decidePit, type MandatoryStop, type PitReason } from "@/tyres/domain/pit-decision";
import type { Compound } from "@/tyres/domain/tyre";
import type { PitStop } from "./pit-stop";

/** The team's call for the driver to come in. */
export interface PitAdvice {
  compound: Compound;
  reason: PitReason;
}

const CHECK_INTERVAL = 1;
/** The board stays out this long (s), then the team stops nagging for a while. */
const SHOW_TIME = 14;
const QUIET_TIME = 25;

/**
 * The pit wall: watches the player's tyres and the weather with the same
 * judgement the bots use, and shows the "BOX" board when a stop is worth it.
 */
export class PitAdvisor {
  advice: PitAdvice | null = null;
  private timer = 0;
  private shownFor = 0;
  private quietFor = 0;

  update(dt: number, car: RaceCar, pit: PitStop, canPit: boolean, lapsLeft: number, lapsRun: number, lapKm: number, rule: MandatoryStop): void {
    this.quietFor = Math.max(0, this.quietFor - dt);
    this.timer += dt;
    if (pit.requested || pit.active || !canPit) {
      this.advice = null;
      return;
    }
    if (this.timer < CHECK_INTERVAL) return;
    this.timer = 0;

    const decision = decidePit(car, lapsLeft, lapsRun, lapKm, rule);
    if (!decision) {
      this.advice = null;
      this.shownFor = 0;
      return;
    }
    if (!this.advice) {
      if (this.quietFor > 0) return;
      this.shownFor = 0;
    }
    this.advice = { compound: decision.compound, reason: decision.reason };
    this.shownFor += CHECK_INTERVAL;
    if (this.shownFor > SHOW_TIME) {
      this.advice = null;
      this.quietFor = QUIET_TIME;
    }
  }

  /** The driver answered the board (by asking to pit): it goes away. */
  clear(): void {
    this.advice = null;
    this.shownFor = 0;
  }
}
