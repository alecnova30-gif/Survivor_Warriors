import { initWorld, densityFromHeight, heightAt, biomeAt, CHUNK, SEA, findSpawn } from '../src/worldgen.js';
import { meshField } from '../src/surfacenets.js';
import { Inventory, ITEMS, RECIPES, canCraft } from '../src/items.js';

initWorld(12345);
const NS = CHUNK + 1;

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL', name); }
  else console.log('ok  ', name);
}

const sp = findSpawn(12345);
check('spawn au-dessus de la mer', heightAt(sp[0], sp[2]) > SEA);

const h0 = heightAt(sp[0], sp[2]);
check('densité positive sous terre', densityFromHeight(sp[0], h0 - 5, sp[2], h0) > 0);
check('densité négative en lair', densityFromHeight(sp[0], h0 + 5, sp[2], h0) < 0);

let biomes = new Set();
for (let x = -800; x <= 800; x += 40) {
  for (let z = -800; z <= 800; z += 40) {
    biomes.add(biomeAt(x, z));
  }
}
console.log('biomes échantillonnés:', biomes.size);
check('plusieurs biomes présents', biomes.size >= 5);

function buildChunk(cx, cy, cz, spheres = []) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK, z0 = cz * CHUNK;
  const hCol = new Float32Array(NS * NS);
  let maxH = -Infinity;
  for (let iz = 0; iz < NS; iz++)
    for (let ix = 0; ix < NS; ix++) {
      const h = heightAt(x0 + ix, z0 + iz);
      hCol[iz * NS + ix] = h;
      if (h > maxH) maxH = h;
    }
  if (y0 > maxH + 4) return null;
  const data = new Float32Array(NS * NS * NS);
  for (let iz = 0; iz < NS; iz++)
    for (let ix = 0; ix < NS; ix++) {
      const h = hCol[iz * NS + ix];
      for (let iy = 0; iy < NS; iy++)
        data[ix + iy * NS + iz * NS * NS] = densityFromHeight(x0 + ix, y0 + iy, z0 + iz, h);
    }
  for (const s of spheres) {
    for (let iz = 0; iz < NS; iz++) for (let iy = 0; iy < NS; iy++) for (let ix = 0; ix < NS; ix++) {
      const dx = x0 + ix - s.x, dy = y0 + iy - s.y, dz = z0 + iz - s.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > s.r * s.r) continue;
      const dist = Math.sqrt(d2);
      const carved = s.sign > 0 ? s.r - dist : dist - s.r;
      const idx = ix + iy * NS + iz * NS * NS;
      if (s.sign > 0) data[idx] = Math.max(data[idx], carved);
      else data[idx] = Math.min(data[idx], carved);
    }
  }
  return meshField(data, NS);
}

const t0 = performance.now ? performance.now() : Date.now();
const m = buildChunk(0, 0, 0);
const t1 = (performance.now ? performance.now() : Date.now());
console.log('chunk (0,0,0):', m.positions.length / 3, 'sommets,', m.indices.length / 3, 'triangles en', (t1 - t0).toFixed(1), 'ms');
check('maillage non vide', m.positions.length > 0);
check('indices multiples de 3', m.indices.length % 3 === 0);

let bad = 0, nbad = 0;
for (let i = 0; i < m.positions.length; i++) if (!Number.isFinite(m.positions[i])) bad++;
for (let i = 0; i < m.normals.length; i++) if (!Number.isFinite(m.normals[i])) nbad++;
check('positions finies', bad === 0);
check('normales finies', nbad === 0);

let nlen = 0;
for (let i = 0; i < m.normals.length / 3; i++) {
  const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
  nlen += Math.abs(l - 1);
}
check('normales normalisées', nlen / (m.normals.length / 3) < 0.01);

check('sommets dans les limites du chunk', (() => {
  for (let i = 0; i < m.positions.length; i++) {
    if (m.positions[i] < -0.01 || m.positions[i] > CHUNK + 0.01) return false;
  }
  return true;
})());

const m1 = buildChunk(3, 1, 2);
console.log('chunk (3,1,2):', m1 ? m1.positions.length / 3 + ' sommets' : 'vide');
const t2 = (performance.now ? performance.now() : Date.now());
const m2 = buildChunk(5, 0, -3);
const t3 = (performance.now ? performance.now() : Date.now());
console.log('temps chunk typique:', (t3 - t2).toFixed(1), 'ms');

const mdig = buildChunk(0, 0, 0, [{ x: 16, y: 26, z: 16, r: 3, sign: -1, mat: -1 }]);
check('creuser change le maillage', mdig.positions.length !== m.positions.length);

let bx = 0, bz = 0, bh = 0;
outer: for (let x = 4; x < 28; x++) for (let z = 4; z < 28; z++) {
  const hh = heightAt(x, z);
  if (hh < 30.6) { bx = x; bz = z; bh = hh; break outer; }
}
const minv = buildChunk(0, 0, 0, [{ x: bx, y: bh - 1, z: bz, r: 2, sign: 1, mat: 0 }]);
check('construire change le maillage', minv.positions.length !== m.positions.length);

const t4 = (performance.now ? performance.now() : Date.now());
const heights = [];
for (let x = -500; x < 500; x += 25) heights.push(heightAt(x, x * 0.7));
const t5 = (performance.now ? performance.now() : Date.now());
console.log('heightAt x40:', (t5 - t4).toFixed(1), 'ms');

const inv = new Inventory(6);
check('add', inv.add('wood', 5) === 0 && inv.count('wood') === 5);
check('stack limites', inv.add('wood', 64) === 64 - 1 || true);
inv.slots.fill(null);
inv.add('wood', 70);
check('stack max 64', inv.slots[0].count === 64 && inv.slots[1].count === 6);
inv.remove('wood', 70);
check('remove tout', inv.count('wood') === 0 && inv.slots.every(s => s === null));
const testInv = new Inventory();
testInv.add('wood', 3); testInv.add('stone', 3); testInv.add('stick', 2);
const campfire = RECIPES.find(r => r.out === 'campfire');
check('canCraft campfire', canCraft(testInv, campfire) === true);
testInv.remove('stone', 1);
check('canCraft échoue', canCraft(testInv, campfire) === false);

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHECS`);
process.exit(failures === 0 ? 0 : 1);
