import * as THREE from "three";
import type { Circuit, TrackPosition } from "@/circuit/domain/circuit";
import { canvasTexture, FLAT_RENDER_ORDER, paintNoise } from "./canvas-texture";

export function buildSky(scene: THREE.Scene): void {
  const radius = 4000;
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const top = new THREE.Color(0x2f6fc4), horizon = new THREE.Color(0xcfe3f2), below = new THREE.Color(0x9fb8a0);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius;
    if (y > 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6));
    else c.copy(horizon).lerp(below, Math.min(1, -y * 8));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = FLAT_RENDER_ORDER.sky;
  scene.add(sky);
}

export function buildGround(scene: THREE.Scene, anisotropy: number): void {
  const tex = canvasTexture(256, (g, s) => {
    paintNoise(g, s, "#4b7d2e", 0.18, 9000);
    g.fillStyle = "rgba(255,255,255,0.05)"; // mowing stripes
    g.fillRect(0, 0, s / 2, s);
  }, anisotropy);
  tex.repeat.set(200, 200);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = FLAT_RENDER_ORDER.ground;
  scene.add(ground);
}

export function buildBarriers(scene: THREE.Scene, circuit: Circuit, anisotropy: number): void {
  // Red/white blocks with a blue advertising band on top.
  const tex = canvasTexture(256, (g, s) => {
    g.fillStyle = "#c62828";
    g.fillRect(0, 0, s / 2, s);
    g.fillStyle = "#eeeeee";
    g.fillRect(s / 2, 0, s / 2, s);
    g.fillStyle = "#0d47a1";
    g.fillRect(0, 0, s, s * 0.3);
    g.fillStyle = "#ffffff";
    g.font = "bold 48px system-ui, sans-serif";
    g.textBaseline = "middle";
    g.fillText("WEB GP", 36, s * 0.15);
  }, anisotropy);
  const N = circuit.n, height = 1.1;
  const material = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 });
  for (const side of [1, -1]) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const off = side > 0 ? circuit.wallR[i] : -circuit.wallL[i];
      const x = circuit.px[i] + circuit.rx[i] * off, z = circuit.pz[i] + circuit.rz[i] * off;
      pos.push(x, 0, z, x, height, z);
      const u = (k * circuit.ds) / 2;
      uv.push(u, 0, u, 1);
      if (k < N) {
        const o = k * 2;
        idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const wall = new THREE.Mesh(g, material);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }
}

export interface StartGantry {
  setLit(count: number): void;
}

export function buildStartGantry(scene: THREE.Scene, circuit: Circuit): StartGantry {
  const i = circuit.indexAt(6);
  const group = new THREE.Group();
  group.position.set(circuit.px[i], 0, circuit.pz[i]);
  group.rotation.y = circuit.headingAt(i);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.5, metalness: 0.6 });
  const span = circuit.halfWidth + 3;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), metal);
    post.position.set(s * span, 4, 0);
    post.castShadow = true;
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.6, 1.4, 0.8), metal);
  beam.position.set(0, 7.4, 0);
  beam.castShadow = true;
  group.add(beam);

  const podMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
  const bulbGeo = new THREE.CircleGeometry(0.35, 16);
  const lights: THREE.MeshStandardMaterial[] = [];
  for (let k = 0; k < 5; k++) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.5), podMat);
    pod.position.set((k - 2) * 1.6, 6.2, -0.4);
    group.add(pod);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000 });
    for (const y of [0.5, -0.5]) {
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set((k - 2) * 1.6, 6.2 + y, -0.66);
      bulb.rotation.y = Math.PI; // faces the grid
      group.add(bulb);
    }
    lights.push(bulbMat);
  }
  scene.add(group);

  return {
    setLit(count) {
      lights.forEach((m, k) => {
        const on = k < count;
        m.emissive.setHex(on ? 0xff1010 : 0x000000);
        m.emissiveIntensity = on ? 3 : 0;
        m.color.setHex(on ? 0xff2020 : 0x220000);
      });
    },
  };
}

