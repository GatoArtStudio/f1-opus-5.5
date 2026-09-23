/** Calls `frame` with the elapsed seconds on every animation frame. */
export function startAnimationLoop(frame: (dt: number) => void): () => void {
  let last = performance.now();
  let handle = requestAnimationFrame(function loop(now) {
    handle = requestAnimationFrame(loop);
    const dt = (now - last) / 1000;
    last = now;
    frame(dt);
  });
  return () => cancelAnimationFrame(handle);
}
