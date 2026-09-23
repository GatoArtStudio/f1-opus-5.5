"use client";

import { useEffect } from "react";
import type { PitUiState } from "@/race/application/race-ui-state";
import { COMPOUND_SPECS, COMPOUNDS, type Compound } from "@/tyres/domain/tyre";
import { TyreBadge } from "@/tyres/presentation/TyreBadge";
import styles from "./pit-menu.module.css";

interface Props {
  pit: PitUiState;
  /** Tyre that suits the conditions best; the team fits it if the player does not choose. */
  recommended: Compound;
  onChoose(compound: Compound): void;
}

/** Shown while the car is stopped in its box: the clock is running until tyres are chosen. */
export function PitMenu({ pit, recommended, onChoose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < COMPOUNDS.length) onChoose(COMPOUNDS[index]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChoose]);

  return (
    <div className={styles.menu} role="dialog" aria-label="Elige neumáticos">
      <div className={styles.head}>
        <strong>BOXES · ELIGE NEUMÁTICOS</strong>
        <span>
          Si no eliges, el equipo monta {COMPOUND_SPECS[recommended].label.toLowerCase()} en {Math.ceil(pit.choiceSecondsLeft)} s
        </span>
      </div>
      <div className={styles.options}>
        {COMPOUNDS.map((compound, k) => (
          <button key={compound} type="button" className={styles.option} onClick={() => onChoose(compound)}>
            <TyreBadge compound={compound} size={34} />
            <span className={styles.name}>
              {COMPOUND_SPECS[compound].label}
              {compound === recommended && <em title="Recomendado"> ★</em>}
            </span>
            <small>{COMPOUND_SPECS[compound].note}</small>
            <kbd>{k + 1}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
