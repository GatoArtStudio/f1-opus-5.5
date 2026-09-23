"use client";

import type { FormEvent } from "react";
import overlay from "@/shared/presentation/overlay.module.css";
import {
  LAP_CHOICES,
  RIVAL_CHOICES,
  type Difficulty,
  type GridSlot,
  type RaceSettings,
} from "../domain/race-settings";
import styles from "./main-menu.module.css";

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Fácil", medium: "Media", hard: "Difícil" };
const GRID_LABELS: Record<GridSlot, string> = {
  pole: "Pole position",
  middle: "Mitad de parrilla",
  back: "Última posición",
  random: "Aleatoria",
};

interface Props {
  settings: RaceSettings;
  onChange(patch: Partial<RaceSettings>): void;
  onStart(): void;
}

export function MainMenu({ settings, onChange, onStart }: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onStart();
  };

  return (
    <div className={`${overlay.overlay} ${styles.overlay}`}>
      <form className={overlay.card} onSubmit={submit}>
        <h1 className={styles.title}>
          <span className={styles.stripe} />
          WEB <em>GRAND PRIX</em>
        </h1>
        <p className={styles.subtitle}>Carrera de Fórmula 1 en 3D contra la IA</p>

        <div className={styles.options}>
          <label>
            Vueltas
            <select value={settings.laps} onChange={(e) => onChange({ laps: Number(e.target.value) })}>
              {LAP_CHOICES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Rivales
            <select value={settings.rivals} onChange={(e) => onChange({ rivals: Number(e.target.value) })}>
              {RIVAL_CHOICES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Dificultad
            <select
              value={settings.difficulty}
              onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}
            >
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Salida
            <select value={settings.gridSlot} onChange={(e) => onChange({ gridSlot: e.target.value as GridSlot })}>
              {Object.entries(GRID_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit" className={`${overlay.button} ${overlay.primary} ${styles.start}`}>
          Empezar carrera ▸
        </button>

        <div className={styles.controls}>
          <div><kbd>W</kbd><kbd>↑</kbd> Acelerar</div>
          <div><kbd>S</kbd><kbd>↓</kbd><kbd>Espacio</kbd> Frenar / marcha atrás</div>
          <div><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd> Girar</div>
          <div><kbd>C</kbd> Cámara · <kbd>R</kbd> Recolocar · <kbd>M</kbd> Sonido · <kbd>Esc</kbd> Pausa</div>
          <div className={overlay.dim}>Mando compatible: RT acelera, LT frena, stick izquierdo gira.</div>
        </div>
      </form>
    </div>
  );
}
