import * as THREE from 'three';
import { initWorld, findSpawn, heightAt, biomeAt, SEA, CHUNK, BIOME } from './worldgen.js';
import { ChunkManager } from './chunks.js';
import { Environment } from './environment.js';
import { FeatureManager } from './features.js';
import { MobManager } from './mobs.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { SFX } from './sound.js';

const SAVE_KEY = 'terra-vive-save-v1';

function makeDetailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  const g = [];
  for (let i = 0; i < 16 * 16; i++) g.push(Math.random());
  const val = (x, y) => {
    const gx = x / 8, gy = y / 8;
    const x0 = Math.floor(gx) % 16, y0 = Math.floor(gy) % 16;
    const tx = gx - Math.floor(gx), ty = gy - Math.floor(gy);
    const s = (a, b) => g[((b % 16) + 16) % 16 * 16 + ((a % 16) + 16) % 16];
    return s(x0, y0) * (1 - tx) * (1 - ty) + s(x0 + 1, y0) * tx * (1 - ty) + s(x0, y0 + 1) * (1 - tx) * ty + s(x0 + 1, y0 + 1) * tx * ty;
  };
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      const v = 216 + (val(x, y) - 0.5) * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

class Game {
  constructor() {
    this.fps = 60;
    this.playing = false;
    this.paused = false;
    this.clock = new THREE.Clock();
    this.t = 0;
    this.chunkTimer = 0;
    this.growlTimer = 8;
    this.autosaveT = 0;
  }

  async boot() {
    try {
      await this.bootInner();
    } catch (e) {
      this.fatal(e);
    }
  }

  fatal(e) {
    console.error(e);
    const panel = document.getElementById('loading');
    if (!panel) return;
    const div = document.createElement('pre');
    div.style.cssText = 'color:#ff9a9a;max-width:80vw;white-space:pre-wrap;font-size:13px;text-align:center;';
    div.textContent = 'Erreur de démarrage : ' + (e && e.stack || e);
    panel.appendChild(div);
  }

  reportError(text) {
    this.errorLog = this.errorLog || [];
    const key = String(text).slice(0, 80);
    if (this.errorLog.includes(key)) return;
    this.errorLog.push(key);
    console.warn('[Terra Vive]', text);
    const panel = document.getElementById('loading');
    if (panel && panel.style.display !== 'none') {
      let el = document.getElementById('boot-errors');
      if (!el) {
        el = document.createElement('div');
        el.id = 'boot-errors';
        el.style.cssText = 'color:#ff9a9a;font-size:12px;max-width:80vw;white-space:pre-wrap;text-align:center;';
        panel.appendChild(el);
      }
      el.textContent += text + '\n';
    } else if (this.ui) {
      this.ui.message('⚠ ' + text);
    }
  }

  async bootInner() {
    const saved = this.loadSaveData();
    this.seed = saved ? saved.seed : (Math.random() * 0x7fffffff) | 0;
    initWorld(this.seed);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      throw new Error('WebGL est indisponible dans ce navigateur : ' + e.message);
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    document.getElementById('app').appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 1000);
    this.scene.add(this.camera);

    this.cm = new ChunkManager(this.scene, this.seed);
    this.cm.onDiagnostic = (t) => this.reportError(t);
    const detail = makeDetailTexture();
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detail,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    this.cm.setMaterial(terrainMat);

    this.env = new Environment(this.scene);

    this.sfx = new SFX();

    this.features = new FeatureManager(this.scene, this.cm, this.seed, (id, n, x, y, z) => this.ui.dropItem(id, n, x, y, z));

    this.mobMgr = new MobManager(this.scene, this.seed, (id, n, x, y, z) => this.ui.dropItem(id, n, x, y, z));

    this.player = new Player({
      camera: this.camera, dom: renderer.domElement,
      cm: this.cm, features: this.features, mobs: this.mobMgr,
      env: this.env, ui: null, sfx: this.sfx
    });
    this.ui = new UI(this.scene, this.camera, this.player, this.sfx, this);
    this.player.ui = this.ui;

    this.mobMgr.setContext({
      attackPlayer: (dmg) => this.player.damage(dmg),
      biomeOf: (x, z) => biomeAt(x, z)
    });

