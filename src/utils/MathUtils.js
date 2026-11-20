// utils/MathUtils.js

/** Linear interpolation */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Clamp value between min and max */
export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

/** Convert grid cell index to world position */
export const cellToWorld = (cell, cellSize) => cell * cellSize;

/** Spatial hash key for a world position */
export const spatialKey = (x, z, cellSize) =>
  `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;

/** Distance squared (avoid sqrt for perf) */
export const distSq = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

/** Normalize a 2D vector */
export const normalize2D = (dx, dz) => {
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  return { dx: dx / len, dz: dz / len };
};
