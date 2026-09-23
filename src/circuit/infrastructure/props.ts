import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { isInStartZone } from "@/circuit/domain/elevation-profile";
import type { Terrain, TerrainExtent } from "@/circuit/domain/terrain";
import { distanceToTunnel } from "@/circuit/domain/tunnel";
import type { RandomSource } from "@/shared/domain/math";
import type { CircuitPalette, PropKind } from "./circuit-palette";

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Tinted per instance (leaves) instead of using the material colour as is. */
  tinted?: (random: RandomSource, out: THREE.Color) => void;
}

interface PropDefinition {
  parts: Part[];
  scale: readonly [number, number];
  casts?: boolean;
  /** Random lean, in radians. */
  lean?: number;
}

const std = (color: number, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function definition(kind: PropKind, palette: CircuitPalette): PropDefinition {
  switch (kind) {
    case "pine":
      return {
        scale: [0.7, 1.5],
        casts: true,
        parts: [
          { geometry: new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0), material: std(0x5b3a21) },
          {
            geometry: new THREE.ConeGeometry(2.8, 8, 8).translate(0, 7, 0),
            material: std(0xffffff),
            tinted: (r, c) => c.setHSL(0.27 + r() * 0.08, 0.5, 0.2 + r() * 0.12),
          },
        ],
      };
    case "snow-pine":
      return {
        scale: [0.7, 1.5],
        casts: true,
        parts: [
          { geometry: new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0), material: std(0x4a3a30) },
          {
            geometry: new THREE.ConeGeometry(2.8, 8, 8).translate(0, 7, 0),
            material: std(0xffffff),
            tinted: (r, c) => c.setHSL(0.55 + r() * 0.05, 0.25 + r() * 0.2, 0.82 + r() * 0.12),
          },
        ],
      };
    case "ice-spike":
      return {
        scale: [0.6, 2.4],
        lean: 0.18,
        parts: [
          {
            geometry: new THREE.ConeGeometry(1.6, 9, 5).translate(0, 4.5, 0),
            material: std(0xffffff, 0.08, { metalness: 0.2, transparent: true, opacity: 0.82 }),
            tinted: (r, c) => c.setHSL(0.53 + r() * 0.05, 0.6, 0.72 + r() * 0.15),
          },
        ],
      };
    case "cactus":
      return {
        scale: [0.7, 1.5],
        casts: true,
        parts: [
          {
            geometry: (() => {
              const trunk = new THREE.CylinderGeometry(0.45, 0.55, 5, 8).translate(0, 2.5, 0);
              return mergeInto(trunk, [
                new THREE.CylinderGeometry(0.3, 0.3, 1.8, 6).rotateZ(Math.PI / 2).translate(-0.9, 2.6, 0),
                new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6).translate(-1.7, 3.4, 0),
                new THREE.CylinderGeometry(0.3, 0.3, 1.6, 6).rotateZ(Math.PI / 2).translate(0.9, 3.4, 0),
                new THREE.CylinderGeometry(0.28, 0.28, 1.4, 6).translate(1.7, 4.1, 0),
              ]);
            })(),
            material: std(0x4f7d3c),
            tinted: (r, c) => c.setHSL(0.27 + r() * 0.05, 0.4, 0.28 + r() * 0.1),
          },
        ],
      };
    case "dead-tree":
      return {
        scale: [0.7, 1.6],
        casts: true,
        lean: 0.12,
        parts: [
          {
            geometry: mergeInto(new THREE.CylinderGeometry(0.15, 0.4, 6, 5).translate(0, 3, 0), [
              new THREE.CylinderGeometry(0.05, 0.14, 2.6, 4).rotateZ(0.9).translate(1.0, 4.4, 0),
              new THREE.CylinderGeometry(0.05, 0.12, 2.2, 4).rotateZ(-0.8).translate(-0.9, 3.6, 0),
            ]),
            material: std(0x1c1614),
          },
        ],
      };
    case "rock":
      return {
        scale: [0.6, 2.8],
        casts: true,
        lean: 0.5,
        parts: [
          {
            geometry: new THREE.DodecahedronGeometry(1.4, 0).scale(1.2, 0.7, 1).translate(0, 0.4, 0),
            material: std(0xffffff, 1, { flatShading: true }),
            tinted: (r, c) => c.setHex(palette.ground.rock).multiplyScalar(0.8 + r() * 0.5),
          },
        ],
      };
  }
}