    if (saved) {
      this.player.setSave(saved.player);
      this.env.time = saved.time;
      this.features.removed = new Set(saved.removed || []);
      this.cm.allSpheres = saved.spheres || [];
      this.cm.allSpheres.forEach(s => this.cm.restoreSphere(s));
      (saved.placed || []).forEach(p => this.features.place(p.type, p.x, p.y, p.z));
    } else {
      const sp = findSpawn(this.seed);
      this.player.spawnAt(sp);
    }

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (!locked && this.playing && !this.ui.invOpen && !this.player.dead) this.pause();
    });
    renderer.domElement.addEventListener('mousedown', () => {
      this.sfx.ensure();
      if (this.playing && !this.paused && !this.ui.invOpen && !this.player.dead && document.pointerLockElement !== renderer.domElement) {
        this.requestLock();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.playing && !this.player.dead && !this.paused) this.ui.toggleInventory();
      if (e.code === 'KeyM' && this.playing) this.toggleMode();
      if (e.code === 'F3') { e.preventDefault(); this.ui.debugOn = !this.ui.debugOn; }
      if (e.code === 'Escape' && this.ui.invOpen) this.ui.toggleInventory(false);
    });

    this.updateLoading();
    this.animate();
    this.booted = true;
  }

  biomeName(x, z) {
    const names = ['Océan', 'Plage', 'Prairie', 'Forêt', 'Désert', 'Savane', 'Toundra', 'Montagne', 'Marais'];
    const h = heightAt(x, z);
    return names[biomeAt(x, z, h)];
  }

  requestLock() {
    this.renderer.domElement.requestPointerLock();
  }

  resume() {
    this.paused = false;
    document.getElementById('pause').style.display = 'none';
    this.requestLock();
  }

  pause() {
    this.paused = true;
    document.getElementById('pause').style.display = 'flex';
    this.save(false);
  }

  toggleMode() {
    this.player.mode = this.player.mode === 'survival' ? 'creative' : 'survival';
    if (this.player.mode === 'survival') this.player.flying = false;
    this.ui.message('Mode : ' + (this.player.mode === 'creative' ? 'Créatif' : 'Survie'));
  }

  respawn() {
    const sp = findSpawn(this.seed);
    this.player.respawn(sp);
    this.requestLock();
  }

  resetWorld() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  save(showMsg) {
    try {
      const data = {
        seed: this.seed,
        time: this.env.time,
        player: this.player.getSave(),
        spheres: this.cm.allSpheres.slice(-6000),
        removed: [...this.features.removed].slice(-4000),
        placed: this.features.pickables.filter(f => f.placed && f.alive).map(f => ({ type: f.type, x: f.x, y: f.y, z: f.z }))
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (showMsg) this.ui.message('Monde sauvegardé');
    } catch (e) {
      if (showMsg) this.ui.message('Sauvegarde impossible (trop de modifications)');
    }
  }

  updateLoading() {
    const el = document.getElementById('loading');
    const bar = document.getElementById('load-bar');
    const ready = [...this.cm.chunks.values()].filter(c => c.state === 'ready' || c.state === 'empty').length;
    const need = 40;
    const pct = Math.min(100, ready / need * 100);
    bar.style.width = pct + '%';
    this.loadStart = this.loadStart || performance.now();
    if (performance.now() - this.loadStart > 15000 && ready < 10) {
      this.reportError('Chargement anormalement lent (' + ready + '/' + need + ' zones prêtes). Vérifie la console (F12).');
    }
    const gy = this.cm.groundAt(this.player.pos.x, this.player.pos.z, 80, 100);
    if (ready >= need && gy !== null) {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 600);
      this.playing = true;
      if (!this.loadSaveData()) {
        this.player.pos.y = gy + 1.5;
      }
      this.ui.message('Bienvenue ! Clique pour jouer. E : inventaire, M : mode');
      return;
    }
    requestAnimationFrame(() => this.updateLoading());
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;

    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0) {
      this.chunkTimer = 0.25;
      this.cm.update(this.player.pos.x, this.player.pos.z);
    }

    this.env.update(dt, this.camera, this.player.pos);
    this.features.update(dt, this.t);
    this.mobMgr.update(dt, this.t, this.player.pos, this.env.isNight(), (x, z, fy) => this.cm.groundAt(x, z, fy, 10));
    if (this.playing && !this.paused) {
      this.player.update(dt, this.t);
      this.ui.update(dt, this.t, this.player, this.env);
    }

    this.growlTimer -= dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = 6 + Math.random() * 8;
      for (const m of this.mobMgr.mobs) {
        if (m.type === 'zombie' && m.group.position.distanceTo(this.player.pos) < 18) {
          this.sfx.zombie();
          break;
        }
      }
    }

    this.autosaveT += dt;
    if (this.autosaveT > 30 && this.playing) {
      this.autosaveT = 0;
      this.save(false);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('beforeunload', () => { window.game && window.game.playing && window.game.save(false); });

const game = new Game();
window.game = game;
window.addEventListener('error', (e) => window.game && window.game.reportError && window.game.reportError(e.message));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  window.game && window.game.reportError && window.game.reportError('Promesse rejetée : ' + (r && r.stack || r));
});
game.boot();
