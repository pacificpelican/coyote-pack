import { G, DAY_LEN, toast, floater } from './state.js';
import { world, buildWorld, groundH, BOUNDS } from './world.js';
import { audio } from './audio.js';
import { clamp, smooth, TAU, rr, chance, dist, pick } from './util.js';
import { populate, updateNPCs, updateEvents, updateDarts, spawnAnimal, dispatchCops, spawnHeli, heatAdd, setPos } from './npc.js';
import { createPlayer, updatePlayer, updatePack, updateNeeds, updateSleep, updateSocial, scan, checkTakeover, leavePack } from './player.js';

const INTRO_BEATS = [
  { t: 0, text: 'You have been walking for days. The old highway ended at a long iron bridge, and beyond it, a hill of porches and lamplight.' },
  { t: 6, text: 'Lavender Hill: old houses, new boxes, a strip of shops, parks, blackberries, and an unreasonable number of bins.' },
  { t: 12, text: 'Behind you, the bridge begins to lift. There is no going back.' },
  { t: 17, text: 'Lavender Hill has never had a coyote. Until now.' },
];
export { INTRO_BEATS };
const INTRO_END = 21;

export function newGame(opts = {}) {
  buildWorld();
  world.bridgeAng = 1.25;
  Object.assign(G.clock, { tod: 0.3, day: 0 });
  G.rain = 0; G.rainTarget = 0; G.wet = 0; G.weatherTimer = rr(60, 110); G.raining = false;
  G.heat = 0; G.notoriety = 0; G.copsOut = 0; G.copCool = 0; G.copTimer = 0;
  G.pack = { members: [], timer: 0, cohesion: 40, duration: 0 };
  G.bonds = {}; G.cues = {}; G.spells = 0; G.flight = 0; G.sleeping = null; G.tipsy = 0; G.dim = 0; G.stun = 0;
  G.social = null; G.dialogue = null; G.menu = null; G.timeScale = 1; G.respawn = []; G.darts = []; G.floaters = [];
  G.marketClaimed = false; G.knownPicnic = false; G.wizardAt = undefined; G.witchAt = undefined;
  world.ev.market = false; world.ev.picnic = -1;
  for (const st of world.stalls) st.solid.off = true;
  for (const k in G.stats) G.stats[k] = 0;
  G.stats.maxPack = 1;
  G.player = createPlayer();
  populate();
  G.camYaw = Math.PI;
  G.view = null;
  G.mode = 'play';
}

export function startIntro() {
  newGame();
  G.mode = 'intro';
  G.intro = { t: 0, beat: 0 };
  const p = G.player;
  p.x = 200; p.z = -110; p.h = Math.PI;
  world.bridgeAng = 0;
}

export function introAdvance() {
  const i = G.intro;
  if (!i) return;
  const next = INTRO_BEATS.find((b) => b.t > i.t + 0.2);
  if (next) i.t = next.t; else i.t = INTRO_END;
}

export function finishIntro() {
  const p = G.player;
  world.bridgeAng = 1.25;
  G.intro = null;
  setPos(p, world.start.x, world.start.z);
  p.h = Math.PI;
  G.camYaw = Math.PI;
  G.view = null;
  G.mode = 'play';
  Object.assign(G.clock, { tod: 0.3 });
  toast('Welcome to Lavender Hill. Use the pad to move. 🐾 talk, 🐺 act wild, 🍖 eat/drink, ✔ menu.');
}

function updateIntro(dt) {
  const i = G.intro, p = G.player;
  i.t += dt;
  const t = i.t;
  p.z = Math.min(26, -110 + 8.6 * t);
  p.x = 200;
  p.h = Math.PI;
  const onBridge = p.z < 16;
  p.y = onBridge ? 1.3 : groundH(p.x, p.z);
  const moving = p.z < 26;
  p.moving = moving ? 1 : 0;
  if (moving) p.walk += dt * 8.6 * 2.3;
  world.bridgeAng = 1.25 * smooth(12, 16.5, t);
  const swing = smooth(11.5, 17, t);
  G.view = { yaw: Math.PI * (1 - swing), D: 11 + 6 * Math.sin(swing * Math.PI), Hc: 5.5 + 2 * Math.sin(swing * Math.PI) };
  G.camYaw = G.view.yaw;
  G.clock.tod = 0.2 + Math.min(1, t / INTRO_END) * 0.08;
  updateClock(0);
  if (t >= INTRO_END) finishIntro();
}

