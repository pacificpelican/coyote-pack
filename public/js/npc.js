import { G, addEnt, toast, floater } from './state.js';
import { world, T, tileAt, groundH, collide, solidAt, BOUNDS, insideShop, shopAt, PITCH } from './world.js';
import { audio } from './audio.js';
import { rr, pick, chance, clamp, dist, angDiff, hash2, TAU, hex } from './util.js';

const SHIRTS = [[150, 110, 80], [90, 110, 90], [170, 120, 60], [110, 90, 130], [180, 90, 70], [80, 100, 120], [200, 180, 140], [120, 80, 70], [70, 70, 76], [160, 150, 110]];
const PANTS = [[70, 80, 100], [90, 70, 50], [60, 64, 60], [120, 110, 90], [50, 56, 80]];
const SKINS = [[226, 186, 156], [196, 150, 112], [150, 104, 76], [110, 76, 56], [236, 202, 176]];
const HAIRS = [[60, 44, 34], [30, 26, 24], [150, 110, 60], [190, 170, 140], [110, 60, 40]];
const CAR_COLS = [[122, 46, 46], [46, 74, 106], [217, 211, 196], [58, 58, 62], [106, 122, 74], [201, 160, 58], [138, 106, 74]];
const COYOTE_NAMES = ['Juniper', 'Sage', 'Pinyon', 'Willow', 'Cedar', 'Mesa'];
export const PREY = { rabbit: { portions: 3, xp: 12, col: [170, 140, 100] }, goose: { portions: 4, xp: 18, col: [150, 138, 122] }, possum: { portions: 3, xp: 10, col: [168, 164, 156] }, deer: { portions: 8, xp: 55, col: [152, 112, 78] } };

export function setPos(e, x, z) { e.x = x; e.z = z; e.y = groundH(x, z) + (e.alt || 0); }
export function faceTo(e, dx, dz, rate, dt) {
  if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
  const th = Math.atan2(dx, -dz);
  e.h += angDiff(e.h, th) * Math.min(1, rate * dt);
}

/** Move with collision. Returns distance actually moved. */
export function stepEnt(e, dx, dz, opts = {}) {
  let nx = e.x + dx, nz = e.z + dz;
  if (!opts.ghost) {
    const r = collide(nx, nz, e.r || 0.5);
    nx = r.x; nz = r.z;
    e.blocked = r.hit;
    if (!opts.swim && tileAt(nx, nz) === T.WATER) { nx = e.x; nz = e.z; e.blocked = true; }
    if (opts.noWoods && tileAt(nx, nz) === T.WOODS) { nx = e.x; nz = e.z; e.blocked = true; }
  }
  nx = clamp(nx, BOUNDS.x0, BOUNDS.x1); nz = clamp(nz, BOUNDS.z0, BOUNDS.z1);
  const moved = Math.hypot(nx - e.x, nz - e.z);
  e.x = nx; e.z = nz;
  e.y = groundH(nx, nz) + (e.alt || 0);
  return moved;
}

function walk(e, dx, dz, speed, dt, opts) {
  const l = Math.hypot(dx, dz) || 1;
  const m = stepEnt(e, (dx / l) * speed * dt, (dz / l) * speed * dt, opts);
  faceTo(e, dx, dz, 8, dt);
  e.walk += m * 2.2;
  e.moving = m / dt > 0.2 ? 1 : 0;
  return m;
}

export function humanOk(x, z) {
  const t = tileAt(x, z);
  return (t === T.SIDEWALK || t === T.PLAZA || t === T.LAWN || t === T.PATH || t === T.GRASS || t === T.SAND || t === T.ROAD) && !solidAt(x, z);
}

function randomNear(e, minD, maxD, ok = humanOk) {
  for (let i = 0; i < 12; i++) {
    const a = rr(0, TAU), d = rr(minD, maxD);
    const x = e.x + Math.sin(a) * d, z = e.z - Math.cos(a) * d;
    if (x > BOUNDS.x0 + 2 && x < BOUNDS.x1 - 2 && z > BOUNDS.z0 + 2 && z < BOUNDS.z1 - 2 && ok(x, z)) return [x, z];
  }
  return null;
}

export function spawnItem(kind, x, z, portions, extra = {}) {
  const it = { kind, x, z, portions, ttl: extra.ttl ?? 150, ...extra };
  G.items.push(it);
  return it;
}

// ----------------------------------------------------------- spawning
function mkHuman(x, z, extra = {}) {
  const e = addEnt({ kind: 'human', x, z, r: 0.45, top: 2.9, look: { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS), hat: chance(0.15) ? pick(SHIRTS) : null }, state: 'idle', timer: rr(0, 4), spd: rr(1.5, 2.3), h: rr(0, TAU), ...extra });
  setPos(e, x, z);
  return e;
}

export function spawnHumanWalker() {
  const p = pick(world.spawn.humans);
  const e = mkHuman(p[0], p[1], { state: 'walk' });
  if (chance(0.18)) e.bag = true;
  if (chance(0.12)) spawnDog(e);
  return e;
}

function spawnDog(owner) {
  const d = addEnt({ kind: 'dog', x: owner.x + 1, z: owner.z + 1, r: 0.4, top: 1.6, fur: pick([[160, 120, 80], [230, 224, 210], [60, 52, 48], [190, 150, 90]]), owner, state: 'follow', timer: 0, temper: Math.random(), scale: rr(0.8, 1.2) });
  setPos(d, d.x, d.z);
  owner.dog = d;
  return d;
}

function spawnCoyoteWild(i, x, z) {
  const name = COYOTE_NAMES[i % COYOTE_NAMES.length];
  const e = addEnt({ kind: 'coyote', cid: name, label: name, x, z, r: 0.5, top: 2, fur: pick([[138, 128, 112], [120, 130, 136], [150, 134, 110], [110, 112, 120]]), state: 'wander', timer: rr(2, 8), spd: 3, avoid: 0, sel: i });
  e.cueSeq = shuffleCues(i);
  setPos(e, x, z);
  return e;
}

export const CUE_DEFS = {
  play: { emoji: '🙇', text: 'It drops into a play bow, rump high, tail wagging.', answer: 'paw', hint: '🐾 Paws: answer the play bow.' },
  howl: { emoji: '🌙', text: 'It lifts its muzzle and lets out a soft, questioning howl.', answer: 'wolf', hint: '🐺 Wild: howl back.' },
  food: { emoji: '🍖', text: 'It sniffs at a scrap, then looks at you.', answer: 'eat', hint: '🍖 Eat: share the scrap.' },
  calm: { emoji: '😠', text: 'It stiffens and stares, ears pinned, hackles up.', answer: 'ok', hint: '✔ Confirm: hold still and stay calm.' },
};
function shuffleCues(seed) {
  const keys = Object.keys(CUE_DEFS);
  const out = [];
  for (let i = 0; i < 3; i++) out.push(keys[Math.floor(hash2(seed * 13 + i, 5) * keys.length)]);
  return out;
}

