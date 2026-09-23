import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { canvasTexture, FLAT_RENDER_ORDER, paintNoise } from "@/circuit/infrastructure/canvas-texture";
import { PIT, PitLane } from "@/pit-stop/domain/pit-lane";
import type { ExitLight } from "@/pit-stop/domain/pit-stop";

const ROAD_HALF_WIDTH = 2.7;
const BAY_LENGTH = 8;
const BAY_HALF_DEPTH = 2.2;
const GARAGE = { near: 21.4, depth: 4.2, height: 4.6 };
/** Pit markings sit over the pit road and the track's edge, so they are pulled toward the camera harder. */
const ON_ROAD = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } as const;

class Strips {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  /** Adds a quad strip along the lap between two lateral edges (functions of `u`). */
  add(circuit: Circuit, lane: PitLane, from: number, to: number, step: number, edges: (u: number) => [number, number], lift: number): void {
    const first = this.pos.length / 3;
    let k = 0;
    for (let u = from; u <= to + 1e-6; u += step, k++) {
      const dist = lane.toLapDistance(u);
      const [a, b] = edges(u);
      const i = circuit.indexAt(dist);
      const p = circuit.pointAt(dist, a), q = circuit.pointAt(dist, b);
      const y = circuit.elevation[i] + lift;
      this.pos.push(p.x, y, p.z, q.x, y, q.z);
      this.uv.push(0, u / 10, 1, u / 10);
      if (k > 0) {
        const o = first + k * 2;
        this.idx.push(o - 2, o - 1, o, o - 1, o + 1, o);
      }
    }
  }

  mesh(material: THREE.Material, order: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    return mesh;
  }
}

