import * as THREE from "three";
import type { Terrain } from "@/circuit/domain/terrain";
import { clamp } from "@/shared/domain/math";
import type { CircuitPalette } from "./circuit-palette";
import { canvasTexture, FLAT_RENDER_ORDER, paintNoise } from "./canvas-texture";

const CELL = 14; // metres between terrain vertices
const TEXTURE_TILE = 9; // metres per repeat of the ground texture
const FAR_GROUND = 8000;

const tint = new THREE.Color();
const rockTint = new THREE.Color();

/** Ground colour from height, slope and a little variation. */
function groundColor(
  out: THREE.Color,
  palette: CircuitPalette["ground"],
  height: number,
  steepness: number,
  variation: number,
  liquidLevel: number | null,
  hillHeight: number,
): void {
  out.setHex(palette.a).lerp(tint.setHex(palette.b), variation);
  const high = clamp((height - hillHeight * 0.55) / (hillHeight * 0.4 + 1), 0, 1);
  if (high > 0) out.lerp(tint.setHex(palette.high), high);
  if (liquidLevel !== null) {
    const shore = clamp(1 - (height - liquidLevel) / 2.2, 0, 1);
    if (shore > 0) out.lerp(tint.setHex(palette.shore), shore);
  }
  const rock = clamp((steepness - 0.18) / 0.22, 0, 1);
  if (rock > 0) out.lerp(rockTint.setHex(palette.rock), rock);
}

function liquidTexture(palette: NonNullable<CircuitPalette["liquid"]>, anisotropy: number): THREE.CanvasTexture {
  const base = new THREE.Color(palette.color);
  const hex = (c: THREE.Color) => `#${c.getHexString()}`;
  return canvasTexture(256, (g, s) => {
    g.fillStyle = hex(base);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      const light = palette.glows ? Math.random() < 0.5 : Math.random() < 0.7;
      g.fillStyle = light ? "rgba(255,240,180,0.22)" : "rgba(0,0,0,0.2)";
      g.beginPath();
      g.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 22, 2 + Math.random() * 10, Math.random() * 3, 0, 7);
      g.fill();
    }
  }, anisotropy);
}

/** Textured height-field around the circuit, plus liquid in the basins and a far plane. */
export function buildTerrain(
  root: THREE.Object3D,
  terrain: Terrain,
  palette: CircuitPalette,
  anisotropy: number,
): void {
  const { extent, profile } = terrain;
  const nx = Math.ceil((extent.maxX - extent.minX) / CELL), nz = Math.ceil((extent.maxZ - extent.minZ) / CELL);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  const col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      const v = iz * (nx + 1) + ix;
      const x = extent.minX + ix * CELL, z = extent.minZ + iz * CELL;
      const y = terrain.heightAt(x, z);
      heights[v] = y;
      pos.set([x, y, z], v * 3);
      uv.set([x / TEXTURE_TILE, z / TEXTURE_TILE], v * 2);
    }
  }
  const index: number[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  const normals = geometry.attributes.normal;
  const color = new THREE.Color();
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      const v = iz * (nx + 1) + ix;
      const variation = 0.5 + 0.5 * Math.sin(ix * 0.37 + Math.sin(iz * 0.23) * 2) * Math.cos(iz * 0.31);
      groundColor(color, palette.ground, heights[v], 1 - normals.getY(v), variation, profile.liquidLevel, profile.hills);
      col.set([color.r, color.g, color.b], v * 3);
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));

  const texture = canvasTexture(256, (g, s) => paintNoise(g, s, "#ececec", 0.3, 9000), anisotropy);
  const ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1, metalness: 0 }),
  );
  ground.receiveShadow = true;
  ground.renderOrder = FLAT_RENDER_ORDER.ground;
  root.add(ground);

  // Far plane beyond the height-field, level with its rim.
  const farTexture = canvasTexture(256, (g, s) => paintNoise(g, s, "#ececec", 0.3, 9000), anisotropy);
  farTexture.repeat.set(FAR_GROUND / TEXTURE_TILE, FAR_GROUND / TEXTURE_TILE);
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(FAR_GROUND, FAR_GROUND),
    new THREE.MeshStandardMaterial({ map: farTexture, color: palette.ground.a, roughness: 1 }),
  );
  far.rotation.x = -Math.PI / 2;
  far.position.set((extent.minX + extent.maxX) / 2, -0.15, (extent.minZ + extent.maxZ) / 2);
  far.renderOrder = FLAT_RENDER_ORDER.ground - 1;
  root.add(far);

  if (palette.liquid && profile.liquidLevel !== null) {
    const { liquid } = palette;
    const liquidMap = liquidTexture(liquid, anisotropy);
    liquidMap.repeat.set((extent.maxX - extent.minX) / 60, (extent.maxZ - extent.minZ) / 60);
    const material = liquid.glows
      ? new THREE.MeshBasicMaterial({ map: liquidMap, color: 0xffffff })
      : new THREE.MeshStandardMaterial({ map: liquidMap, roughness: liquid.roughness, metalness: 0.25 });
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(extent.maxX - extent.minX, extent.maxZ - extent.minZ),
      material,
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.set((extent.minX + extent.maxX) / 2, profile.liquidLevel, (extent.minZ + extent.maxZ) / 2);
    root.add(surface);
  }
}
