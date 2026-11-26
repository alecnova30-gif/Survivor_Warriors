import * as THREE from 'three';
import { BIOME, SEA, heightAt, biomeAt } from './worldgen.js';
import { mulberry32, hash2i } from './noise.js';

const WOOD = () => new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
const LEAF = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
const ROCK = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
const CACTUS = () => new THREE.MeshStandardMaterial({ color: 0x3e7d3a, roughness: 0.8 });
const BARK_BIRCH = () => new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.85 });

function jitterColor(mat, rng, amt = 0.12) {
  const f = 1 + (rng() - 0.5) * 2 * amt;
  mat.color.multiplyScalar(f);
  return mat;
}

export class FeatureManager {
  constructor(scene, chunkManager, seed, onDrop) {
    this.scene = scene;
    this.cm = chunkManager;
    this.seed = seed;
    this.onDrop = onDrop;
    this.byChunk = new Map();
    this.pickables = [];
    this.removed = new Set();
    this.lights = [];
    this.growTimers = [];
    chunkManager.onChunkLoad = (cx, cz) => this.loadChunk(cx, cz);
    chunkManager.onChunkUnload = (cx, cz) => this.unloadChunk(cx, cz);
  }

  loadChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (this.byChunk.has(key)) return;
    const list = [];
    const rng = mulberry32(hash2i(cx, cz, this.seed));
    const attempts = 24;
    for (let i = 0; i < attempts; i++) {
      const x = cx * 32 + rng() * 32;
      const z = cz * 32 + rng() * 32;
      const sid = key + ':' + i;
      if (this.removed.has(sid)) continue;
      const h = heightAt(x, z);
      if (h < SEA + 0.9) continue;
      const s = Math.max(
        Math.abs(heightAt(x + 1.6, z) - h),
        Math.abs(heightAt(x - 1.6, z) - h),
        Math.abs(heightAt(x, z + 1.6) - h),
        Math.abs(heightAt(x, z - 1.6) - h)
      );
      if (s > 2.4) continue;
      const b = biomeAt(x, z, h);
      const r = rng();
      let f = null;
      switch (b) {
        case BIOME.FOREST:
          if (r < 0.5) f = rng() < 0.72 ? this.makeTree('oak', x, h, z, rng) : this.makeTree('birch', x, h, z, rng);
          else if (r < 0.58) f = this.makeBush(x, h, z, rng);
          else if (r < 0.64) f = this.makeBoulder(x, h, z, rng, 0x8a8a86);
          break;
        case BIOME.PLAINS:
          if (r < 0.09) f = this.makeTree('oak', x, h, z, rng);
          else if (r < 0.14) f = this.makeBush(x, h, z, rng);
          else if (r < 0.2) f = this.makeBoulder(x, h, z, rng, 0x8a8a86);
          break;
        case BIOME.SAVANNA:
          if (r < 0.07) f = this.makeTree('oak', x, h, z, rng, 0x7d8b3e);
          else if (r < 0.11) f = this.makeBoulder(x, h, z, rng, 0x9a8f70);
          break;
        case BIOME.TUNDRA:
          if (r < 0.28) f = this.makeTree('pine', x, h, z, rng);
          else if (r < 0.33) f = this.makeBoulder(x, h, z, rng, 0x9aa0a4);
          break;
        case BIOME.DESERT:
          if (r < 0.09) f = this.makeCactus(x, h, z, rng);
          else if (r < 0.12) f = this.makeBoulder(x, h, z, rng, 0xc0aa7a);
          break;
        case BIOME.MOUNTAIN:
          if (r < 0.05 && h < SEA + 52) f = this.makeTree('pine', x, h, z, rng);
          else if (r < 0.14) f = this.makeBoulder(x, h, z, rng, 0x82827e);
          else if (r < 0.17) f = this.makeOreBoulder(x, h, z, rng, 'ironOre', 0xd8a878);
          else if (r < 0.19) f = this.makeOreBoulder(x, h, z, rng, 'goldOre', 0xffd23e);
          break;
        case BIOME.SWAMP:
          if (r < 0.14) f = this.makeTree('willow', x, h, z, rng);
          else if (r < 0.2) f = this.makeBush(x, h, z, rng);
          break;
        case BIOME.BEACH:
          if (r < 0.035) f = this.makeTree('palm', x, h, z, rng);
          break;
      }
      if (f) {
        f.saveId = sid;
        f.chunkKey = key;
        this.indexFeature(f);
        this.scene.add(f.group);
        list.push(f);
        this.pickables.push(f);
      }
    }
    this.byChunk.set(key, list);
  }

  unloadChunk(cx, cz) {
    const key = cx + ',' + cz;
    const list = this.byChunk.get(key);
    if (!list) return;
    for (const f of list) {
      this.scene.remove(f.group);
      const i = this.pickables.indexOf(f);
      if (i >= 0) this.pickables.splice(i, 1);
    }
    this.byChunk.delete(key);
  }

  addPickables(f) {
    this.scene.add(f.group);
    this.pickables.push(f);
  }

  place(type, x, y, z) {
    let f = null;
    if (type === 'torch') f = this.makeTorch(x, y, z);
    else if (type === 'campfire') f = this.makeCampfire(x, y, z);
    else if (type === 'sapling') f = this.makeSapling(x, y, z);
    if (!f) return null;
    f.chunkKey = 'placed';
    f.saveId = null;
    f.placed = true;
    this.indexFeature(f);
    this.addPickables(f);
    return f;
  }

  makeTorch(x, y, z) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), WOOD());
    stick.position.y = 0.45;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff7010, emissiveIntensity: 2.2 })
    );
    flame.position.y = 1.0;
    g.add(stick, flame);
    const light = this.attachLight(g, 0xffa048, 1.6, 13, 1.0);
    g.position.set(x, y, z);
    return { type: 'torch', kind: 'plant', group: g, hp: 1, maxHp: 1, x, y, z, drops: [], alive: true, light, flame };
  }

  makeCampfire(x, y, z) {
    const g = new THREE.Group();
    const stoneM = ROCK(0x777777);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), stoneM);
      s.position.set(Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62);
      g.add(s);
    }
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), WOOD());
      log.rotation.z = Math.PI / 2.4;
      log.rotation.y = i / 3 * Math.PI;
      log.position.y = 0.2;
      g.add(log);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.75, 10),
      new THREE.MeshStandardMaterial({ color: 0xff9028, emissive: 0xff6010, emissiveIntensity: 2.4 })
    );
    flame.position.y = 0.62;
    g.add(flame);
    const light = this.attachLight(g, 0xff9040, 2.0, 18, 0.42);
    g.position.set(x, y, z);
    return { type: 'campfire', kind: 'plant', group: g, hp: 1, maxHp: 1, x, y, z, drops: [], alive: true, light, flame };
  }

  makeSapling(x, y, z) {
    const g = new THREE.Group();
    const s = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.55, 6),
      LEAF(0x4e8a34)
    );
    s.position.y = 0.3;
    g.add(s);
    g.position.set(x, y, z);
    return { type: 'sapling', kind: 'plant', group: g, hp: 1, maxHp: 1, x, y, z, drops: [{ id: 'sapling', n: 1 }], alive: true, growT: 50 };
  }

  attachLight(g, color, intensity, dist, y) {
    if (this.lights.length >= 22) {
      const old = this.lights.shift();
      old.parent && old.parent.remove(old);
    }
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.y = y;
    g.add(l);
    this.lights.push(l);
    return l;
  }

  makeTree(kind, x, h, z, rng, leafColor) {
    const g = new THREE.Group();
    let woodDrops = 3;
    if (kind === 'oak' || kind === 'willow') {
      const ht = 3.6 + rng() * 2.4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, ht, 7), jitterColor(WOOD(), rng));
      trunk.position.y = ht / 2;
      trunk.rotation.z = (rng() - 0.5) * 0.08;
      g.add(trunk);
      const lc = leafColor !== undefined ? leafColor : (kind === 'willow' ? 0x556b34 : 0x3f7a2e);
      const lm = jitterColor(LEAF(lc), rng, 0.1);
      const blobs = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < blobs; i++) {
        const r = 1.4 + rng() * 1.1;
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lm);
        s.position.set((rng() - 0.5) * 2.4, ht - 0.4 + rng() * 1.6 - (kind === 'willow' ? 1.1 : 0), (rng() - 0.5) * 2.4);
        s.scale.y = kind === 'willow' ? 0.8 : 0.85;
        g.add(s);
      }
      woodDrops = 3 + Math.floor(rng() * 3);
    } else if (kind === 'birch') {
      const ht = 4.5 + rng() * 2.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, ht, 7), BARK_BIRCH());
      trunk.position.y = ht / 2;
      g.add(trunk);
      const lm = jitterColor(LEAF(0x6fa04a), rng, 0.1);
      for (let i = 0; i < 3 + Math.floor(rng() * 2); i++) {
        const r = 1.1 + rng() * 0.8;
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lm);
        s.position.set((rng() - 0.5) * 1.6, ht - 0.8 + rng() * 1.8, (rng() - 0.5) * 1.6);
        g.add(s);
      }
      woodDrops = 3 + Math.floor(rng() * 2);
    } else if (kind === 'pine') {
      const ht = 6 + rng() * 3.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, ht, 7), jitterColor(WOOD(), rng));
      trunk.position.y = ht / 2;
      g.add(trunk);
      const lm = jitterColor(LEAF(0x2c5a2e), rng, 0.1);
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6 * (1 - t * 0.75), 2.2, 9), lm);
        cone.position.y = ht * 0.42 + t * ht * 0.56;
        g.add(cone);
      }
      woodDrops = 4 + Math.floor(rng() * 3);
    } else if (kind === 'palm') {
      const ht = 4.5 + rng() * 2;
      const segs = 5;
      let px = 0, py = 0;
      const lean = (rng() - 0.5) * 0.5;
      for (let i = 0; i < segs; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, ht / segs, 6), WOOD());
        px += lean * (ht / segs);
        seg.position.set(px, py + ht / segs / 2, 0);
        seg.rotation.z = -lean;
        g.add(seg);
        py += ht / segs;
      }
      const fm = jitterColor(LEAF(0x4c8a38), rng, 0.1);
      for (let i = 0; i < 6; i++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.42), fm);
        frond.position.set(px, py, 0);
        frond.rotation.y = i / 6 * Math.PI * 2 + rng() * 0.4;
        frond.rotation.z = -0.5 - rng() * 0.25;
        frond.translateX(1.1);
        g.add(frond);
      }
      woodDrops = 2 + Math.floor(rng() * 2);
    }
    g.position.set(x, h - 0.25, z);
    g.traverse(o => { o.castShadow = true; });
    return {
      type: 'tree', treeKind: kind, kind: 'wood', group: g,
      hp: 6, maxHp: 6, x, y: h, z,
      drops: [{ id: 'wood', n: woodDrops }].concat(rng() < 0.35 ? [{ id: 'sapling', n: 1 }] : []),
      alive: true
    };
  }

  makeBoulder(x, h, z, rng, color) {
    const g = new THREE.Group();
    const s = 0.7 + rng() * 1.1;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), jitterColor(ROCK(color), rng));
    m.scale.set(1 + rng() * 0.4, 0.65 + rng() * 0.5, 1 + rng() * 0.4);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.position.y = s * 0.3;
    g.add(m);
    g.position.set(x, h - 0.2, z);
    g.traverse(o => { o.castShadow = true; });
    return { type: 'boulder', kind: 'stone', group: g, hp: 8, maxHp: 8, x, y: h, z, drops: [{ id: 'stone', n: 3 + Math.floor(rng() * 3) }], alive: true };
  }

  makeOreBoulder(x, h, z, rng, oreId, fleckColor) {
    const f = this.makeBoulder(x, h, z, rng, 0x6f6f6b);
    const n = 4 + Math.floor(rng() * 5);
    const fm = new THREE.MeshStandardMaterial({ color: fleckColor, emissive: fleckColor, emissiveIntensity: 0.5, roughness: 0.4 });
    for (let i = 0; i < n; i++) {
      const fl = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16 + rng() * 0.1), fm);
      const a = rng() * Math.PI * 2, r = 0.6 + rng() * 0.5;
      fl.position.set(Math.cos(a) * r, 0.2 + rng() * 0.7, Math.sin(a) * r);
      f.group.add(fl);
    }
    f.type = 'oreBoulder';
    f.hp = f.maxHp = 13;
    f.drops = [{ id: oreId, n: 2 + Math.floor(rng() * 3) }, { id: 'stone', n: 1 }];
    return f;
  }

  makeBush(x, h, z, rng) {
    const g = new THREE.Group();
    const m = jitterColor(LEAF(0x2e5c26), rng);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), m);
    b.scale.y = 0.75;
    b.position.y = 0.5;
    g.add(b);
    const bm = new THREE.MeshStandardMaterial({ color: 0xc42a4a, roughness: 0.5, emissive: 0x400a14, emissiveIntensity: 0.3 });
    for (let i = 0; i < 6; i++) {
      const ber = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), bm);
      const a = rng() * Math.PI * 2;
      ber.position.set(Math.cos(a) * 0.6, 0.35 + rng() * 0.55, Math.sin(a) * 0.6);
      g.add(ber);
    }
    g.position.set(x, h - 0.1, z);
    g.traverse(o => { o.castShadow = true; });
    return { type: 'bush', kind: 'plant', group: g, hp: 2, maxHp: 2, x, y: h, z, drops: [{ id: 'berries', n: 2 + Math.floor(rng() * 3) }], alive: true };
  }

  makeCactus(x, h, z, rng) {
    const g = new THREE.Group();
    const m = jitterColor(CACTUS(), rng);
    const ht = 1.6 + rng() * 1.4;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, ht, 6, 10), m);
    body.position.y = ht / 2 + 0.2;
    g.add(body);
    if (rng() < 0.6) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 5, 8), m);
      arm.position.set(0.42, ht * 0.6, 0);
      arm.rotation.z = -0.9;
      g.add(arm);
    }
    g.position.set(x, h - 0.1, z);
    g.traverse(o => { o.castShadow = true; });
    return { type: 'cactus', kind: 'plant', group: g, hp: 3, maxHp: 3, x, y: h, z, drops: [], alive: true };
  }

  damage(f, amount, hitDir) {
    if (!f.alive) return false;
    f.hp -= amount;
    f.shake = 1;
    if (hitDir) {
      f.knock = { x: hitDir.x * 0.6, z: hitDir.z * 0.6 };
    }
    if (f.hp <= 0) {
      f.alive = false;
      if (f.light) {
        const i = this.lights.indexOf(f.light);
        if (i >= 0) this.lights.splice(i, 1);
      }
      this.scene.remove(f.group);
      const i = this.pickables.indexOf(f);
      if (i >= 0) this.pickables.splice(i, 1);
      if (f.saveId) this.removed.add(f.saveId);
      const list = this.byChunk.get(f.chunkKey);
      if (list) {
        const j = list.indexOf(f);
        if (j >= 0) list.splice(j, 1);
      }
      for (const d of f.drops) {
        this.onDrop(d.id, d.n, f.x, f.y + 0.8, f.z);
      }
      return true;
    }
    return false;
  }

  raycast(origin, dir, maxDist) {
    if (this.pickables.length === 0) return null;
    const ray = new THREE.Raycaster();
    ray.set(origin, dir);
    ray.far = maxDist;
    const groups = this.pickables.map(f => f.group);
    const hits = ray.intersectObjects(groups, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o) {
        if (o.userData && o.userData.feat) return { feature: o.userData.feat, hit };
        o = o.parent;
      }
    }
    return null;
  }

  indexFeature(f) {
    f.group.userData.feat = f;
    f.group.traverse(o => { o.userData.feat = f; });
  }

  update(dt, t) {
    for (const f of this.pickables) {
      if (f.shake > 0) {
        f.shake = Math.max(0, f.shake - dt * 4);
        f.group.rotation.z = Math.sin(t * 60) * f.shake * 0.05;
      }
      if (f.flame) {
        const s = 1 + Math.sin(t * 14 + f.x) * 0.12;
        f.flame.scale.set(s, 1 + Math.sin(t * 17 + f.z) * 0.18, s);
        if (f.light) f.light.intensity = (f.type === 'campfire' ? 2.0 : 1.6) * (0.85 + Math.sin(t * 11 + f.x * 3) * 0.15);
      }
      if (f.type === 'sapling') {
        f.growT -= dt;
        if (f.growT <= 0) {
          const x = f.x, y = f.y, z = f.z;
          this.damage(f, 999);
          const rng = mulberry32((hash2i(Math.floor(x * 7), Math.floor(z * 7), this.seed)));
          const b = biomeAt(x, z);
          const kind = (b === BIOME.TUNDRA || b === BIOME.MOUNTAIN) ? 'pine' : 'oak';
          const tree = this.makeTree(kind, x, y, z, rng);
          tree.saveId = null;
          tree.chunkKey = 'placed';
          this.indexFeature(tree);
          this.addPickables(tree);
        }
      }
    }
  }
}