function garageTexture(bays: number, anisotropy: number): THREE.CanvasTexture {
  return canvasTexture(2048, (g, s) => {
    g.fillStyle = "#8b9099";
    g.fillRect(0, 0, s, s);
    const w = s / bays;
    for (let k = 0; k < bays; k++) {
      g.fillStyle = "#15171d"; // the open bay
      g.fillRect(k * w + 8, s * 0.32, w - 16, s * 0.68);
      g.fillStyle = k % 2 ? "#e10600" : "#1e78d2"; // team stripe over each door
      g.fillRect(k * w + 8, s * 0.2, w - 16, s * 0.07);
      g.fillStyle = "#e8e8e8";
      g.font = `bold ${Math.round(w * 0.5)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.fillText(String(k + 1), k * w + w / 2, s * 0.16);
    }
  }, anisotropy, false);
}

function signTexture(text: string, anisotropy: number): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = "#0d47a1";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 8;
    g.strokeRect(6, 6, s - 12, s - 12);
    g.fillStyle = "#ffffff";
    g.font = "bold 76px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("PIT", s / 2, s * 0.36);
    g.font = "bold 44px system-ui, sans-serif";
    g.fillText(text, s / 2, s * 0.72);
  }, anisotropy, false);
}

export interface PitLaneScenery {
  setExitLight(light: ExitLight): void;
}

/** Pit road, its markings, the box bays, the garages, the entry/exit boards and the exit light. */
export function buildPitLane(root: THREE.Object3D, circuit: Circuit, anisotropy: number): PitLaneScenery {
  const lane = new PitLane(circuit);
  const from = PIT.entryStart, to = lane.exitEnd, step = circuit.ds * 2;

  const asphalt = canvasTexture(256, (g, s) => paintNoise(g, s, "#43454b", 0.22, 12000), anisotropy);
  const road = new Strips();
  road.add(circuit, lane, from, to, step, (u) => [lane.roadLateral(u) - ROAD_HALF_WIDTH, lane.roadLateral(u) + ROAD_HALF_WIDTH], 0.024);
  // The apron in front of the garages, where the cars park.
  road.add(circuit, lane, PIT.firstBox - 9, lane.boxPosition(lane.boxCount - 1) + 9, step, () => [PIT.fastLateral + 2.4, GARAGE.near], 0.024);
  root.add(
    road.mesh(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, depthWrite: false, ...ON_ROAD }), FLAT_RENDER_ORDER.road),
  );

  // White edge lines along the pit road, and box bay outlines.
  const white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, depthWrite: false, ...ON_ROAD });
  const lines = new Strips();
  const edgeStart = PIT.laneStart - 20, edgeEnd = lane.laneEnd + 20;
  for (const side of [-1, 1]) {
    lines.add(circuit, lane, edgeStart, edgeEnd, step, (u) => {
      const e = lane.roadLateral(u) + side * (ROAD_HALF_WIDTH - 0.12);
      return [e - 0.09, e + 0.09];
    }, 0.03);
  }
  for (let box = 0; box < lane.boxCount; box++) {
    const u0 = lane.boxPosition(box) - BAY_LENGTH / 2, u1 = lane.boxPosition(box) + BAY_LENGTH / 2;
    const near = PIT.boxLateral - BAY_HALF_DEPTH, far = PIT.boxLateral + BAY_HALF_DEPTH;
    for (const u of [u0, u1]) lines.add(circuit, lane, u - 0.09, u + 0.09, 0.09, () => [near, far], 0.03);
    lines.add(circuit, lane, u0, u1, 1, () => [far - 0.09, far + 0.09], 0.03);
  }
  root.add(lines.mesh(white, FLAT_RENDER_ORDER.marks));

  // Garages behind the boxes.
  const length = lane.boxCount * PIT.boxSpacing;
  const middle = PIT.firstBox + ((lane.boxCount - 1) * PIT.boxSpacing) / 2;
  const front = garageTexture(lane.boxCount, anisotropy);
  const facade = new THREE.MeshStandardMaterial({ map: front, roughness: 0.8 });
  const plain = new THREE.MeshStandardMaterial({ color: 0x5c616b, roughness: 0.9 });
  const garage = new THREE.Mesh(new THREE.BoxGeometry(GARAGE.depth, GARAGE.height, length), [facade, plain, plain, plain, plain, plain]);
  const mid = lane.toLapDistance(middle);
  const i = circuit.indexAt(mid);
  const centre = circuit.pointAt(mid, GARAGE.near + GARAGE.depth / 2);
  garage.position.set(centre.x, circuit.elevation[i] + GARAGE.height / 2 - 0.4, centre.z);
  garage.rotation.y = circuit.headingAt(i); // local +X (the facade) then points toward the track
  garage.castShadow = true;
  garage.receiveShadow = true;
  root.add(garage);

  // Boards at the entry and the exit of the pit lane.
  const post = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.6, metalness: 0.5 });
  for (const [u, text] of [[PIT.entryStart + 30, "ENTRADA"], [lane.exitEnd - 30, "SALIDA"]] as const) {
    const dist = lane.toLapDistance(u);
    const j = circuit.indexAt(dist);
    const p = circuit.pointAt(dist, PIT.fastLateral + 5);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: signTexture(text, anisotropy), side: THREE.DoubleSide }));
    board.position.set(p.x, circuit.elevation[j] + 4.2, p.z);
    board.rotation.y = circuit.headingAt(j) + Math.PI;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), post);
    pole.position.set(p.x, circuit.elevation[j] + 2, p.z);
    root.add(board, pole);
  }

  // Exit light: red while a car on the track is about to pass, green when the way is clear.
  const line = lane.toLapDistance(lane.exitLine);
  const k = circuit.indexAt(line);
  const spot = circuit.pointAt(line, PIT.fastLateral + 4.6);
  const mast = new THREE.Group();
  mast.position.set(spot.x, circuit.elevation[k], spot.z);
  mast.rotation.y = circuit.headingAt(k) + Math.PI; // lamps face the cars coming down the lane
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 6), post);
  stem.position.y = 2.1;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x0c0c0f }));
  housing.position.y = 4.6;
  const red = new THREE.MeshBasicMaterial({ color: 0x300000, fog: false });
  const green = new THREE.MeshBasicMaterial({ color: 0x002a10, fog: false });
  const lamp = (material: THREE.Material, y: number) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), material);
    disc.position.set(0, y, 0.16);
    return disc;
  };
  mast.add(stem, housing, lamp(red, 4.98), lamp(green, 4.22));
  root.add(mast);

  return {
    setExitLight(light) {
      red.color.setHex(light === "red" ? 0xff2a1a : 0x300000);
      green.color.setHex(light === "green" ? 0x2dff6a : 0x002a10);
    },
  };
}
