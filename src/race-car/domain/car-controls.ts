/** Analogue driver inputs, as produced by a human or a bot. */
export interface CarControls {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
}

export const NEUTRAL_CONTROLS: Readonly<CarControls> = { throttle: 0, brake: 0, steer: 0 };
