import * as THREE from 'three';
import { ITEMS, RECIPES, canCraft } from './items.js';

const emojiCache = new Map();
function emojiTexture(emoji) {
  if (emojiCache.has(emoji)) return emojiCache.get(emoji);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '48px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  const t = new THREE.CanvasTexture(c);
  emojiCache.set(emoji, t);
  return t;
}

class Particles {
  constructor(scene, max = 700) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.14, vertexColors: true, sizeAttenuation: true
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }

  spawn(p, color, n) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * 0.5;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.5;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.5;
      this.vel[i * 3] = (Math.random() - 0.5) * 3;
      this.vel[i * 3 + 1] = 2 + Math.random() * 3;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      this.col[i * 3] = color[0];
      this.col[i * 3 + 1] = color[1];
      this.col[i * 3 + 2] = color[2];
      this.life[i] = 0.7 + Math.random() * 0.4;
    }
  }

  update(dt) {
    let active = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      active = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 12 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -9999;
    }
    if (active) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }
}

export class UI {
  constructor(scene, camera, player, sfx, game) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.sfx = sfx;
    this.game = game;
    this.particles = new Particles(scene);
    this.drops = [];
    this.debugOn = false;
    this.invOpen = false;
    this.selectedSlot = -1;

    this.el = {
      hotbar: document.getElementById('hotbar'),
      health: document.getElementById('health'),
      hunger: document.getElementById('hunger'),
      crosshair: document.getElementById('crosshair'),
      messages: document.getElementById('messages'),
      vignette: document.getElementById('vignette'),
      water: document.getElementById('water-overlay'),
      inv: document.getElementById('inventory'),
      invGrid: document.getElementById('inv-grid'),
      recipes: document.getElementById('recipes'),
      death: document.getElementById('death'),
      pause: document.getElementById('pause'),
      debug: document.getElementById('debug'),
      mode: document.getElementById('mode-indicator'),
      clock: document.getElementById('clock')
    };

    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.i = i;
      d.addEventListener('mousedown', () => {
        this.trySlotClick(i);
      });
      this.el.hotbar.appendChild(d);
    }
    this.hotbarSlots = [...this.el.hotbar.children];

    document.getElementById('btn-resume').addEventListener('click', () => this.game.resume());
    document.getElementById('btn-mode').addEventListener('click', () => this.game.toggleMode());
    document.getElementById('btn-save').addEventListener('click', () => this.game.save(true));
    document.getElementById('btn-reset').addEventListener('click', () => this.game.resetWorld());
    document.getElementById('btn-respawn').addEventListener('click', () => this.game.respawn());
    document.getElementById('btn-close-inv').addEventListener('click', () => this.toggleInventory(false));

    this.refreshHotbar();
    this.msgT = [];
  }

  message(text) {
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = text;
    this.el.messages.appendChild(d);
    setTimeout(() => { d.classList.add('fade'); }, 2400);
    setTimeout(() => { d.remove(); }, 3000);
    while (this.el.messages.children.length > 6) this.el.messages.firstChild.remove();
  }

  slotHTML(s) {
    if (!s) return '';
    const def = ITEMS[s.id];
    return `<span class="icon">${def.icon}</span><span class="count">${s.count > 1 ? s.count : ''}</span>`;
  }

  refreshHotbar() {
    const inv = this.player.inv;
    for (let i = 0; i < 9; i++) {
      const d = this.hotbarSlots[i];
      d.innerHTML = this.slotHTML(inv.slots[i]);
      d.classList.toggle('selected', i === inv.sel);
    }
    this.player.updateHeld();
    if (this.invOpen) this.refreshInventory();
  }

  trySlotClick(i) {
    const inv = this.player.inv;
    if (this.selectedSlot === -1) {
      if (inv.slots[i]) { this.selectedSlot = i; this.refreshHotbar(); this.refreshInventory(); }
    } else {
      const a = inv.slots[this.selectedSlot];
      const b = inv.slots[i];
      inv.slots[this.selectedSlot] = b;
      inv.slots[i] = a;
      this.selectedSlot = -1;
      this.refreshHotbar();
      this.refreshInventory();
    }
  }

  toggleInventory(force) {
    const open = force !== undefined ? force : !this.invOpen;
    this.invOpen = open;
    this.el.inv.style.display = open ? 'flex' : 'none';
    this.selectedSlot = -1;
    if (open) {
      document.exitPointerLock();
      this.refreshInventory();
    } else {
      this.game.requestLock();
    }
  }

  refreshInventory() {
    const inv = this.player.inv;
    this.el.invGrid.innerHTML = '';
    for (let i = 0; i < inv.slots.length; i++) {
      const d = document.createElement('div');
      d.className = 'slot' + (i < 9 ? ' hot' : '') + (i === this.selectedSlot ? ' selected' : '');
      d.innerHTML = this.slotHTML(inv.slots[i]);
      d.addEventListener('mousedown', () => {
        this.trySlotClick(i);
        this.refreshInventory();
        this.refreshHotbar();
      });
      this.el.invGrid.appendChild(d);
    }
    this.el.recipes.innerHTML = '<h3>Fabrication</h3>';
    for (const r of RECIPES) {
      const def = ITEMS[r.out];
      const ok = canCraft(inv, r);
      const needs = Object.entries(r.needs).map(([id, n]) => {
        const have = inv.count(id);
        return `<span class="${have >= n ? 'ok' : 'missing'}">${ITEMS[id].icon}${n}</span>`;
      }).join(' ');
      const row = document.createElement('div');
      row.className = 'recipe';
      row.innerHTML = `<span class="out">${def.icon} ${def.name}${r.n > 1 ? ' ×' + r.n : ''}</span><span class="needs">${needs}</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Créer';
      btn.disabled = !ok;
      btn.addEventListener('click', () => this.craft(r));
      row.appendChild(btn);
      this.el.recipes.appendChild(row);
    }
  }

  craft(r) {
    const inv = this.player.inv;
    if (!canCraft(inv, r)) return;
    for (const id in r.needs) inv.remove(id, r.needs[id]);
    inv.add(r.out, r.n);
    this.sfx.craft();
    this.message(`${ITEMS[r.out].icon} ${ITEMS[r.out].name} ×${r.n}`);
    this.refreshInventory();
    this.refreshHotbar();
  }

  damageFlash() {
    this.el.vignette.style.opacity = '0.75';
    setTimeout(() => { this.el.vignette.style.opacity = '0'; }, 220);
  }

  showDeath() {
    this.el.death.style.display = 'flex';
    document.exitPointerLock();
  }

  hideDeath() {
    this.el.death.style.display = 'none';
  }

  dropItem(id, n, x, y, z) {
    const def = ITEMS[id];
    if (!def) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(def.icon), transparent: true }));
    spr.scale.setScalar(0.5);
    spr.position.set(x, y, z);
    this.scene.add(spr);
    this.drops.push({
      spr, id, n,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
      age: 0
    });
  }

  update(dt, t, player, env) {
    this.particles.update(dt);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const dp = d.spr.position;
      const toP = new THREE.Vector3().subVectors(player.pos, dp);
      toP.y += 1.1;
      const dist = toP.length();
      if (d.age > 0.5 && dist < 3) {
        toP.normalize();
        dp.addScaledVector(toP, dt * 9);
        if (dist < 0.9) {
          const left = player.inv.add(d.id, d.n);
          if (left === 0) {
            this.sfx.pickup();
            this.message(`+${d.n} ${ITEMS[d.id].name}`);
            this.scene.remove(d.spr);
            this.drops.splice(i, 1);
            this.refreshHotbar();
            continue;
          }
        }
      } else {
        d.vel.y -= 11 * dt;
        dp.addScaledVector(d.vel, dt);
        const gy = this.game.cm.groundAt(dp.x, dp.z, dp.y + 1, 6);
        if (gy !== null && dp.y < gy + 0.3) { dp.y = gy + 0.3; d.vel.set(0, 0, 0); }
      }
      d.spr.position.y += Math.sin(t * 3 + i) * 0.0006;
      if (d.age > 120) { this.scene.remove(d.spr); this.drops.splice(i, 1); }
    }

    const hearts = Math.ceil(player.health / 2);
    const drum = Math.ceil(player.hunger / 2);
    let hh = '';
    for (let i = 0; i < 10; i++) hh += i < hearts ? '❤️' : '🖤';
    this.el.health.textContent = hh;
    let fu = '';
    for (let i = 0; i < 10; i++) fu += i < drum ? '🍗' : '·';
    this.el.hunger.textContent = fu;

    const underwater = this.camera.position.y < 24 - 0.3 && player.pos.y < 24;
    this.el.water.style.opacity = underwater ? '0.35' : '0';

    const hrs = ((env.time * 24) + 6) % 24;
    this.el.clock.textContent = `${String(Math.floor(hrs)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`;
    this.el.mode.textContent = player.mode === 'creative' ? '🎨 Créatif' : '⛏️ Survie';

    if (this.debugOn) {
      const p = player.pos;
      this.el.debug.textContent = `FPS ${this.game.fps.toFixed(0)} | x ${p.x.toFixed(1)} y ${p.y.toFixed(1)} z ${p.z.toFixed(1)} | chunks ${this.game.cm.chunks.size} | mobs ${this.game.mobMgr.mobs.length} | biome ${this.game.biomeName(p.x, p.z)}`;
    }
    this.el.debug.style.display = this.debugOn ? 'block' : 'none';
  }
}