function updateClock(dt) {
  const c = G.clock;
  const dTod = (dt * G.timeScale) / DAY_LEN;
  c.tod += dTod;
  while (c.tod >= 1) { c.tod -= 1; c.day++; }
  c.season = (c.day + c.tod) / 6;
  const sea = Math.sin((TAU * c.season) / 4);
  const sunrise = 0.25 - 0.07 * sea, sunset = 0.75 + 0.07 * sea;
  c.sunrise = sunrise; c.sunset = sunset;
  if (c.tod >= sunrise && c.tod <= sunset) {
    const a = (c.tod - sunrise) / (sunset - sunrise);
    c.sunAng = Math.PI * a;
    c.sunE = Math.sin(Math.PI * a) * (0.85 + 0.15 * sea);
    c.moonE = -1;
    c.moonAng = 0;
  } else {
    const nl = 1 - (sunset - sunrise);
    const n = c.tod > sunset ? (c.tod - sunset) / nl : (c.tod + 1 - sunset) / nl;
    c.moonAng = Math.PI * n;
    c.moonE = Math.sin(Math.PI * n);
    c.sunAng = Math.PI;
    c.sunE = -Math.sin(Math.PI * n) * 0.5 - 0.02;
  }
  c.moonPhase = ((c.day + c.tod) / 8) % 1;
  return dTod;
}
export const updateClockOnce = () => updateClock(0);
export const tickClock = (dt) => updateClock(dt);

