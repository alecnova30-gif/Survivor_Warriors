import { Simplex, fbm2 } from './noise.js';

export const SEA = 24;
export const WORLD_H = 96;
export const CHUNK = 32;
export const VCH = 3;

let nCont, nMask, nRidge, nHill, nDet, nT, nH, nOv, nC1, nC2, nC3, nVar, nTree;
let WORLD_SEED = 1;

export function initWorld(seed) {
  WORLD_SEED = seed | 0;
  nCont = new Simplex(seed + 1);
  nMask = new Simplex(seed + 2);
  nRidge = new Simplex(seed + 3);
  nHill = new Simplex(seed + 4);
  nDet = new Simplex(seed + 5);
  nT = new Simplex(seed + 6);
  nH = new Simplex(seed + 7);
  nOv = new Simplex(seed + 8);
  nC1 = new Simplex(seed + 9);
  nC2 = new Simplex(seed + 10);
  nC3 = new Simplex(seed + 11);
  nVar = new Simplex(seed + 12);
  nTree = new Simplex(seed + 13);
}

export function heightAt(x, z) {
  const c = fbm2(nCont, x * 0.0009, z * 0.0009, 4);
  const mmRaw = fbm2(nMask, x * 0.00045 + 377, z * 0.00045 - 211, 3);
  const mm = smoothstep(0.05, 0.7, mmRaw);
  const ridge = 1 - Math.abs(fbm2(nRidge, x * 0.0026 + 91, z * 0.0026 + 17, 4));
  const hills = fbm2(nHill, x * 0.008, z * 0.008, 4);
  const detail = fbm2(nDet, x * 0.045, z * 0.045, 2);
  let h = SEA + 3 + c * 27 + mm * (5 + ridge * ridge * 64) + hills * (4 + 9 * mm) + detail * 1.4;
  if (h > SEA - 2.5 && h < SEA + 3.2) h = SEA + (h - SEA) * 0.42;
  return clamp(h, 2, WORLD_H - 4);
}

export function tempAt(x, z, h) {
  const t = fbm2(nT, x * 0.00035 + 500, z * 0.00035 + 500, 3);
  return t - Math.max(0, h - SEA) * 0.007;
}

export function humidAt(x, z) {
  return fbm2(nH, x * 0.0004 - 800, z * 0.0004 + 300, 3);
}

export const BIOME = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4,
  SAVANNA: 5, TUNDRA: 6, MOUNTAIN: 7, SWAMP: 8
};

export function biomeAt(x, z, h) {
  if (h === undefined) h = heightAt(x, z);
  const alt = h - SEA;
  const temp = tempAt(x, z, h);
  const humid = humidAt(x, z);
  if (h < SEA - 1.2) return BIOME.OCEAN;
  if (h < SEA + 2.2) return BIOME.BEACH;
  if (alt > 44) return BIOME.MOUNTAIN;
  if (temp < -0.3) return BIOME.TUNDRA;
  if (temp > 0.38 && humid < 0.05) return BIOME.DESERT;
  if (humid > 0.25 && alt < 4 && temp > 0.05) return BIOME.SWAMP;
  if (humid > 0.18) return BIOME.FOREST;
  if (humid < -0.22) return BIOME.SAVANNA;
  return BIOME.PLAINS;
}

const SURFACE_COLORS = [
  [0.72, 0.68, 0.52],
  [0.85, 0.79, 0.6],
  [0.44, 0.65, 0.3],
  [0.31, 0.5, 0.24],
  [0.85, 0.76, 0.54],
  [0.66, 0.64, 0.31],
  [0.93, 0.95, 0.97],
  [0.52, 0.51, 0.49],
  [0.36, 0.44, 0.27]
];

const DIRT = [0.45, 0.34, 0.22];
const STONE = [0.5, 0.5, 0.5];

