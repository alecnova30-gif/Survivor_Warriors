import * as THREE from 'three';
import { SEA } from './worldgen.js';

function makeWaterNormalMap(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  const rnd = [];
  const S = 8;
  for (let i = 0; i < S * S; i++) rnd.push(Math.random());
  const g = (xx, yy) => rnd[(((yy % S) + S) % S) * S + (((xx % S) + S) % S)];
  const val = (x, y) => {
    const gx = x / size * S, gy = y / size * S;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = gx - x0, ty = gy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return g(x0, y0) * (1 - sx) * (1 - sy) + g(x0 + 1, y0) * sx * (1 - sy) + g(x0, y0 + 1) * (1 - sx) * sy + g(x0 + 1, y0 + 1) * sx * sy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      h[y * size + x] = val(x, y) * 0.65 + val((x * 2) % size, (y * 2) % size) * 0.35;
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float nightFactor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(bottomColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) col = mix(bottomColor, bottomColor * 0.55, clamp(-h * 3.0, 0.0, 1.0));
  float s = max(dot(dir, sunDir), 0.0);
  col += sunColor * pow(s, 600.0) * 3.0;
  col += sunColor * pow(s, 6.0) * 0.22 * (0.35 + 0.65 * nightFactor);
  if (nightFactor > 0.01 && h > 0.0) {
    vec2 sp = dir.xz / max(dir.y + 0.4, 0.05) * 60.0;
    float st = step(0.997, hash(floor(sp)));
    col += vec3(st) * nightFactor * clamp(dir.y * 2.0, 0.0, 1.0);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const DAY_TOP = new THREE.Color(0x2f6bc4);
const DAY_BOTTOM = new THREE.Color(0xb9d4ec);
const NIGHT_TOP = new THREE.Color(0x05070f);
const NIGHT_BOTTOM = new THREE.Color(0x10182b);
const DUSK = new THREE.Color(0xff8b4a);

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.08;
    this.dayLength = 600;
    this.wind = 1.2;

    scene.fog = new THREE.Fog(0xb9d4ec, 60, 300);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.camera.updateProjectionMatrix();
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x7788bb, 0);
    scene.add(this.moon);
    scene.add(this.moon.target);

    this.hemi = new THREE.HemisphereLight(0x9db8d9, 0x54452e, 0.6);
    scene.add(this.hemi);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: DAY_TOP.clone() },
        bottomColor: { value: DAY_BOTTOM.clone() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xfff2d0) },
        nightFactor: { value: 0 }
      }
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const wTex = new THREE.CanvasTexture(makeWaterNormalMap());
    wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping;
    wTex.repeat.set(60, 60);
    this.waterTex = wTex;
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x1f5e73,
      transparent: true,
      opacity: 0.86,
      roughness: 0.14,
      metalness: 0.35,
      normalMap: wTex,
      normalScale: new THREE.Vector2(0.35, 0.35)
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800, 1, 1), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = SEA - 0.15;
    scene.add(this.water);

    this.clouds = new THREE.Group();
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5,
      roughness: 1, metalness: 0, fog: false
    });
    for (let i = 0; i < 22; i++) {
      const puff = new THREE.Group();
      const parts = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < parts; j++) {
        const s = 6 + Math.random() * 10;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), this.cloudMat);
        m.position.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 20);
        m.scale.y = 0.35;
        puff.add(m);
      }
      puff.position.set((Math.random() - 0.5) * 700, 78 + Math.random() * 18, (Math.random() - 0.5) * 700);
      this.clouds.add(puff);
    }
    scene.add(this.clouds);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.dayFactor = 1;
  }

  update(dt, camera, playerPos) {
    this.time = (this.time + dt / this.dayLength) % 1;
    const a = this.time * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.82, Math.sin(a), 0.4).normalize();
    const elev = this.sunDir.y;

    const dayF = THREE.MathUtils.smoothstep(elev, -0.08, 0.16);
    this.dayFactor = dayF;
    const nightF = 1 - dayF;

    this.sun.intensity = 0.1 + dayF * 2.1;
    const warm = THREE.MathUtils.smoothstep(1 - Math.abs(elev) * 4, 0.4, 1);
    this.sun.color.setRGB(1, 1 - warm * 0.28 * dayF, 1 - warm * 0.5 * dayF);
    this.sun.position.copy(playerPos).addScaledVector(this.sunDir, 190);
    this.sun.target.position.copy(playerPos);

    this.moon.intensity = nightF * 0.22;
    this.moon.position.copy(playerPos).addScaledVector(this.sunDir, -190);
    this.moon.target.position.copy(playerPos);

    this.hemi.intensity = 0.12 + dayF * 0.55;

    const top = NIGHT_TOP.clone().lerp(DAY_TOP, dayF);
    const bottom = NIGHT_BOTTOM.clone().lerp(DAY_BOTTOM, dayF);
    bottom.lerp(DUSK, warm * 0.55 * dayF);
    this.skyMat.uniforms.topColor.value.copy(top);
    this.skyMat.uniforms.bottomColor.value.copy(bottom);
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    this.skyMat.uniforms.nightFactor.value = nightF;
    this.sky.position.copy(camera.position);

    this.scene.fog.color.copy(bottom);
    this.scene.fog.near = 60 + dayF * 40;
    this.scene.fog.far = 170 + dayF * 60;

    this.waterTex.offset.x += dt * 0.008;
    this.waterTex.offset.y += dt * 0.005;
    this.water.position.x = camera.position.x;
    this.water.position.z = camera.position.z;

    this.clouds.position.x += dt * this.wind;
    if (this.clouds.position.x - camera.position.x > 400) this.clouds.position.x -= 800;
    if (this.clouds.position.x - camera.position.x < -400) this.clouds.position.x += 800;
    this.clouds.position.z = camera.position.z;
    this.cloudMat.opacity = 0.18 + dayF * 0.35;
    this.cloudMat.color.setRGB(0.25 + dayF * 0.75, 0.28 + dayF * 0.72, 0.38 + dayF * 0.62);
  }

  isNight() { return this.sunDir.y < -0.04; }
}

function lerp(a, b, t) { return a + (b - a) * t; }