export function seasonName() {
  return ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(G.clock.season % 4)];
}
export function moonName() {
  const p = G.clock.moonPhase;
  return p < 0.06 || p > 0.94 ? 'New moon' : p < 0.25 ? 'Waxing crescent' : p < 0.31 ? 'First quarter' : p < 0.5 ? 'Waxing gibbous' : p < 0.56 ? 'Full moon' : p < 0.75 ? 'Waning gibbous' : p < 0.81 ? 'Last quarter' : 'Waning crescent';
}
export function clockString() {
  const h = G.clock.tod * 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const ap = hh >= 12 ? 'pm' : 'am';
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`;
}

function updateWeather(dt) {
  G.weatherTimer -= dt * G.timeScale;
  if (G.weatherTimer <= 0) {
    G.raining = !G.raining;
    G.weatherTimer = G.raining ? rr(20, 50) : rr(110, 170);
    if (G.raining) toast('🌧️ Rain is rolling in. Puddles mean free water.');
  }
  G.rainTarget = G.raining ? 1 : 0;
  G.rain += (G.rainTarget - G.rain) * Math.min(1, dt * 0.45);
  if (G.rain > 0.25) G.wet = Math.min(1.2, G.wet + dt * 0.12 * G.rain);
  else G.wet = Math.max(0, G.wet - dt * 0.02);
}

function updateWorldBits(dt) {
  for (const b of world.bins) {
    if (b.tipped) { b.timer -= dt; if (b.timer <= 0) { b.tipped = false; b.food = chance(0.6) ? 2 : 0; } }
    else if (b.food === 0 && chance(dt / 220)) b.food = 2;
  }
  for (const b of world.bushes) {
    if (b.food < 3) { b.timer -= dt; if (b.timer <= 0) { b.food = 3; b.timer = 0; } }
  }
  G.items = G.items.filter((it) => { it.ttl -= dt; return it.ttl > 0 && !it.dead; });
  G.floaters = G.floaters.filter((f) => { f.life -= dt; return f.life > 0; });
  for (const r of G.respawn) r.t -= dt;
  const due = G.respawn.filter((r) => r.t <= 0);
  if (due.length) {
    G.respawn = G.respawn.filter((r) => r.t > 0);
    for (const r of due) if (!spawnAnimal(r.kind, true)) G.respawn.push({ kind: r.kind, t: 10 });
  }
  if (G.scoutTimer > 0) {
    G.scoutTimer -= dt;
    if (G.scoutTimer <= 0) for (const e of G.ents) e.scouted = false;
  }
  for (const e of G.ents) if (e.emote === '') e.emote = undefined;
}

function updatePolice(dt) {
  const cops = G.ents.filter((e) => e.role === 'cop' && !e.dead);
  if (!cops.length && G.copsOut) { G.copsOut = 0; G.copCool = 40; }
  if (!G.copsOut) {
    G.copCool = Math.max(0, G.copCool - dt);
    if (G.heat >= 40 && G.copCool <= 0) {
      G.copTimer += dt;
      if (G.copTimer > 16) { G.copTimer = 0; dispatchCops(); }
    } else G.copTimer = Math.max(0, G.copTimer - dt);
  } else {
    const p = G.player;
    const near = cops.some((c) => c.state !== 'retreat' && dist(c.x, c.z, p.x, p.z) < 30);
    G.copGone = near ? 0 : G.copGone + dt;
    if (G.copGone > 9) {
      for (const c of cops) { c.state = 'retreat'; c.life = Math.min(c.life, 5); }
      G.stats.evaded++;
      if (G.pack.members.length) G.pack.cohesion = clamp(G.pack.cohesion + 8, 0, 100);
      G.heat = Math.max(0, G.heat - 15);
      G.copGone = 0;
      toast('You lost the cops. Your pack trusts your instincts a bit more.');
    }
  }
  if (G.notoriety > 100 && !G.ents.some((e) => e.kind === 'heli')) spawnHeli();
}

export function update(dt) {
  dt = Math.min(dt, 0.1);
  if (G.mode === 'intro') { updateIntro(dt); return; }
  if (G.mode !== 'play' || G.paused) return;
  if (G.social) { updateSocial(dt); return; }
  if (G.dialogue || G.menu) return;
  G.stats.play += dt;
  const dTod = updateClock(dt);
  updateWeather(dt);
  if (G.sleeping) updateSleep(dt, dTod * 24);
  updateEvents(dt);
  G.ents = G.ents.filter((e) => !e.dead);
  updatePlayer(dt);
  updateNPCs(dt);
  updatePack(dt);
  updateNeeds(dt);
  updatePolice(dt);
  updateDarts(dt);
  updateWorldBits(dt);
  G.scanT = (G.scanT || 0) - dt;
  if (G.scanT <= 0) { G.scanT = 0.1; scan(); }
  G.takeT = (G.takeT || 0) + dt;
  if (G.takeT > 1) { G.takeT = 0; checkTakeover(); }
  for (const s of world.shops) if (s.inside && s.open) heatAdd(dt * (s.kind === 'coffee' ? 1.1 : 1.6));
  G.autoT = (G.autoT || 0) + dt;
  if (G.autoT > 45) { G.autoT = 0; saveLocal(); }
  audio.update(dt, 1 - smooth(-0.08, 0.3, G.clock.sunE), G.rain);
}

// ---------------------------------------------------------------- persistence
export function serialize() {
  const p = G.player, c = G.clock;
  return {
    v: 1, savedAt: Date.now(),
    clock: { day: c.day, tod: c.tod },
    player: { x: p.x, z: p.z, hp: p.hp, maxHp: p.maxHp, food: p.food, water: p.water, energy: p.energy, xp: p.xp, level: p.level },
    spells: G.spells, stats: { ...G.stats }, bonds: { ...G.bonds }, cues: { ...G.cues }, wizardAt: G.wizardAt, witchAt: G.witchAt,
  };
}

export function applySave(d) {
  newGame();
  Object.assign(G.clock, { day: d.clock?.day ?? 0, tod: d.clock?.tod ?? 0.3 });
  const p = G.player, sp = d.player || {};
  Object.assign(p, { hp: sp.hp ?? 100, maxHp: sp.maxHp ?? 100, food: sp.food ?? 70, water: sp.water ?? 70, energy: sp.energy ?? 100, xp: sp.xp ?? 0, level: sp.level ?? 1 });
  if (Number.isFinite(sp.x) && Number.isFinite(sp.z)) setPos(p, clamp(sp.x, BOUNDS.x0 + 2, BOUNDS.x1 - 2), clamp(sp.z, BOUNDS.z0 + 2, BOUNDS.z1 - 2));
  G.spells = d.spells || 0;
  Object.assign(G.stats, d.stats || {});
  G.bonds = d.bonds || {};
  G.cues = d.cues || {};
  G.wizardAt = d.wizardAt; G.witchAt = d.witchAt;
  for (const e of G.ents) if (e.kind === 'coyote' && e.cid && G.bonds[e.cid]) e.bond = G.bonds[e.cid];
  updateClock(0);
  G.camYaw = 0;
}

export function saveLocal() {
  if (G.mode !== 'play') return null;
  try {
    const d = serialize();
    localStorage.setItem('coyotepack.save', JSON.stringify(d));
    G.lastSave = d.savedAt;
    return d;
  } catch (e) { return null; }
}

export function loadLocal() {
  try { return JSON.parse(localStorage.getItem('coyotepack.save') || 'null'); } catch (e) { return null; }
}
