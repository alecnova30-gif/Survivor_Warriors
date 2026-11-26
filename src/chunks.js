import * as THREE from 'three';
import { CHUNK, VCH, heightAt } from './worldgen.js';

const WORKER_URL = new URL('./worker.js', import.meta.url);

export class ChunkManager {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.chunks = new Map();
    this.queue = [];
    this.queued = new Set();
    this.inFlight = new Map();
    this.edits = new Map();
    this.allSpheres = [];
    this.viewDist = 6;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.onChunkLoad = null;
    this.onChunkUnload = null;
    this.onDiagnostic = null;
    this.nextId = 1;
    this.raycaster = new THREE.Raycaster();
    this.terrainMaterial = null;
    this.meshes = [];

    this.workers = [];
    this.fallback = false;
    this.fallbackGen = null;
    try {
      const n = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(WORKER_URL, { type: 'module' });
        w.postMessage({ type: 'init', seed });
        w.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === 'init') return;
          if (msg.error) {
            this.diag('Erreur worker: ' + msg.error);
            return;
          }
          const k = this.inFlight.get(msg.id);
          if (!k) return;
          this.inFlight.delete(msg.id);
          this.applyChunkResult(k, msg);
        };
        w.onerror = (e) => {
          this.diag('Worker indisponible (' + (e.message || 'erreur de chargement') + '), basculement sans workers');
          this.enableFallback();
        };
        this.workers.push(w);
      }
    } catch (e) {
      this.diag('Workers non supportés, génération sur le thread principal');
      this.enableFallback();
    }
  }

  diag(text) {
    if (this.onDiagnostic) this.onDiagnostic(text);
    console.warn('[Terra Vive]', text);
  }

  enableFallback() {
    if (this.fallback) return;
    this.fallback = true;
    for (const w of this.workers) { w.onmessage = null; w.onerror = null; w.terminate(); }
    this.workers = [];
    this.inFlight.clear();
    import('./chunkgen.js').then((m) => {
      this.fallbackGen = m;
      this.fallbackGen.ensureWorld(this.seed);
      for (const [, c] of this.chunks) {
        if (c.state === 'pending' || c.mesh || c.state === 'ready' || c.state === 'empty') this.enqueue(c.key);
      }
      this.pump();
    }).catch((e) => this.diag('Impossible de charger le générateur: ' + e.message));
  }

  key(cx, cy, cz) { return cx + ',' + cy + ',' + cz; }

  columnMaxEst(cx, cz) {
    const x = cx * CHUNK, z = cz * CHUNK;
    return Math.max(
      heightAt(x + 16, z + 16),
      heightAt(x, z),
      heightAt(x + 32, z),
      heightAt(x, z + 32),
      heightAt(x + 32, z + 32)
    );
  }

  update(px, pz) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const wanted = [];
    for (let dz = -this.viewDist; dz <= this.viewDist; dz++) {
      for (let dx = -this.viewDist; dx <= this.viewDist; dx++) {
        if (dx * dx + dz * dz > this.viewDist * this.viewDist + 2) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const estH = this.columnMaxEst(cx, cz);
        for (let cy = 0; cy < VCH; cy++) {
          if (cy * CHUNK > estH + 14) continue;
          wanted.push([cx, cy, cz, dx * dx + dz * dz + cy * 0.25]);
        }
      }
    }
    wanted.sort((a, b) => a[3] - b[3]);
    for (const [cx, cy, cz] of wanted) {
      const k = this.key(cx, cy, cz);
      if (!this.chunks.has(k) && !this.queued.has(k)) {
        this.chunks.set(k, { cx, cy, cz, key: k, mesh: null, state: 'pending', dirty: false });
        this.enqueue(k);
      }
    }

    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (this.viewDist + 2) * (this.viewDist + 2)) {
        this.unload(c);
      }
    }

    this.pump();
  }

  enqueue(k) {
    if (this.queued.has(k)) return;
    this.queued.add(k);
    this.queue.push(k);
  }

  pump() {
    if (this.fallback) {
      if (!this.fallbackGen) return;
      while (this.queue.length > 0) {
        const k = this.queue.shift();
        this.queued.delete(k);
        const c = this.chunks.get(k);
        if (!c) continue;
        let msg;
        try {
          msg = this.fallbackGen.buildChunk({ cx: c.cx, cy: c.cy, cz: c.cz, spheres: this.edits.get(k) || [] });
        } catch (e) {
          this.diag('Erreur de génération: ' + (e && e.message));
          continue;
        }
        this.applyChunkResult(k, msg);
        if (msg.positions) {
          setTimeout(() => this.pump(), 16);
          return;
        }
      }
      return;
    }

    while (this.queue.length > 0 && this.inFlight.size < this.workers.length * 2) {
      const k = this.queue.shift();
      this.queued.delete(k);
      if (!this.chunks.has(k)) continue;
      const c = this.chunks.get(k);
      const id = this.nextId++;
      this.inFlight.set(id, k);
      const w = this.workers[id % this.workers.length];
      w.postMessage({ id, cx: c.cx, cy: c.cy, cz: c.cz, spheres: this.edits.get(k) || [] });
    }
  }

  applyChunkResult(k, msg) {
    const c = this.chunks.get(k);
    if (!c) return;

    if (c.mesh) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      const i = this.meshes.indexOf(c.mesh);
      if (i >= 0) this.meshes.splice(i, 1);
      c.mesh = null;
    }

    if (msg.empty || !msg.positions) {
      c.state = 'empty';
    } else {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(msg.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(msg.normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(msg.colors, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(msg.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.terrainMaterial);
      mesh.position.set(c.cx * CHUNK, c.cy * CHUNK, c.cz * CHUNK);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.chunkKey = k;
      this.group.add(mesh);
      this.meshes.push(mesh);
      c.mesh = mesh;
      c.state = 'ready';
      if (!c.featured) {
        c.featured = true;
        if (this.onChunkLoad) this.onChunkLoad(c.cx, c.cz);
      }
    }

    if (c.dirty) {
      c.dirty = false;
      this.enqueue(k);
    }
  }

  setMaterial(mat) {
    this.terrainMaterial = mat;
    for (const [, c] of this.chunks) {
      if (c.mesh) c.mesh.material = mat;
    }
  }

  applyEdit(sphere) {
    this.allSpheres.push(sphere);
    const r = sphere.r;
    const minX = Math.floor((sphere.x - r) / CHUNK), maxX = Math.floor((sphere.x + r) / CHUNK);
    const minY = Math.max(0, Math.floor((sphere.y - r) / CHUNK)), maxY = Math.min(VCH - 1, Math.floor((sphere.y + r) / CHUNK));
    const minZ = Math.floor((sphere.z - r) / CHUNK), maxZ = Math.floor((sphere.z + r) / CHUNK);
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const k = this.key(cx, cy, cz);
          let arr = this.edits.get(k);
          if (!arr) { arr = []; this.edits.set(k, arr); }
          arr.push(sphere);
          const c = this.chunks.get(k);
          if (c) {
            c.dirty = true;
            this.enqueue(k);
          }
        }
      }
    }
  }

  restoreSphere(sphere) {
    const r = sphere.r;
    const minX = Math.floor((sphere.x - r) / CHUNK), maxX = Math.floor((sphere.x + r) / CHUNK);
    const minY = Math.max(0, Math.floor((sphere.y - r) / CHUNK)), maxY = Math.min(VCH - 1, Math.floor((sphere.y + r) / CHUNK));
    const minZ = Math.floor((sphere.z - r) / CHUNK), maxZ = Math.floor((sphere.z + r) / CHUNK);
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const k = this.key(cx, cy, cz);
          let arr = this.edits.get(k);
          if (!arr) { arr = []; this.edits.set(k, arr); }
          arr.push(sphere);
        }
      }
    }
  }

  nearbyMeshes(x, z, radius = 2) {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    const out = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let cy = 0; cy < VCH; cy++) {
          const cc = this.chunks.get(this.key(pcx + dx, cy, pcz + dz));
          if (cc && cc.mesh) out.push(cc.mesh);
        }
      }
    }
    return out;
  }

  raycast(origin, dir, maxDist, meshes) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(meshes, false);
    return hits.length > 0 ? hits[0] : null;
  }

  groundAt(x, z, fromY, maxDrop = 8) {
    const meshes = this.nearbyMeshes(x, z, 0);
    if (meshes.length === 0) return heightAt(x, z);
    const origin = new THREE.Vector3(x, fromY + 0.5, z);
    const hit = this.raycast(origin, new THREE.Vector3(0, -1, 0), maxDrop + 0.5, meshes);
    if (hit) return hit.point.y;
    return heightAt(x, z);
  }

  unload(c) {
    if (c.mesh) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      const i = this.meshes.indexOf(c.mesh);
      if (i >= 0) this.meshes.splice(i, 1);
    }
    this.chunks.delete(c.key);
    if (this.onChunkUnload) this.onChunkUnload(c.cx, c.cz);
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const [, c] of this.chunks) {
      if (c.mesh) c.mesh.geometry.dispose();
    }
    this.chunks.clear();
  }
}
