import { useEffect, useRef } from "react";
import type { LiveTelemetry } from "@/race/application/race-ui-state";

export type TelemetrySubscription = (listener: (t: LiveTelemetry) => void) => () => void;

/**
 * Keeps a canvas sized to its box (at device pixel ratio) and redraws it on
 * every telemetry frame, outside React's render cycle.
 */
export function useTelemetryCanvas(
  subscribe: TelemetrySubscription,
  draw: (g: CanvasRenderingContext2D, t: LiveTelemetry, size: { w: number; h: number; dpr: number }) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);

  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const size = { w: 1, h: 1, dpr: 1 };
    const fit = () => {
      size.dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.w = canvas.width = Math.max(1, Math.round(canvas.clientWidth * size.dpr));
      size.h = canvas.height = Math.max(1, Math.round(canvas.clientHeight * size.dpr));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    const unsubscribe = subscribe((t) => drawRef.current(g, t, size));
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [subscribe]);

  return canvasRef;
}
