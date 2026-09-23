import type { RaceCar } from "@/race-car/domain/race-car";
import type { PitStop } from "@/pit-stop/domain/pit-stop";
import { randomBetween, type RandomSource } from "@/shared/domain/math";
import { decidePit, type MandatoryStop } from "@/tyres/domain/pit-decision";
import { rankCompounds, type Compound } from "@/tyres/domain/tyre";
import type { TrackConditions } from "@/weather/domain/weather";

/** Seconds a better tyre must have been on offer before the bot acts on it. */
const REACTION: readonly [number, number] = [4, 22];
const CHECK_INTERVAL = 1;
/** Chance a bot goes for its second-best tyre choice, for variety on the grid. */
const OFF_PICK_CHANCE = 0.2;

/** Picks the tyres a bot starts on, from the conditions and race length. */
export function chooseStartCompound(conditions: TrackConditions, laps: number, lapKm: number, random: RandomSource): Compound {
  const ranking = rankCompounds(conditions, laps, lapKm);
  const close = ranking[1] && ranking[1].score > ranking[0].score * 0.985;
  return ranking[close && random() < OFF_PICK_CHANCE * 2 ? 1 : 0].compound;
}

/**
 * Decides when a bot should come in for tyres and which: for a change of
 * weather or worn tyres it reacts after a short delay, and for the mandatory
 * two-compound stop it goes at a lap of its own choosing.
 */
export class TyreStrategy {
  private timer = 0;
  private wantedFor = 0;
  private readonly reaction: number;

  constructor(
    private readonly car: RaceCar,
    private readonly pit: PitStop,
    private readonly lapKm: number,
    private readonly random: RandomSource,
    /** Scales the delay before acting on a change of weather (a sharp driver reacts sooner). */
    reactionScale = 1,
  ) {
    this.reaction = randomBetween(REACTION, random) * reactionScale;
  }

  /** `lapsLeft` is the distance still to run, in laps; `lapsRun` how far it has already gone. */
  update(dt: number, lapsLeft: number, lapsRun: number, rule: MandatoryStop): void {
    const { car, pit } = this;
    this.timer += dt;
    if (this.timer < CHECK_INTERVAL) return;
    this.timer = 0;
    if (pit.active || pit.requested || pit.cooldown > 0) {
      this.wantedFor = 0;
      return;
    }

    const decision = decidePit(car, lapsLeft, lapsRun, this.lapKm, rule);
    if (!decision) {
      this.wantedFor = 0;
      return;
    }
    if (decision.reason !== "mandatory") {
      this.wantedFor += CHECK_INTERVAL;
      if (this.wantedFor < this.reaction) return;
    }
    pit.requested = true;
    pit.compound = decision.compound;
    this.wantedFor = 0;
  }
}