export function spawnAnimal(kind, near) {
  const woods = world.spawn.woods, parks = world.spawn.parks;
  let x, z;
  const tryPick = (okTypes, pools) => {
    for (let i = 0; i < 30; i++) {
      const c = pick(pools);
      const px = c[0] + rr(-18, 18), pz = c[1] + rr(-18, 18);
      if (okTypes.includes(tileAt(px, pz)) && !solidAt(px, pz) && (!near || dist(px, pz, G.player.x, G.player.z) > 55)) return [px, pz];
    }
    return null;
  };
  let p = null;
  switch (kind) {
    case 'rabbit': p = tryPick([T.LAWN, T.GRASS, T.WOODS], [...parks, ...woods]); break;
    case 'goose': p = tryPick([T.LAWN, T.SAND, T.GRASS], [...parks, ...world.spawn.beach]); break;
    case 'possum': p = tryPick([T.WOODS, T.GRASS], woods); break;
    case 'deer': p = tryPick([T.WOODS], woods); break;
    case 'fox': p = tryPick([T.WOODS, T.LAWN], [...woods, ...parks]); break;
    case 'cat': p = tryPick([T.GRASS, T.SIDEWALK], world.spawn.humans); break;
    case 'crow': p = tryPick([T.LAWN, T.SIDEWALK, T.GRASS, T.PLAZA], [...parks, ...world.spawn.humans.slice(0, 60)]); break;
  }
  if (!p) return null;
  [x, z] = p;
  const base = { kind, x, z, state: 'idle', timer: rr(1, 6), r: 0.4, top: 1.6, h: rr(0, TAU) };
  const defs = {
    rabbit: { r: 0.3, top: 1.2 }, goose: { r: 0.45, top: 2, aggro: chance(0.4) }, possum: { r: 0.35, top: 1.1 },
    deer: { r: 0.7, top: 3.9, stag: chance(0.4) }, fox: { r: 0.4, top: 1.6, trust: 0 }, cat: { r: 0.35, top: 1.4, trust: 0, fur: pick([[120, 124, 130], [210, 150, 80], [50, 50, 54], [220, 214, 200]]), sitting: chance(0.5) },
    crow: { r: 0.3, top: 1.2, alt: 0 },
  };
  const e = addEnt({ ...base, ...defs[kind] });
  setPos(e, x, z);
  return e;
}

export function populate() {
  G.ents.length = 0;
  G.items.length = 0;
  const p = G.player;
  G.ents.push(p);
  for (let i = 0; i < 46; i++) spawnHumanWalker();
  const rows = [2, 4, 5];
  const cols = [2, 6];
  const mk = (axis, line, dirSign, a, b, kindBias) => {
    const n = kindBias === 4 ? 3 : 2;
    for (let i = 0; i < n; i++) spawnVehicle({ axis, line, dirSign, a, b }, rr(a, b), kindBias);
  };
  for (const k of rows) { mk('x', k * PITCH + 10, 1, 52, 370, k); mk('x', k * PITCH + 6, -1, 52, 370, k); }
  for (const k of cols) { mk('z', k * PITCH + 6, 1, 26, 370, 0); mk('z', k * PITCH + 10, -1, 26, 370, 0); }
  for (let i = 0; i < 12; i++) spawnAnimal('rabbit');
  for (let i = 0; i < 7; i++) spawnAnimal('goose');
  for (let i = 0; i < 5; i++) spawnAnimal('possum');
  for (let i = 0; i < 6; i++) spawnAnimal('deer');
  for (let i = 0; i < 7; i++) spawnAnimal('cat');
  for (let i = 0; i < 4; i++) spawnAnimal('fox');
  for (let i = 0; i < 9; i++) spawnAnimal('crow');
  const wp = world.spawn.woods, pk = world.spawn.parks;
  const homes = [wp[2], wp[5], pk[0], wp[9] || wp[1], wp[7] || wp[3]];
  homes.forEach((c, i) => { if (c) { const e = spawnCoyoteWild(i, c[0] + rr(-8, 8), c[1] + rr(-8, 8)); e.bond = G.bonds[e.cid] || 0; } });
  world.spawn.beach.forEach(([x, z]) => {
    const s = addEnt({ kind: 'sealion', x: x + 0.5, z, r: 1.6, top: 3, scale: 1.1, state: 'rest', timer: rr(4, 10), h: Math.PI * 1.5, label: '' });
    setPos(s, s.x, s.z);
    s.y = 0.2;
  });
  const wz = world.landmarks.wizard, wi = world.landmarks.witch;
  const wizard = addEnt({ kind: 'wizard', x: wz.x, z: wz.z, r: 0.55, top: 3.9, state: 'idle', timer: 2, home: wz, label: 'Ambrose the Wizard', npc: 'wizard' });
  const witch = addEnt({ kind: 'witch', x: wi.x, z: wi.z, r: 0.5, top: 3.6, state: 'idle', timer: 2, home: wi, label: 'Hazel the Witch', npc: 'witch' });
  const pumpkin = addEnt({ kind: 'pumpkin', x: 250, z: 150, r: 0.8, top: 3, state: 'idle', timer: 2, label: 'Jack', npc: 'pumpkin', spd: 2.4 });
  for (const e of [wizard, witch, pumpkin]) setPos(e, e.x, e.z);
  // shop staff and patrons
  for (const s of world.shops) {
    const n = s.kind === 'grocery' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = rr(s.x0 + 3, s.x1 - 3), z = rr(s.z0 + 3, s.z1 - 3);
      if (solidAt(x, z)) continue;
      mkHuman(x, z, { state: 'inshop', shop: s, role: i === 0 ? 'staff' : 'patron', timer: rr(1, 4), bag: false, h: rr(0, TAU) });
    }
  }
  // night-time pumpkin, puddles
  G.puddles.length = 0;
  for (let i = 0; i < 45; i++) {
    const x = rr(BOUNDS.x0 + 10, BOUNDS.x1 - 10), z = rr(BOUNDS.z0 + 10, BOUNDS.z1 - 10);
    const t = tileAt(x, z);
    if (t === T.ROAD || t === T.SIDEWALK || t === T.PATH || t === T.PLAZA) G.puddles.push({ x, z, r: rr(0.9, 1.7) });
  }
}

// ----------------------------------------------------------- vehicles
function spawnVehicle(route, pos, bias) {
  const r = Math.random();
  let kind = 'car';
  if (bias === 4 && r < 0.2) kind = 'bus'; else if (r > 0.82) kind = r > 0.92 ? 'scooter' : 'bike';
  const along = route.axis === 'x';
  const e = { kind, route, axis: undefined, dirSign: route.dirSign, speed: 0, x: along ? pos : route.line, z: along ? route.line : pos, r: 1, top: 2, h: 0 };
  if (kind === 'car' || kind === 'bus') {
    e.axis = route.axis;
    e.len = kind === 'bus' ? 10 : 4.2; e.wid = kind === 'bus' ? 2.6 : 1.9; e.hgt = kind === 'bus' ? 3.4 : 1.7;
    e.col = kind === 'bus' ? [200, 150, 60] : pick(CAR_COLS);
    e.cruise = kind === 'bus' ? rr(6, 8) : rr(8.5, 12);
  } else {
    e.kind = 'human'; e.look = { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS), hat: [200, 60, 60] };
    e.bike = true; e.cruise = kind === 'bike' ? rr(4.5, 6) : rr(6, 8); e.r = 0.5; e.top = 2.9; e.rider = true; e.state = 'ride';
    e.line = route.line + (route.axis === 'x' ? (route.dirSign > 0 ? 1.2 : -1.2) : (route.dirSign > 0 ? -1.2 : 1.2));
    if (along) e.z = e.line; else e.x = e.line;
  }
  e.h = along ? (route.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2) : (route.dirSign > 0 ? Math.PI : 0);
  addEnt(e);
  setPos(e, e.x, e.z);
  return e;
}

