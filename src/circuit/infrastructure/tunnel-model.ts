import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { TUNNEL, type TunnelSpan } from "@/circuit/domain/tunnel";
import type { CircuitPalette } from "./circuit-palette";
import { canvasTexture, paintNoise } from "./canvas-texture";

type Profile = readonly (readonly [number, number])[]; // (lateral, height) from the left base to the right base

const STATION_SAMPLES = 4; // one cross-section every few samples
const ARCH_STEPS = 14;
const HILL_HALF_WIDTH = 30;
const HILL_HEIGHT = 15;
/** Distance over which the hill shrinks toward each portal. */
const HILL_TAPER = 35;
const HILL_END_SCALE = 0.62;
const WALL_HEIGHT = 5.5;
const LIGHT_SPACING = 12;

/** Inner arch: straight walls topped by a half-ellipse. */
function archProfile(): Profile {
  const W = TUNNEL.archHalfWidth, H = TUNNEL.archHeight;
  const points: [number, number][] = [[-W, 0]];
  for (let k = 0; k <= ARCH_STEPS; k++) {
    const a = Math.PI - (k / ARCH_STEPS) * Math.PI;
    points.push([W * Math.cos(a), WALL_HEIGHT + (H - WALL_HEIGHT) * Math.sin(a)]);
  }
  points.push([W, 0]);
  return points;
}

/** The mound above the tunnel, with the same number of points as the arch. */
function hillProfile(scale: number, count: number): Profile {
  const points: [number, number][] = [[-HILL_HALF_WIDTH * scale, -1]];
  for (let k = 0; k <= count - 3; k++) {
    const a = Math.PI - (k / (count - 3)) * Math.PI;
    points.push([HILL_HALF_WIDTH * scale * Math.cos(a), HILL_HEIGHT * scale * Math.sin(a) + 1]);
  }
  points.push([HILL_HALF_WIDTH * scale, -1]);
  return points;
}

class MeshBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  vertex(x: number, y: number, z: number, u = 0, v = 0): number {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, b, d, c);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

