import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { isInStartZone } from "@/circuit/domain/elevation-profile";
import type { Terrain } from "@/circuit/domain/terrain";
import { distanceToTunnel } from "@/circuit/domain/tunnel";
import type { RandomSource } from "@/shared/domain/math";
import { canvasTexture } from "./canvas-texture";

const BUILDINGS = 170;
/** Metres of facade covered by one repeat of the window texture. */
const FACADE_TILE = 16;
const MIN_GAP_TO_TRACK = 26;

interface Footprint {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  angle: number;
  base: number;
}

function windowTexture(random: RandomSource, anisotropy: number): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = "#1a1d26";
    g.fillRect(0, 0, s, s);
    const cell = s / 4, inset = 9;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const lit = random() < 0.42;
        g.fillStyle = lit ? (random() < 0.7 ? "#ffd58a" : "#bfe3ff") : "#2a3142";
        g.fillRect(col * cell + inset, row * cell + inset + 6, cell - inset * 2, cell - inset * 2 - 6);
      }
    }
  }, anisotropy);
}

/** All footprints merged into one mesh: four textured walls and a roof each. */
function buildingGeometry(footprints: Footprint[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const tint = new THREE.Color();
  let base = 0;
  const quad = (a: number[], b: number[], c: number[], d: number[], uvs: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c, ...d);
    uv.push(...uvs);
    for (let k = 0; k < 4; k++) col.push(color.r, color.g, color.b);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  };
  for (const f of footprints) {
    const cos = Math.cos(f.angle), sin = Math.sin(f.angle);
    const corner = (dx: number, dz: number, y: number) => [f.x + dx * cos - dz * sin, y, f.z + dx * sin + dz * cos];
    const hw = f.width / 2, hd = f.depth / 2;
    const bottom = f.base - 3, top = f.base + f.height;
    const shade = 0.55 + ((f.x * 7 + f.z * 13) % 1 + 1) % 1 * 0.45;
    tint.setRGB(shade, shade * 0.98, shade * 1.05);
    const walls: [number, number, number, number, number][] = [
      [-hw, -hd, hw, -hd, f.width], [hw, -hd, hw, hd, f.depth], [hw, hd, -hw, hd, f.width], [-hw, hd, -hw, -hd, f.depth],
    ];
    for (const [x0, z0, x1, z1, length] of walls) {
      const u = length / FACADE_TILE, v = (top - bottom) / FACADE_TILE;
      quad(corner(x0, z0, bottom), corner(x1, z1, bottom), corner(x1, z1, top), corner(x0, z0, top), [0, 0, u, 0, u, v, 0, v], tint);
    }
    const roof = tint.clone().multiplyScalar(0.5);
    quad(corner(-hw, -hd, top), corner(hw, -hd, top), corner(hw, hd, top), corner(-hw, hd, top), [0.02, 0.02, 0.03, 0.02, 0.03, 0.03, 0.02, 0.03], roof);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** City blocks around the circuit, kept clear of the road, the stands and the tunnel hills. */
export function buildBuildings(
  root: THREE.Object3D,
  circuit: Circuit,
  terrain: Terrain,
  random: RandomSource,
  anisotropy: number,
): void {
  const footprints: Footprint[] = [];
  for (let tries = 0; footprints.length < BUILDINGS && tries < BUILDINGS * 60; tries++) {
    const i = Math.floor(random() * circuit.n);
    const side = random() < 0.5 ? -1 : 1;
    const width = 18 + random() * 30, depth = 18 + random() * 30;
    const offset = Math.max(circuit.wallL[i], circuit.wallR[i]) + MIN_GAP_TO_TRACK + Math.max(width, depth) / 2 + random() * 170;
    const x = circuit.px[i] + circuit.rx[i] * offset * side, z = circuit.pz[i] + circuit.rz[i] * offset * side;

    const reach = Math.hypot(width, depth) / 2;
    const near = terrain.nearest(x, z);
    if (near) {
      const wall = Math.max(circuit.wallL[near.index], circuit.wallR[near.index]);
      if (near.distance < wall + MIN_GAP_TO_TRACK + reach * 0.7) continue;
      if (near.distance < 130 && isInStartZone(near.index * circuit.ds, circuit.length, 40)) continue;
      if (near.distance < 60 && distanceToTunnel(circuit.tunnels, near.index * circuit.ds) < 90) continue;
    }
    if (footprints.some((o) => Math.hypot(o.x - x, o.z - z) < (Math.hypot(o.width, o.depth) + Math.hypot(width, depth)) / 2 + 6)) continue;

    const towering = random() < 0.16;
    const height = towering ? 90 + random() * 90 : 16 + random() * 60;
    const angle = circuit.headingAt(i) + (random() < 0.7 ? 0 : random() * Math.PI);
    const base = Math.min(
      terrain.heightAt(x, z),
      terrain.heightAt(x + reach, z),
      terrain.heightAt(x - reach, z),
      terrain.heightAt(x, z + reach),
      terrain.heightAt(x, z - reach),
    );
    footprints.push({ x, z, width, depth, height, angle, base });
  }
  if (!footprints.length) return;

  const facade = windowTexture(random, anisotropy);
  const mesh = new THREE.Mesh(
    buildingGeometry(footprints),
    new THREE.MeshStandardMaterial({
      map: facade,
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0xffffff,
      emissiveMap: facade,
      emissiveIntensity: 0.85,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}

/** Street lamps every few dozen metres just outside the barriers. */
export function buildStreetLamps(root: THREE.Object3D, circuit: Circuit): void {
  const spacing = 44;
  const pole = new THREE.CylinderGeometry(0.16, 0.22, 9, 6).translate(0, 4.5, 0);
  const arm = new THREE.BoxGeometry(0.16, 0.16, 2.6).translate(0, 9, 1.2);
  const head = new THREE.BoxGeometry(0.7, 0.18, 1.1).translate(0, 8.9, 2.4);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.5, metalness: 0.6 });
  const light = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffd58a, emissiveIntensity: 2.5 });

  const spots: { x: number; y: number; z: number; heading: number }[] = [];
  for (let d = 0; d < circuit.length; d += spacing) {
    const i = circuit.indexAt(d);
    if (isInStartZone(d, circuit.length, 20) || distanceToTunnel(circuit.tunnels, d) < 60) continue;
    for (const side of [-1, 1]) {
      const off = (side > 0 ? circuit.wallR[i] : circuit.wallL[i]) + 1.8;
      spots.push({
        x: circuit.px[i] + circuit.rx[i] * off * side,
        y: circuit.elevation[i],
        z: circuit.pz[i] + circuit.rz[i] * off * side,
        heading: Math.atan2(-circuit.rx[i] * side, -circuit.rz[i] * side), // arm points over the road
      });
    }
  }
  if (!spots.length) return;

  const poles = new THREE.InstancedMesh(pole, metal, spots.length);
  const arms = new THREE.InstancedMesh(arm, metal, spots.length);
  const heads = new THREE.InstancedMesh(head, light, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  spots.forEach((s, k) => {
    m.compose(new THREE.Vector3(s.x, s.y - 0.4, s.z), q.setFromAxisAngle(up, s.heading), one);
    poles.setMatrixAt(k, m);
    arms.setMatrixAt(k, m);
    heads.setMatrixAt(k, m);
  });
  poles.castShadow = true;
  root.add(poles, arms, heads);
}
