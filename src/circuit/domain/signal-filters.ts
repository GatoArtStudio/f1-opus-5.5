// Filters over values sampled around a closed loop (indices wrap around).

export function smoothLoop(values: ArrayLike<number>, radius: number): Float32Array {
  const n = values.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[(i + k + n) % n];
    out[i] = sum / (radius * 2 + 1);
  }
  return out;
}

export function minFilterLoop(values: ArrayLike<number>, radius: number): Float32Array {
  const n = values.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let min = Infinity;
    for (let k = -radius; k <= radius; k++) min = Math.min(min, values[(i + k + n) % n]);
    out[i] = min;
  }
  return out;
}