function buildOneTunnel(
  root: THREE.Object3D,
  circuit: Circuit,
  span: TunnelSpan,
  materials: {
    hill: THREE.Material;
    portal: THREE.Material;
    inner: THREE.Material;
    floor: THREE.Material;
    lights: THREE.Material;
    reflectors: THREE.Material;
  },
): void {
  const first = Math.ceil(span.from / circuit.ds), last = Math.floor(span.to / circuit.ds);
  const stations: number[] = [];
  for (let i = first; i < last; i += STATION_SAMPLES) stations.push(i);
  stations.push(last);
  if (stations.length < 2) return;

  const arch = archProfile();
  const at = (i: number, lateral: number, height: number): [number, number, number] => [
    circuit.px[i] + circuit.rx[i] * lateral,
    circuit.elevation[i] + height,
    circuit.pz[i] + circuit.rz[i] * lateral,
  ];
  const taper = (i: number) => {
    const d = Math.min(i * circuit.ds - span.from, span.to - i * circuit.ds);
    const t = Math.min(1, Math.max(0, d / HILL_TAPER));
    return HILL_END_SCALE + (1 - HILL_END_SCALE) * t;
  };

  const hill = new MeshBuilder(), inner = new MeshBuilder(), portal = new MeshBuilder(), floor = new MeshBuilder();
  const floorEdges: [number, number][] = [];
  const rings: { hillRing: number[]; archRing: number[] }[] = [];
  stations.forEach((i, s) => {
    const outline = hillProfile(taper(i), arch.length);
    const hillRing = outline.map(([x, y], k) => hill.vertex(...at(i, x, y), k / arch.length, (i * circuit.ds) / 20));
    const archRing = arch.map(([x, y], k) => inner.vertex(...at(i, x, y), k / arch.length, (i * circuit.ds) / 10));
    rings.push({ hillRing, archRing });
    const w = TUNNEL.archHalfWidth;
    floorEdges.push([floor.vertex(...at(i, -w, 0.005)), floor.vertex(...at(i, w, 0.005))]);
    if (s === 0 || s === stations.length - 1) {
      const outer = outline.map(([x, y]) => portal.vertex(...at(i, x, y)));
      const rim = arch.map(([x, y]) => portal.vertex(...at(i, x, y)));
      for (let k = 0; k < arch.length - 1; k++) portal.quad(outer[k], outer[k + 1], rim[k], rim[k + 1]);
    }
  });
  for (let s = 0; s < rings.length - 1; s++) {
    for (let k = 0; k < arch.length - 1; k++) {
      hill.quad(rings[s].hillRing[k], rings[s].hillRing[k + 1], rings[s + 1].hillRing[k], rings[s + 1].hillRing[k + 1]);
      inner.quad(rings[s].archRing[k], rings[s].archRing[k + 1], rings[s + 1].archRing[k], rings[s + 1].archRing[k + 1]);
    }
  }

  for (let s = 0; s < floorEdges.length - 1; s++) {
    floor.quad(floorEdges[s][0], floorEdges[s][1], floorEdges[s + 1][0], floorEdges[s + 1][1]);
  }

  const hillMesh = new THREE.Mesh(hill.build(), materials.hill);
  hillMesh.castShadow = true;
  hillMesh.receiveShadow = true;
  root.add(hillMesh, new THREE.Mesh(inner.build(), materials.inner), new THREE.Mesh(portal.build(), materials.portal), new THREE.Mesh(floor.build(), materials.floor));

  // Ceiling lights (three rows) and wall reflectors.
  const lights = new MeshBuilder(), reflectors = new MeshBuilder();
  const ceiling = (x: number) => WALL_HEIGHT + (TUNNEL.archHeight - WALL_HEIGHT) * Math.sqrt(Math.max(0, 1 - (x / TUNNEL.archHalfWidth) ** 2)) - 0.06;
  for (let d = Math.ceil(span.from / LIGHT_SPACING) * LIGHT_SPACING + 6; d < span.to - 4; d += LIGHT_SPACING) {
    const i = circuit.indexAt(d), j = circuit.indexAt(d + 4);
    for (const x of [-7, 0, 7]) {
      const w = 0.45;
      lights.quad(
        lights.vertex(...at(i, x - w, ceiling(x - w))), lights.vertex(...at(i, x + w, ceiling(x + w))),
        lights.vertex(...at(j, x - w, ceiling(x - w))), lights.vertex(...at(j, x + w, ceiling(x + w))),
      );
    }
    for (const side of [-1, 1]) {
      const x = side * (TUNNEL.archHalfWidth - 0.05);
      reflectors.quad(
        reflectors.vertex(...at(i, x, 0.7)), reflectors.vertex(...at(i, x, 1.1)),
        reflectors.vertex(...at(j, x, 0.7)), reflectors.vertex(...at(j, x, 1.1)),
      );
    }
  }
  root.add(new THREE.Mesh(lights.build(), materials.lights), new THREE.Mesh(reflectors.build(), materials.reflectors));
}

/** Tunnels through grassy (or snowy, rocky…) mounds, lit from the inside. */
export function buildTunnels(root: THREE.Object3D, circuit: Circuit, palette: CircuitPalette, anisotropy: number): void {
  if (!circuit.tunnels.length) return;
  const hillTexture = canvasTexture(256, (g, s) => paintNoise(g, s, "#ececec", 0.3, 9000), anisotropy);
  hillTexture.repeat.set(1, 1);
  const materials = {
    hill: new THREE.MeshStandardMaterial({ color: palette.tunnelHill, map: hillTexture, roughness: 1, side: THREE.DoubleSide }),
    portal: new THREE.MeshStandardMaterial({ color: 0xb8bbc2, roughness: 0.9, side: THREE.DoubleSide }),
    inner: new THREE.MeshBasicMaterial({ color: 0x33363e, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0x4a4d54, roughness: 0.95, side: THREE.DoubleSide }),
    lights: new THREE.MeshBasicMaterial({ color: 0xfff1c4, side: THREE.DoubleSide, fog: false }),
    reflectors: new THREE.MeshBasicMaterial({ color: 0xff8a1e, side: THREE.DoubleSide }),
  };
  for (const span of circuit.tunnels) buildOneTunnel(root, circuit, span, materials);
}
