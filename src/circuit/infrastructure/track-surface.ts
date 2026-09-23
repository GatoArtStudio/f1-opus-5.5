import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { canvasTexture, FLAT_RENDER_ORDER, paintNoise } from "./canvas-texture";

export interface GridSlotMark {
  dist: number;
  lateral: number;
}

/** Ribbon along the circuit between two lateral offsets (functions of index). */
function ribbon(
  circuit: Circuit,
  inner: (i: number) => number,
  outer: (i: number) => number,
  y: number,
  vScale: number,
): THREE.BufferGeometry {
  const N = circuit.n;
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const idx: number[] = [];
  for (let k = 0; k <= N; k++) {
    const i = k % N;
    const a = inner(i), b = outer(i);
    pos.set(
      [
        circuit.px[i] + circuit.rx[i] * a, y, circuit.pz[i] + circuit.rz[i] * a,
        circuit.px[i] + circuit.rx[i] * b, y, circuit.pz[i] + circuit.rz[i] * b,
      ],
      k * 6,
    );
    const v = (k * circuit.ds) / vScale;
    uv.set([0, v, 1, v], k * 4);
    if (k < N) {
      const o = k * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildRoad(scene: THREE.Scene, circuit: Circuit, anisotropy: number): void {
  const hw = circuit.halfWidth;
  const tex = canvasTexture(256, (g, s) => {
    paintNoise(g, s, "#3a3b3e", 0.22, 14000);
    g.fillStyle = "#e8e8e8";
    g.fillRect(0, 0, 6, s);
    g.fillRect(s - 6, 0, 6, s);
  }, anisotropy);
  const road = new THREE.Mesh(
    ribbon(circuit, () => -hw, () => hw, 0.02, 10),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, depthWrite: false }),
  );
  road.receiveShadow = true;
  road.renderOrder = FLAT_RENDER_ORDER.road;
  scene.add(road);

  // Darker rubbered-in racing line.
  const line = new THREE.Mesh(
    ribbon(circuit, (i) => circuit.lineOffset[i] - 1.2, (i) => circuit.lineOffset[i] + 1.2, 0.025, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  line.renderOrder = FLAT_RENDER_ORDER.marks;
  scene.add(line);
}

export function buildKerbs(scene: THREE.Scene, circuit: Circuit): void {
  const N = circuit.n, hw = circuit.halfWidth, kw = circuit.kerbWidth;
  // Kerbs only where the track bends, dilated to cover entry and exit.
  const on = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (Math.abs(circuit.curv[i]) > 1 / 320) for (let k = -8; k <= 8; k++) on[circuit.wrap(i + k)] = 1;
  }
  const pos: number[] = [], col: number[] = [];
  const red = new THREE.Color(0xd4161c), white = new THREE.Color(0xf2f2f2);
  for (let i = 0; i < N; i++) {
    if (!on[i]) continue;
    const j = circuit.wrap(i + 1);
    const c = Math.floor(i / 2) % 2 ? red : white;
    for (const side of [-1, 1]) {
      const corners: [number, number, number][] = [
        [i, hw, 0.03], [i, hw + kw, 0.09], [j, hw, 0.03], [j, hw + kw, 0.09],
      ];
      const pts = corners.map(([k, off, y]) => [
        circuit.px[k] + circuit.rx[k] * off * side, y, circuit.pz[k] + circuit.rz[k] * off * side,
      ]);
      const tri = side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3];
      for (const t of tri) {
        pos.push(...pts[t]);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, depthWrite: false }));
  m.receiveShadow = true;
  m.renderOrder = FLAT_RENDER_ORDER.marks;
  scene.add(m);
}

/** Flat plane lying on the ground, rotated to face across the track. */
function groundPlate(geometry: THREE.PlaneGeometry, material: THREE.Material, x: number, z: number, heading: number) {
  const m = new THREE.Mesh(geometry, material);
  m.rotation.order = "YXZ";
  m.rotation.set(-Math.PI / 2, heading, 0);
  m.position.set(x, 0.03, z);
  m.renderOrder = FLAT_RENDER_ORDER.marks;
  return m;
}

export function buildStartLine(scene: THREE.Scene, circuit: Circuit, gridSlots: readonly GridSlotMark[]): void {
  const tex = canvasTexture(128, (g, s) => {
    const n = 8;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#f5f5f5";
        g.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
      }
    }
  });
  tex.repeat.set(4, 1);
  scene.add(
    groundPlate(
      new THREE.PlaneGeometry(circuit.halfWidth * 2, 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, depthWrite: false }),
      circuit.px[0], circuit.pz[0], circuit.headingAt(0),
    ),
  );

  const slotGeo = new THREE.PlaneGeometry(2.6, 0.25);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, depthWrite: false });
  for (const { dist, lateral } of gridSlots) {
    const p = circuit.pointAt(dist + 3.2, lateral);
    scene.add(groundPlate(slotGeo, slotMat, p.x, p.z, circuit.headingAt(circuit.indexAt(dist))));
  }
}
