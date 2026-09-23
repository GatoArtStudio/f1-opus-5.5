import { Circuit } from "@/circuit/domain/circuit";
import { CHARACTER_LABELS } from "@/circuit/domain/circuit-character";
import { THEME_PROFILES } from "@/circuit/domain/circuit-theme";
import { isSameCircuitSelection, resolveCircuitLayout, type CircuitSelection } from "@/circuit/domain/circuit-selection";
import { CHOICE_TIMEOUT } from "@/pit-stop/domain/pit-stop";
import { bestCompound, type Compound } from "@/tyres/domain/tyre";
import { describeSurface } from "@/weather/domain/track-description";
import { pickStartWeather, WEATHER } from "@/weather/domain/weather";
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
  PitUiState,
  RacePhase,
  RaceUiState,
  WeatherInfo,
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
  startTyre: "auto",
  mandatoryStop: false,
};

type Listener = () => void;

const outlineOf = (circuit: Circuit): CircuitOutline => ({ xs: circuit.px, zs: circuit.pz });
const infoOf = (circuit: Circuit): CircuitInfo => ({
  name: circuit.name,
  lengthKm: circuit.length / 1000,
  themeLabel: THEME_PROFILES[circuit.theme].label,
  characterLabel: circuit.character ? CHARACTER_LABELS[circuit.character] : null,
  climb: Math.max(...circuit.elevation) - Math.min(...circuit.elevation),
  tunnels: circuit.tunnels.length,
});

const NO_WEATHER: WeatherInfo = {
  kind: "clear",
  label: WEATHER.clear.label,
  precipitation: "none",
  surface: "Seca",
  temperature: 20,
  outlook: [],
  recommended: "medium",
};

function weatherInfoOf(race: Race, theme: Circuit["theme"], laps: number): WeatherInfo {
  const { kind, conditions, outlook } = race.weather;
  const spec = WEATHER[kind];
  return {
    kind,
    label: spec.label,
    precipitation: spec.precipitation,
    surface: describeSurface(conditions, theme),
    temperature: Math.round(conditions.temperature),
    outlook: outlook.slice(0, 3).map((o) => ({ label: WEATHER[o.kind].label, chance: o.chance })),
    recommended: race.attractMode ? bestCompound(conditions, Math.max(1, laps), race.lapKm) : race.recommendedCompound(),
  };
}