function updateVehicle(e, dt) {
  const rt = e.route, along = rt.axis === 'x';
  const pos = along ? e.x : e.z;
  // look ahead for blockers
  let gap = 99;
  const lane = along ? e.z : e.x;
  const me = e.len ? e.len / 2 : 1;
  for (const o of G.ents) {
    if (o === e || o.dead) continue;
    const ol = along ? o.z : o.x;
    if (Math.abs(ol - lane) > (o.isPlayer || o.kind === 'human' || o.kind === 'coyote' ? 1.6 : 1.4)) continue;
    const op = along ? o.x : o.z;
    const ahead = (op - pos) * e.dirSign - me - (o.len ? o.len / 2 : (o.r || 0.4));
    if (ahead > -0.5 && ahead < gap && (o.route || o.isPlayer || o.kind === 'human' || o.kind === 'coyote' || o.kind === 'dog')) {
      if (o.route && o.route !== rt && o.route.axis !== rt.axis) continue;
      gap = ahead;
    }
  }
  let target = e.cruise;
  if (e.parked) target = 0;
  else if (gap < 14) target = clamp((gap - 3) / 11, 0, 1) * e.cruise;
  e.blockT = target < 0.5 ? (e.blockT || 0) + dt : 0;
  if (e.blockT > 2.5 && G.player && dist(e.x, e.z, G.player.x, G.player.z) < 20 && !e.honked) {
    e.honked = true; audio.honk(); e.emote = '📢';
    setTimeout(() => { e.honked = false; e.emote = ''; }, 4000);
  }
  e.speed += clamp(target - e.speed, -18 * dt, 6 * dt);
  const mv = e.speed * dt * e.dirSign;
  if (along) e.x += mv; else e.z += mv;
  const lo = rt.a, hi = rt.b;
  if (along) { if (e.x > hi) e.x = lo; if (e.x < lo) e.x = hi; } else { if (e.z > hi) e.z = lo; if (e.z < lo) e.z = hi; }
  e.y = groundH(e.x, e.z);
  e.moving = e.speed > 0.3 ? 1 : 0;
  e.walk += e.speed * dt * 2;
}

// ----------------------------------------------------------- scaring / drops
export function nearestThreat(e) {
  const p = G.player;
  let best = null, bd = 1e9;
  const test = (o) => { const d = dist(e.x, e.z, o.x, o.z); if (d < bd) { bd = d; best = o; } };
  test(p);
  for (const m of G.pack.members) if (!m.dead) test(m);
  return { o: best, d: bd };
}

function threatRadius(base) {
  const p = G.player;
  let r = base * (1 + 0.02 * (p.level || 1));
  if (p.speedNow > 6) r *= 1.35;
  if (G.sleeping) r *= 0.3;
  r *= 1 + 0.15 * G.pack.members.length;
  return r;
}

export function heatAdd(v) { G.heat = clamp(G.heat + v, 0, 100); }

export function scare(e, from, dur = rr(6, 10)) {
  if (e.state === 'flee' || e.state === 'panic') { e.timer = Math.max(e.timer, dur * 0.5); return; }
  e.state = e.state === 'inshop' || e.shop ? 'panic' : 'flee';
  e.timer = dur;
  e.fleeFrom = from;
  e.emote = pick(['😱', '😨', '❗']);
  setTimeout(() => { if (e.emote) e.emote = ''; }, 1800);
  G.stats.scared++;
  heatAdd(e.shop ? 1.2 : 0.7);
  if (chance(0.3)) audio.scream();
}

export function dropBag(h) {
  if (!h.bag) return;
  h.bag = false;
  spawnItem('bag', h.x + 0.6, h.z, 1, { ttl: 140 });
  h.emote = '😫';
  floater(h.x, 2.6, h.z, 'Dropped groceries!', '#ffd27a');
  heatAdd(2);
  scare(h, G.player, 9);
  G.stats.groceries++;
  setTimeout(() => { if (h.emote === '😫') h.emote = ''; }, 2000);
}

