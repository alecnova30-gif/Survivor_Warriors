import * as THREE from 'three';
import { SEA } from './worldgen.js';

function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: opts.rough !== undefined ? opts.rough : 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

function buildQuadruped(rng, cfg) {
  const g = new THREE.Group();
  const parts = { legs: [] };
  const bodyLen = cfg.bodyLen, bodyH = cfg.bodyH, bodyW = cfg.bodyW;
  const body = box(bodyW, bodyH, bodyLen, cfg.color);
  body.position.y = cfg.legLen + bodyH / 2;
  g.add(body);
  const head = box(cfg.headS, cfg.headS, cfg.headS, cfg.headColor || cfg.color);
  head.position.set(0, cfg.legLen + bodyH * 0.9, bodyLen / 2 + cfg.headS * 0.4);
  g.add(head);
  if (cfg.snout) {
    const sn = box(cfg.headS * 0.5, cfg.headS * 0.35, cfg.headS * 0.5, cfg.snout);
    sn.position.set(0, cfg.legLen + bodyH * 0.82, bodyLen / 2 + cfg.headS * 0.85);
    g.add(sn);
  }
  if (cfg.ears) {
    for (const sx of [-1, 1]) {
      const ear = box(cfg.headS * 0.18, cfg.headS * 0.35, 0.06, cfg.headColor || cfg.color);
      ear.position.set(sx * cfg.headS * 0.28, cfg.legLen + bodyH * 0.9 + cfg.headS * 0.62, bodyLen / 2 + cfg.headS * 0.4);
      g.add(ear);
    }
  }
  if (cfg.horns) {
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(cfg.headS * 0.09, cfg.headS * 0.5, 5),
        new THREE.MeshStandardMaterial({ color: 0xd9cfb8, roughness: 0.6 })
      );
      horn.position.set(sx * cfg.headS * 0.38, cfg.legLen + bodyH * 0.9 + cfg.headS * 0.55, bodyLen / 2 + cfg.headS * 0.4);
      horn.rotation.z = sx * 0.5;
      g.add(horn);
    }
  }
  if (cfg.tail) {
    const tail = box(0.08, 0.08, cfg.tail, cfg.color);
    tail.position.set(0, cfg.legLen + bodyH * 0.8, -bodyLen / 2 - cfg.tail / 2);
    g.add(tail);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(bodyW * 0.28, cfg.legLen, bodyW * 0.28, cfg.legColor || cfg.color);
      const pivot = new THREE.Group();
      pivot.position.set(sx * bodyW * 0.38, cfg.legLen, sz * bodyLen * 0.34);
      leg.position.y = -cfg.legLen / 2;
      pivot.add(leg);
      g.add(pivot);
      parts.legs.push(pivot);
    }
  }
  return { group: g, parts };
}

function buildHumanoid(rng, cfg) {
  const g = new THREE.Group();
  const parts = { legs: [], arms: [] };
  const skin = cfg.color, shirt = cfg.shirt, pants = cfg.pants;
  const torso = box(0.62, 0.85, 0.34, shirt);
  torso.position.y = 1.15;
  g.add(torso);
  const head = box(0.52, 0.52, 0.52, skin);
  head.position.y = 1.86;
  g.add(head);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x1a0d0d, emissive: 0x501010, emissiveIntensity: 0.8 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), eyeM);
    eye.position.set(sx * 0.13, 1.9, 0.27);
    g.add(eye);
  }
  for (const sx of [-1, 1]) {
    const leg = box(0.24, 0.78, 0.24, pants);
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.16, 0.75, 0);
    leg.position.y = -0.39;
    pivot.add(leg);
    g.add(pivot);
    parts.legs.push(pivot);
  }
  for (const sx of [-1, 1]) {
    const arm = box(0.2, 0.72, 0.2, skin);
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.42, 1.5, 0);
    arm.position.y = -0.3;
    pivot.add(arm);
    pivot.rotation.x = -1.3;
    g.add(pivot);
    parts.arms.push(pivot);
  }
  return { group: g, parts };
}

