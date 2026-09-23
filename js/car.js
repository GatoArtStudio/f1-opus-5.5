import * as THREE from 'three';
import { CAR, GEARS } from './config.js';
import { clamp } from './track.js';

const _proj = {};

export class Car {
  constructor(driver, track, { isPlayer = false, topFactor = 1 } = {}) {
    this.driver = driver;
    this.track = track;
    this.isPlayer = isPlayer;
    this.topSpeed = CAR.maxSpeed * topFactor;

    this.x = 0; this.z = 0; this.heading = 0;
    this.vx = 0; this.vz = 0;
    this.speed = 0;        // signed forward speed
    this.steerAngle = 0;
    this.input = { throttle: 0, brake: 0, steer: 0 };
    this.surface = 'track';
    this.impact = 0;       // strongest hit this frame (for audio / camera shake)
    this.wheelSpin = 0;

    this.index = 0; this.lateral = 0; this.trackDist = 0;
    this.lap = 0;          // current lap number (0 = still behind the line on the grid)
    this.progress = 0;     // total distance covered, used for race order
    this.finished = false;
    this.finishTime = 0;
    this.lapStart = 0;
    this.lastLap = 0;
    this.bestLap = 0;
    this.position = 0;

    this.mesh = buildCarMesh(driver, !isPlayer);
  }

  placeAt(dist, lateral) {
    const p = this.track.pointAt(dist, lateral);
    this.x = p.x; this.z = p.z;
    const pr = this.track.project(this.x, this.z, -1, _proj);
    this.heading = this.track.headingAt(pr.index);
    this.vx = this.vz = this.speed = 0;
    this.steerAngle = 0;
    this.index = pr.index; this.lateral = pr.lateral; this.trackDist = pr.dist;
    this.syncMesh(0);
  }

  // Put the car back on the racing surface facing the right way.
  respawn() {
    const t = this.track;
    this.placeAt(this.trackDist, clamp(this.lateral, -t.halfWidth + 2, t.halfWidth - 2));
  }

  get gear() {
    const v = Math.abs(this.speed);
    if (this.speed < -0.5) return 'R';
    if (v < 0.5 && this.input.throttle === 0) return 'N';
    for (let g = 1; g < GEARS.length; g++) if (v < GEARS[g]) return g;
    return 8;
  }

  get rpm() {
    const v = Math.abs(this.speed);
    const g = typeof this.gear === 'number' ? this.gear : 1;
    const lo = GEARS[g - 1] ?? 0, hi = Math.min(GEARS[g] ?? 95, 95);
    const t = clamp((v - lo * 0.75) / (hi - lo * 0.75), 0, 1);
    return 4000 + t * 8000 + this.input.throttle * 600;
  }

  update(dt) {
    const t = this.track;
    const { throttle, brake, steer } = this.input;

    const ab = Math.abs(this.lateral);
    this.surface = ab < t.halfWidth ? 'track' : ab < t.halfWidth + t.kerbWidth ? 'kerb' : 'grass';
    const grip = this.surface === 'track' ? CAR.grip : this.surface === 'kerb' ? CAR.kerbGrip : CAR.grassGrip;

    let sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    let vf = this.vx * sh + this.vz * ch;
    let vl = this.vx * -ch + this.vz * sh;

    // Longitudinal forces.
    let a = 0;
    if (throttle > 0) {
      if (vf > -0.5) a += throttle * CAR.engineAccel * Math.max(0, 1 - (vf / this.topSpeed) ** 2);
      else a += throttle * CAR.brakeDecel;
    }
    if (brake > 0) {
      if (vf > 0.5) a -= brake * CAR.brakeDecel;
      else if (vf > -CAR.reverseSpeed) a -= brake * 7;
    }
    a -= Math.sign(vf) * (0.4 + 0.0009 * vf * vf);
    if (this.surface === 'grass') {
      a -= Math.sign(vf) * CAR.grassDrag * (Math.abs(vf) > CAR.grassMaxSpeed ? 2.2 : 1);
    }
    const prev = vf;
    vf += a * dt;
    if (throttle === 0 && Math.sign(vf) !== Math.sign(prev) && prev !== 0) vf = 0;

    // Steering: less lock at speed, yaw limited by available grip.
    const maxSteer = CAR.maxSteer / (1 + Math.abs(vf) / 20);
    const target = steer * maxSteer;
    this.steerAngle += clamp(target - this.steerAngle, -3 * dt, 3 * dt);
    let yaw = (vf * Math.tan(this.steerAngle)) / CAR.wheelBase;
    const yawLimit = (grip * 1.08) / Math.max(Math.abs(vf), 4);
    yaw = clamp(yaw, -yawLimit, yawLimit);

    // World velocity in the old frame, then re-expressed in the rotated frame.
    const wx = sh * vf - ch * vl, wz = ch * vf + sh * vl;
    this.heading -= yaw * dt;
    sh = Math.sin(this.heading); ch = Math.cos(this.heading);
    vf = wx * sh + wz * ch;
    vl = wx * -ch + wz * sh;
    vl -= clamp(vl, -grip * dt, grip * dt);

    this.vx = sh * vf - ch * vl;
    this.vz = ch * vf + sh * vl;
    this.speed = vf;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.wheelSpin += (vf / 0.36) * dt;

    this.updateTrackPosition();
    this.collideWalls();
  }

