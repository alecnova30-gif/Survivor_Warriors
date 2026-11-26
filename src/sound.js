export class SFX {
  constructor() {
    this.ctx = null;
    this.windStarted = false;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.windStarted) this.startWind();
    return this.ctx;
  }

  startWind() {
    const ctx = this.ctx;
    this.windStarted = true;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      v = v * 0.98 + (Math.random() * 2 - 1) * 0.02;
      d[i] = v * 8;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  noiseBurst(dur, freq, vol = 0.25, type = 'lowpass') {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.max(1, ctx.sampleRate * dur) | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  dig() { this.noiseBurst(0.12, 700, 0.3); this.tone(90, 0.08, 'triangle', 0.15); }
  chop(kind) {
    this.noiseBurst(0.09, kind === 'stone' ? 1600 : 900, 0.28);
    this.tone(kind === 'stone' ? 220 : 140, 0.07, 'square', 0.08);
  }
  break_() { this.noiseBurst(0.25, 1100, 0.4); this.tone(70, 0.18, 'triangle', 0.25, -30); }
  place() { this.tone(320, 0.06, 'square', 0.12); this.noiseBurst(0.05, 2000, 0.1); }
  pickup() { this.tone(660, 0.07, 'sine', 0.15, 300); this.tone(990, 0.09, 'sine', 0.1, 200); }
  craft() { this.tone(440, 0.08, 'square', 0.12); setTimeout(() => this.tone(660, 0.1, 'square', 0.12), 90); }
  hit() { this.noiseBurst(0.08, 500, 0.35); this.tone(120, 0.09, 'sawtooth', 0.18); }
  hurt() { this.tone(160, 0.25, 'sawtooth', 0.3, -80); }
  eat() {
    let i = 0;
    const iv = setInterval(() => { this.noiseBurst(0.07, 1800, 0.2); if (++i >= 3) clearInterval(iv); }, 140);
  }
  zombie() { this.tone(95, 0.7, 'sawtooth', 0.12, -35); }
}