export const MOB_TYPES = {
  rabbit: {
    hp: 5, speed: 4.4, hostile: false, fleeDist: 9, scale: 0.55,
    drops: [{ id: 'meat', n: 1 }],
    build: (rng) => buildQuadruped(rng, {
      color: 0xa89a88, bodyLen: 0.55, bodyH: 0.32, bodyW: 0.26, legLen: 0.22, headS: 0.24, tail: 0.12, ears: true
    })
  },
  deer: {
    hp: 12, speed: 5.6, hostile: false, fleeDist: 11, scale: 1,
    drops: [{ id: 'meat', n: 2 }],
    build: (rng) => buildQuadruped(rng, {
      color: 0x8a6b48, bodyLen: 1.15, bodyH: 0.62, bodyW: 0.5, legLen: 0.75, headS: 0.32, snout: 0x5e4630, horns: true
    })
  },
  wolf: {
    hp: 14, speed: 6.2, hostile: true, damage: 3, aggroDist: 17, scale: 0.85,
    drops: [{ id: 'meat', n: 1 }],
    build: (rng) => buildQuadruped(rng, {
      color: 0x74787f, bodyLen: 1.0, bodyH: 0.48, bodyW: 0.42, legLen: 0.55, headS: 0.36, snout: 0x4a4a50, tail: 0.4, ears: true
    })
  },
  zombie: {
    hp: 18, speed: 3.1, hostile: true, damage: 4, aggroDist: 24, scale: 1, nightOnly: true,
    drops: [],
    build: (rng) => buildHumanoid(rng, { color: 0x6f9a52, shirt: 0x3e6a8a, pants: 0x44506e })
  }
};

export class MobManager {
  constructor(scene, seed, onDrop) {
    this.scene = scene;
    this.seed = seed;
    this.onDrop = onDrop;
    this.mobs = [];
    this.spawnTimer = 0;
    this.ctx = null;
  }

  setContext(ctx) { this.ctx = ctx; }

  spawn(typeId, x, y, z) {
    const def = MOB_TYPES[typeId];
    const rng = Math.random;
    const { group, parts } = def.build(rng);
    group.scale.setScalar(def.scale);
    group.position.set(x, y, z);
    this.scene.add(group);
    const mob = {
      type: typeId, def, group, parts, hp: def.hp, maxHp: def.hp,
      x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
      state: 'idle', stateT: Math.random() * 3, phase: Math.random() * 10,
      hurtT: 0, attackCd: 0, fleeFrom: null, alive: true, grounded: false
    };
    group.traverse(o => {
      o.userData.mob = mob;
      if (o.material && o.material.emissive) o.userData.baseEmissive = o.material.emissive.getHex();
    });
    this.mobs.push(mob);
    return mob;
  }

  trySpawn(playerPos, isNight, groundAt, biomeOf) {
    const counts = { passive: 0, hostile: 0 };
    for (const m of this.mobs) counts[m.def.hostile ? 'hostile' : 'passive']++;
    const angle = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 26;
    const x = playerPos.x + Math.cos(angle) * dist;
    const z = playerPos.z + Math.sin(angle) * dist;
    const gy = groundAt(x, z, playerPos.y + 30);
    if (gy === null || gy < SEA + 0.4) return;
    const b = biomeOf(x, z);
    let type = null;
    if (isNight && counts.hostile < 10 && Math.random() < 0.65) {
      type = 'zombie';
    } else if (counts.passive < 12) {
      const r = Math.random();
      if (b === 3 || b === 2) type = r < 0.45 ? 'deer' : r < 0.75 ? 'rabbit' : (isNight ? 'wolf' : 'deer');
      else if (b === 6) type = r < 0.5 ? 'rabbit' : 'wolf';
      else if (b === 4) type = 'rabbit';
      else if (b === 5) type = r < 0.5 ? 'deer' : 'rabbit';
      else if (b === 7) type = r < 0.6 ? 'wolf' : 'rabbit';
    }
    if (type) this.spawn(type, x, gy + 0.5, z);
  }

  hurt(mob, dmg, dir) {
    if (!mob.alive) return;
    mob.hp -= dmg;
    mob.hurtT = 0.25;
    mob.kb = { x: dir.x * 5, z: dir.z * 5 };
    if (mob.def.hostile) mob.aggroT = 12;
    else { mob.state = 'flee'; mob.stateT = 5; mob.fleeFrom = 'player'; }
    if (mob.hp <= 0) {
      mob.alive = false;
      this.scene.remove(mob.group);
      for (const d of mob.def.drops) this.onDrop(d.id, d.n, mob.x, mob.y + 0.6, mob.z);
    }
  }

  raycast(origin, dir, maxDist) {
    let best = null;
    const ray = new THREE.Raycaster();
    ray.set(origin, dir);
    ray.far = maxDist;
    for (const m of this.mobs) {
      const hits = ray.intersectObjects(m.group.children, true);
      if (hits.length > 0 && (!best || hits[0].distance < best.hit.distance)) {
        best = { mob: m, hit: hits[0] };
      }
    }
    return best;
  }

