import { Circuit } from "@/circuit/domain/circuit";
import { isSameCircuitSelection, resolveCircuitLayout, type CircuitSelection } from "@/circuit/domain/circuit-selection";
import { classifyRace } from "@/race-results/domain/classification";
import { DEFAULT_RACE_SETTINGS, type RaceSettings } from "@/race-setup/domain/race-settings";
import type { RandomSource } from "@/shared/domain/math";
import { formatLapTime } from "@/shared/domain/lap-time";
import { Race, type RaceEvent } from "../domain/race";
import { StartSequence } from "../domain/start-sequence";
import type { CameraMode, EngineSound, PlayerControls, RaceView } from "./ports";
import type {
  CircuitInfo,
  CircuitOutline,
  HudSnapshot,
  LiveTelemetry,
  MessageTone,
  RacePhase,
  RaceUiState,
} from "./race-ui-state";

const STEP = 1 / 120; // fixed physics step
const MAX_FRAME = 0.1;
const HUD_INTERVAL = 1 / 15;
const RESULTS_DELAY = 3;
const RESULTS_REFRESH = 0.5;
const CAMERA_MODES: { mode: CameraMode; label: string }[] = [
  { mode: "chase", label: "Persecución" },
  { mode: "far-chase", label: "Persecución lejana" },
  { mode: "onboard", label: "Cámara T (onboard)" },
];
const ATTRACT_SETTINGS: RaceSettings = {
  laps: 1,
  rivals: 9,
  difficulty: "medium",
  gridSlot: "random",
  circuit: DEFAULT_RACE_SETTINGS.circuit,
};

type Listener = () => void;

const outlineOf = (circuit: Circuit): CircuitOutline => ({ xs: circuit.px, zs: circuit.pz });
const infoOf = (circuit: Circuit): CircuitInfo => ({ name: circuit.name, lengthKm: circuit.length / 1000 });

/**
 * Orchestrates a play session: attract mode behind the menu, the start
 * sequence, the race itself, pause and results. Drives the simulation with a
 * fixed time step and publishes UI state for the presentation layer.
 */
export class RaceSession {
  private state: RaceUiState;
  private readonly listeners = new Set<Listener>();
  private readonly telemetryListeners = new Set<(t: LiveTelemetry) => void>();

  private circuit: Circuit;
  private circuitSelection: CircuitSelection;
  private circuitOutline: CircuitOutline;
  private race!: Race;
  private startSequence: StartSequence | null = null;
  private pausedFrom: RacePhase = "racing";
  private cameraIndex = 0;
  private accumulator = 0;
  private shake = 0;
  private revs = 0;
  private hudTimer = 0;
  private finishedFor = 0;
  private resultsTimer = 0;
  private messageId = 0;

  constructor(
    private readonly view: RaceView,
    private readonly controls: PlayerControls,
    private readonly sound: EngineSound,
    private readonly random: RandomSource = Math.random,
  ) {
    const { circuit } = DEFAULT_RACE_SETTINGS;
    this.circuitSelection = circuit;
    this.circuit = new Circuit(resolveCircuitLayout(circuit));
    this.circuitOutline = outlineOf(this.circuit);
    this.view.setCircuit(this.circuit);
    this.state = {
      phase: "menu",
      settings: DEFAULT_RACE_SETTINGS,
      circuit: infoOf(this.circuit),
      hud: null,
      startLights: { lit: 0, visible: false },
      message: null,
      results: null,
    };
    this.enterMenu();
  }