// ----------------------------------------------------------- per-kind updates
function updateHuman(e, dt) {
  if (e.rider) return updateRider(e, dt);
  if (e.role === 'cop') return updateCop(e, dt);
  if (e.role === 'vendor') return updateVendor(e, dt);
  const p = G.player;
  if (e.state === 'curious') { e.timer = 5; return; }
  const dp = dist(e.x, e.z, p.x, p.z);
  e.timer -= dt;
  if (e.emote === '' ) e.emote = undefined;
  // pumpkin scares
  const pump = G.ents.find((o) => o.kind === 'pumpkin');
  if (pump && dist(e.x, e.z, pump.x, pump.z) < 7 && e.state !== 'flee' && e.state !== 'panic' && !e.leaving) { e.state = 'flee'; e.timer = 5; e.fleeFrom = pump; e.emote = '🎃'; }
  const shop = e.shop;
  const coffeeInside = shop && shop.kind === 'coffee' && shop.inside;
  if (e.state !== 'flee' && e.state !== 'panic') {
    const R = e.role === 'picnic' ? 5 : coffeeInside ? 16 : shop ? 7 : 6.5;
    const { o, d } = nearestThreat(e);
    if (d < threatRadius(R) && !(G.sleeping && d > 2)) {
      if (shop && !shop.inside) { /* shoppers ignore the coyote outside */ }
      else if (e.role === 'staff' && shop && shop.inside && d > 5) { e.state = 'shout'; e.timer = 2; e.emote = '😠'; }
      else scare(e, o);
    }
    if (e.bag && dp < 3.4 && p.speedNow > 5.5) {
      e.chaseT = (e.chaseT || 0) + dt;
      e.emote = '😰';
      if (e.chaseT > 1.2) { e.emote = ''; dropBag(e); }
    } else if (e.chaseT) { e.chaseT = Math.max(0, e.chaseT - dt); }
  }
  switch (e.state) {
    case 'idle':
      e.moving = 0;
      if (e.timer <= 0) { e.state = 'walk'; e.wp = null; }
      break;
    case 'sit':
      e.moving = 0;
      break;
    case 'shout':
      e.moving = 0;
      faceTo(e, p.x - e.x, p.z - e.z, 6, dt);
      if (e.timer <= 0) e.state = 'inshop';
      break;
    case 'walk': {
      if (!e.wp || e.timer <= 0 || dist(e.x, e.z, e.wp[0], e.wp[1]) < 1.2) {
        if (e.wp && chance(0.35)) { e.state = 'idle'; e.timer = rr(2, 7); break; }
        e.wp = e.market ? pick(world.spawn.plaza.filter((q) => q[0] > 192 && q[0] < 208 && q[1] > 112 && q[1] < 192).concat([[200, rr(116, 188)]])) : e.leaving ? [e.x + (e.x > 200 ? 90 : -90), e.z + rr(-30, 30)] : randomNear(e, 12, 38);
        e.timer = rr(8, 16);
        if (!e.wp) { e.state = 'idle'; e.timer = 2; break; }
      }
      walk(e, e.wp[0] - e.x, e.wp[1] - e.z, e.spd, dt);
      if (e.blocked && e.blockedT > 0.4) { e.wp = null; e.blockedT = 0; } else e.blockedT = e.blocked ? (e.blockedT || 0) + dt : 0;
      if (e.leaving) { e.leaveT = (e.leaveT || 0) + dt; if (e.leaveT > 28 && dist(e.x, e.z, p.x, p.z) > 30) e.dead = true; }
      break;
    }
    case 'flee':
    case 'panic': {
      const from = e.fleeFrom || p;
      let dx = e.x - from.x, dz = e.z - from.z;
      if (e.state === 'panic' && e.shop) {
        // run around the shop, toward the door once the coyote is close
        const s = e.shop;
        const door = [(s.doorX0 + s.doorX1) / 2, s.face === 's' ? s.z1 + 3 : s.z0 - 3];
        if (e.timer < 4 || dp < 4) { dx = door[0] - e.x; dz = door[1] - e.z; }
        else { dx += Math.sin(e.timer * 3 + e.id) * 4; dz += Math.cos(e.timer * 2.3 + e.id) * 4; }
        if (chance(dt * 0.25)) audio.scream();
      }
      if (e.blockedT > 0.3) { const a = Math.atan2(dx, dz) + (e.id % 2 ? 1.2 : -1.2); dx = Math.sin(a); dz = Math.cos(a); }
      walk(e, dx, dz, e.state === 'panic' ? 5.6 : 5.2, dt);
      e.blockedT = e.blocked ? (e.blockedT || 0) + dt : 0;
      if (e.timer <= 0 && dist(e.x, e.z, from.x, from.z) > 8) {
        e.state = e.shop && !shopAt(e.x, e.z) ? 'walk' : e.shop ? 'inshop' : 'walk'; e.wp = null; e.emote = '';
        if (e.shop && !shopAt(e.x, e.z)) { e.shop = null; }
      }
      break;
    }
    case 'inshop': {
      const s = e.shop;
      if (!e.wp || e.timer <= 0) { e.wp = [rr(s.x0 + 2.5, s.x1 - 2.5), rr(s.z0 + 2.5, s.z1 - 2.5)]; e.timer = rr(3, 8); }
      if (e.role === 'staff' && chance(dt * 0.01)) e.wp = e.wp;
      walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 1.2, dt);
      if (e.blocked) e.timer = 0;
      break;
    }
  }
}

function updateRider(e, dt) {
  const rt = e.route, along = rt.axis === 'x';
  const pos = along ? e.x : e.z;
  let target = e.cruise;
  const lane = along ? e.z : e.x;
  for (const o of G.ents) {
    if (o === e || o.dead || !(o.isPlayer || o.route)) continue;
    const ol = along ? o.z : o.x;
    if (Math.abs(ol - lane) > 1.6) continue;
    const ahead = ((along ? o.x : o.z) - pos) * e.dirSign - (o.len ? o.len / 2 : 0.5);
    if (ahead > 0 && ahead < 7) target = Math.min(target, Math.max(0, (ahead - 2) / 5) * e.cruise);
  }
  e.speed = e.speed === undefined ? 0 : e.speed;
  e.speed += clamp(target - e.speed, -14 * dt, 4 * dt);
  const mv = e.speed * dt * e.dirSign;
  if (along) e.x += mv; else e.z += mv;
  if (along) { if (e.x > rt.b) e.x = rt.a; if (e.x < rt.a) e.x = rt.b; } else { if (e.z > rt.b) e.z = rt.a; if (e.z < rt.a) e.z = rt.b; }
  e.y = groundH(e.x, e.z);
  e.moving = e.speed > 0.3 ? 1 : 0;
  e.walk += e.speed * dt * 1.4;
}

function updateVendor(e, dt) {
  const p = G.player;
  const dp = dist(e.x, e.z, p.x, p.z);
  e.timer -= dt;
  if (e.state === 'stand') {
    e.moving = 0;
    faceTo(e, p.x - e.x, p.z - e.z, 3, dt);
    e.broom = false;
    if (dp < 4.6 && !G.marketClaimed && !G.sleeping) {
      e.state = 'shoo'; e.timer = 1.6; e.emote = '😡'; e.broom = true;
    }
    const thr = G.pack.members.length >= 2 ? threatRadius(5) : 0;
    if (G.pack.members.length >= 2 && dp < thr) scare(e, p, 14);
  } else if (e.state === 'shoo') {
    faceTo(e, p.x - e.x, p.z - e.z, 8, dt);
    if (dp < 3.2 && !e.hit && e.timer < 1.2) {
      e.hit = true; hurtPlayer(3, e, 4);
      floater(p.x, 2.4, p.z, 'Shoo!', '#ffb0a0');
    }
    if (e.timer <= 0) { e.state = 'stand'; e.hit = false; e.emote = ''; }
  } else if (e.state === 'flee') {
    const dx = e.x - p.x, dz = e.z - p.z;
    walk(e, dx, dz, 5, dt);
    if (e.timer <= 0 && dp > 10) { e.state = 'stand'; e.emote = ''; }
  }
  if (e.state === 'panic') e.state = 'flee';
}

export function hurtPlayer(n, from, knock = 0) {
  const p = G.player;
  if (p.invuln > 0 || G.flight > 0) return;
  p.hp -= n; p.invuln = 0.8; p.hurt = 0.3;
  audio.bad();
  if (knock && from) {
    const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1;
    p.kx = (dx / l) * knock * 4; p.kz = (dz / l) * knock * 4;
  }
}

function updateCop(e, dt) {
  const p = G.player;
  const dp = dist(e.x, e.z, p.x, p.z);
  e.life -= dt;
  const packPower = G.pack.members.length;
  if (e.state !== 'retreat' && packPower >= 2 && dp < 16 + packPower * 3) {
    e.state = 'retreat'; e.emote = '😬'; e.life = Math.min(e.life, 6);
    G.stats.evaded++; G.pack.cohesion = clamp(G.pack.cohesion + 6, 0, 100);
    floater(e.x, 3, e.z, 'The pack overwhelmed the cops!', '#cba8ff');
  }
  if (e.state === 'retreat') {
    walk(e, e.x - p.x, e.z - p.z, 6, dt, { noWoods: true });
    if (e.life <= 0) e.dead = true;
    return;
  }
  if (e.life <= 0) { e.dead = true; return; }
  // flank: cop 0 approaches directly, cop 1 from the side
  const side = e.idx % 2 ? 1 : -1;
  let tx = p.x, tz = p.z;
  if (dp > 6) { tx += Math.cos(p.h) * 5 * side; tz += Math.sin(p.h) * 5 * side; }
  walk(e, tx - e.x, tz - e.z, 5.2 + (e.idx ? 0.2 : 0), dt, { noWoods: true });
  e.emote = dp < 14 ? '🚔' : '';
  if (dp < 1.5 && !G.sleeping && G.flight <= 0 && p.alt < 1 && !e.dead) caught();
}

