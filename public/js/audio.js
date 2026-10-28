import { rr, pick, clamp } from './util.js';

let ctx = null;
let master, musicBus, sfxBus, delay, rainGain, noiseBuf;
let muted = false;
let musicVol = 0.6;
let sfxVol = 0.8;
let nextNote = 0;
let night = 0;
let rain = 0;

const PENT = [0, 2, 4, 7, 9]; // major pentatonic degrees: gentle, never discordant
const ROOTS = [146.83, 130.81, 164.81]; // D3, C3, E3 families

function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, t, dur, peak, dest, a = 0.01) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, peak, dur);
  o.connect(g).connect(dest || sfxBus);
  o.start(t);
  o.stop(t + dur + a + 0.05);
  return { o, g };
}

function burst(t, dur, peak, freq, q, dest) {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.01, peak, dur);
  s.connect(f).connect(g).connect(dest || sfxBus);
  s.start(t, Math.random());
  s.stop(t + dur + 0.1);
}

function ambientNote() {
  const root = pick(ROOTS) * (night > 0.5 ? 1 : pick([1, 2]));
  const n = pick(PENT) + pick([0, 0, 12]);
  const f = root * Math.pow(2, n / 12);
  const t = ctx.currentTime + 0.05;
  const dur = rr(5, 9);
  for (const [type, mult, peak] of [['sine', 1, 0.07], ['triangle', 2.003, 0.012]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

function drone() {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.value = 0.035;
  f.connect(g).connect(musicBus);
  for (const [freq, det] of [[73.42, 0], [110, 4], [146.83, -3]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.detune.value = det;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = rr(0.03, 0.08);
    lg.gain.value = 0.4;
    lfo.connect(lg).connect(o.detune);
    lfo.start();
    o.connect(f);
    o.start();
  }
}

export const audio = {
  get muted() { return muted; },
  get started() { return !!ctx; },

  start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicVol;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    delay = ctx.createDelay(2);
    delay.delayTime.value = 0.55;
    const fb = ctx.createGain();
    fb.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    musicBus.connect(master);
    musicBus.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(master);
    sfxBus.connect(master);
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    const rs = ctx.createBufferSource();
    rs.buffer = noise();
    rs.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 1400;
    rf.Q.value = 0.5;
    rs.connect(rf).connect(rainGain).connect(master);
    rs.start();
    drone();
    nextNote = ctx.currentTime + 1;
  },

  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  },
  setVolumes(music, sfx) {
    musicVol = music;
    sfxVol = sfx;
    if (ctx) {
      musicBus.gain.value = music;
      sfxBus.gain.value = sfx;
    }
  },
  get volumes() { return { music: musicVol, sfx: sfxVol }; },

  update(dt, nightAmt, rainAmt) {
    night = nightAmt;
    rain = rainAmt;
    if (!ctx || ctx.state !== 'running') return;
    rainGain.gain.setTargetAtTime(rain * 0.12, ctx.currentTime, 0.5);
    if (ctx.currentTime >= nextNote) {
      ambientNote();
      if (Math.random() < 0.25) setTimeout(ambientNote, rr(400, 1800));
      nextNote = ctx.currentTime + rr(4.5, 12);
    }
  },

  bark() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t + i * 0.2);
      o.frequency.exponentialRampToValueAtTime(260, t + i * 0.2 + 0.14);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 1.4;
      const g = ctx.createGain();
      env(g, t + i * 0.2, 0.015, 0.3, 0.16);
      o.connect(f).connect(g).connect(sfxBus);
      o.start(t + i * 0.2);
      o.stop(t + i * 0.2 + 0.25);
      burst(t + i * 0.2, 0.1, 0.12, 1500, 1, sfxBus);
    }
  },
  howl(layers = 1) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < layers; i++) {
      const t = t0 + i * rr(0.1, 0.5);
      const base = 360 * rr(0.88, 1.2);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.7, t + 0.9);
      o.frequency.linearRampToValueAtTime(base * 1.5, t + 2.0);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 3.0);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = rr(4.5, 6);
      lg.gain.value = 9;
      lfo.connect(lg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 / Math.sqrt(layers), t + 0.7);
      g.gain.setValueAtTime(0.16 / Math.sqrt(layers), t + 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(f).connect(g).connect(sfxBus);
      g.connect(delay);
      o.start(t);
      lfo.start(t);
      o.stop(t + 3.4);
      lfo.stop(t + 3.4);
    }
  },
  growl() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 68;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 26;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    env(g, t, 0.08, 0.4, 0.7);
    lfo.connect(lg).connect(g.gain);
    o.connect(f).connect(g).connect(sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1);
    lfo.stop(t + 1);
  },
  pounce() { if (ctx) burst(ctx.currentTime, 0.18, 0.25, 700, 0.8); },
  eat() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 4; i++) burst(t + i * 0.12, 0.07, 0.22, rr(1200, 2600), 2); },
  drink() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 5; i++) tone('sine', rr(300, 500), rr(600, 900), t + i * 0.1, 0.08, 0.08); },
  scream() { if (!ctx) return; const t = ctx.currentTime; const f = rr(900, 1300); tone('square', f, f * 1.4, t, 0.35, 0.025); },
  honk() { if (!ctx) return; const t = ctx.currentTime; tone('square', 330, 330, t, 0.25, 0.04); tone('square', 392, 392, t, 0.25, 0.04); },
  caw() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 2; i++) { tone('sawtooth', 640, 380, t + i * 0.22, 0.16, 0.07); burst(t + i * 0.22, 0.12, 0.05, 1800, 1); } },
  hiss() { if (ctx) burst(ctx.currentTime, 0.5, 0.15, 5000, 0.6); },
  bleat() { if (!ctx) return; const t = ctx.currentTime; tone('sawtooth', 180, 120, t, 0.5, 0.15); },
  spell() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => tone('sine', f, f, t + i * 0.08, 0.5, 0.08)); },
  blip() { if (ctx) tone('triangle', rr(320, 520), rr(320, 520), ctx.currentTime, 0.04, 0.05); },
  good() { if (!ctx) return; const t = ctx.currentTime; tone('sine', 523, 523, t, 0.2, 0.1); tone('sine', 784, 784, t + 0.12, 0.3, 0.1); },
  bad() { if (!ctx) return; const t = ctx.currentTime; tone('sine', 330, 330, t, 0.2, 0.1); tone('sine', 220, 220, t + 0.12, 0.3, 0.1); },
  siren() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) { tone('sine', 700, 950, t + i * 0.6, 0.3, 0.03); tone('sine', 950, 700, t + i * 0.6 + 0.3, 0.3, 0.03); } },
  chop() { if (ctx) burst(ctx.currentTime, 0.12, 0.2, 200, 1); },
  zap() { if (ctx) tone('square', 900, 120, ctx.currentTime, 0.2, 0.05); },
};