function pitUiOf(race: Race): PitUiState {
  const { pit } = race.player;
  return {
    requested: pit.requested,
    phase: pit.phase,
    canRequest: race.playerCanPit,
    choosing: pit.waitingForChoice,
    choiceSecondsLeft: Math.max(0, CHOICE_TIMEOUT - pit.choiceWait),
    stops: pit.stops,
    advice: race.advisor.advice,
    rule: !race.mandatoryStop
      ? "off"
      : race.player.dryCompounds.size >= 2
        ? "done"
        : race.wetSeen
          ? "waived"
          : "pending",
    exitLight: race.crew.exitLight,
  };
}

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
  private menuWeatherTimer = 0;
  /** Which call from the pit wall has been announced on the radio already. */
  private adviceKey = "";

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
      weather: NO_WEATHER, // replaced as soon as the first scene is loaded, just below
      pit: null,
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
      this.setState({ weather: this.weatherInfo() }); // the recommended tyre depends on the race length
      return;
    }
    this.circuitSelection = settings.circuit;
    this.circuit = new Circuit(resolveCircuitLayout(settings.circuit));
    this.circuitOutline = outlineOf(this.circuit);
    this.view.setCircuit(this.circuit);
    this.enterMenu(); // reloads the attract-mode race on the new circuit
    this.setState({ settings, circuit: infoOf(this.circuit) });
    this.setState({ weather: this.weatherInfo() });
  };

  /** Starts a race with the current settings. Call from a user gesture (audio). */
  startRace = (): void => {
    const { settings } = this.state;
    this.sound.start();
    // The menu shows the weather of the scene behind it, so that is the weather the race starts in.
    const weather = this.state.phase === "menu" ? this.race.weather.kind : pickStartWeather(this.circuit.theme, this.random);
    this.loadRace(Race.create(this.circuit, settings, { random: this.random, weather }));
    this.startSequence = new StartSequence(this.random);
    this.finishedFor = 0;
    this.adviceKey = "";
    this.controls.clearActions();
    this.setState({
      phase: "countdown",
      results: null,
      message: null,
      startLights: { lit: 0, visible: true },
      hud: this.buildHud(),
      weather: this.weatherInfo(),
      pit: pitUiOf(this.race),
    });
    if (this.race.mandatoryStop) this.showMessage("Regla F1: usa dos compuestos distintos · B para pedir boxes", "info", 4.5);
  };

  /** Asks the team for a pit stop on the next lap, or cancels the request. */
  togglePit = (): void => {
    if (this.state.phase !== "racing" && this.state.phase !== "countdown") return;
    const player = this.race.player;
    if (player.pit.active) return this.showMessage("Ya estás en boxes", "info", 1.5);
    const wasRequested = player.pit.requested;
    if (!this.race.togglePlayerPit()) return this.showMessage("Boxes cerrados", "info", 1.5);
    this.showMessage(wasRequested ? "Parada cancelada" : "BOX, BOX: entras en boxes al final de la vuelta", "info", 2.2);
    this.setState({ pit: pitUiOf(this.race) });
  };

  /** Picks the tyres to fit while stopped in the box. */
  chooseTyre = (compound: Compound): void => {
    this.race.choosePlayerTyre(compound);
    this.setState({ pit: pitUiOf(this.race) });
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
    else this.refreshMenuWeather(dt);
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
    this.setState({
      phase: "menu",
      hud: null,
      pit: null,
      results: null,
      message: null,
      startLights: { lit: 0, visible: false },
      weather: this.weatherInfo(),
    });
  }

  /** The team's radio call when the pit wall starts asking for a stop. */
  private announceAdvice(pit: PitUiState): void {
    const key = pit.advice ? `${pit.advice.reason}-${pit.advice.compound}` : "";
    if (key && key !== this.adviceKey) this.showMessage("📻 Radio: «Box, box» · pulsa B", "info", 3);
    this.adviceKey = key;
  }

  /** The weather behind the menu keeps moving, so the menu's summary of it is refreshed now and then. */
  private refreshMenuWeather(dt: number): void {
    this.menuWeatherTimer -= dt;
    if (this.menuWeatherTimer > 0) return;
    this.menuWeatherTimer = 0.7;
    this.setState({ weather: this.weatherInfo() });
  }

  private weatherInfo(): WeatherInfo {
    const laps = this.state.phase === "menu" ? this.state.settings.laps : this.race.lapsLeft(this.race.player);
    return weatherInfoOf(this.race, this.circuit.theme, laps);
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
      if (this.race.player.pit.active) this.race.crew.abandon(this.race.player.car, this.race.player.pit);
      this.race.player.car.respawn();
      this.showMessage("Coche recolocado", "info", 1);
    }
    if (c.consumeAction("pit")) this.togglePit();
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
      case "penalty":
        if (entry.isPlayer) {
          this.showMessage(`Penalización +${event.seconds} s: no usaste dos compuestos distintos`, "info", 5);
        }
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
      const pit = pitUiOf(this.race);
      this.announceAdvice(pit);
      this.setState({ hud: this.buildHud(), weather: this.weatherInfo(), pit });
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
      slipstream: player.car.tow,
      dirtyAir: player.car.dirtyAir,
      tyre: {
        compound: player.car.tyre.compound,
        wear: Math.min(1, player.car.tyre.wear),
        grip: player.car.gripFactor,
      },
      tower: standings.map(({ entry, gap }) => ({
        position: entry.position,
        code: entry.driver.code,
        color: entry.driver.color,
        isPlayer: entry.isPlayer,
        gap,
        tyre: entry.car.tyre.compound,
        inPit: entry.pit.active,
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