export function caught() {
  const p = G.player;
  G.stats.caught++;
  toast('Caught! The cops shooed you out of the neighborhood. You wake up in the woods.');
  audio.bad();
  const c = pick(world.spawn.woods);
  setPos(p, c[0], c[1]);
  p.hp = Math.max(10, p.hp - 12); p.food = Math.max(0, p.food - 15);
  G.heat = 20;
  for (const e of G.ents) if (e.role === 'cop') e.state = 'retreat';
  G.copsOut = 0;
  G.pack.cohesion = Math.max(0, G.pack.cohesion - 10);
}

export function dispatchCops() {
  const p = G.player;
  G.copsOut = 1;
  G.copGone = 0;
  let spot = null;
  for (let i = 0; i < 40 && !spot; i++) {
    const c = pick(world.spawn.humans);
    const d = dist(c[0], c[1], p.x, p.z);
    if (d > 55 && d < 100) spot = c;
  }
  if (!spot) spot = pick(world.spawn.humans);
  audio.siren();
  toast('🚔 Sirens! Someone called the cops. (They are slow, and they don\'t like the woods.)');
  const car = addEnt({ kind: 'car', cop: true, axis: 'x', dirSign: 1, len: 4.4, wid: 1.9, hgt: 1.7, col: [230, 232, 236], x: spot[0], z: spot[1], r: 1, parked: true, speed: 0, route: { axis: 'x', a: 0, b: 999 }, cruise: 0, life: 70 });
  setPos(car, spot[0], spot[1]);
  for (let i = 0; i < 2; i++) {
    const c = mkHuman(spot[0] + 2 + i, spot[1] + 2, { role: 'cop', state: 'chase', life: 55, idx: i, look: { shirt: [40, 60, 110], pants: [30, 36, 60], skin: pick(SKINS), hair: [40, 30, 30] } });
    c.emote = '🚔';
  }
}

export function spawnHeli() {
  const p = G.player;
  const h = addEnt({ kind: 'heli', x: p.x + 60, z: p.z - 40, r: 2, top: 4, alt: 16, fire: 3, life: 120, ang: 0 });
  setPos(h, h.x, h.z);
  toast('🚁 A federal helicopter is circling! Lay low, or get into the woods.');
  audio.siren();
  return h;
}

function updateHeli(e, dt) {
  const p = G.player;
  e.life -= dt;
  e.ang += dt * 0.5;
  const tx = p.x + Math.cos(e.ang) * 20, tz = p.z + Math.sin(e.ang) * 20;
  e.x += (tx - e.x) * Math.min(1, dt * 1.2); e.z += (tz - e.z) * Math.min(1, dt * 1.2);
  e.alt = 14 + Math.sin(e.ang * 2) * 1.5;
  e.y = groundH(e.x, e.z) + e.alt;
  e.h = Math.atan2(p.x - e.x, -(p.z - e.z));
  e.fire -= dt;
  if (e.fire <= 0 && G.heat > 60 && tileAt(p.x, p.z) !== T.WOODS && !G.sleeping) {
    e.fire = rr(2.2, 3.4);
    audio.zap();
    G.darts.push({ sx: e.x, sy: e.y, sz: e.z, tx: p.x + (p.vx || 0) * 0.5, tz: p.z + (p.vz || 0) * 0.5, t: 0.9, ent: { kind: 'dart', x: e.x, y: e.y, z: e.z, h: 0, r: 0.2 } });
  }
  if (G.heat < 45 || e.life <= 0) e.dead = true;
  e.moving = 1;
}

export function updateDarts(dt) {
  const p = G.player;
  for (const d of G.darts) {
    d.t -= dt;
    const k = 1 - Math.max(0, d.t) / 0.9;
    d.ent.x = d.sx + (d.tx - d.sx) * k; d.ent.z = d.sz + (d.tz - d.sz) * k;
    d.ent.y = d.sy + (groundH(d.tx, d.tz) + 0.8 - d.sy) * k;
    if (d.t <= 0) {
      d.dead = true;
      if (dist(d.tx, d.tz, p.x, p.z) < 1.8) { hurtPlayer(9, { x: d.tx, z: d.tz }, 1); G.stun = 0.7; floater(p.x, 2.5, p.z, 'Tranq dart!', '#ff8080'); }
    }
  }
  G.darts = G.darts.filter((d) => !d.dead);
}

function updateDog(e, dt) {
  const p = G.player, o = e.owner;
  if (!o || o.dead) { e.owner = null; e.state = 'wander'; }
  const dp = dist(e.x, e.z, p.x, p.z);
  e.timer -= dt;
  e.cool = Math.max(0, (e.cool || 0) - dt);
  if (o && e.state !== 'engage' && e.state !== 'flee' && !e.reactCd && dp < 8 && o.state !== 'flee') {
    e.reactCd = 12;
    const r = e.friend ? 1 : Math.random();
    if (e.friend) { e.state = 'follow'; e.emote = '🐕'; }
    else if (r < 0.4) { e.state = 'engage'; e.timer = rr(4, 7); e.emote = '🐕‍🦺'; audio.bark(); }
    else if (r < 0.75) { e.state = 'flee'; e.timer = 4; e.emote = '😧'; }
  }
  if (e.reactCd) e.reactCd = Math.max(0, e.reactCd - dt);
  switch (e.state) {
    case 'engage': {
      walk(e, p.x - e.x, p.z - e.z, 6.2, dt);
      if (dp < 1.3 && e.cool <= 0) { e.cool = 1.6; hurtPlayer(4, e, 2); floater(p.x, 2.2, p.z, 'Bitten!', '#ffb0a0'); audio.bark(); }
      if (e.timer <= 0 || dp > 25) { e.state = 'follow'; e.emote = ''; if (o) { o.emote = '😅'; setTimeout(() => { o.emote = ''; }, 2000); } }
      break;
    }
    case 'flee':
      walk(e, e.x - p.x, e.z - p.z, 6, dt);
      if (e.timer <= 0) { e.state = 'follow'; e.emote = ''; }
      break;
    default: {
      if (!o) {
        if (e.timer <= 0) { e.timer = rr(2, 6); e.wp = randomNear(e, 4, 12); }
        if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 2.2, dt); else e.moving = 0;
        break;
      }
      const d = dist(e.x, e.z, o.x, o.z);
      if (d > 3) walk(e, o.x - e.x, o.z - e.z, clamp(d * 1.4, 2, 6), dt);
      else { e.moving = 0; if (chance(dt * 0.2)) e.h += rr(-1, 1); }
      if (d > 4.5 && o.state !== 'flee' && o.state !== 'idle') { /* owner drags along */ }
    }
  }
  // owner waits if dog is far
  if (o && !o.dead && dist(e.x, e.z, o.x, o.z) > 9 && o.state === 'walk') { o.state = 'idle'; o.timer = 1.5; }
}