  updateTrackPosition() {
    const pr = this.track.project(this.x, this.z, this.index, _proj);
    this.index = pr.index;
    this.lateral = pr.lateral;
    this.trackDist = pr.dist;
  }

  collideWalls() {
    const t = this.track, i = this.index;
    const half = CAR.width / 2 + 0.2;
    const right = t.wallR[i] - half, left = -(t.wallL[i] - half);
    let side = 0, over = 0;
    if (this.lateral > right) { side = 1; over = this.lateral - right; }
    else if (this.lateral < left) { side = -1; over = left - this.lateral; }
    if (!side) return;

    const nx = t.rx[i] * side, nz = t.rz[i] * side; // points into the wall
    this.x -= nx * over; this.z -= nz * over;
    const vn = this.vx * nx + this.vz * nz;
    if (vn > 0) {
      this.vx -= nx * vn * 1.35;
      this.vz -= nz * vn * 1.35;
      const scrub = clamp(1 - vn * 0.02, 0.6, 0.98);
      this.vx *= scrub; this.vz *= scrub;
      this.impact = Math.max(this.impact, vn);
    }
    this.lateral -= side * over;
  }

  syncMesh(dt) {
    const m = this.mesh;
    m.position.set(this.x, 0, this.z);
    m.rotation.y = this.heading;
    const u = m.userData;
    for (const w of u.wheels) w.rotation.x = this.wheelSpin;
    for (const p of u.steerPivots) p.rotation.y = -this.steerAngle;
    // A little pitch under braking / acceleration for weight transfer.
    const pitch = clamp(-this.input.throttle * 0.008 + this.input.brake * 0.02, -0.02, 0.03);
    u.body.rotation.x += (pitch - u.body.rotation.x) * Math.min(1, dt * 6);
  }
}

// ---------------------------------------------------------------------------
// Procedural F1 car built from primitives. Faces +Z, ~5.4 m long.

