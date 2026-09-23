"use client";

import { useMemo } from "react";
import {
  boundsOf,
  drawCircuitOutline,
  fitToCanvas,
  type CanvasSize,
  type OutlineBounds,
} from "@/circuit/presentation/draw-circuit-outline";
import type { CircuitOutline, LiveTelemetry } from "@/race/application/race-ui-state";
import { toCssColor } from "@/shared/presentation/format";
import styles from "./hud.module.css";
import { useTelemetryCanvas, type TelemetrySubscription } from "./use-telemetry-canvas";

function drawMinimap(
  g: CanvasRenderingContext2D,
  outline: CircuitOutline,
  bounds: OutlineBounds,
  t: LiveTelemetry,
  size: CanvasSize,
) {
  const { w, h, dpr } = size;
  const toMap = fitToCanvas(bounds, size);
  g.clearRect(0, 0, w, h);
  drawCircuitOutline(g, outline, toMap, dpr);

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