export function surfaceColor(x, z, h, biome, out) {
  const v = nVar.noise2D(x * 0.13, z * 0.13) * 0.5 + nVar.noise2D(x * 0.021, z * 0.021) * 0.5;
  const m = 0.9 + v * 0.16;
  if (biome === BIOME.TUNDRA) {
    const snow = smoothstep(-0.3, -0.12, tempAt(x, z, h));
    const r = lerp(0.93, 0.5, snow), g = lerp(0.95, 0.56, snow), b2 = lerp(0.97, 0.36, snow);
    out[0] = r * m; out[1] = g * m; out[2] = b2 * m;
    return;
  }
  const base = SURFACE_COLORS[biome];
  out[0] = base[0] * m; out[1] = base[1] * m; out[2] = base[2] * m;
}

export function colorAt(x, y, z, ny, h, biome, out) {
  const depth = h - y;
  if (depth < 1.2) {
    surfaceColor(x, z, h, biome, out);
  } else if (depth < 4.2) {
    const v = nVar.noise2D(x * 0.3, z * 0.3);
    const m = 0.92 + v * 0.12;
    if (biome === BIOME.DESERT || biome === BIOME.BEACH) { out[0] = 0.82 * m; out[1] = 0.74 * m; out[2] = 0.53 * m; }
    else { out[0] = DIRT[0] * m; out[1] = DIRT[1] * m; out[2] = DIRT[2] * m; }
  } else {
    const v = nVar.noise2D(x * 0.2, z * 0.2) * 0.5 + nVar.noise2D(y * 0.25, x * 0.25) * 0.5;
    const m = 0.88 + v * 0.18;
    const deep = clamp((depth - 10) * 0.01, 0, 0.25);
    out[0] = STONE[0] * m * (1 - deep); out[1] = STONE[1] * m * (1 - deep); out[2] = STONE[2] * m * (1 - deep * 0.8);
  }
  if (ny < 0.62 && depth < 5) {
    const t = clamp((0.62 - ny) * 2.4, 0, 1);
    const v = nVar.noise2D(x * 0.11, z * 0.11);
    const m = 0.9 + v * 0.14;
    out[0] = lerp(out[0], 0.5 * m, t); out[1] = lerp(out[1], 0.49 * m, t); out[2] = lerp(out[2], 0.47 * m, t);
  }
  if (y < SEA - 0.5 && depth < 2.5) {
    const t = clamp((SEA - y) * 0.18, 0, 0.65);
    out[0] = lerp(out[0], 0.35, t); out[1] = lerp(out[1], 0.42, t); out[2] = lerp(out[2], 0.3, t);
  }
}

export function worldDensity(x, y, z) {
  return densityFromHeight(x, y, z, heightAt(x, z));
}

export function densityFromHeight(x, y, z, h) {
  let d = h - y;
  const surfaceDist = Math.abs(h - y);
  const w = Math.max(0, 1 - surfaceDist * 0.055);
  if (w > 0) d += nOv.noise3D(x * 0.02, y * 0.05, z * 0.02) * 3.2 * w;
  if (y > 2 && y < h - 3 && h > SEA + 1.5) {
    const c1 = Math.abs(nC1.noise3D(x * 0.013, y * 0.02, z * 0.013));
    const c2 = Math.abs(nC2.noise3D(x * 0.013 + 700, y * 0.02 + 400, z * 0.013 + 700));
    const tunnel = (Math.max(c1, c2) - 0.13) * 30;
    if (tunnel < 0) d = Math.min(d, tunnel);
    if (y < h - 16) {
      const c3 = Math.abs(nC3.noise3D(x * 0.009, y * 0.014, z * 0.009));
      const cheese = (c3 - 0.09) * 45;
      if (cheese < 0) d = Math.min(d, cheese);
    }
  }
  return d;
}

export function spawnHeight(x, z) {
  return heightAt(x, z);
}

export function findSpawn(seed) {
  for (let r = 0; r < 4000; r += 7) {
    const a = r * 2.399963;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > SEA + 2.5 && h < SEA + 30 && biomeAt(x, z, h) !== BIOME.OCEAN) return [x, h + 2, z];
  }
  return [0, SEA + 20, 0];
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, t) {
  t = clamp((t - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
