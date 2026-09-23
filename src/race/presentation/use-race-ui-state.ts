import { useSyncExternalStore } from "react";
import type { RaceSession } from "../application/race-session";
import type { RaceUiState } from "../application/race-ui-state";

const noSubscription = () => () => {};
const noState = () => null;

/** Subscribes a component to the session's UI state (null until mounted). */
export function useRaceUiState(session: RaceSession | null): RaceUiState | null {
  return useSyncExternalStore(session?.subscribe ?? noSubscription, session?.getState ?? noState, noState);
}