export function buildGrandstands(scene: THREE.Scene, circuit: Circuit): void {
  const crowd = canvasTexture(256, (g, s) => {
    g.fillStyle = "#3a3f4a";
    g.fillRect(0, 0, s, s);
    const cols = ["#e53935", "#fdd835", "#ffffff", "#1e88e5", "#fb8c00", "#43a047", "#f06292", "#222"];
    for (let y = 0; y < s; y += 8) {
      for (let x = 0; x < s; x += 6) {
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.fillRect(x + Math.random() * 2, y + Math.random() * 2, 4, 5);
      }
    }
  });
  const seatMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9, side: THREE.DoubleSide });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xb0b6bf, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, side: THREE.DoubleSide });
  const len = 70, depth = 18, height = 12, hl = len / 2;

  // Wedge-shaped stand in local space: +Z along the track, the track lies
  // toward -X (stands sit on the left of the main straight), rising to +X.
  const wedge = new THREE.BufferGeometry();
  wedge.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, -hl, 0, 0, hl, 0, 1.5, -hl, 0, 1.5, hl,
    depth, height, -hl, depth, height, hl, depth, 0, -hl, depth, 0, hl,
  ], 3));
  wedge.setIndex([0, 1, 2, 2, 1, 3, 6, 4, 7, 7, 4, 5, 0, 6, 1, 1, 6, 7, 0, 2, 6, 6, 2, 4, 1, 7, 3, 3, 7, 5]);
  wedge.computeVertexNormals();
  const seats = new THREE.BufferGeometry();
  seats.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.05, 1.55, -hl, -0.05, 1.55, hl, depth - 0.05, height + 0.05, -hl, depth - 0.05, height + 0.05, hl,
  ], 3));
  seats.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, len / 12, 0, 0, depth / 10, len / 12, depth / 10], 2));
  seats.setIndex([0, 2, 1, 1, 2, 3]);
  seats.computeVertexNormals();
  const roofGeo = new THREE.PlaneGeometry(depth + 4, len).rotateX(-Math.PI / 2);
  const postGeo = new THREE.BoxGeometry(0.4, height + 6, 0.4);

  for (const d of [-260, -180, -100, -20, 60, 140]) {
    const dist = (d + circuit.length) % circuit.length;
    const i = circuit.indexAt(dist);
    const p = circuit.pointAt(dist, -(circuit.wallL[i] + 5));
    const stand = new THREE.Group();
    stand.position.set(p.x, 0, p.z);
    stand.rotation.y = circuit.headingAt(i);
    const body = new THREE.Mesh(wedge, frameMat);
    body.castShadow = true;
    stand.add(body, new THREE.Mesh(seats, seatMat));
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(depth / 2 - 1, height + 6, 0);
    roof.castShadow = true;
    stand.add(roof);
    for (const z of [-hl + 1, 0, hl - 1]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(depth - 0.5, (height + 6) / 2, z);
      stand.add(post);
    }
    scene.add(stand);
  }
}

export function buildTrees(scene: THREE.Scene, circuit: Circuit): void {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < circuit.n; i++) {
    minX = Math.min(minX, circuit.px[i]);
    maxX = Math.max(maxX, circuit.px[i]);
    minZ = Math.min(minZ, circuit.pz[i]);
    maxZ = Math.max(maxZ, circuit.pz[i]);
  }
  const pad = 250, count = 900;
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0);
  const leafGeo = new THREE.ConeGeometry(2.8, 8, 8).translate(0, 7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b3a21 }), count);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), count);
  leaves.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const proj: TrackPosition = { index: 0, lateral: 0, dist: 0 };
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 20; tries++) {
    const x = minX - pad + Math.random() * (maxX - minX + pad * 2);
    const z = minZ - pad + Math.random() * (maxZ - minZ + pad * 2);
    circuit.project(x, z, -1, proj);
    const wall = proj.lateral > 0 ? circuit.wallR[proj.index] : circuit.wallL[proj.index];
    if (Math.abs(proj.lateral) < wall + 10 + Math.random() * 20) continue;
    // Keep the grandstand area along the main straight clear.
    if (Math.abs(proj.lateral) < 60 && (proj.dist < 220 || proj.dist > circuit.length - 320)) continue;
    const scale = 0.7 + Math.random() * 0.8;
    s.set(scale, scale * (0.8 + Math.random() * 0.5), scale);
    q.setFromAxisAngle(up, Math.random() * Math.PI);
    m.compose(p.set(x, 0, z), q, s);
    trunks.setMatrixAt(placed, m);
    leaves.setMatrixAt(placed, m);
    leaves.setColorAt(placed, c.setHSL(0.27 + Math.random() * 0.08, 0.5, 0.2 + Math.random() * 0.12));
    placed++;
  }
  trunks.count = leaves.count = placed;
  scene.add(trunks, leaves);
}
