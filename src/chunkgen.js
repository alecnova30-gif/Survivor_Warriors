import { initWorld, densityFromHeight, CHUNK, colorAt, heightAt, biomeAt, SEA } from './worldgen.js';
import { meshField } from './surfacenets.js';
import { ITEMS } from './items.js';

const NS = CHUNK + 1;
let ready = false;

export function ensureWorld(seed) {
  if (!ready) {
    initWorld(seed);
    ready = true;
  }
}

export function buildChunk({ cx, cy, cz, spheres }) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK, z0 = cz * CHUNK;

  const hCol = new Float32Array(NS * NS);
  const bCol = new Uint8Array(NS * NS);
  let maxH = -Infinity;
  for (let iz = 0; iz < NS; iz++) {
    for (let ix = 0; ix < NS; ix++) {
      const wx = x0 + ix, wz = z0 + iz;
      const h = heightAt(wx, wz);
      hCol[iz * NS + ix] = h;
      if (h > maxH) maxH = h;
      bCol[iz * NS + ix] = biomeAt(wx, wz, h);
    }
  }

  if (y0 > maxH + 4) {
    return { empty: true };
  }

  const data = new Float32Array(NS * NS * NS);
  for (let iz = 0; iz < NS; iz++) {
    const wz = z0 + iz;
    for (let ix = 0; ix < NS; ix++) {
      const wx = x0 + ix;
      const h = hCol[iz * NS + ix];
      const colBase = ix + iz * NS * NS;
      for (let iy = 0; iy < NS; iy++) {
        data[colBase + iy * NS] = densityFromHeight(wx, y0 + iy, wz, h);
      }
    }
  }

  applySpheres(data, spheres, x0, y0, z0);

  const { positions, normals, indices } = meshField(data, NS);
  if (positions.length === 0) {
    return { empty: true };
  }

  const matGrid = buildMatGrid(spheres, x0, y0, z0);
  const vCount = positions.length / 3;
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array(vCount * 2);
  const col = [0, 0, 0];
  for (let i = 0; i < vCount; i++) {
    const lx = positions[i * 3], ly = positions[i * 3 + 1], lz = positions[i * 3 + 2];
    const wx = x0 + lx, wy = y0 + ly, wz = z0 + lz;
    const cix = Math.min(NS - 1, Math.max(0, Math.round(lx)));
    const ciz = Math.min(NS - 1, Math.max(0, Math.round(lz)));
    const h = hCol[ciz * NS + cix];
    const biome = bCol[ciz * NS + cix];
    let r, g, b;
    const mi = matAt(matGrid, lx, ly, lz);
    if (mi >= 0) {
      const c = ITEMS[mi].color;
      r = c[0]; g = c[1]; b = c[2];
    } else {
      colorAt(wx, wy, wz, normals[i * 3 + 1], h, biome, col);
      r = col[0]; g = col[1]; b = col[2];
    }
    const ao = 0.72 + 0.28 * Math.max(0, normals[i * 3 + 1]);
    colors[i * 3] = r * ao;
    colors[i * 3 + 1] = g * ao;
    colors[i * 3 + 2] = b * ao;
    uvs[i * 2] = wx * 0.22;
    uvs[i * 2 + 1] = wz * 0.22;
  }

  return { positions, normals, colors, uvs, indices };
}

function applySpheres(data, spheres, x0, y0, z0) {
  if (!spheres || spheres.length === 0) return;
  for (const s of spheres) {
    const minX = Math.max(0, Math.floor(s.x - s.r - x0));
    const maxX = Math.min(NS - 1, Math.ceil(s.x + s.r - x0));
    const minY = Math.max(0, Math.floor(s.y - s.r - y0));
    const maxY = Math.min(NS - 1, Math.ceil(s.y + s.r - y0));
    const minZ = Math.max(0, Math.floor(s.z - s.r - z0));
    const maxZ = Math.min(NS - 1, Math.ceil(s.z + s.r - z0));
    if (minX > maxX || minY > maxY || minZ > maxZ) continue;
    const r2 = s.r * s.r;
    for (let iz = minZ; iz <= maxZ; iz++) {
      const dz = z0 + iz - s.z;
      for (let iy = minY; iy <= maxY; iy++) {
        const dy = y0 + iy - s.y;
        for (let ix = minX; ix <= maxX; ix++) {
          const dx = x0 + ix - s.x;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          const dist = Math.sqrt(d2);
          const carved = s.sign > 0 ? s.r - dist : dist - s.r;
          const idx = ix + iy * NS + iz * NS * NS;
          if (s.sign > 0) data[idx] = Math.max(data[idx], carved);
          else data[idx] = Math.min(data[idx], carved);
        }
      }
    }
  }
}

function buildMatGrid(spheres, x0, y0, z0) {
  const mat = new Int8Array(NS * NS * NS).fill(-1);
  for (const s of spheres) {
    if (s.mat < 0) continue;
    const r = Math.max(0, s.r - 0.6);
    const minX = Math.max(0, Math.floor(s.x - r - x0));
    const maxX = Math.min(NS - 1, Math.ceil(s.x + r - x0));
    const minY = Math.max(0, Math.floor(s.y - r - y0));
    const maxY = Math.min(NS - 1, Math.ceil(s.y + r - y0));
    const minZ = Math.max(0, Math.floor(s.z - r - z0));
    const maxZ = Math.min(NS - 1, Math.ceil(s.z + r - z0));
    const r2 = r * r;
    for (let iz = minZ; iz <= maxZ; iz++) {
      const dz = z0 + iz - s.z;
      for (let iy = minY; iy <= maxY; iy++) {
        const dy = y0 + iy - s.y;
        for (let ix = minX; ix <= maxX; ix++) {
          const dx = x0 + ix - s.x;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          mat[ix + iy * NS + iz * NS * NS] = s.mat;
        }
      }
    }
  }
  return mat;
}

function matAt(matGrid, lx, ly, lz) {
  const ix = Math.min(NS - 1, Math.max(0, Math.floor(lx + 0.5)));
  const iy = Math.min(NS - 1, Math.max(0, Math.floor(ly + 0.5)));
  const iz = Math.min(NS - 1, Math.max(0, Math.floor(lz + 0.5)));
  return matGrid[ix + iy * NS + iz * NS * NS];
}
