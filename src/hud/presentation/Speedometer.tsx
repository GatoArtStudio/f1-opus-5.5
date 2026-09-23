"use client";

import type { Gear } from "@/race-car/domain/car-specs";
import styles from "./hud.module.css";
import { useTelemetryCanvas, type TelemetrySubscription } from "./use-telemetry-canvas";

const SHIFT_LIGHTS = 10;

function drawRevCounter(g: CanvasRenderingContext2D, rpm: number, w: number, h: number) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.56, r = Math.min(w, h) * 0.42;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const f = Math.min(1, Math.max(0, (rpm - 3000) / 10000));
  g.lineCap = "round";
  g.lineWidth = r * 0.12;
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.beginPath();
  g.arc(cx, cy, r, a0, a1);
  g.stroke();
  const grad = g.createLinearGradient(cx - r, 0, cx + r, 0);
  grad.addColorStop(0, "#20e070");
  grad.addColorStop(0.6, "#ffd000");
  grad.addColorStop(1, "#ff2a2a");
  g.strokeStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, a0, a0 + (a1 - a0) * f);
  g.stroke();

  const lw = r * 0.14;
  for (let i = 0; i < SHIFT_LIGHTS; i++) {
    const on = f > 0.45 + (i / SHIFT_LIGHTS) * 0.5;
    const col = i < 4 ? "#20e070" : i < 7 ? "#ff2a2a" : "#3aa0ff";
    g.fillStyle = on ? col : "rgba(255,255,255,0.1)";
    g.beginPath();
    g.arc(cx - ((SHIFT_LIGHTS - 1) / 2) * lw * 1.25 + i * lw * 1.25, cy - r * 1.05, lw / 2, 0, Math.PI * 2);
    g.fill();
  }
}

export function Speedometer({ speedKmh, gear, subscribe }: { speedKmh: number; gear: Gear; subscribe: TelemetrySubscription }) {
  const canvasRef = useTelemetryCanvas(subscribe, (g, t, { w, h }) => drawRevCounter(g, t.player.rpm, w, h));
  return (
    <div className={`${styles.panel} ${styles.speedo}`}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.speedRead}>
        <div className={styles.speed}>{speedKmh}</div>
        <div className={styles.unit}>KM/H</div>
      </div>
      <div className={styles.gear}>{gear}</div>
    </div>
  );
}
