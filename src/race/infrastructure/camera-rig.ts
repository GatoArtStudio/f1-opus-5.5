import * as THREE from "three";
import { CAR_SPECS } from "@/race-car/domain/car-specs";
import type { RaceCar } from "@/race-car/domain/race-car";
import { angleDiff } from "@/shared/domain/math";
import type { CameraMode } from "../application/ports";

/** Smoothed chase / onboard cameras plus the menu's orbiting shot. */
export class CameraRig {
  private readonly position = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private yaw = 0;
  private orbit = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Jump behind a car without easing (e.g. at the start of a race). */
  snapBehind(car: RaceCar): void {
    this.yaw = car.heading;
    this.position.set(car.x - Math.sin(car.heading) * 9, car.y + 3, car.z - Math.cos(car.heading) * 9);
  }

  orbitAround(car: RaceCar, dt: number): void {
    const cam = this.camera;
    this.orbit += dt * 0.12;
    this.target.set(car.x + Math.sin(this.orbit) * 30, car.y + 12, car.z + Math.cos(this.orbit) * 30);
    this.position.lerp(this.target, 1 - Math.exp(-dt * 2));
    cam.position.copy(this.position);
    this.target.set(car.x, car.y + 1, car.z);
    this.look.lerp(this.target, 1 - Math.exp(-dt * 4));
    cam.lookAt(this.look);
    cam.fov = 55;
    cam.updateProjectionMatrix();
  }

  follow(car: RaceCar, mode: CameraMode, dt: number, shake: number): void {
    const cam = this.camera;
    this.yaw += angleDiff(car.heading, this.yaw) * (1 - Math.exp(-dt * (mode === "onboard" ? 30 : 5)));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let fov = 66 + (Math.abs(car.speed) / CAR_SPECS.maxSpeed) * 14 + car.tow * 4; // the tow widens the view

    if (mode === "onboard") {
      const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
      cam.position.set(car.x - hx * 0.4, car.y + 1.42, car.z - hz * 0.4);
      cam.lookAt(car.x + hx * 30, car.y + 1.0 + Math.tan(car.pitch) * 30, car.z + hz * 30);
      fov += 4;
    } else {
      const dist = mode === "chase" ? 8.5 : 14;
      const height = mode === "chase" ? 2.7 : 4.8;
      this.target.set(car.x - fx * dist, car.y + height, car.z - fz * dist);
      this.position.lerp(this.target, 1 - Math.exp(-dt * 12));
      cam.position.copy(this.position);
      this.look.set(car.x + fx * 5, car.y + 1.1 + Math.tan(car.pitch) * 5, car.z + fz * 5);
      cam.lookAt(this.look);
    }
    if (shake > 0) {
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }
}