  // ---- subscription API (useSyncExternalStore compatible) ----

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): RaceUiState => this.state;

  onTelemetry(listener: (t: LiveTelemetry) => void): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  get outline(): CircuitOutline {
    return this.circuitOutline;
  }

  // ---- commands ----

  /** Changing the circuit rebuilds the track, so it is only meant for the menu. */
  updateSettings = (patch: Partial<RaceSettings>): void => {
    const settings = { ...this.state.settings, ...patch };
    if (isSameCircuitSelection(settings.circuit, this.circuitSelection)) {
      this.setState({ settings });
      return;
    }
    this.circuitSelection = settings.circuit;
    this.circuit = new Circuit(resolveCircuitLayout(settings.circuit));
    this.circuitOutline = outlineOf(this.circuit);
    this.view.setCircuit(this.circuit);
    this.enterMenu(); // reloads the attract-mode race on the new circuit
    this.setState({ settings, circuit: infoOf(this.circuit) });
  };

  /** Starts a race with the current settings. Call from a user gesture (audio). */
  startRace = (): void => {
    const { settings } = this.state;
    this.sound.start();
    this.loadRace(Race.create(this.circuit, settings, { random: this.random }));
    this.startSequence = new StartSequence(this.random);
    this.finishedFor = 0;
    this.controls.clearActions();
    this.setState({
      phase: "countdown",
      results: null,
      message: null,
      startLights: { lit: 0, visible: true },
      hud: this.buildHud(),
    });
  };

  quitToMenu = (): void => this.enterMenu();

  togglePause = (): void => {
    const { phase } = this.state;
    if (phase === "paused") this.setState({ phase: this.pausedFrom });
    else if (phase === "racing" || phase === "countdown" || phase === "finished") {
      this.pausedFrom = phase;
      this.setState({ phase: "paused" });
    }
  };

  pause = (): void => {
    if (this.state.phase !== "paused") this.togglePause();
  };

  // ---- frame loop ----

  tick(realDt: number): void {
    const dt = Math.min(MAX_FRAME, realDt);
    this.handleActions();
    const { phase } = this.state;

    if (phase !== "paused") {
      if (phase === "countdown") this.advanceStart(dt);
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.simulate(STEP);
        this.accumulator -= STEP;
      }
      for (const event of this.race.drainEvents()) this.onRaceEvent(event);
    }

    this.handleImpacts();
    this.view.render(dt, {
      race: this.race,
      camera: this.state.phase === "menu" ? "attract" : CAMERA_MODES[this.cameraIndex].mode,
      shake: this.shake,
    });
    this.shake = Math.max(0, this.shake - dt * 2);

    if (this.state.phase !== "menu") this.updateRaceUi(dt);
  }

  dispose(): void {
    this.listeners.clear();
    this.telemetryListeners.clear();
  }

  // ---- internals ----

  private enterMenu(): void {
    this.sound.update(0, 0, false);
    this.loadRace(Race.create(this.circuit, ATTRACT_SETTINGS, { attractMode: true, random: this.random }));
    this.startSequence = null;
    this.setState({ phase: "menu", hud: null, results: null, message: null, startLights: { lit: 0, visible: false } });
  }

  private loadRace(race: Race): void {
    this.race = race;
    this.accumulator = 0;
    this.view.showRace(race);
    this.view.setStartLights(0);
  }

  private simulate(dt: number): void {
    const green = this.state.phase !== "countdown";
    const input = this.controls.read(dt);
    if (!green) this.revs = input.throttle; // rev the engine on the grid
    this.race.step(dt, green, input);
  }

  private advanceStart(dt: number): void {
    if (!this.startSequence) return;
    const { lit, lightsOut } = this.startSequence.advance(dt);
    if (lit !== this.state.startLights.lit || lightsOut) {
      this.view.setStartLights(lit);
      this.setState({ startLights: { lit, visible: !lightsOut } });
    }
    if (lightsOut) {
      this.startSequence = null;
      this.race.time = 0;
      this.setState({ phase: "racing" });
      this.showMessage("¡YA!", "go", 1.2);
    }
  }

  private handleActions(): void {
    const c = this.controls;
    const phase = this.state.phase;
    if (c.consumeAction("pause")) this.togglePause();
    if (c.consumeAction("camera")) {
      this.cameraIndex = (this.cameraIndex + 1) % CAMERA_MODES.length;
      if (phase !== "menu") this.showMessage("Cámara: " + CAMERA_MODES[this.cameraIndex].label, "info", 1.2);
    }
    if (c.consumeAction("mute")) {
      this.sound.setMuted(!this.sound.muted);
      this.showMessage(this.sound.muted ? "Sonido: OFF" : "Sonido: ON", "info", 1);
    }
    if (c.consumeAction("respawn") && phase === "racing") {
      this.race.player.car.respawn();
      this.showMessage("Coche recolocado", "info", 1);
    }
    if (c.consumeAction("start") && phase === "menu") this.startRace();
    c.clearActions();
  }

  private onRaceEvent(event: RaceEvent): void {
    if (this.race.attractMode) return;
    const { entry } = event;
    switch (event.type) {
      case "fastest-lap":
        if (entry.isPlayer) this.showMessage(`¡VUELTA RÁPIDA! ${formatLapTime(event.lapTime)}`, "fastest", 2.5);
        else this.showMessage(`Vuelta rápida: ${entry.driver.code} ${formatLapTime(event.lapTime)}`, "info", 2.5);
        break;
      case "final-lap":
        if (entry.isPlayer) this.showMessage("ÚLTIMA VUELTA", "big", 2.5);
        break;
      case "finished":
        if (entry.isPlayer) {
          this.setState({ phase: "finished" });
          this.showMessage(`🏁 ¡META! Posición P${event.position}`, "big", 4);
        }
        break;
    }
  }

  private handleImpacts(): void {
    for (const car of this.race.cars) {
      if (car === this.race.player.car && car.impact > 3 && this.state.phase !== "menu") {
        this.shake = Math.min(0.6, car.impact * 0.04);
        this.sound.impact(car.impact);
      }
      car.impact = 0;
    }
  }

  private updateRaceUi(dt: number): void {
    const { phase } = this.state;
    const car = this.race.player.car;
    const onGrid = phase === "countdown" || (phase === "paused" && this.pausedFrom === "countdown");
    const rpm = onGrid ? 4000 + this.revs * 8000 : car.rpm;
    this.sound.update(rpm, onGrid ? this.revs : car.controls.throttle, phase !== "paused");

    if (this.telemetryListeners.size) {
      const telemetry: LiveTelemetry = {
        cars: this.race.entries.map((e) => ({ x: e.car.x, z: e.car.z, color: e.driver.color, isPlayer: e.isPlayer })),
        player: { x: car.x, z: car.z, heading: car.heading, rpm },
      };
      for (const listener of this.telemetryListeners) listener(telemetry);
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = HUD_INTERVAL;
      this.setState({ hud: this.buildHud() });
    }

    if (phase === "finished") {
      this.finishedFor += dt;
      this.resultsTimer -= dt;
      if (this.finishedFor > RESULTS_DELAY && this.resultsTimer <= 0) {
        this.resultsTimer = RESULTS_REFRESH; // keeps updating while rivals finish
        this.setState({ results: classifyRace(this.race) });
      }
    }
  }

  private buildHud(): HudSnapshot {
    const race = this.race;
    const standings = race.standings();
    const player = race.player;
    const phase = this.state.phase;
    return {
      speedKmh: Math.round(Math.abs(player.car.speed) * 3.6),
      gear: player.car.gear,
      position: player.position,
      carCount: standings.length,
      lap: Math.min(Math.max(player.lap, 1), race.totalLaps),
      totalLaps: race.totalLaps,
      currentLap: player.finished ? player.lastLap : race.time - player.lapStart,
      lastLap: player.lastLap,
      bestLap: player.bestLap,
      wrongWay: phase === "racing" && race.isPlayerWrongWay(),
      tower: standings.map(({ entry, gap }) => ({
        position: entry.position,
        code: entry.driver.code,
        color: entry.driver.color,
        isPlayer: entry.isPlayer,
        gap,
      })),
    };
  }

  private showMessage(text: string, tone: MessageTone, seconds: number): void {
    this.setState({ message: { id: ++this.messageId, text, tone, seconds } });
  }

  private setState(patch: Partial<RaceUiState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
