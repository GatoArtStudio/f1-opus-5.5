import { clamp } from './track.js';

// Keyboard + gamepad input turned into analogue throttle / brake / steer.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since the last consumePressed()
    this.steer = 0;
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  consumePressed(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearPressed() {
    this.pressed.clear();
  }

  read(dt) {
    const k = this.keys;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') || k.has('Space') ? 1 : 0;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    const want = (right ? 1 : 0) - (left ? 1 : 0);

    // Keyboard steering ramps in and returns to centre smoothly.
    const rate = want === 0 || Math.sign(want) !== Math.sign(this.steer) ? 6 : 3.2;
    this.steer += clamp(want - this.steer, -rate * dt, rate * dt);
    let steer = this.steer;

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88) ** 1.4;
      const rt = pad.buttons[7]?.value ?? 0, lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.05) throttle = Math.max(throttle, rt);
      if (lt > 0.05) brake = Math.max(brake, lt);
      if (pad.buttons[0]?.pressed) throttle = Math.max(throttle, 1);
      if (pad.buttons[1]?.pressed) brake = Math.max(brake, 1);
    }
    return { throttle, brake, steer: clamp(steer, -1, 1) };
  }
}