function preyThreat(e, base) {
  const { d } = nearestThreat(e);
  return d < threatRadius(base) * (G.player.speedNow > 6 ? 1.2 : 0.8) && !G.sleeping ? d : -1;
}

function updateRabbit(e, dt) {
  e.timer -= dt;
  const th = preyThreat(e, 8);
  if (e.state === 'flee') {
    const { o } = nearestThreat(e);
    let dx = e.x - o.x + Math.sin(e.timer * 9) * 3, dz = e.z - o.z + Math.cos(e.timer * 7) * 3;
    if (e.blockedT > 0.2) { const a = Math.atan2(dx, dz) + 1.3; dx = Math.sin(a); dz = Math.cos(a); }
    walk(e, dx, dz, e.fast ? 12 : 10, dt);
    e.blockedT = e.blocked ? (e.blockedT || 0) + dt : 0;
    if (e.timer <= 0) { e.state = 'idle'; e.timer = rr(2, 5); e.fast = false; }
    return;
  }
  if (th > 0) { e.state = 'flee'; e.timer = rr(3.5, 6); return; }
  if (e.state === 'idle') { e.moving = 0; e.walk += dt * 0.5; if (e.timer <= 0) { e.state = 'wander'; e.timer = rr(1.5, 3); e.wp = randomNear(e, 3, 9, (x, z) => !solidAt(x, z) && tileAt(x, z) !== T.ROAD && tileAt(x, z) !== T.WATER && tileAt(x, z) !== T.CREEK); } }
  else { if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 2.2, dt); if (e.timer <= 0 || !e.wp) { e.state = 'idle'; e.timer = rr(2, 6); } }
}

function updateGoose(e, dt) {
  e.timer -= dt;
  e.cool = Math.max(0, (e.cool || 0) - dt);
  const p = G.player;
  const dp = dist(e.x, e.z, p.x, p.z);
  if (e.state === 'chase') {
    walk(e, p.x - e.x, p.z - e.z, 6.2, dt);
    if (dp < 1.2 && e.cool <= 0) { e.cool = 1.6; hurtPlayer(3, e, 1.5); audio.hiss(); floater(p.x, 2, p.z, 'Honk! Bite!', '#ffb0a0'); }
    if (e.timer <= 0) { e.state = 'idle'; e.timer = 3; e.emote = ''; }
    return;
  }
  if (e.state === 'flee') {
    walk(e, e.x - p.x, e.z - p.z, 5.2, dt);
    if (e.timer <= 0) { e.state = 'idle'; e.timer = rr(2, 5); }
    return;
  }
  if (preyThreat(e, 5) > 0) {
    if (e.aggro && chance(0.5)) { e.state = 'chase'; e.timer = 3; e.emote = '😤'; audio.hiss(); setTimeout(() => { e.emote = ''; }, 1500); }
    else { e.state = 'flee'; e.timer = rr(3, 5); if (chance(0.5)) audio.honk(); }
    return;
  }
  if (e.state === 'idle') { e.moving = 0; if (e.timer <= 0) { e.state = 'wander'; e.timer = rr(2, 5); e.wp = randomNear(e, 3, 10, (x, z) => !solidAt(x, z) && [T.LAWN, T.SAND, T.GRASS, T.PATH].includes(tileAt(x, z))); } }
  else { if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 1.2, dt); if (e.timer <= 0 || !e.wp) { e.state = 'idle'; e.timer = rr(2, 6); } }
}

function updatePossum(e, dt) {
  e.timer -= dt;
  if (e.state === 'dead' || e.state === 'play') { e.moving = 0; if (e.timer <= 0) { e.state = 'idle'; e.timer = 2; } return; }
  if (preyThreat(e, 5) > 0 && e.state !== 'flee') {
    if (chance(0.55)) { e.state = 'play'; e.timer = rr(6, 9); e.emote = '💀'; setTimeout(() => { e.emote = ''; }, 1200); }
    else { e.state = 'flee'; e.timer = 4; }
    return;
  }
  if (e.state === 'flee') { const { o } = nearestThreat(e); walk(e, e.x - o.x, e.z - o.z, 4.6, dt); if (e.timer <= 0) { e.state = 'idle'; e.timer = 3; } return; }
  const night = G.clock.sunE < 0.05;
  if (e.state === 'idle') { e.moving = 0; if (e.timer <= 0) { e.state = 'wander'; e.timer = rr(2, 5); e.wp = night ? randomNear(e, 4, 14) : null; } }
  else { if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 1.4, dt); if (e.timer <= 0 || !e.wp) { e.state = 'idle'; e.timer = rr(3, 8); } }
}

function updateDeer(e, dt) {
  e.timer -= dt;
  if (e.state === 'flee') {
    const { o } = nearestThreat(e);
    let dx = e.x - o.x, dz = e.z - o.z;
    if (e.blockedT > 0.2) { const a = Math.atan2(dx, dz) + (e.id % 2 ? 1 : -1); dx = Math.sin(a); dz = Math.cos(a); }
    walk(e, dx, dz, (e.slow ? 6 : 10.5), dt);
    e.blockedT = e.blocked ? (e.blockedT || 0) + dt : 0;
    if (e.timer <= 0) { e.state = 'idle'; e.timer = rr(3, 7); e.slow = false; }
    return;
  }
  if (preyThreat(e, 16) > 0) { e.state = 'flee'; e.timer = rr(5, 8); e.emote = '❗'; setTimeout(() => { e.emote = ''; }, 1200); return; }
  if (e.state === 'idle') { e.moving = 0; if (e.timer <= 0) { e.state = 'wander'; e.timer = rr(3, 6); e.wp = randomNear(e, 5, 15, (x, z) => !solidAt(x, z) && tileAt(x, z) !== T.WATER && tileAt(x, z) !== T.ROAD); } }
  else { if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 1.8, dt); if (e.timer <= 0 || !e.wp) { e.state = 'idle'; e.timer = rr(3, 8); } }
}

function updateCatFox(e, dt) {
  e.timer -= dt;
  if (e.pack) return;
  if (e.state === 'flee') {
    const { o } = nearestThreat(e);
    walk(e, e.x - o.x, e.z - o.z, 6.5, dt);
    if (e.timer <= 0) { e.state = 'idle'; e.timer = 3; e.sitting = false; }
    return;
  }
  if (e.kind === 'cat') e.sitting = e.state === 'idle';
  if (e.state === 'idle') { e.moving = 0; if (e.timer <= 0) { e.state = 'wander'; e.timer = rr(3, 7); e.wp = randomNear(e, 3, 12, (x, z) => !solidAt(x, z) && tileAt(x, z) !== T.ROAD && tileAt(x, z) !== T.WATER && tileAt(x, z) !== T.CREEK); } }
  else { if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, e.kind === 'fox' ? 2.4 : 1.8, dt); if (e.timer <= 0 || !e.wp) { e.state = 'idle'; e.timer = rr(3, 9); } }
}

