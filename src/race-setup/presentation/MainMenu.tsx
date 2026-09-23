"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { normalizeSeed, randomSeed } from "@/circuit/domain/circuit-seed";
import { PRESET_CIRCUITS, type PresetCircuitId } from "@/circuit/domain/circuit-selection";
import type { CircuitInfo, CircuitOutline } from "@/race/application/race-ui-state";
import overlay from "@/shared/presentation/overlay.module.css";
import {
  LAP_CHOICES,
  RIVAL_CHOICES,
  type Difficulty,
  type GridSlot,
  type RaceSettings,
} from "../domain/race-settings";
import { CircuitPreview } from "./CircuitPreview";
import styles from "./main-menu.module.css";

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Fácil", medium: "Media", hard: "Difícil" };
const GRID_LABELS: Record<GridSlot, string> = {
  pole: "Pole position",
  middle: "Mitad de parrilla",
  back: "Última posición",
  random: "Aleatoria",
};

const GENERATED = "generated";

interface Props {
  settings: RaceSettings;
  circuit: CircuitInfo;
  outline: CircuitOutline;
  onChange(patch: Partial<RaceSettings>): void;
  onStart(): void;
}

export function MainMenu({ settings, circuit, outline, onChange, onStart }: Props) {
  const selection = settings.circuit;
  const activeSeed = selection.kind === "generated" ? selection.seed : "";
  // What the seed field shows while typing; only applied on Enter / blur.
  const [seedDraft, setSeedDraft] = useState(activeSeed);
  const [copied, setCopied] = useState(false);

  const applySeed = (seed: string) => {
    setSeedDraft(seed);
    if (seed !== activeSeed) onChange({ circuit: { kind: "generated", seed } });
  };
  const commitSeed = (typed: string) => {
    const seed = normalizeSeed(typed);
    if (seed) applySeed(seed);
    else setSeedDraft(activeSeed);
  };
  const onSeedKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter applies the seed instead of starting the race
    commitSeed(e.currentTarget.value);
  };
  const chooseCircuit = (value: string) => {
    if (value === GENERATED) applySeed(normalizeSeed(seedDraft) || randomSeed());
    else onChange({ circuit: { kind: "preset", id: value as PresetCircuitId } });
  };
  const copySeed = () => {
    navigator.clipboard?.writeText(activeSeed).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

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
          <label className={styles.wide}>
            Circuito
            <select
              value={selection.kind === "generated" ? GENERATED : selection.id}
              onChange={(e) => chooseCircuit(e.target.value)}
            >
              {PRESET_CIRCUITS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value={GENERATED}>Circuito generado (seed)</option>
            </select>
          </label>
          {selection.kind === "generated" && (
            <div className={`${styles.seed} ${styles.wide}`}>
              <label htmlFor="circuit-seed">Seed</label>
              <div className={styles.seedControls}>
                <input
                  id="circuit-seed"
                  value={seedDraft}
                  onChange={(e) => setSeedDraft(e.target.value)}
                  onBlur={(e) => commitSeed(e.currentTarget.value)}
                  onKeyDown={onSeedKeyDown}
                  maxLength={24}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button type="button" onClick={() => applySeed(randomSeed())} title="Generar un circuito nuevo">
                  🎲 Nuevo
                </button>
                <button type="button" onClick={copySeed} title="Copiar la seed para compartirla">
                  {copied ? "¡Copiada!" : "Copiar"}
                </button>
              </div>
            </div>
          )}
          <p className={`${styles.circuitInfo} ${styles.wide}`}>
            {circuit.name} · {circuit.lengthKm.toFixed(2)} km · {circuit.themeLabel}
            {circuit.climb >= 1 && ` · Desnivel ${Math.round(circuit.climb)} m`}
            {circuit.tunnels > 0 && ` · ${circuit.tunnels} ${circuit.tunnels === 1 ? "túnel" : "túneles"}`}
          </p>
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
      <CircuitPreview outline={outline} />
    </div>
  );
}
