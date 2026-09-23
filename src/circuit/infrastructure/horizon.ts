import * as THREE from "three";
import type { Terrain } from "@/circuit/domain/terrain";
import type { RandomSource } from "@/shared/domain/math";
import type { CircuitPalette } from "./circuit-palette";

const RING_RADIUS: readonly [number, number] = [1350, 1900];

/** Distant mountains all around, plus a smoking volcano for the volcanic theme. */
export function buildHorizon(root: THREE.Object3D, terrain: Terrain, palette: CircuitPalette, random: RandomSource): void {
  const { extent } = terrain;
  const cx = (extent.minX + extent.maxX) / 2, cz = (extent.minZ + extent.maxZ) / 2;
  const { mountains } = palette;

  const rock = new THREE.MeshStandardMaterial({ color: mountains.color, roughness: 1, flatShading: true });
  const cap = mountains.cap === null ? null : new THREE.MeshStandardMaterial({ color: mountains.cap, roughness: 0.9, flatShading: true });
  for (let k = 0; k < mountains.count; k++) {
    const angle = ((k + random() * 0.8) / mountains.count) * Math.PI * 2;
    const distance = RING_RADIUS[0] + random() * (RING_RADIUS[1] - RING_RADIUS[0]);
    const height = mountains.height[0] + random() * (mountains.height[1] - mountains.height[0]);
    const radius = height * (0.9 + random() * 0.9);
    const x = cx + Math.cos(angle) * distance, z = cz + Math.sin(angle) * distance;

    const peak = new THREE.ConeGeometry(radius, height, 6 + Math.floor(random() * 3), 1).translate(0, height / 2 - 30, 0);
    const mesh = new THREE.Mesh(peak, rock);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = random() * Math.PI;
    root.add(mesh);
    if (cap) {
      const snow = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.34, height * 0.34, 6, 1).translate(0, height * 0.83 - 30, 0), cap);
      snow.position.copy(mesh.position);
      snow.rotation.y = mesh.rotation.y;
      root.add(snow);
    }
  }

  if (palette.volcano) buildVolcano(root, cx, cz, random);
}

function buildVolcano(root: THREE.Object3D, cx: number, cz: number, random: RandomSource): void {
  const angle = random() * Math.PI * 2, distance = 1500;
  const x = cx + Math.cos(angle) * distance, z = cz + Math.sin(angle) * distance;
  const height = 520, base = 780, craterRadius = 110;

  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(craterRadius, base, height, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x241d1b, roughness: 1, flatShading: true }),
  );
  cone.position.set(x, height / 2 - 40, z);
  root.add(cone);

  // Molten crater and the glow above it.
  const lava = new THREE.Mesh(
    new THREE.CircleGeometry(craterRadius * 0.95, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false }),
  );
  lava.position.set(x, height - 42, z);
  root.add(lava);

  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(craterRadius * 2.4, 420, 16, 1, true).translate(0, 210, 0),
    new THREE.MeshBasicMaterial({
      color: 0xff5a1a,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  glow.position.set(x, height - 42, z);
  root.add(glow);

  // Lava streaks running down the slopes.
  const streak = new THREE.MeshBasicMaterial({ color: 0xff5010, fog: false });
  for (let k = 0; k < 7; k++) {
    const t = (k + random() * 0.6) / 7 * Math.PI * 2;
    const length = 240 + random() * 200;
    const rim = new THREE.Vector3(Math.cos(t) * craterRadius, height - 40, Math.sin(t) * craterRadius);
    const foot = new THREE.Vector3(Math.cos(t + (random() - 0.5) * 0.4) * (base * 0.75), height - 40 - length, Math.sin(t) * (base * 0.75));
    const mid = rim.clone().lerp(foot, 0.5);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(9, 9, rim.distanceTo(foot)), streak);
    strip.position.set(x + mid.x, mid.y - 40 + 40, z + mid.z);
    strip.lookAt(x + foot.x, foot.y, z + foot.z);
    root.add(strip);
  }
}
