// Kaikki äänet syntetisoidaan Web Audiolla – ei äänitiedostoja.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.voiceOn = true;
    this.musicOn = true;
  }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0; this.mus.connect(this.master);
    this.noise = this.makeNoise(2);
    this.brown = this.makeBrown(4);
    this.applauseBuf = this.makeApplause(4);
    this.startAmbience();
    this.startMusicLoop();
  }

  get t() { return this.ctx.currentTime; }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeBrown(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }

  makeApplause(sec) {
    const sr = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(2, sr * sec, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const claps = 900 * sec;
      for (let c = 0; c < claps; c++) {
        const start = Math.floor(Math.random() * (d.length - 800));
        const amp = 0.15 + Math.random() * 0.35;
        const len = 300 + Math.random() * 400;
        for (let i = 0; i < len; i++) d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (len * 0.25));
      }
      for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i]);
    }
    return b;
  }

  src(buf, loop = false) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s;
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // ---------- tehosteet ----------
  step(intensity = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.t;
    const s = this.src(this.noise);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 220 + Math.random() * 160; f.Q.value = 0.9;
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    this.env(g, t, 0.004, 0.55 * intensity, 0.09);
    s.connect(f); f.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
    s.start(t, Math.random() * 1.5, 0.15);
    // hiekan rahina
    const s2 = this.src(this.noise);
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 2500;
    const g2 = this.ctx.createGain(); this.env(g2, t, 0.003, 0.08 * intensity, 0.06);
    s2.connect(f2); f2.connect(g2); g2.connect(this.sfx); s2.start(t, Math.random(), 0.1);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.t;
    const s = this.src(this.noise);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
    const g = this.ctx.createGain(); this.env(g, t, 0.12, 0.35, 0.4);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, 0, 0.6);
  }

  land() {
    if (!this.ctx) return;
    this.step(1.6, -0.2); setTimeout(() => this.step(1.3, 0.2), 70);
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = this.ctx.createGain(); this.env(g, t, 0.005, 0.4, 0.18);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.25);
  }

  knock() {
    if (!this.ctx) return;
    const t = this.t;
    [0, 0.09, 0.2, 0.33, 0.45].forEach((dt, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = 520 + Math.random() * 300 - i * 40;
      const g = this.ctx.createGain(); this.env(g, t + dt, 0.002, 0.35 / (i + 1), 0.08);
      const s = this.src(this.noise);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
      const g2 = this.ctx.createGain(); this.env(g2, t + dt, 0.002, 0.4 / (i + 1), 0.05);
      o.connect(g); g.connect(this.sfx); s.connect(f); f.connect(g2); g2.connect(this.sfx);
      o.start(t + dt); o.stop(t + dt + 0.15); s.start(t + dt, Math.random(), 0.1);
    });
    setTimeout(() => this.crowdOoh(), 120);
  }

  crowdOoh() {
    if (!this.ctx) return;
    const t = this.t;
    for (let v = 0; v < 6; v++) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const base = 180 + Math.random() * 120;
      o.frequency.setValueAtTime(base * 1.25, t); o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 1.0);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 4;
      const g = this.ctx.createGain(); this.env(g, t, 0.15, 0.03, 0.9);
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1.3);
    }
  }

  splash() {
    if (!this.ctx) return;
    const t = this.t;
    const s = this.src(this.noise);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    const g = this.ctx.createGain(); this.env(g, t, 0.01, 0.6, 0.55);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, 0, 0.8);
    setTimeout(() => this.crowdOoh(), 100);
  }

  bell(times = 1) {
    if (!this.ctx) return;
    for (let k = 0; k < times; k++) {
      const t = this.t + k * 0.7;
      [[880, 0.5], [880 * 2.76, 0.18], [880 * 5.4, 0.09], [880 * 0.5, 0.12]].forEach(([fr, a]) => {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
        const g = this.ctx.createGain(); this.env(g, t, 0.003, a, 2.2);
        o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 2.4);
      });
    }
  }

  neigh() {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.18);
    o.frequency.setValueAtTime(980, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(380, t + 1.1);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 11;
    const lg = this.ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5;
    const g = this.ctx.createGain(); this.env(g, t, 0.05, 0.22, 1.05);
    o.connect(f); f.connect(g); g.connect(this.sfx);
    o.start(t); lfo.start(t); o.stop(t + 1.3); lfo.stop(t + 1.3);
    // tuhahdus
    const s = this.src(this.noise);
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 700;
    const g2 = this.ctx.createGain(); this.env(g2, t + 1.15, 0.02, 0.3, 0.35);
    s.connect(f2); f2.connect(g2); g2.connect(this.sfx); s.start(t + 1.15, 0, 0.5);
  }

  tick(high = false) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = high ? 1320 : 880;
    const g = this.ctx.createGain(); this.env(g, t, 0.002, 0.06, 0.06);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.1);
  }

  uiClick() {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.06);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.15, 0.1);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.15);
  }

  fanfare() {
    if (!this.ctx) return;
    const notes = [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.75], [1047, 0.9]];
    for (const [f, dt] of notes) {
      const t = this.t + dt;
      for (const det of [0, 4]) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f + det;
        const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2400;
        const g = this.ctx.createGain(); this.env(g, t, 0.02, 0.08, dt > 0.8 ? 0.9 : 0.2);
        o.connect(fl); fl.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1.2);
      }
    }
  }

  applause(level = 1, dur = 3.5) {
    if (!this.ctx) return;
    const t = this.t;
    const s = this.src(this.applauseBuf, true);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.3);
    g.gain.setValueAtTime(0.5 * level, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
    if (level > 0.7) this.cheer(level);
  }

  cheer(level = 1) {
    const t = this.t;
    for (let v = 0; v < 8; v++) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const base = 250 + Math.random() * 250;
      o.frequency.setValueAtTime(base, t + v * 0.05);
      o.frequency.linearRampToValueAtTime(base * 1.3, t + 0.4 + v * 0.05);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 1.4);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 600; f.Q.value = 3;
      const g = this.ctx.createGain(); this.env(g, t + v * 0.05, 0.2, 0.02 * level, 1.3);
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1.8);
    }
  }

  // ---------- tausta ----------
  startAmbience() {
    const s = this.src(this.brown, true);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.16;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain(); lg.gain.value = 0.05;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.amb); s.start(); lfo.start();
    // tuuli
    const w = this.src(this.brown, true);
    const wf = this.ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 250;
    const wg = this.ctx.createGain(); wg.gain.value = 0.12;
    w.connect(wf); wf.connect(wg); wg.connect(this.amb); w.start(0, 1.3);
    // linnut
    const bird = () => {
      if (!this.ctx) return;
      const t = this.t;
      const n = 2 + Math.floor(Math.random() * 4);
      const base = 2600 + Math.random() * 1800;
      for (let i = 0; i < n; i++) {
        const o = this.ctx.createOscillator(); o.type = 'sine';
        const tt = t + i * 0.13;
        o.frequency.setValueAtTime(base, tt); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), tt + 0.07);
        const g = this.ctx.createGain(); this.env(g, tt, 0.01, 0.025, 0.08);
        const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        o.connect(g);
        if (p) { p.pan.value = Math.random() * 2 - 1; g.connect(p); p.connect(this.amb); } else g.connect(this.amb);
        o.start(tt); o.stop(tt + 0.12);
      }
      setTimeout(bird, 2500 + Math.random() * 6000);
    };
    setTimeout(bird, 2000);
  }

  startMusicLoop() {
    // pieni iloinen arpeggio-luuppi valikoihin
    const chords = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]];
    const bpm = 112, step = 60 / bpm / 2;
    let next = this.t + 0.1, i = 0;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const sched = () => {
      if (!this.ctx) return;
      while (next < this.t + 0.3) {
        const ch = chords[Math.floor(i / 8) % 4];
        const n = ch[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]] + 12;
        const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
        const g = this.ctx.createGain(); this.env(g, next, 0.005, 0.12, 0.25);
        o.connect(g); g.connect(this.mus); o.start(next); o.stop(next + 0.32);
        if (i % 4 === 0) {
          const b = this.ctx.createOscillator(); b.type = 'sine'; b.frequency.value = midi(ch[0] - 12);
          const bg = this.ctx.createGain(); this.env(bg, next, 0.01, 0.2, step * 3.5);
          b.connect(bg); bg.connect(this.mus); b.start(next); b.stop(next + step * 4);
        }
        next += step; i++;
      }
      setTimeout(sched, 100);
    };
    sched();
  }

  setMusic(on) {
    if (!this.ctx) return;
    const v = on && this.musicOn ? 0.35 : 0;
    this.mus.gain.cancelScheduledValues(this.t);
    this.mus.gain.setTargetAtTime(v, this.t, 0.6);
  }

  // ---------- kuuluttaja ----------
  say(text) {
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fi-FI';
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('fi'));
      if (v) u.voice = v;
      u.rate = 1.02; u.pitch = 1.0; u.volume = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ei puhesynteesiä */ }
  }
}
