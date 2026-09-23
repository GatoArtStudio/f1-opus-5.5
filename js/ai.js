import { CAR } from './config.js';
import { clamp } from './track.js';

// Drives a Car along the track's racing line: pure-pursuit steering, a
// pre-computed speed profile for throttle/brake, and simple overtaking.
export class BotDriver {
  constructor(car, track, skill = 0.93) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.profile = track.speedProfile(CAR.grip * skill, CAR.brakeDecel * 0.8 * skill, car.topSpeed, CAR.engineAccel);
    this.avoid = 0;           // extra lateral offset used to pass other cars
    this.wobblePhase = Math.random() * 100;
    this.stuckTime = 0;
    this.reverseTime = 0;
  }

  update(dt, cars, time) {
    const car = this.car, t = this.track;
    const v = Math.max(car.speed, 0);
    const i = car.index;

    // Find the closest car ahead in our lane and decide which side to pass on.
    let blockGap = Infinity, blockSpeed = 0, desiredAvoid = 0;
    const myLine = t.lineOffset[i] + this.avoid;
    for (const o of cars) {
      if (o === car) continue;
      let gap = o.trackDist - car.trackDist;
      if (gap < -t.length / 2) gap += t.length;
      if (gap > t.length / 2) gap -= t.length;
      if (gap <= 0 || gap > 30 + v * 0.6) continue;
      const lat = o.lateral - myLine;
      if (Math.abs(lat) > 2.8) continue;
      if (gap < blockGap) {
        blockGap = gap;
        blockSpeed = o.speed;
        const room = t.halfWidth - 1.5;
        const passLeft = o.lateral - 3.2, passRight = o.lateral + 3.2;
        const canLeft = passLeft > -room, canRight = passRight < room;
        const prefer = lat >= 0 ? passLeft : passRight;
        let target = prefer;
        if (lat >= 0 && !canLeft) target = passRight;
        if (lat < 0 && !canRight) target = passLeft;
        desiredAvoid = clamp(target, -room, room) - t.lineOffset[i];
      }
    }
    if (blockGap === Infinity) desiredAvoid = 0;
    this.avoid += clamp(desiredAvoid - this.avoid, -4 * dt, 4 * dt);

    // Pure pursuit toward a look-ahead point on the (shifted) racing line.
    const look = 9 + v * 0.42;
    const la = t.wrap(i + Math.round(look / t.ds));
    const wobble = Math.sin(time * 0.3 + this.wobblePhase) * 0.5;
    const off = clamp(t.lineOffset[la] + this.avoid + wobble, -t.halfWidth + 1.3, t.halfWidth - 1.3);
    const tx = t.px[la] + t.rx[la] * off, tz = t.pz[la] + t.rz[la] * off;
    const dx = tx - car.x, dz = tz - car.z;
    const sh = Math.sin(car.heading), ch = Math.cos(car.heading);
    const fwd = dx * sh + dz * ch, right = dx * -ch + dz * sh;
    const alpha = Math.atan2(right, fwd);
    const ld = Math.hypot(dx, dz);
    const wheel = Math.atan((2 * CAR.wheelBase * Math.sin(alpha)) / ld);
    const maxSteer = CAR.maxSteer / (1 + v / 20);
    let steer = clamp(wheel / maxSteer, -1, 1);

    // Speed control from the profile, anticipating slightly ahead.
    const ahead = t.wrap(i + Math.round((v * 0.25) / t.ds));
    let target = Math.min(this.profile[i], this.profile[ahead]);
    if (car.surface === 'grass') target = Math.min(target, 35);
    if (blockGap < 12 + v * 0.3 && Math.abs(this.avoid - desiredAvoid) > 1) {
      target = Math.min(target, blockSpeed - 1);
    }
    let throttle = clamp((target - v) * 0.35 + 0.1, 0, 1);
    let brake = clamp((v - target) * 0.25, 0, 1);
    if (brake > 0.05) throttle = 0;

    // Recovery: reverse out if stuck against something.
    if (time > 0 && v < 2 && throttle > 0.5) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt);
    if (this.stuckTime > 1.5) { this.reverseTime = 1.2; this.stuckTime = 0; }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      throttle = 0; brake = 1; steer = -steer;
    }
    // Hopelessly lost (e.g. facing backwards off track): reset.
    const heading = Math.atan2(t.tx[i], t.tz[i]);
    const dot = Math.cos(car.heading - heading);
    if (dot < -0.2 && v < 5) this.lostTime = (this.lostTime || 0) + dt;
    else this.lostTime = 0;
    if (this.lostTime > 3) { car.respawn(); this.lostTime = 0; }

    car.input.throttle = throttle;
    car.input.brake = brake;
    car.input.steer = steer;
  }
}