function updateCrow(e, dt) {
  e.timer -= dt;
  if (e.scouting) {
    e.scoutT -= dt;
    e.alt = Math.min(14, (e.alt || 0) + dt * 12);
    const a = e.scoutT * 0.6;
    e.x += Math.cos(a) * 14 * dt; e.z += Math.sin(a) * 14 * dt;
    e.y = groundH(e.x, e.z) + e.alt;
    e.h = a + Math.PI / 2; e.moving = 1;
    if (e.scoutT <= 0) { e.scouting = false; e.state = 'idle'; e.timer = 3; setPos(e, G.player.x + rr(-5, 5), G.player.z + rr(-5, 5)); e.alt = 6; e.state = 'land'; }
    return;
  }
  const dp = dist(e.x, e.z, G.player.x, G.player.z);
  if (e.state === 'land') { e.alt = Math.max(0, e.alt - dt * 5); e.y = groundH(e.x, e.z) + e.alt; if (e.alt <= 0) { e.state = 'idle'; e.timer = 3; } return; }
  if (e.state === 'fly') {
    e.alt = Math.min(5, e.alt + dt * 9);
    const dx = e.wp[0] - e.x, dz = e.wp[1] - e.z;
    walk(e, dx, dz, 11, dt, { ghost: true });
    e.alt = e.alt;
    e.y = groundH(e.x, e.z) + e.alt;
    if (Math.hypot(dx, dz) < 2 || e.timer <= 0) { e.state = 'land'; }
    return;
  }
  if (!e.friend && dp < 4 && G.player.speedNow > 3.5 && e.state !== 'fly') {
    e.state = 'fly'; e.timer = 4; e.wp = [e.x + rr(-22, 22), e.z + rr(-22, 22)]; audio.caw(); return;
  }
  if (e.state === 'idle') { e.moving = 0; e.walk += dt; if (e.timer <= 0) { e.state = 'wander'; e.timer = rr(1.5, 3); e.wp = randomNear(e, 2, 6, (x, z) => !solidAt(x, z) && tileAt(x, z) !== T.WATER); } }
  else { if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 1.6, dt); if (e.timer <= 0 || !e.wp) { e.state = 'idle'; e.timer = rr(2, 6); } }
}

function updateSealion(e, dt) {
  e.timer -= dt;
  const p = G.player;
  const dp = dist(e.x, e.z, p.x, p.z);
  e.y = 0.2;
  if (dp < 2.6 && !G.sleeping && G.flight <= 0) {
    e.warn = (e.warn || 0) + dt;
    if (e.warn < 0.05) { e.emote = '😠'; audio.bleat(); }
    faceTo(e, p.x - e.x, p.z - e.z, 3, dt);
    if (e.warn > 1.6) { e.warn = 0; slam(e); }
  } else e.warn = 0;
  if (e.timer <= 0) { e.timer = rr(5, 12); if (dp < 20 && chance(0.5)) { audio.bleat(); e.emote = '🦭'; setTimeout(() => { e.emote = ''; }, 1500); } }
  e.moving = 0;
}

export function slam(e) {
  const p = G.player;
  hurtPlayer(20, e, 5);
  G.stun = 0.9;
  floater(p.x, 2.6, p.z, 'WHUMP!', '#ff9a9a');
  toast('The sea lion body-slams you. Maybe don\'t do that.');
  e.emote = '😤';
  setTimeout(() => { e.emote = ''; }, 1500);
}

function updateWild(e, dt) {
  // wizard / witch / pumpkin wander
  e.timer -= dt;
  if (e.state === 'idle') {
    e.moving = 0;
    if (e.timer <= 0) {
      e.state = 'walk'; e.timer = rr(4, 8);
      const home = e.home || e;
      const a = rr(0, TAU), d = rr(2, e.kind === 'pumpkin' ? 30 : 8);
      e.wp = [clamp((e.home ? home.x : e.x) + Math.sin(a) * d, BOUNDS.x0 + 4, BOUNDS.x1 - 4), clamp((e.home ? home.z : e.z) - Math.cos(a) * d, BOUNDS.z0 + 4, BOUNDS.z1 - 4)];
    }
  } else {
    walk(e, e.wp[0] - e.x, e.wp[1] - e.z, e.kind === 'pumpkin' ? e.spd : 1.3, dt);
    if (e.timer <= 0 || e.blocked || dist(e.x, e.z, e.wp[0], e.wp[1]) < 1) { e.state = 'idle'; e.timer = rr(2, 6); }
  }
  if (e.kind === 'pumpkin' && G.clock.sunE > 0.3 && chance(dt * 0.01)) e.emote = '🎃';
}

function updateWildCoyote(e, dt) {
  const p = G.player;
  const dp = dist(e.x, e.z, p.x, p.z);
  e.timer -= dt;
  e.avoid = Math.max(0, (e.avoid || 0) - dt);
  if (e.state === 'answer') {
    walk(e, p.x - e.x, p.z - e.z, 8, dt);
    if (dp < 5) {
      e.state = 'watch';
      if ((e.bond || 0) >= 60 && G.pack.members.length < 3) G.joinPack?.(e);
      else { e.emote = '🐾'; toast(`${e.cid} came running. Press 🐾 to greet.`); }
    }
    return;
  }
  if (e.avoid > 0) { walk(e, e.x - p.x, e.z - p.z, 7, dt); return; }
  if (dp < 16 && !G.sleeping) {
    e.moving = 0;
    faceTo(e, p.x - e.x, p.z - e.z, 3, dt);
    e.state = 'watch';
    if (dp < 4 && e.blocked) e.timer = 0;
    return;
  }
  if (e.state === 'watch') { e.state = 'wander'; e.timer = 1; }
  if (e.state === 'wander') {
    if (!e.wp || e.timer <= 0) { e.wp = randomNear(e, 6, 24, (x, z) => !solidAt(x, z) && [T.WOODS, T.LAWN, T.GRASS, T.PATH].includes(tileAt(x, z))); e.timer = rr(5, 12); }
    if (e.wp) walk(e, e.wp[0] - e.x, e.wp[1] - e.z, 2.8, dt); else e.moving = 0;
    if (e.wp && dist(e.x, e.z, e.wp[0], e.wp[1]) < 1.2) { e.state = 'rest'; e.timer = rr(4, 10); }
  } else if (e.state === 'rest') { e.moving = 0; if (e.timer <= 0) { e.state = 'wander'; e.wp = null; } }
}

export function updatePackMember(e, dt) {
  const p = G.player;
  const i = G.pack.members.indexOf(e);
  const offs = [[-2.2, 2.0], [2.2, 2.4], [0, 4.2], [-3.6, 4]];
  const o = offs[i % offs.length];
  // offsets are in the leader's frame: x = right, y = behind
  const fx = Math.sin(p.h), fz = -Math.cos(p.h), rx = Math.cos(p.h), rz = Math.sin(p.h);
  const tx = p.x - fx * o[1] + rx * o[0], tz = p.z - fz * o[1] + rz * o[0];
  e.sleeping = !!G.sleeping && dist(e.x, e.z, p.x, p.z) < 7;
  if (G.sleeping) { e.moving = 0; return; }
  if (e.assist && !e.assist.dead) {
    e.assistT -= dt;
    walk(e, e.assist.x - e.x, e.assist.z - e.z, 9.5, dt);
    if (e.assistT <= 0) e.assist = null;
    return;
  }
  const d = dist(e.x, e.z, tx, tz);
  if (d > 40) { setPos(e, tx, tz); return; }
  if (d > 0.9) walk(e, tx - e.x, tz - e.z, clamp(d * 2.2, 1.5, 11), dt, { swim: false });
  else { e.moving = 0; faceTo(e, Math.sin(p.h), -Math.cos(p.h), 4, dt); }
  e.crouch = 0;
  if (e.kind === 'coyote' || e.kind === 'fox') e.tailUp = 0.3;
}

