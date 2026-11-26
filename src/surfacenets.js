const EDGES = [
  0, 1, 2, 3, 4, 5, 6, 7,
  0, 2, 1, 3, 4, 6, 5, 7,
  0, 4, 1, 5, 2, 6, 3, 7
];

export function meshField(data, ns) {
  const verts = [];
  const indices = [];
  const vertIdx = new Int32Array(ns * ns * ns).fill(-1);
  const grid = new Float32Array(8);
  const cellCount = ns - 1;
  const STR = [1, ns, ns * ns];

  for (let z = 0; z < cellCount; z++) {
    for (let y = 0; y < cellCount; y++) {
      let base = y * ns + z * ns * ns;
      for (let x = 0; x < cellCount; x++, base++) {
        let mask = 0;
        let g = 0;
        for (let k = 0; k < 2; k++) {
          for (let j = 0; j < 2; j++) {
            const row = base + j * ns + k * ns * ns;
            for (let i = 0; i < 2; i++, g++) {
              const v = data[row + i];
              grid[g] = v;
              if (v < 0) mask |= 1 << g;
            }
          }
        }
        if (mask === 0 || mask === 255) continue;

        let vx = 0, vy = 0, vz = 0, cnt = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e], b = EDGES[e + 1];
          const va = grid[a], vb = grid[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
          const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
          vx += ax + (bx - ax) * t;
          vy += ay + (by - ay) * t;
          vz += az + (bz - az) * t;
          cnt++;
        }
        const vid = verts.length / 3;
        vertIdx[base] = vid;
        verts.push(x + vx / cnt, y + vy / cnt, z + vz / cnt);

        const X = [x, y, z];
        for (let d = 0; d < 3; d++) {
          const s0 = data[base], s1 = data[base + STR[d]];
          if ((s0 < 0) === (s1 < 0)) continue;
          const u = (d + 1) % 3, v = (d + 2) % 3;
          if (X[u] === 0 || X[v] === 0) continue;
          const su = STR[u], sv = STR[v];
          const A = vertIdx[base];
          const B = vertIdx[base - su];
          const C = vertIdx[base - su - sv];
          const D = vertIdx[base - sv];
          if (A < 0 || B < 0 || C < 0 || D < 0) continue;
          if (s0 > 0) indices.push(A, B, C, A, C, D);
          else indices.push(A, D, C, A, C, B);
        }
      }
    }
  }

  const positions = new Float32Array(verts);
  const normals = new Float32Array(verts.length);
  computeNormals(data, ns, verts, normals);
  return { positions, normals, indices: new Uint32Array(indices) };
}

function computeNormals(data, ns, verts, normals) {
  const n = verts.length / 3;
  const max = ns - 1;
  for (let i = 0; i < n; i++) {
    const fx = clamp(verts[i * 3], 0, max - 1e-4);
    const fy = clamp(verts[i * 3 + 1], 0, max - 1e-4);
    const fz = clamp(verts[i * 3 + 2], 0, max - 1e-4);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    let nx = 0, nyy = 0, nz = 0;
    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < 2; j++) {
        for (let ii = 0; ii < 2; ii++) {
          const cx = clamp(x0 + ii, 1, max - 1);
          const cy = clamp(y0 + j, 1, max - 1);
          const cz = clamp(z0 + k, 1, max - 1);
          const idx = cx + cy * ns + cz * ns * ns;
          const dx = data[idx + 1] - data[idx - 1];
          const dy = data[idx + ns] - data[idx - ns];
          const dz = data[idx + ns * ns] - data[idx - ns * ns];
          const w = (ii ? tx : 1 - tx) * (j ? ty : 1 - ty) * (k ? tz : 1 - tz);
          nx += dx * w; nyy += dy * w; nz += dz * w;
        }
      }
    }
    const len = Math.sqrt(nx * nx + nyy * nyy + nz * nz) || 1;
    normals[i * 3] = -nx / len;
    normals[i * 3 + 1] = -nyy / len;
    normals[i * 3 + 2] = -nz / len;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
