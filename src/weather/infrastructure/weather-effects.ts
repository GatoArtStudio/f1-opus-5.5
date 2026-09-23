import * as THREE from "three";
import type { CircuitPalette } from "@/circuit/infrastructure/circuit-palette";
import type { CircuitThemeId } from "@/circuit/domain/circuit-theme";
import type { Precipitation, TrackConditions, WeatherLook } from "../domain/weather";

/** What the effects need from the scene to change its mood. */
export interface WeatherTargets {
  fog: THREE.Fog;
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** Sky dome and asphalt of the current circuit. */
  skyMaterial: THREE.MeshBasicMaterial;
  roadMaterial: THREE.MeshStandardMaterial;
}

const RAIN_DROPS = 5000;
const FLAKES = 4500;
const BOX = { width: 90, height: 40 };
const WIND = new THREE.Vector3(6, 0, 3);

/** Colour of loose cover on the road, by kind of circuit. */
const COVER_COLOR: Record<CircuitThemeId, number> = {
  forest: 0xe6eef5,
  ice: 0xe9f1f8,
  desert: 0xd8b070,
  volcano: 0x4a4644,
  city: 0xe6eef5,
};

/** Soft round sprite, so flakes and grains are not drawn as hard squares. */
function softDisc(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const PARTICLE: Record<Exclude<Precipitation, "none" | "rain">, { color: number; size: number; fall: number; drift: number; opacity: number }> = {
  snow: { color: 0xffffff, size: 0.15, fall: 2.4, drift: 1.4, opacity: 0.95 },
  sand: { color: 0xd9b26a, size: 0.07, fall: 0.6, drift: 24, opacity: 0.6 },
  ash: { color: 0xa79d94, size: 0.1, fall: 3, drift: 2.2, opacity: 0.85 },
};

/**
 * Weather as seen in the scene: a darker, foggier sky, lightning, falling
 * rain / snow / sand / ash around the camera, and a wet or covered road.
 */
export class WeatherEffects {
  private palette: CircuitPalette | null = null;
  private theme: CircuitThemeId = "forest";
  private time = 0;

  private readonly rain: THREE.LineSegments;
  private readonly rainPositions = new Float32Array(RAIN_DROPS * 6);
  private readonly rainSeeds = new Float32Array(RAIN_DROPS * 3);
  private readonly flakes: THREE.Points;
  private readonly flakePositions = new Float32Array(FLAKES * 3);
  private readonly flakeSeeds = new Float32Array(FLAKES * 3);
  private flakeKind: Exclude<Precipitation, "none" | "rain"> = "snow";

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly targets: () => WeatherTargets | null,
  ) {
    for (let i = 0; i < RAIN_DROPS; i++) this.seed(this.rainSeeds, i);
    for (let i = 0; i < FLAKES; i++) this.seed(this.flakeSeeds, i);

    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(this.rainPositions, 3));
    this.rain = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({ color: 0xc6d4e2, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;

    const flakeGeometry = new THREE.BufferGeometry();
    flakeGeometry.setAttribute("position", new THREE.BufferAttribute(this.flakePositions, 3));
    this.flakes = new THREE.Points(
      flakeGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.11,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        map: softDisc(),
        alphaTest: 0.02,
      }),
    );
    this.flakes.frustumCulled = false;
    this.flakes.visible = false;
    scene.add(this.rain, this.flakes);
  }

  /** Called when a circuit is (re)built: its palette is the "fair weather" everything is measured against. */
  setCircuit(palette: CircuitPalette, theme: CircuitThemeId): void {
    this.palette = palette;
    this.theme = theme;
  }

  private seed(seeds: Float32Array, i: number): void {
    seeds[i * 3] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
  }

  update(dt: number, look: WeatherLook, conditions: TrackConditions): void {
    const targets = this.targets();
    if (!targets || !this.palette) return;
    this.time += dt;
    this.applySky(targets, look);
    this.applyRoad(targets, conditions);
    this.updateParticles(dt, look);
  }

  private applySky({ fog, hemisphere, sun, skyMaterial }: WeatherTargets, look: WeatherLook): void {
    const { palette } = this;
    if (!palette) return;
    const cloud = look.cloud;
    // Overcast skies are darker and greyer; the fog takes the same tint so the horizon still matches.
    const dark = 1 - 0.5 * cloud;
    const grey = 0.55 * cloud;
    const flash = look.flash;
    const tint = (out: THREE.Color, base: number) => {
      out.setHex(base);
      const luminance = (out.r + out.g + out.b) / 3;
      out.r += (luminance - out.r) * grey;
      out.g += (luminance - out.g) * grey;
      out.b += (luminance - out.b) * grey;
      out.multiplyScalar(dark);
      out.addScalar(flash * 0.6);
    };
    tint(fog.color, palette.fog.color);
    // The sky dome's colours are baked in fair weather; multiplying by white/grey rebuilds the tint.
    skyMaterial.color.setRGB(1, 1, 1).multiplyScalar(dark + flash * 0.9);
    skyMaterial.color.lerp(new THREE.Color(0.62, 0.66, 0.72).multiplyScalar(dark), grey);

    const visibility = Math.max(0.16, look.visibility);
    fog.far = Math.max(260, palette.fog.far * visibility);
    fog.near = Math.min(palette.fog.near * visibility, fog.far * 0.2);

    hemisphere.intensity = palette.light.hemiIntensity * (1 - 0.32 * cloud) + flash * 2.2;
    sun.intensity = palette.light.sunIntensity * (1 - 0.82 * cloud);
  }

  private applyRoad({ roadMaterial }: WeatherTargets, { water, loose }: TrackConditions): void {
    roadMaterial.roughness = 0.85 - 0.63 * water;
    roadMaterial.metalness = 0.05 + 0.2 * water;
    roadMaterial.color.setRGB(1, 1, 1).multiplyScalar(1 - 0.38 * water);
    // Snow, sand or ash lighten (or colour) the asphalt as a glow of its own so it shows through the dark texture.
    roadMaterial.emissive.setHex(COVER_COLOR[this.theme]).multiplyScalar(0.62 * loose);
  }

  private updateParticles(dt: number, look: WeatherLook): void {
    const p = look.precipitation;
    const strength = look.intensity;
    const cam = this.camera.position;
    this.rain.visible = p === "rain" && strength > 0.02;
    this.flakes.visible = (p === "snow" || p === "sand" || p === "ash") && strength > 0.02;
    if (this.rain.visible) this.updateRain(dt, strength, cam);
    if (this.flakes.visible) this.updateFlakes(dt, strength, cam, p as Exclude<Precipitation, "none" | "rain">);
  }

  private updateRain(dt: number, strength: number, cam: THREE.Vector3): void {
    const active = Math.floor(RAIN_DROPS * Math.min(1, strength));
    const fall = 26 + 8 * strength;
    const pos = this.rainPositions, seeds = this.rainSeeds;
    const half = BOX.width / 2;
    for (let i = 0; i < active; i++) {
      // Each drop keeps a position inside the box around the camera, falls, and re-enters at the top.
      const k = i * 3;
      let y = seeds[k + 1] * BOX.height - dt * fall;
      if (y < 0) y += BOX.height;
      seeds[k + 1] = y / BOX.height;
      const x = ((seeds[k] * BOX.width - cam.x - WIND.x * this.time + 1e6 * BOX.width) % BOX.width) - half + cam.x;
      const z = ((seeds[k + 2] * BOX.width - cam.z - WIND.z * this.time + 1e6 * BOX.width) % BOX.width) - half + cam.z;
      const top = cam.y - 4 + y;
      const o = i * 6;
      pos[o] = x;
      pos[o + 1] = top;
      pos[o + 2] = z;
      pos[o + 3] = x + WIND.x * 0.035;
      pos[o + 4] = top + 0.95;
      pos[o + 5] = z + WIND.z * 0.035;
    }
    for (let i = active; i < RAIN_DROPS; i++) pos.fill(0, i * 6, i * 6 + 6);
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.geometry.setDrawRange(0, active * 2);
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.28 + 0.3 * strength;
  }

  private updateFlakes(dt: number, strength: number, cam: THREE.Vector3, kind: Exclude<Precipitation, "none" | "rain">): void {
    const spec = PARTICLE[kind];
    if (kind !== this.flakeKind) {
      this.flakeKind = kind;
      const material = this.flakes.material as THREE.PointsMaterial;
      material.color.setHex(spec.color);
      material.size = spec.size;
      material.opacity = spec.opacity;
    }
    const active = Math.floor(FLAKES * Math.min(1, strength + 0.15));
    const pos = this.flakePositions, seeds = this.flakeSeeds;
    const half = BOX.width / 2;
    const horizontal = kind === "sand" ? spec.drift : WIND.x * 0.3;
    for (let i = 0; i < active; i++) {
      const k = i * 3;
      let y = seeds[k + 1] * BOX.height - dt * spec.fall;
      if (y < 0) y += BOX.height;
      seeds[k + 1] = y / BOX.height;
      const sway = Math.sin(this.time * 0.8 + i) * spec.drift * 0.15;
      const x = ((seeds[k] * BOX.width - cam.x - horizontal * this.time + 1e6 * BOX.width) % BOX.width) - half + cam.x + sway;
      const z = ((seeds[k + 2] * BOX.width - cam.z - WIND.z * 0.4 * this.time + 1e6 * BOX.width) % BOX.width) - half + cam.z;
      const yy = kind === "sand" ? cam.y - 3 + y * 0.35 : cam.y - 4 + y;
      pos[k] = x;
      pos[k + 1] = yy;
      pos[k + 2] = z;
    }
    this.flakes.geometry.attributes.position.needsUpdate = true;
    this.flakes.geometry.setDrawRange(0, active);
  }

  dispose(): void {
    for (const object of [this.rain, this.flakes]) {
      object.geometry.dispose();
      (object.material as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
      (object.material as THREE.Material).dispose();
      object.removeFromParent();
    }
  }
}