const matCache = new Map();
function mat(color, rough = 0.45, metal = 0.25) {
  const key = `${color}-${rough}-${metal}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(key);
}

// Box whose width/height shrink toward +Z by the given ratios.
function taperBox(w, h, l, wRatio, hRatio, material) {
  const g = new THREE.BoxGeometry(w, h, l, 1, 1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) + l / 2) / l; // 0 at back, 1 at front
    pos.setX(i, pos.getX(i) * (1 + (wRatio - 1) * t));
    const y = pos.getY(i);
    if (y > 0) pos.setY(i, -h / 2 + (y + h / 2) * (1 + (hRatio - 1) * t));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

function box(w, h, l, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const tyreGeo = {
  front: new THREE.CylinderGeometry(0.34, 0.34, 0.36, 20),
  rear: new THREE.CylinderGeometry(0.36, 0.36, 0.44, 20),
};
tyreGeo.front.rotateZ(Math.PI / 2);
tyreGeo.rear.rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12).rotateZ(Math.PI / 2);

export function buildCarMesh(driver, withLabel) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = mat(driver.color, 0.35, 0.4);
  const accent = mat(driver.accent, 0.4, 0.3);
  const carbon = mat(0x151515, 0.6, 0.3);
  const tyre = mat(0x1a1a1a, 0.9, 0);

  // Floor / plank
  body.add(box(1.5, 0.06, 3.9, carbon, 0, 0.12, -0.2));
  // Monocoque + nose
  const tub = taperBox(0.9, 0.5, 2.2, 0.75, 0.85, paint);
  tub.position.set(0, 0.42, 0.35);
  body.add(tub);
  const nose = taperBox(0.62, 0.38, 1.5, 0.35, 0.55, paint);
  nose.position.set(0, 0.36, 2.15);
  body.add(nose);
  // Sidepods
  for (const s of [-1, 1]) {
    const pod = taperBox(0.55, 0.42, 1.7, 0.8, 0.85, paint);
    pod.position.set(s * 0.68, 0.38, -0.25);
    body.add(pod);
    body.add(box(0.5, 0.06, 0.08, accent, s * 0.68, 0.61, 0.62));
  }
  // Engine cover sloping to the rear
  const cover = taperBox(0.4, 0.4, 2.0, 2.2, 1.6, paint);
  cover.position.set(0, 0.62, -1.0);
  body.add(cover);
  body.add(box(0.28, 0.3, 0.5, accent, 0, 0.98, -0.25)); // airbox
  // Cockpit, driver helmet and halo
  body.add(box(0.5, 0.1, 0.8, carbon, 0, 0.68, 0.5));
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mat(driver.accent, 0.3, 0.5));
  helmet.position.set(0, 0.86, 0.35);
  helmet.castShadow = true;
  body.add(helmet);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI), carbon);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, 0.95, 0.45);
  body.add(halo);
  body.add(box(0.05, 0.25, 0.05, carbon, 0, 0.84, 0.76));
  // Front wing
  body.add(box(1.95, 0.05, 0.45, carbon, 0, 0.16, 2.72));
  body.add(box(1.8, 0.04, 0.22, accent, 0, 0.24, 2.62));
  for (const s of [-1, 1]) body.add(box(0.04, 0.26, 0.55, paint, s * 0.98, 0.24, 2.7));
  // Rear wing
  body.add(box(1.0, 0.05, 0.38, carbon, 0, 0.95, -2.35));
  body.add(box(1.0, 0.04, 0.2, paint, 0, 1.08, -2.28));
  for (const s of [-1, 1]) body.add(box(0.04, 0.6, 0.6, accent, s * 0.51, 0.82, -2.33));
  body.add(box(0.08, 0.5, 0.12, carbon, 0, 0.66, -2.25));
  // Rear rain light
  body.add(box(0.14, 0.08, 0.04, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 0.28, -2.12));

  // Wheels: rear directly on the body, fronts on steering pivots.
  const wheels = [], steerPivots = [];
  const rimMat = mat(0x888888, 0.3, 0.8);
  const addWheel = (parent, x, front) => {
    const w = new THREE.Group();
    const t = new THREE.Mesh(front ? tyreGeo.front : tyreGeo.rear, tyre);
    t.castShadow = true;
    w.add(t);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.x = Math.sign(x) * (front ? 0.18 : 0.22);
    w.add(rim);
    wheels.push(w);
    parent.add(w);
    return w;
  };
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.86, 0.34, 1.62);
    addWheel(pivot, s, true);
    steerPivots.push(pivot);
    root.add(pivot);
    const rw = addWheel(root, s, false);
    rw.position.set(s * 0.84, 0.36, -1.55);
    // suspension arms
    body.add(box(0.7, 0.03, 0.05, carbon, s * 0.5, 0.36, 1.62));
    body.add(box(0.6, 0.03, 0.05, carbon, s * 0.5, 0.38, -1.5));
  }

  if (withLabel) {
    const label = makeLabel(driver);
    label.position.set(0, 2.2, 0);
    root.add(label);
    root.userData.label = label;
  }

  root.userData.body = body;
  root.userData.wheels = wheels;
  root.userData.steerPivots = steerPivots;
  return root;
}

function makeLabel(driver) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,10,14,0.8)';
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#' + driver.color.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 10, 48);
  g.fillStyle = '#fff';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(driver.code, 70, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(2.4, 0.9, 1);
  return s;
}