/** Concatenates simple geometries (position/normal/uv only) into one. */
function mergeInto(first: THREE.BufferGeometry, others: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const all = [first, ...others].map((g) => g.toNonIndexed());
  const attrs = ["position", "normal", "uv"] as const;
  const merged = new THREE.BufferGeometry();
  for (const name of attrs) {
    const size = all[0].attributes[name].itemSize;
    const data = new Float32Array(all.reduce((sum, g) => sum + g.attributes[name].count * size, 0));
    let offset = 0;
    for (const g of all) {
      data.set(g.attributes[name].array as Float32Array, offset);
      offset += g.attributes[name].count * size;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  return merged;
}

/** Area of the terrain the scenery counts were tuned for; larger circuits get proportionally more props. */
const REFERENCE_AREA = 2.4e6;

/** How many times more scenery a terrain of this size needs to look as full as the original circuit. */
export function sceneryDensity(extent: TerrainExtent): number {
  const area = (extent.maxX - extent.minX) * (extent.maxZ - extent.minZ);
  return Math.min(6, Math.max(1, (area / REFERENCE_AREA) ** 0.9));
}

/** Scatters the theme's trees, rocks and crystals over the terrain, clear of the track. */
export function buildProps(
  root: THREE.Object3D,
  circuit: Circuit,
  terrain: Terrain,
  palette: CircuitPalette,
  random: RandomSource,
): void {
  const { extent, profile } = terrain;
  // Stay within a stone's throw of the track rather than filling the whole terrain.
  const inset = 250;
  const minX = extent.minX + inset, maxX = extent.maxX - inset, minZ = extent.minZ + inset, maxZ = extent.maxZ - inset;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const euler = new THREE.Euler(), color = new THREE.Color();

  const density = sceneryDensity(extent);
  for (const { kind, count: baseCount } of palette.props) {
    const count = Math.round(baseCount * density);
    const def = definition(kind, palette);
    const meshes = def.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
      mesh.castShadow = !!def.casts;
      return mesh;
    });

    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 25; tries++) {
      const x = minX + random() * (maxX - minX), z = minZ + random() * (maxZ - minZ);
      const near = terrain.nearest(x, z);
      if (near) {
        const wall = Math.max(circuit.wallL[near.index], circuit.wallR[near.index]);
        if (near.distance < wall + 10 + random() * 20) continue;
        // Keep the grandstand area beside the main straight clear.
        if (near.distance < 60 && isInStartZone(near.index * circuit.ds, circuit.length)) continue;
        // Leave the hills over tunnels bare.
        if (near.distance < 48 && distanceToTunnel(circuit.tunnels, near.index * circuit.ds) < 70) continue;
      }
      const y = terrain.heightAt(x, z);
      if (profile.liquidLevel !== null && y < profile.liquidLevel + 0.6) continue;

      const scale = def.scale[0] + random() * (def.scale[1] - def.scale[0]);
      s.set(scale, scale * (0.8 + random() * 0.5), scale);
      const lean = def.lean ?? 0;
      euler.set((random() - 0.5) * lean, random() * Math.PI * 2, (random() - 0.5) * lean);
      q.setFromEuler(euler);
      m.compose(p.set(x, y, z), q, s);
      def.parts.forEach((part, k) => {
        meshes[k].setMatrixAt(placed, m);
        if (part.tinted) {
          part.tinted(random, color);
          meshes[k].setColorAt(placed, color);
        }
      });
      placed++;
    }
    for (const mesh of meshes) {
      mesh.count = placed;
      root.add(mesh);
    }
  }
}
