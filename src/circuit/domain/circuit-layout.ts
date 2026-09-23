import type { CircuitCharacter } from "./circuit-character";
import type { CircuitThemeId } from "./circuit-theme";
import type { ElevationSpec } from "./elevation-profile";
import type { TunnelSpan } from "./tunnel";

/** Static description of a circuit. Units: metres. */
export interface CircuitLayout {
  readonly name: string;
  readonly width: number;
  readonly kerbWidth: number;
  /** Grass between the kerb and the barrier. */
  readonly runoff: number;
  /** Distance between centreline samples. */
  readonly sampleSpacing: number;
  /** Closed loop of (x, z) points; index 0 is the start/finish line. */
  readonly controlPoints: readonly (readonly [number, number])[];
  /** How twisty a generated circuit is; unset for hand-made ones. */
  readonly character?: CircuitCharacter;
  /** Look of the surroundings; flat forest when omitted. */
  readonly theme?: CircuitThemeId;
  /** Seeds the scenery (hills, props) so the same layout always looks the same. */
  readonly seed?: string;
  /** Hills along the lap; the track is flat when omitted. */
  readonly elevation?: ElevationSpec;
  readonly tunnels?: readonly TunnelSpan[];
}

/** Every circuit is drawn at this multiple of the original size: twice as long. */
export const TRACK_SCALE = 2;

/** The same circuit, `factor` times larger. Width, kerbs and run-off stay as they are. */
export function scaleLayout(layout: CircuitLayout, factor: number = TRACK_SCALE): CircuitLayout {
  return {
    ...layout,
    controlPoints: layout.controlPoints.map(([x, z]) => [x * factor, z * factor] as const),
    tunnels: layout.tunnels?.map((t) => ({ from: t.from * factor, to: t.to * factor })),
    elevation: layout.elevation && { ...layout.elevation, scale: layout.elevation.scale * factor },
  };
}

export const WEB_GP_CIRCUIT: CircuitLayout = {
  name: "Web Grand Prix Circuit",
  width: 16,
  kerbWidth: 1.8,
  runoff: 14,
  sampleSpacing: 2,
  controlPoints: [
    [0, 0], [300, 0], [520, 0], [600, 50], [610, 150], [540, 220], [520, 300],
    [590, 380], [600, 480], [520, 560], [380, 560], [280, 500], [180, 520],
    [120, 600], [40, 640], [-40, 600], [-40, 500], [-120, 440], [-260, 460],
    [-380, 520], [-480, 480], [-500, 360], [-430, 270], [-320, 250], [-230, 215],
    [-250, 140], [-350, 115], [-440, 108], [-497, 90], [-517, 55], [-497, 20],
    [-440, 3], [-300, 0],
  ],
};
