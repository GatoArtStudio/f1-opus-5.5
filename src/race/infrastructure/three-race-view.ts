import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { buildCircuitScenery, type CircuitScenery } from "@/circuit/infrastructure/circuit-scenery";
import type { CircuitPalette } from "@/circuit/infrastructure/circuit-palette";
import type { RaceCar } from "@/race-car/domain/race-car";
import { CarModel } from "@/race-car/infrastructure/car-model";
import type { RaceView, RenderFrame } from "../application/ports";
import { Race } from "../domain/race";
import { PitLane } from "@/pit-stop/domain/pit-lane";
import { PitCrewView } from "@/pit-stop/infrastructure/pit-crew-view";
import { WeatherEffects } from "@/weather/infrastructure/weather-effects";
import { CameraRig } from "./camera-rig";

const MAX_GRID = 14;

/** Releases GPU resources held by every mesh, material and texture under `root`. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    (obj as THREE.InstancedMesh).dispose?.(); // per-instance buffers
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}

/** three.js implementation of the race view: scene, lights, cars, camera. */
export class ThreeRaceView implements RaceView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly fog = new THREE.Fog(0xcfe3f2, 350, 2200);
  private scenery: CircuitScenery | null = null;
  private sceneryRoot: THREE.Group | null = null;
  private readonly rig: CameraRig;
  private readonly effects: WeatherEffects;
  private circuit: Circuit | null = null;
  private crewView: PitCrewView | null = null;
  private models = new Map<RaceCar, CarModel>();
  private shownRace: Race | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.3, 6000);
    this.rig = new CameraRig(this.camera);
    this.effects = new WeatherEffects(this.scene, this.camera, () =>
      this.scenery
        ? {
            fog: this.fog,
            hemisphere: this.hemisphere,
            sun: this.sun,
            skyMaterial: this.scenery.skyMaterial,
            roadMaterial: this.scenery.roadMaterial,
          }
        : null,
    );

    this.hemisphere = new THREE.HemisphereLight(0xdcecff, 0x3d5a2a, 1.1);
    this.scene.add(this.hemisphere);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff4e0, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setCircuit(circuit: Circuit): void {
    if (this.sceneryRoot) {
      this.scene.remove(this.sceneryRoot);
      disposeTree(this.sceneryRoot);
    }
    this.circuit = circuit;
    const root = (this.sceneryRoot = new THREE.Group());
    this.scene.add(root);
    this.scenery = buildCircuitScenery(root, circuit, this.renderer, Race.gridSlots(circuit, MAX_GRID));
    this.applyAtmosphere(this.scenery.palette);
    this.effects.setCircuit(this.scenery.palette, circuit.theme);
  }

  private applyAtmosphere({ fog, light }: CircuitPalette): void {
    this.fog.color.setHex(fog.color);
    this.fog.near = fog.near;
    this.fog.far = fog.far;
    this.hemisphere.color.setHex(light.hemiSky);
    this.hemisphere.groundColor.setHex(light.hemiGround);
    this.sun.color.setHex(light.sun); // weather scales the intensities each frame
    this.renderer.toneMappingExposure = light.exposure;
  }

  showRace(race: Race): void {
    for (const model of this.models.values()) this.scene.remove(model.root);
    this.models = new Map();
    for (const entry of race.entries) {
      const model = new CarModel(entry.driver, !entry.isPlayer);
      model.sync(entry.car, 0);
      this.scene.add(model.root);
      this.models.set(entry.car, model);
    }
    this.crewView?.dispose();
    this.crewView = this.circuit ? new PitCrewView(this.scene, this.circuit, new PitLane(this.circuit), race.entries) : null;
    this.shownRace = race;
    this.rig.snapBehind(race.player.car);
  }

  setStartLights(lit: number): void {
    this.scenery?.startGantry.setLit(lit);
  }

  render(dt: number, { race, camera, shake }: RenderFrame): void {
    if (race !== this.shownRace) this.showRace(race);
    const player = race.player.car;

    if (camera === "attract") {
      const leader = race.entries.reduce((a, b) => (b.progress > a.progress ? b : a));
      this.rig.orbitAround(leader.car, dt);
    } else {
      this.rig.follow(player, camera, dt, shake);
    }

    for (const [car, model] of this.models) {
      model.sync(car, dt);
      model.root.position.y += PitCrewView.lift(race.entries.find((e) => e.car === car)!.pit); // raised on the jacks
      const d = this.camera.position.distanceTo(this.tmp.set(car.x, 1, car.z));
      model.setLabelVisible(camera !== "attract" && d > 6 && d < 160);
    }
    this.models.get(player)?.setOnboardView(camera === "onboard");

    this.crewView?.update(dt, race.entries);
    this.scenery?.pitLane.setExitLight(race.crew.exitLight);
    this.effects.update(dt, race.weather.look, race.weather.conditions);
    const cp = this.camera.position;
    this.sun.position.set(cp.x + 80, cp.y + 140, cp.z + 50);
    this.sun.target.position.set(cp.x, cp.y - 3, cp.z);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.effects.dispose();
    this.crewView?.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
