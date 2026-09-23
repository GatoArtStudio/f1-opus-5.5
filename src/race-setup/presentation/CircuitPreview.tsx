"use client";

import { useEffect, useRef } from "react";
import { boundsOf, drawCircuitOutline, fitToCanvas } from "@/circuit/presentation/draw-circuit-outline";
import type { CircuitOutline } from "@/race/application/race-ui-state";
import styles from "./main-menu.module.css";

/** Static top-down view of the selected circuit, drawn like the in-race minimap. */
export function CircuitPreview({ outline }: { outline: CircuitOutline }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const bounds = boundsOf(outline);
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = (canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr)));
      const h = (canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr)));
      drawCircuitOutline(g, outline, fitToCanvas(bounds, { w, h, dpr }), dpr);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [outline]);

  return (
    <div className={styles.preview}>
      <canvas ref={canvasRef} className={styles.previewCanvas} aria-label="Vista previa del circuito" />
    </div>
  );
}
