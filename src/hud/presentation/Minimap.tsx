"use client";

import { useMemo } from "react";
import type { CircuitOutline, LiveTelemetry } from "@/race/application/race-ui-state";
import { toCssColor } from "@/shared/presentation/format";
import styles from "./hud.module.css";
import { useTelemetryCanvas, type TelemetrySubscription } from "./use-telemetry-canvas";

interface Bounds {
  minX: number;
  minZ: number;
  spanX: number;
  spanZ: number;
}

function boundsOf({ xs, zs }: CircuitOutline): Bounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minZ = Math.min(minZ, zs[i]);
    maxZ = Math.max(maxZ, zs[i]);
  }
  return { minX, minZ, spanX: maxX - minX, spanZ: maxZ - minZ };
}

function drawMinimap(
  g: CanvasRenderingContext2D,
  outline: CircuitOutline,
  bounds: Bounds,
  t: LiveTelemetry,
  { w, h, dpr }: { w: number; h: number; dpr: number },
) {
  const pad = 14 * dpr;
  const scale = Math.min((w - pad * 2) / bounds.spanX, (h - pad * 2) / bounds.spanZ);
  const ox = (w - bounds.spanX * scale) / 2, oz = (h - bounds.spanZ * scale) / 2;
  const toMap = (x: number, z: number): [number, number] => [ox + (x - bounds.minX) * scale, oz + (z - bounds.minZ) * scale];

  g.clearRect(0, 0, w, h);
  const path = new Path2D();
  const n = outline.xs.length;
  for (let i = 0; i <= n; i += 3) {
    const [x, y] = toMap(outline.xs[i % n], outline.zs[i % n]);
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineWidth = 9 * dpr;
  g.stroke(path);
  g.strokeStyle = "#d9dde3";
  g.lineWidth = 4 * dpr;
  g.stroke(path);

  // Start/finish marker
  const [sx, sy] = toMap(outline.xs[0], outline.zs[0]);
  g.fillStyle = "#e10600";
  g.fillRect(sx - 2 * dpr, sy - 7 * dpr, 4 * dpr, 14 * dpr);

  for (const car of t.cars) {
    if (car.isPlayer) continue;
    const [x, y] = toMap(car.x, car.z);
    g.fillStyle = toCssColor(car.color);
    g.strokeStyle = "#111";
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.arc(x, y, 4.2 * dpr, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // Player: arrow pointing along its heading.
  const [px, py] = toMap(t.player.x, t.player.z);
  g.save();
  g.translate(px, py);
  g.rotate(Math.PI - t.player.heading);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#e10600";
  g.lineWidth = 2 * dpr;
  g.beginPath();
  g.moveTo(0, -8 * dpr);
  g.lineTo(6 * dpr, 6 * dpr);
  g.lineTo(0, 3 * dpr);
  g.lineTo(-6 * dpr, 6 * dpr);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

export function Minimap({ outline, subscribe }: { outline: CircuitOutline; subscribe: TelemetrySubscription }) {
  const bounds = useMemo(() => boundsOf(outline), [outline]);
  const canvasRef = useTelemetryCanvas(subscribe, (g, t, size) => drawMinimap(g, outline, bounds, t, size));
  return (
    <div className={`${styles.panel} ${styles.minimap}`}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Minimapa del circuito" />
    </div>
  );
}
