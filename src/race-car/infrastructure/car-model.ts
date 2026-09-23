import * as THREE from "three";
import { clamp } from "@/shared/domain/math";
import type { RaceCar } from "../domain/race-car";

/** Colours and short code painted on a car. */
export interface Livery {
  code: string;
  color: number;
  accent: number;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function paint(color: number, roughness = 0.45, metalness = 0.25): THREE.MeshStandardMaterial {
  const key = `${color}-${roughness}-${metalness}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materialCache.set(key, m);
  }
  return m;
}

/** Box whose width/height scale toward +Z by the given ratios. */
function taperBox(w: number, h: number, l: number, wRatio: number, hRatio: number, material: THREE.Material) {
  const g = new THREE.BoxGeometry(w, h, l, 1, 1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) + l / 2) / l; // 0 at the back, 1 at the front
    pos.setX(i, pos.getX(i) * (1 + (wRatio - 1) * t));
    const y = pos.getY(i);
    if (y > 0) pos.setY(i, -h / 2 + (y + h / 2) * (1 + (hRatio - 1) * t));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

function box(w: number, h: number, l: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

let sharedGeometry: { front: THREE.BufferGeometry; rear: THREE.BufferGeometry; rim: THREE.BufferGeometry } | null = null;
function wheelGeometry() {
  sharedGeometry ??= {
    front: new THREE.CylinderGeometry(0.34, 0.34, 0.36, 20).rotateZ(Math.PI / 2),
    rear: new THREE.CylinderGeometry(0.36, 0.36, 0.44, 20).rotateZ(Math.PI / 2),
    rim: new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12).rotateZ(Math.PI / 2),
  };
  return sharedGeometry;
}

function makeLabel(livery: Livery): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 48;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "rgba(10,10,14,0.8)";
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = "#" + livery.color.toString(16).padStart(6, "0");
  g.fillRect(0, 0, 10, 48);
  g.fillStyle = "#fff";
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(livery.code, 70, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(2.4, 0.9, 1);
  sprite.position.set(0, 2.2, 0);
  return sprite;
}

/** Procedural F1 car built from primitives. Faces +Z, ~5.4 m long. */
export class CarModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  private readonly steerPivots: THREE.Group[] = [];
  private readonly label: THREE.Sprite | null;

  constructor(livery: Livery, withLabel: boolean) {
    const { root, body } = this;
    root.add(body);

    const livPaint = paint(livery.color, 0.35, 0.4);
    const accent = paint(livery.accent, 0.4, 0.3);
    const carbon = paint(0x151515, 0.6, 0.3);

    // Floor / plank
    body.add(box(1.5, 0.06, 3.9, carbon, 0, 0.12, -0.2));
    // Monocoque + nose
    const tub = taperBox(0.9, 0.5, 2.2, 0.75, 0.85, livPaint);
    tub.position.set(0, 0.42, 0.35);
    const nose = taperBox(0.62, 0.38, 1.5, 0.35, 0.55, livPaint);
    nose.position.set(0, 0.36, 2.15);
    body.add(tub, nose);
    // Sidepods
    for (const s of [-1, 1]) {
      const pod = taperBox(0.55, 0.42, 1.7, 0.8, 0.85, livPaint);
      pod.position.set(s * 0.68, 0.38, -0.25);
      body.add(pod, box(0.5, 0.06, 0.08, accent, s * 0.68, 0.61, 0.62));
    }
    // Engine cover and airbox
    const cover = taperBox(0.4, 0.4, 2.0, 2.2, 1.6, livPaint);
    cover.position.set(0, 0.62, -1.0);
    body.add(cover, box(0.28, 0.3, 0.5, accent, 0, 0.98, -0.25));
    // Cockpit, helmet and halo
    body.add(box(0.5, 0.1, 0.8, carbon, 0, 0.68, 0.5));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), paint(livery.accent, 0.3, 0.5));
    helmet.position.set(0, 0.86, 0.35);
    helmet.castShadow = true;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI), carbon);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, 0.95, 0.45);
    body.add(helmet, halo, box(0.05, 0.25, 0.05, carbon, 0, 0.84, 0.76));
    // Front wing
    body.add(box(1.95, 0.05, 0.45, carbon, 0, 0.16, 2.72), box(1.8, 0.04, 0.22, accent, 0, 0.24, 2.62));
    for (const s of [-1, 1]) body.add(box(0.04, 0.26, 0.55, livPaint, s * 0.98, 0.24, 2.7));
    // Rear wing
    body.add(box(1.0, 0.05, 0.38, carbon, 0, 0.95, -2.35), box(1.0, 0.04, 0.2, livPaint, 0, 1.08, -2.28));
    for (const s of [-1, 1]) body.add(box(0.04, 0.6, 0.6, accent, s * 0.51, 0.82, -2.33));
    body.add(box(0.08, 0.5, 0.12, carbon, 0, 0.66, -2.25));
    // Rear rain light
    body.add(box(0.14, 0.08, 0.04, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 0.28, -2.12));

    // Wheels: rears on the chassis, fronts on steering pivots.
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.86, 0.34, 1.62);
      pivot.add(this.makeWheel(s, true));
      this.steerPivots.push(pivot);
      const rear = this.makeWheel(s, false);
      rear.position.set(s * 0.84, 0.36, -1.55);
      root.add(pivot, rear);
      // Suspension arms
      body.add(box(0.7, 0.03, 0.05, carbon, s * 0.5, 0.36, 1.62), box(0.6, 0.03, 0.05, carbon, s * 0.5, 0.38, -1.5));
    }

    this.label = withLabel ? makeLabel(livery) : null;
    if (this.label) root.add(this.label);
  }

  private makeWheel(side: number, front: boolean): THREE.Group {
    const geo = wheelGeometry();
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(front ? geo.front : geo.rear, paint(0x1a1a1a, 0.9, 0));
    tyre.castShadow = true;
    const rim = new THREE.Mesh(geo.rim, paint(0x888888, 0.3, 0.8));
    rim.position.x = side * (front ? 0.18 : 0.22);
    wheel.add(tyre, rim);
    this.wheels.push(wheel);
    return wheel;
  }

  sync(car: RaceCar, dt: number): void {
    this.root.position.set(car.x, car.y, car.z);
    this.root.rotation.order = "YXZ";
    this.root.rotation.set(-car.pitch, car.heading, 0); // nose up on climbs
    for (const w of this.wheels) w.rotation.x = car.wheelSpin;
    for (const p of this.steerPivots) p.rotation.y = -car.steerAngle;
    // A little pitch under braking / acceleration for weight transfer.
    const pitch = clamp(-car.controls.throttle * 0.008 + car.controls.brake * 0.02, -0.02, 0.03);
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 6);
  }

  setLabelVisible(visible: boolean): void {
    if (this.label) this.label.visible = visible;
  }

  /** Onboard camera: hide everything behind the nose. */
  setOnboardView(onboard: boolean): void {
    for (const part of this.body.children) part.visible = !onboard || part.position.z > 1.2;
  }
}
