import * as THREE from 'three';
import { heightAt, biomeAt, SEA, findSpawn, BIOME } from './worldgen.js';
import { ITEMS, Inventory } from './items.js';

const EYE = 1.62;
const GRAV = 24;

function toolColor(tier) {
  return tier === 1 ? 0x8a6a42 : tier === 2 ? 0x9a9a9a : 0xd8dce4;
}

export class Player {
  constructor(opts) {
    this.camera = opts.camera;
    this.dom = opts.dom;
    this.cm = opts.cm;
    this.features = opts.features;
    this.mobs = opts.mobs;
    this.env = opts.env;
    this.ui = opts.ui;
    this.sfx = opts.sfx;

    this.inv = new Inventory(36);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.mode = 'survival';
    this.flying = false;
    this.health = 20;
    this.hunger = 20;
    this.exhaust = 0;
    this.dead = false;
    this.onGround = false;
    this.fallStart = null;
    this.keys = {};
    this.mouse = [false, false, false];
    this.digTimer = 0;
    this.attackTimer = 0;
    this.buildTimer = 0;
    this.swingT = 0;
    this.bobT = 0;
    this.lastSpaceT = 0;
    this.stepDist = 0;
    this.hurtCd = 0;
    this.daySurvived = 0;

    this.held = new THREE.Group();
    this.camera.add(this.held);
    this.heldId = null;
    this.updateHeld();

    this.raycaster = new THREE.Raycaster();

    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.toggleFly();
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5));
        if (n >= 1 && n <= 9) { this.inv.sel = n - 1; this.updateHeld(); this.ui.refreshHotbar(); }
      }
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.mouse[e.button] = true;
      if (e.button === 0) this.digTimer = 0;
      if (e.button === 2) this.buildTimer = 0;
    });
    document.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    });
    document.addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.inv.sel = (this.inv.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      this.updateHeld();
      this.ui.refreshHotbar();
    }, { passive: true });
  }

  toggleFly() {
    if (this.mode === 'creative') {
      this.flying = !this.flying;
      if (this.flying) this.vel.set(0, 0, 0);
    } else if (this.flying) {
      this.flying = false;
    }
  }

  spawnAt(p) {
    this.pos.set(p[0], p[1], p[2]);
    this.vel.set(0, 0, 0);
  }

  heldItem() {
    return this.inv.selected();
  }

  heldDef() {
    const s = this.heldItem();
    return s ? ITEMS[s.id] : null;
  }

  update(dt, t) {
    if (this.dead) return;
    this.hurtCd = Math.max(0, this.hurtCd - dt);

    const speedBase = this.mode === 'creative' && this.flying ? (this.keys['ShiftLeft'] ? 26 : 13) : (this.keys['ShiftLeft'] ? 8.4 : 5.4);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let mx = 0, mz = 0;
    if (this.keys['KeyW']) { mx += fwd.x; mz += fwd.z; }
    if (this.keys['KeyS']) { mx -= fwd.x; mz -= fwd.z; }
    if (this.keys['KeyD']) { mx += right.x; mz += right.z; }
    if (this.keys['KeyA']) { mx -= right.x; mz -= right.z; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    const inWater = this.pos.y < SEA - 0.35;

    if (this.flying && this.mode === 'creative') {
      this.vel.x = mx * speedBase;
      this.vel.z = mz * speedBase;
      let vy = 0;
      if (this.keys['Space']) vy += speedBase * 0.8;
      if (this.keys['ControlLeft'] || this.keys['KeyC']) vy -= speedBase * 0.8;
      this.vel.y = vy;
      this.pos.addScaledVector(this.vel, dt);
      this.onGround = false;
    } else {
      const accel = this.onGround ? 42 : 12;
      this.vel.x += (mx * speedBase - this.vel.x) * Math.min(1, accel * dt / speedBase * 2);
      this.vel.z += (mz * speedBase - this.vel.z) * Math.min(1, accel * dt / speedBase * 2);
      if (inWater) {
        this.vel.x *= 0.92; this.vel.z *= 0.92;
        this.vel.y -= 7 * dt;
        if (this.keys['Space']) this.vel.y = 3.6;
        this.vel.y = Math.max(this.vel.y, -3.5);
        this.pos.y += this.vel.y * dt;
        if (this.pos.y > SEA - 0.2 && this.vel.y > 0 && !this.keys['Space']) this.vel.y = 0;
        this.onGround = false;
        this.fallStart = null;
      } else {
        this.vel.y -= GRAV * dt;
      }

      if (!inWater) this.pos.y += this.vel.y * dt;

      let nx = this.pos.x + this.vel.x * dt;
      let nz = this.pos.z + this.vel.z * dt;

      if (!this.flying) {
        const footY = this.pos.y;
        const canStand = (px, pz) => {
          const gy = this.cm.groundAt(px, pz, footY + 1.4, 6);
          if (gy === null) return true;
          return gy - footY <= 1.15;
        };
        if (!canStand(nx, nz)) {
          if (canStand(nx, this.pos.z)) nz = this.pos.z;
          else if (canStand(this.pos.x, nz)) nx = this.pos.x;
          else { nx = this.pos.x; nz = this.pos.z; }
        }

        this.pos.x = nx;
        this.pos.z = nz;

        const gy = this.cm.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.4, 8);
        if (gy !== null && this.pos.y <= gy + 0.02 && this.vel.y <= 0) {
          if (!this.onGround && this.fallStart !== null) {
            const fall = this.fallStart - this.pos.y;
            if (fall > 4.2 && !inWater) this.damage(Math.floor((fall - 4.2) * 1.1));
          }
          this.pos.y = gy;
          this.vel.y = 0;
          this.onGround = true;
          this.fallStart = null;
        } else {
          this.onGround = false;
          if (this.vel.y > 0.5 || this.fallStart === null) {
            if (this.fallStart === null || this.pos.y > this.fallStart) this.fallStart = this.pos.y;
          }
        }

        if (this.keys['Space'] && this.onGround) {
          this.vel.y = 8.6;
          this.onGround = false;
        }
      } else {
        this.pos.x = nx; this.pos.z = nz;
      }
    }

    if (ml > 0 && this.onGround) {
      this.bobT += dt * (this.keys['ShiftLeft'] ? 11 : 7.5);
      this.exhaust += dt * (this.keys['ShiftLeft'] ? 0.045 : 0.02);
    }

    if (this.mode === 'survival') {
      this.exhaust += dt * 0.008;
      if (this.exhaust > 1) {
        this.exhaust = 0;
        this.hunger = Math.max(0, this.hunger - 0.5);
      }
      if (this.hunger > 16 && this.health < 20) {
        this.regenT = (this.regenT || 0) + dt;
        if (this.regenT > 3.5) { this.regenT = 0; this.health = Math.min(20, this.health + 1); this.exhaust += 0.4; }
      }
      if (this.hunger <= 0) {
        this.starveT = (this.starveT || 0) + dt;
        if (this.starveT > 4) { this.starveT = 0; this.damage(1); }
      }
    }

    const eyeY = this.pos.y + EYE + Math.sin(this.bobT) * 0.045;
    this.camera.position.set(this.pos.x, eyeY, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    if (this.mouse[0]) {
      this.digTimer -= dt;
      if (this.digTimer <= 0) this.doDig(t);
    }
    if (this.mouse[2]) {
      this.buildTimer -= dt;
      if (this.buildTimer <= 0) this.doBuild(t);
    }

    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 3.2);
      const s = Math.sin((1 - this.swingT) * Math.PI);
      this.held.rotation.x = this.heldBaseRot.x - s * 1.1;
      this.held.rotation.z = this.heldBaseRot.z - s * 0.3;
      this.held.position.z = -0.7 + s * 0.15;
    } else {
      this.held.rotation.set(this.heldBaseRot.x, this.heldBaseRot.y, this.heldBaseRot.z);
      this.held.position.set(0.42, -0.42 + Math.sin(this.bobT) * 0.012, -0.7);
    }
  }

  target() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone();
    const mobHit = this.mobs.raycast(origin, dir, 3.8);
    const featHit = this.features.raycast(origin, dir, 5.6);
    const terrHit = this.cm.raycast(origin, dir, 7, this.cm.nearbyMeshes(origin.x, origin.z, 1));
    let best = null;
    if (mobHit) best = { type: 'mob', dist: mobHit.hit.distance, mob: mobHit.mob, point: mobHit.hit.point, normal: mobHit.hit.face ? mobHit.hit.face.normal : new THREE.Vector3(0, 1, 0) };
    if (featHit && (!best || featHit.hit.distance < best.dist)) {
      best = { type: 'feature', dist: featHit.hit.distance, feature: featHit.feature, point: featHit.hit.point, normal: featHit.hit.face ? featHit.hit.face.normal : new THREE.Vector3(0, 1, 0) };
    }
    if (terrHit && (!best || terrHit.distance < best.dist)) {
      best = { type: 'terrain', dist: terrHit.distance, point: terrHit.point, normal: terrHit.face ? terrHit.face.normal.clone() : new THREE.Vector3(0, 1, 0), object: terrHit.object };
    }
    return best;
  }

  doDig(t) {
    const target = this.target();
    const def = this.heldDef();
    const isTool = def && def.tool;
    if (this.mode === 'creative') {
      this.digTimer = 0.16;
      this.swing();
      if (!target) return;
      if (target.type === 'mob') { this.mobs.hurt(target.mob, 100, dirFrom(this.camera, target.point)); this.sfx.hit(); return; }
      if (target.type === 'feature') { this.features.damage(target.feature, 999); this.sfx.break_(); return; }
      this.cm.applyEdit({ x: target.point.x, y: target.point.y, z: target.point.z, r: 2.8, sign: -1, mat: -1 });
      this.ui.particles(target.point, [0.5, 0.45, 0.38], 14);
      this.sfx.dig();
      return;
    }

    if (target && target.type === 'mob') {
      this.digTimer = 0.45;
      this.swing();
      const dmg = def && def.damage ? def.damage : 1;
      this.mobs.hurt(target.mob, dmg, dirFrom(this.camera, target.point));
      this.sfx.hit();
      this.exhaust += 0.08;
      return;
    }

    if (target && target.type === 'feature') {
      const f = target.feature;
      const match = (def && ((f.kind === 'wood' && def.tool === 'axe') || (f.kind === 'stone' && def.tool === 'pick'))) ? def.speed : (def && def.tool ? 1 : 1.2);
      this.digTimer = Math.max(0.15, 0.55 / match);
      this.swing();
      this.sfx.chop(f.kind);
      const destroyed = this.features.damage(f, match, dirFrom(this.camera, target.point));
      this.ui.particles(target.point, f.kind === 'stone' ? [0.5, 0.5, 0.5] : f.kind === 'wood' ? [0.4, 0.3, 0.17] : [0.3, 0.5, 0.2], 6);
      this.exhaust += 0.06;
      if (destroyed) this.sfx.break_();
      return;
    }

    if (target && target.type === 'terrain') {
      const p = target.point;
      const h = heightAt(p.x, p.z);
      const depth = h - p.y;
      const diggingStone = depth >= 4.3;
      const match = diggingStone
        ? (def && def.tool === 'pick' ? def.speed : 1)
        : (def && def.tool === 'shovel' ? def.speed : 1);
      this.digTimer = Math.max(0.12, 0.5 / match);
      this.swing();
      const r = 0.95 + (def && def.tool === (diggingStone ? 'pick' : 'shovel') ? def.tier * 0.22 : 0);
      this.cm.applyEdit({ x: p.x, y: p.y, z: p.z, r, sign: -1, mat: -1 });
      const col = diggingStone ? [0.5, 0.5, 0.5] : [0.45, 0.34, 0.22];
      this.ui.particles(p, col, 8);
      this.sfx.dig();
      this.exhaust += 0.05;

      const b = biomeAt(p.x, p.z, h);
      let drop;
      if (depth < 1.3) drop = (b === BIOME.DESERT || b === BIOME.BEACH) ? 'sand' : (b === BIOME.TUNDRA ? 'snow' : 'dirt');
      else if (depth < 4.3) drop = (b === BIOME.DESERT || b === BIOME.BEACH) ? 'sand' : 'dirt';
      else {
        const roll = Math.random();
        if (p.y < 30 && roll < 0.02) drop = 'goldOre';
        else if (p.y < 46 && roll < 0.08) drop = 'ironOre';
        else if (roll < 0.16) drop = 'coal';
        else drop = 'stone';
      }
      this.ui.dropItem(drop, 1, p.x, p.y + 0.3, p.z);
      return;
    }

    this.digTimer = 0.25;
    this.swing();
  }

  doBuild(t) {
    const sel = this.heldItem();
    const def = this.heldDef();
    if (!sel || !def) { this.buildTimer = 0.3; return; }

    if (def.food) {
      if (this.mode === 'creative' || this.hunger < 20) {
        this.buildTimer = 0.8;
        this.hunger = Math.min(20, this.hunger + def.food);
        if (this.mode !== 'creative') this.inv.consumeSelected();
        this.updateHeld();
        this.ui.refreshHotbar();
        this.sfx.eat();
        this.ui.message('Miam ! (+' + def.food + ' faim)');
      } else {
        this.buildTimer = 0.4;
      }
      return;
    }

    const target = this.target();
    if (!target) { this.buildTimer = 0.25; return; }
    if (target.type === 'terrain' || target.type === 'feature') {
      const p = target.type === 'terrain' ? target.point : target.point;
      const n = target.normal;

      if (def.placed) {
        const px = p.x + n.x * 0.4, pz = p.z + n.z * 0.4;
        const gy = this.cm.groundAt(px, pz, p.y + 2, 5);
        const py = gy !== null ? gy : p.y;
        this.features.place(def.placed, px, py, pz);
        if (this.mode !== 'creative') this.inv.consumeSelected();
        this.updateHeld();
        this.ui.refreshHotbar();
        this.sfx.place();
        this.buildTimer = 0.3;
        return;
      }

      if (def.planted) {
        const h = heightAt(p.x, p.z);
        const b = biomeAt(p.x, p.z, h);
        if (b !== BIOME.DESERT && b !== BIOME.OCEAN && b !== BIOME.BEACH && h > SEA) {
          this.features.place('sapling', p.x, h, p.z);
          if (this.mode !== 'creative') this.inv.consumeSelected();
          this.updateHeld();
          this.ui.refreshHotbar();
          this.sfx.place();
          this.ui.message('Pousse plantée');
        } else {
          this.ui.message('Cette plante ne pousse pas ici');
        }
        this.buildTimer = 0.3;
        return;
      }

      if (def.place && def.color) {
        this.buildTimer = this.mode === 'creative' ? 0.12 : 0.28;
        const bx = p.x + n.x * 0.6, by = p.y + n.y * 0.6, bz = p.z + n.z * 0.6;
        this.cm.applyEdit({ x: bx, y: by, z: bz, r: 1.25, sign: 1, mat: sel.id });
        this.ui.particles(new THREE.Vector3(bx, by, bz), def.color, 5);
        this.sfx.place();
        this.swing();
        if (this.mode !== 'creative') this.inv.consumeSelected();
        this.updateHeld();
        this.ui.refreshHotbar();
        return;
      }
    }
    this.buildTimer = 0.25;
  }

  swing() {
    this.swingT = 1;
    if (this.heldId) this.rebuildHeldTransform();
  }

  updateHeld() {
    const s = this.heldItem();
    const id = s ? s.id : null;
    if (id === this.heldId) return;
    this.heldId = id;
    this.rebuildHeldTransform();
  }

  rebuildHeldTransform() {
    while (this.held.children.length) this.held.remove(this.held.children[0]);
    const def = this.heldDef();
    this.heldBaseRot = { x: 0.2, y: -0.4, z: 0.1 };
    this.held.position.set(0.42, -0.42, -0.7);
    this.held.rotation.set(0.2, -0.4, 0.1);
    if (!def) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), new THREE.MeshStandardMaterial({ color: 0xc8a080 }));
      this.held.add(hand);
      return;
    }
    if (def.tool) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x7a5a34 }));
      handle.position.y = -0.1;
      this.held.add(handle);
      const headM = new THREE.MeshStandardMaterial({ color: toolColor(def.tier) });
      if (def.tool === 'pick') {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.06), headM);
        head.position.y = 0.18;
        this.held.add(head);
      } else if (def.tool === 'axe') {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.06), headM);
        head.position.set(0.1, 0.14, 0);
        this.held.add(head);
      } else if (def.tool === 'shovel') {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.04), headM);
        head.position.y = 0.2;
        this.held.add(head);
      } else if (def.tool === 'sword') {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.02), headM);
        blade.position.y = 0.12;
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x4a3a22 }));
        guard.position.y = -0.14;
        this.held.add(blade, guard);
      }
      this.heldBaseRot = { x: 0.4, y: -0.6, z: 0.3 };
      this.held.rotation.set(0.4, -0.6, 0.3);
    } else {
      const c = def.color || [0.7, 0.7, 0.7];
      const blob = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.14, 1),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), roughness: 0.8 })
      );
      this.held.add(blob);
    }
  }

  damage(n) {
    if (this.mode === 'creative' || this.dead || n <= 0) return;
    if (this.hurtCd > 0) return;
    this.hurtCd = 0.5;
    this.health -= n;
    this.ui.damageFlash();
    this.sfx.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.ui.showDeath();
    }
  }

  respawn(spawn) {
    this.dead = false;
    this.health = 20;
    this.hunger = 20;
    this.spawnAt(spawn);
    this.ui.hideDeath();
  }

  getSave() {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z],
      yaw: this.yaw, pitch: this.pitch,
      health: this.health, hunger: this.hunger,
      mode: this.mode, flying: this.flying,
      inv: this.inv.slots, sel: this.inv.sel
    };
  }

  setSave(s) {
    if (!s) return;
    this.pos.set(s.pos[0], s.pos[1], s.pos[2]);
    this.yaw = s.yaw; this.pitch = s.pitch;
    this.health = s.health; this.hunger = s.hunger;
    this.mode = s.mode || 'survival';
    this.flying = !!s.flying;
    if (s.inv) this.inv.slots = s.inv;
    this.inv.sel = s.sel || 0;
    this.updateHeld();
  }
}

function dirFrom(camera, point) {
  const d = point.clone().sub(camera.position).normalize();
  return d;
}