  update(dt, t, playerPos, isNight, groundAt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.2;
      this.trySpawn(playerPos, isNight, groundAt, this.ctx && this.ctx.biomeOf ? this.ctx.biomeOf : () => 2);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (!m.alive) { this.mobs.splice(i, 1); continue; }
      const dx = playerPos.x - m.x, dz = playerPos.z - m.z;
      const distSq = dx * dx + dz * dz;
      const dist = Math.sqrt(distSq);
      if (dist > 110) {
        this.scene.remove(m.group);
        this.mobs.splice(i, 1);
        continue;
      }
      if (m.def.nightOnly && !isNight) {
        m.hp -= dt * 6;
        if (m.hp <= 0) {
          this.scene.remove(m.group);
          this.mobs.splice(i, 1);
          continue;
        }
      }

      let moveX = 0, moveZ = 0, speed = 0;
      m.stateT -= dt;
      if (m.def.hostile && (dist < m.def.aggroDist || m.aggroT > 0)) {
        m.aggroT = Math.max(0, (m.aggroT || 0) - dt);
        m.state = 'chase';
      } else if (m.state === 'chase') {
        m.state = 'idle'; m.stateT = 1;
      }

      if (m.state === 'chase') {
        speed = m.def.speed;
        moveX = dx / (dist || 1); moveZ = dz / (dist || 1);
        if (dist < 1.9) {
          speed = 0;
          m.attackCd -= dt;
          if (m.attackCd <= 0 && this.ctx) {
            m.attackCd = 1.3;
            this.ctx.attackPlayer(m.def.damage);
            if (m.parts.arms) {
              m.attackAnim = 0.35;
            }
          }
        }
      } else if (m.state === 'flee') {
        speed = m.def.speed * 1.15;
        moveX = -dx / (dist || 1); moveZ = -dz / (dist || 1);
        if (m.stateT <= 0 || dist > 34) { m.state = 'idle'; m.stateT = 2 + Math.random() * 3; }
      } else if (m.state === 'wander') {
        speed = m.def.speed * 0.35;
        moveX = Math.cos(m.yaw); moveZ = Math.sin(m.yaw);
        if (m.stateT <= 0) { m.state = 'idle'; m.stateT = 1.5 + Math.random() * 4; }
      } else {
        if (m.stateT <= 0) {
          m.state = 'wander';
          m.stateT = 2 + Math.random() * 4;
          m.yaw = Math.random() * Math.PI * 2;
        }
      }

      if (m.kb) {
        moveX = m.kb.x; moveZ = m.kb.z; speed = 1;
        m.kb.x *= 0.82; m.kb.z *= 0.82;
        if (Math.abs(m.kb.x) < 0.1 && Math.abs(m.kb.z) < 0.1) m.kb = null;
      }

      if (speed > 0) {
        m.x += moveX * speed * dt;
        m.z += moveZ * speed * dt;
        const targetYaw = Math.atan2(moveX, moveZ);
        let dy = targetYaw - m.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        m.yaw += dy * Math.min(1, dt * 8);
      }

      m.groundT = (m.groundT === undefined ? Math.random() * 0.1 : m.groundT) - dt;
      if (m.groundT <= 0) {
        m.groundT = 0.1;
        m.gy = groundAt(m.x, m.z, m.y + 3);
      }
      const gy = m.gy;
      const inWater = gy < SEA - 0.8;
      if (inWater) {
        m.vy = 0;
        m.y = Math.max(SEA - 0.7, gy);
      } else {
        m.vy -= 22 * dt;
        m.y += m.vy * dt;
        if (gy !== null && m.y <= gy) {
          m.y = gy;
          m.vy = 0;
        }
      }
      if (gy === null) m.y = SEA + 2;

      m.group.position.set(m.x, m.y, m.z);
      m.group.rotation.y = m.yaw;

      const animSpeed = speed > 0 ? speed * 2.2 : 0;
      m.phase += dt * animSpeed;
      const amp = speed > 0 ? 0.6 : 0;
      if (m.parts.legs) {
        m.parts.legs.forEach((leg, li) => {
          leg.rotation.x = Math.sin(m.phase + (li % 2 === 0 ? 0 : Math.PI) + (li > 1 ? Math.PI : 0)) * amp;
        });
      }
      if (m.parts.arms) {
        m.parts.arms.forEach((arm, li) => {
          arm.rotation.x = -1.3 + Math.sin(m.phase * 0.7 + li) * 0.12 + (m.attackAnim > 0 ? Math.sin((0.35 - m.attackAnim) / 0.35 * Math.PI) * 1.2 : 0);
        });
      }
      if (m.attackAnim) m.attackAnim = Math.max(0, m.attackAnim - dt);
      if (m.hurtT > 0) {
        m.hurtT -= dt;
        m.group.traverse(o => {
          if (o.material && o.material.emissive) {
            o.material.emissive.setHex(0x660000);
            o.material.emissiveIntensity = 0.9;
          }
        });
      } else {
        m.group.traverse(o => {
          if (o.material && o.material.emissive && o.userData.baseEmissive !== undefined) {
            o.material.emissive.setHex(o.userData.baseEmissive);
            o.material.emissiveIntensity = 1;
          }
        });
      }
    }
  }
}
