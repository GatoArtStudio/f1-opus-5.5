import * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { PIT, type PitLane } from "@/pit-stop/domain/pit-lane";
import type { PitStop } from "@/pit-stop/domain/pit-stop";
import type { RaceCar } from "@/race-car/domain/race-car";
import { clamp } from "@/shared/domain/math";

/** What the view needs from each race entry. */
interface CrewSubject {
  readonly car: RaceCar;
  readonly pit: PitStop;
  readonly driver: { readonly color: number };
}

const CREW_SIZE = 12;
/** Local positions around the car (x: toward the garage, z: forward), and whether the person kneels. */
const WORK: readonly { x: number; z: number; kneel: boolean }[] = [
  { x: -1.4, z: 1.62, kneel: true }, // wheel guns
  { x: 1.4, z: 1.62, kneel: true },
  { x: -1.4, z: -1.55, kneel: true },
  { x: 1.4, z: -1.55, kneel: true },
  { x: -2.3, z: 1.62, kneel: false }, // tyre carriers
  { x: 2.3, z: 1.62, kneel: false },
  { x: -2.3, z: -1.55, kneel: false },
  { x: 2.3, z: -1.55, kneel: false },
  { x: 0, z: 3.2, kneel: true }, // front jack
  { x: 0, z: -3.1, kneel: true }, // rear jack
  { x: -0.9, z: 3.4, kneel: false }, // front wing
  { x: 0, z: 6.4, kneel: false }, // lollipop
];
const LOLLIPOP = CREW_SIZE - 1;
const IDLE_X = 2.4;
const IDLE_SPACING = 0.62;
const BODY = { width: 0.5, height: 1.05, depth: 0.32 };
/** Metres the car is raised on the jacks while its wheels are changed. */
const LIFT = 0.16;
/** The crew steps out when a car is this close to its box (m). */
const CALL_OUT_DISTANCE = 45;
/** ...and goes back to the garage once the car has pulled this far past (m). */
const STAND_DOWN_DISTANCE = 9;

interface Box {
  origin: THREE.Vector3;
  /** Unit vectors along the lap and toward the garage (to the right). */
  forward: THREE.Vector2;
  right: THREE.Vector2;
  boxU: number;
  lollipop: THREE.Group;
  lollipopMaterial: THREE.MeshBasicMaterial;
  positions: THREE.Vector2[];
}

/**
 * The pit crews: a dozen mechanics waiting at each box in their team's colour,
 * who step out when their car comes in, change the wheels while the car is
 * lifted, and show the lollipop board ("stop" then "go") before stepping back.
 */
export class PitCrewView {
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly boxes: Box[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(
    private readonly root: THREE.Object3D,
    private readonly circuit: Circuit,
    private readonly lane: PitLane,
    private readonly subjects: readonly CrewSubject[],
  ) {
    const count = subjects.length * CREW_SIZE;
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(BODY.width, BODY.height, BODY.depth).translate(0, BODY.height / 2 + 0.35, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8).translate(0, BODY.height + 0.35 + 0.18, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }), count);
    this.bodies.castShadow = true;
    this.heads.castShadow = true;
    this.bodies.frustumCulled = false;
    this.heads.frustumCulled = false;