function updateStaffAndShops(dt) {
  for (const s of world.shops) {
    const pl = G.player;
    s.inside = insideShop(s, pl.x, pl.z);
    const clk = G.clock;
    if (s.kind === 'grocery') {
      s.cycle = (s.cycle ?? rr(0, 40)) + dt;
      if (s.cycle > 40) s.cycle -= 40;
      const night = clk.sunE < -0.15;
      s.open = !night && s.cycle < 17;
      if (s.open && !s.wasOpen) { audio.blip(); }
      s.wasOpen = s.open;
    } else s.open = clk.sunE > -0.1;
    s.barrier.off = s.open || s.inside;
    // shoppers leave carrying groceries
    if (s.open && s.kind === 'grocery') {
      s.exitT = (s.exitT || 0) - dt;
      if (s.exitT <= 0) {
        s.exitT = rr(6, 11);
        if (dist((s.x0 + s.x1) / 2, s.z1, pl.x, pl.z) < 120) {
          const fz = s.face === 's' ? s.z1 + 1.2 : s.z0 - 1.2;
          const h = mkHuman((s.doorX0 + s.doorX1) / 2, fz, { state: 'walk', bag: true, spd: rr(1.6, 2.2) });
          if (G.ents.length > 300) h.dead = true;
        }
      }
    }
    // restock
    s.restock = (s.restock || 0) - dt;
    if (s.restock <= 0 && s.open) {
      s.restock = 18;
      const kind = s.kind === 'grocery' ? 'crate' : 'coffee';
      let have = 0;
      for (const it of G.items) if (it.shop === s) have++;
      const want = Math.min(s.spots.length, s.kind === 'grocery' ? 4 : 3);
      if (have < want) {
        const spot = pick(s.spots);
        if (!G.items.some((it) => it.shop === s && Math.hypot(it.x - spot.x, it.z - spot.z) < 1)) spawnItem(kind, spot.x, spot.z, kind === 'coffee' ? 2 : 3, { shop: s, ttl: 9999 });
      }
    }
  }
}

// ----------------------------------------------------------- events
function marketActive(clk) {
  const day = Math.floor(clk.day);
  const h = clk.tod * 24;
  return hash2(day, 11) < 0.6 && h >= 9 && h < 17 && G.rain < 0.5;
}

function startMarket() {
  world.ev.market = true;
  G.marketClaimed = false;
  toast('🥕 The Plum Street Farmer\'s Market is open! Stalls full of food… and brooms.');
  world.stalls.forEach((st, i) => {
    st.solid.off = false;
    if (i % 2 === 0) {
      const v = mkHuman(st.x + (st.side ? -2.2 : 2.2), st.z, { role: 'vendor', state: 'stand', look: { shirt: pick(SHIRTS), pants: PANTS[0], skin: pick(SKINS), hair: pick(HAIRS) }, evt: 'market', home: st });
      v.h = st.side ? -Math.PI / 2 : Math.PI / 2;
    }
    st.food = 3;
    spawnItem('produce', st.x + (st.side ? -1.4 : 1.4), st.z, 3, { stall: st, ttl: 99999, evt: 'market' });
  });
  for (let i = 0; i < 20; i++) {
    const x = rr(195, 205), z = rr(116, 188);
    mkHuman(x, z, { state: 'walk', market: true, evt: 'market', bag: chance(0.3) });
  }
}

function endMarket() {
  world.ev.market = false;
  G.marketClaimed = false;
  toast('The market is packing up.');
  for (const st of world.stalls) st.solid.off = true;
  for (const e of G.ents) {
    if (e.evt === 'market') { if (e.role === 'vendor') e.dead = true; else { e.leaving = true; e.market = false; e.state = 'walk'; e.wp = null; } }
  }
  G.items = G.items.filter((it) => it.evt !== 'market');
}

function startPicnic(i) {
  world.ev.picnic = i;
  const sp = world.picnicSpots[i];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    mkHuman(sp.x + Math.cos(a) * 3.2, sp.z + Math.sin(a) * 3.2, { state: 'sit', role: 'picnic', evt: 'picnic', look: { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS), hat: chance(0.4) ? [220, 200, 120] : null } });
  }
  spawnItem('crate', sp.x - 0.8, sp.z, 3, { evt: 'picnic', ttl: 99999 });
  spawnItem('crate', sp.x + 0.8, sp.z + 0.5, 3, { evt: 'picnic', ttl: 99999 });
  if (G.knownPicnic) toast('🧺 The picnic your crow friend mentioned has started!');
}

function endPicnic() {
  world.ev.picnic = -1;
  G.knownPicnic = false;
  for (const e of G.ents) if (e.evt === 'picnic') { e.leaving = true; e.state = 'walk'; e.role = null; e.wp = null; }
  G.items = G.items.filter((it) => it.evt !== 'picnic');
}

export function updateEvents(dt) {
  const clk = G.clock;
  const m = marketActive(clk);
  if (m && !world.ev.market) startMarket();
  if (!m && world.ev.market) endMarket();
  const day = Math.floor(clk.day), h = clk.tod * 24;
  const pic = hash2(day, 13) < 0.7 && h >= 11.5 && h < 16.5 && G.rain < 0.4;
  if (pic && world.ev.picnic < 0) startPicnic(Math.floor(hash2(day, 17) * 3));
  if (!pic && world.ev.picnic >= 0) endPicnic();
}

// ----------------------------------------------------------- main
export function updateNPCs(dt) {
  const p = G.player;
  updateStaffAndShops(dt);
  for (const e of G.ents) {
    if (e.isPlayer || e.dead) continue;
    const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z);
    if (d > 190 && !e.pack && !e.route) continue;
    if (e.pack) { updatePackMember(e, dt); continue; }
    if (e.route && e.axis) { if (!e.parked || true) { if (d > 260) continue; if (e.cop) { e.life -= dt; if (e.life <= 0) e.dead = true; continue; } updateVehicle(e, dt); } continue; }
    switch (e.kind) {
      case 'human': updateHuman(e, dt); break;
      case 'dog': updateDog(e, dt); break;
      case 'rabbit': updateRabbit(e, dt); break;
      case 'goose': updateGoose(e, dt); break;
      case 'possum': updatePossum(e, dt); break;
      case 'deer': updateDeer(e, dt); break;
      case 'cat': case 'fox': updateCatFox(e, dt); break;
      case 'crow': updateCrow(e, dt); break;
      case 'sealion': updateSealion(e, dt); break;
      case 'coyote': updateWildCoyote(e, dt); break;
      case 'heli': updateHeli(e, dt); break;
      case 'wizard': case 'witch': case 'pumpkin': updateWild(e, dt); break;
    }
  }
}

export { COYOTE_NAMES };