    subjects.forEach((subject, k) => {
      this.boxes.push(this.buildBox(subject));
      for (let i = 0; i < CREW_SIZE; i++) this.bodies.setColorAt(k * CREW_SIZE + i, this.color.setHex(subject.driver.color));
    });
    root.add(this.bodies, this.heads);
    this.update(1, subjects); // settle everyone at their idle spot
  }

  private buildBox(subject: CrewSubject): Box {
    const { circuit, lane } = this;
    const boxU = lane.boxPosition(subject.pit.box);
    const dist = lane.toLapDistance(boxU);
    const index = circuit.indexAt(dist);
    const p = circuit.pointAt(dist, PIT.boxLateral);
    const h = circuit.headingAt(index);
    const forward = new THREE.Vector2(Math.sin(h), Math.cos(h));
    const right = new THREE.Vector2(-Math.cos(h), Math.sin(h));
    const origin = new THREE.Vector3(p.x, circuit.elevation[index], p.z);

    const lollipopMaterial = new THREE.MeshBasicMaterial({ color: 0xd8140c, side: THREE.DoubleSide });
    const lollipop = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pole.position.y = 0.85;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), lollipopMaterial);
    disc.position.set(0, 1.85, 0);
    lollipop.add(pole, disc);
    lollipop.visible = false;
    this.root.add(lollipop);

    const positions = Array.from({ length: CREW_SIZE }, (_, i) => this.idleSpot(i));
    return { origin, forward, right, boxU, lollipop, lollipopMaterial, positions };
  }

  private idleSpot(i: number): THREE.Vector2 {
    return new THREE.Vector2(IDLE_X, (i - (CREW_SIZE - 1) / 2) * IDLE_SPACING);
  }

  /** How high the car is raised on the jacks, for the view to apply to the car model. */
  static lift(pit: PitStop): number {
    if (pit.phase !== "service" || pit.waitingForChoice || pit.served || pit.serviceTotal <= 0) return 0;
    const progress = 1 - pit.serviceLeft / pit.serviceTotal;
    return LIFT * clamp(Math.min(progress / 0.12, (1 - progress) / 0.12), 0, 1);
  }

  update(dt: number, subjects: readonly CrewSubject[]): void {
    const follow = Math.min(1, dt * 5);
    subjects.forEach((subject, k) => {
      const box = this.boxes[k];
      if (!box) return;
      const { pit, car } = subject;
      const u = this.lane.signed(car.trackDist);
      const onBox = pit.active && Math.abs(u - box.boxU) < CALL_OUT_DISTANCE && u < box.boxU + STAND_DOWN_DISTANCE;
      const working = onBox && (pit.phase === "service" || (pit.phase === "approach" && Math.abs(u - box.boxU) < CALL_OUT_DISTANCE));
      const stopped = pit.phase === "service" && !pit.served;

      for (let i = 0; i < CREW_SIZE; i++) {
        const target = working || (pit.phase === "exit" && onBox) ? new THREE.Vector2(WORK[i].x, WORK[i].z) : this.idleSpot(i);
        const spot = box.positions[i];
        spot.x += (target.x - spot.x) * follow;
        spot.y += (target.y - spot.y) * follow;

        const kneeling = stopped && WORK[i].kneel;
        const world = box.origin
          .clone()
          .addScaledVector(new THREE.Vector3(box.right.x, 0, box.right.y), spot.x)
          .addScaledVector(new THREE.Vector3(box.forward.x, 0, box.forward.y), spot.y);
        // Working crew face the car; the ones waiting look out at the track.
        const towardX = working ? -spot.x : -1, towardZ = working ? -spot.y : 0;
        const facing = Math.atan2(box.right.x * towardX + box.forward.x * towardZ, box.right.y * towardX + box.forward.y * towardZ);
        this.quaternion.setFromAxisAngle(this.up, facing);
        this.scale.set(1, kneeling ? 0.68 : 1, 1);
        this.matrix.compose(this.position.copy(world), this.quaternion, this.scale);
        this.bodies.setMatrixAt(k * CREW_SIZE + i, this.matrix);
        this.heads.setMatrixAt(k * CREW_SIZE + i, this.matrix);
      }

      // Lollipop board: "stop" (red) while the car is in the box, "go" (green) once the tyres are on.
      const spot = box.positions[LOLLIPOP];
      const lollipopUp = onBox && pit.phase !== "none";
      box.lollipop.visible = lollipopUp;
      if (lollipopUp) {
        const world = box.origin
          .clone()
          .addScaledVector(new THREE.Vector3(box.right.x, 0, box.right.y), spot.x - 0.45)
          .addScaledVector(new THREE.Vector3(box.forward.x, 0, box.forward.y), spot.y);
        box.lollipop.position.copy(world);
        box.lollipop.rotation.y = Math.atan2(-box.forward.x, -box.forward.y); // faces the driver
        box.lollipopMaterial.color.setHex(pit.served ? 0x1fc45a : 0xd8140c);
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.root.remove(this.bodies, this.heads);
    this.bodies.geometry.dispose();
    this.heads.geometry.dispose();
    (this.bodies.material as THREE.Material).dispose();
    (this.heads.material as THREE.Material).dispose();
    for (const box of this.boxes) {
      this.root.remove(box.lollipop);
      box.lollipopMaterial.dispose();
    }
  }
}
