import { G, addEnt, toast, floater } from './state.js';
import { world, T, tileAt, groundH, solidAt, BOUNDS } from './world.js';
import { audio } from './audio.js';
import { rr, pick, chance, clamp, dist, angDiff, TAU, lerp } from './util.js';
import { stepEnt, faceTo, setPos, spawnItem, dropBag, scare, heatAdd, hurtPlayer, slam, PREY, CUE_DEFS, caught } from './npc.js';

const TALKABLE = new Set(['crow', 'cat', 'fox', 'sealion', 'wizard', 'witch', 'pumpkin', 'dog', 'coyote']);
const PREY_KINDS = new Set(['rabbit', 'goose', 'possum', 'deer']);
const EDIBLE = new Set(['ripped', 'carcass', 'scraps', 'treat', 'crate', 'coffee', 'produce']);
const NUTRITION = { ripped: 12, carcass: 14, scraps: 8, treat: 30, crate: 10, coffee: 0, produce: 9 };
const NAMES = { crow: 'Crow', cat: 'Alley Cat', fox: 'Red Fox', sealion: 'Sea Lion', wizard: 'Ambrose the Wizard', witch: 'Hazel the Witch', pumpkin: 'Jack the Pumpkin', dog: 'Dog', coyote: 'Coyote' };
const ICONS = { crow: '🐦‍⬛', cat: '🐈', fox: '🦊', sealion: '🦭', wizard: '🧙', witch: '🧙‍♀️', pumpkin: '🎃', dog: '🐕', coyote: '🐺' };
export { NAMES, ICONS };

export function createPlayer() {
  const s = world.start;
  const p = {
    kind: 'coyote', isPlayer: true, x: s.x, z: s.z, r: 0.5, top: 2.5, h: Math.PI, hp: 100, maxHp: 100, food: 70, water: 70, energy: 100, xp: 0, level: 1,
    alt: 0, speedNow: 0, lunge: 0, cool: 0, invuln: 0, hurt: 0, kx: 0, kz: 0, eatCd: 0, vx: 0, vz: 0, howlT: 0, fur: [128, 138, 142],
  };
  return p;
}

export function xpNeed(l) { return 40 + l * 35; }
export function gainXp(n) {
  const p = G.player;
  p.xp += n;
  while (p.xp >= xpNeed(p.level) && p.level < 30) {
    p.xp -= xpNeed(p.level);
    p.level++;
    p.maxHp += 8;
    p.hp = Math.min(p.maxHp, p.hp + 20);
    toast(`⭐ Level ${p.level}! You feel stronger and faster.`);
    audio.good();
  }
}

// ------------------------------------------------------------------ scanning
export function scan() {
  const p = G.player;
  const tg = {};
  let bTalk = 4.6, bPrey = 7, bBag = 6.5, bHum = 9, bDog = 8, bSea = 9, bCoy = 12;
  for (const e of G.ents) {
    if (e.isPlayer || e.dead || e.hidden || e.pack) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    const k = e.kind;
    if (TALKABLE.has(k) && d < (k === 'sealion' ? 5.4 : bTalk) && !(k === 'crow' && (e.alt || 0) > 0.8) && !e.scouting && !(k === 'coyote' && e.avoid > 0)) { tg.talk = e; bTalk = d; }
    if (PREY_KINDS.has(k) && d < bPrey && e.state !== 'dead') { tg.prey = e; bPrey = d; }
    if (k === 'human' && !e.rider && e.role !== 'cop') {
      if (e.bag && d < bBag) { tg.bagHuman = e; bBag = d; }
      if (d < bHum) { tg.human = e; bHum = d; }
    }
    if (k === 'dog' && d < bDog) { tg.dog = e; bDog = d; }
    if (k === 'sealion' && d < bSea) { tg.sealion = e; bSea = d; }
    if (k === 'coyote' && d < bCoy) { tg.coyote = e; bCoy = d; }
  }
  let bi = 2.7, bb = 2.9;
  for (const it of G.items) {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (EDIBLE.has(it.kind) && d < bi) { tg.item = it; bi = d; }
    else if (it.kind === 'bag' && d < bb) { tg.bag = it; bb = d; }
  }
  let bbin = 2.5;
  for (const b of world.bins) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bbin) { tg.bin = b; bbin = d; } }
  let bbush = 2.4;
  for (const b of world.bushes) { if (b.food <= 0) continue; const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bbush) { tg.bush = b; bbush = d; } }
  for (const [dx, dz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
    const t = tileAt(p.x + dx, p.z + dz);
    if (t === T.CREEK) { tg.water = 'creek'; break; }
    if (t === T.WATER) tg.water = 'sea';
  }
  if (!tg.water || tg.water === 'sea') for (const q of G.puddles) if (G.wet > 0.3 && Math.hypot(q.x - p.x, q.z - p.z) < q.r + 1) { tg.water = 'puddle'; break; }
  G.tg = tg;
  G.focus = tg.talk || tg.prey || tg.bagHuman || null;
  G.focusItem = tg.item || tg.bag || null;
  const dict = {};
  dict.paw = tg.talk ? `Talk: ${NAMES[tg.talk.kind] || ''}` : 'Sniff around';
  dict.wolf = tg.prey ? `Pounce: ${tg.prey.kind}` : tg.bagHuman ? 'Growl: grab groceries' : tg.bag ? 'Rip open bag' : tg.bin ? 'Tip the bin' : tg.sealion ? 'Don\'t.' : tg.dog ? 'Growl at dog' : tg.human ? 'Growl' : 'Bark (hold: howl)';
  dict.eat = tg.item ? (tg.item.kind === 'coffee' ? 'Drink coffee' : 'Eat') : tg.water ? (tg.water === 'sea' ? 'Drink (salty)' : 'Drink') : tg.bush ? 'Eat berries' : 'Eat / drink';
  dict.ok = 'Menu';
  G.hints = dict;
}

// ------------------------------------------------------------------ player update
function vehicleBox(e) {
  const alongX = e.axis === 'x';
  return { hx: alongX ? e.len / 2 : e.wid / 2, hz: alongX ? e.wid / 2 : e.len / 2 };
}

export function updatePlayer(dt) {
  const p = G.player;
  const inp = G.input;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.cool = Math.max(0, p.cool - dt);
  p.eatCd = Math.max(0, p.eatCd - dt);
  p.howlT = Math.max(0, p.howlT - dt);
  p.headUp = p.howlT > 0 ? Math.min(1, p.howlT * 2) : 0;
  p.crouch = p.lunge > 0 ? 0 : p.cool > 0.5 ? 0.5 : 0;

  // camera follows heading while moving forward
  const mx = inp.x, my = inp.y;
  const mag = Math.min(1, Math.hypot(mx, my));
  const cy = G.camYaw;
  const fx = Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = Math.sin(cy);

  if (G.sleeping) {
    p.sleeping = true; p.moving = 0; p.speedNow = 0;
    return;
  }
  p.sleeping = false;

  let vx = 0, vz = 0;
  if (G.stun > 0) { G.stun -= dt; }
  else if (mag > 0.12) {
    let dx = rx * mx + fx * my, dz = rz * mx + fz * my;
    if (G.tipsy > 0.5) {
      const a = Math.sin(G.stats.play * 2.6) * (G.tipsy - 0.4) * 0.9;
      const c = Math.cos(a), s = Math.sin(a);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const l = Math.hypot(dx, dz) || 1;
    let sp = mag < 0.55 ? lerp(0.8, 4.4, mag / 0.55) : lerp(4.4, 9.6, (mag - 0.55) / 0.45);
    sp *= 1 + 0.018 * Math.min(20, p.level);
    if (G.tipsy > 0.2) sp *= 1.2;
    if (G.flight > 0) sp = Math.max(sp * 1.4, 7);
    if (p.energy < 6) sp *= 0.6;
    if (p.hp < 25) sp *= 0.85;
    vx = (dx / l) * sp; vz = (dz / l) * sp;
    const heading = Math.atan2(dx, -dz);
    const diff = Math.abs(angDiff(cy, heading));
    const follow = Math.max(0, Math.cos(angDiff(cy, heading))) ** 2;
    if (!G.camLock) G.camYaw += angDiff(cy, heading) * follow * dt * 1.5 * mag;
    if (sp > 7.5) p.energy = Math.max(0, p.energy - 1.4 * dt);
  }
  if (p.lunge > 0) {
    p.lunge -= dt;
    vx = p.ldx * 17; vz = p.ldz * 17;
    huntCheck();
  }
  vx += p.kx; vz += p.kz;
  p.kx *= Math.max(0, 1 - dt * 6); p.kz *= Math.max(0, 1 - dt * 6);
  p.vx = vx; p.vz = vz;
  const flying = G.flight > 0 || p.alt > 0.6;
  const moved = stepEnt(p, vx * dt, vz * dt, { ghost: flying });
  if (vx || vz) faceTo(p, vx, vz, 14, dt);
  p.speedNow = moved / Math.max(dt, 1e-3);
  p.moving = clamp(p.speedNow / 3, 0, 1);
  p.walk += moved * 2.3;
  G.stats.dist += moved;
  // vehicles
  for (const e of G.ents) {
    if (!e.axis || e.dead || e.parked) continue;
    if (Math.abs(e.x - p.x) > 8 || Math.abs(e.z - p.z) > 8) continue;
    const { hx, hz } = vehicleBox(e);
    if (Math.abs(p.x - e.x) < hx + p.r && Math.abs(p.z - e.z) < hz + p.r && p.alt < 1) {
      if (e.speed > 1.5) hurtPlayer(5, e, 2.2);
      const ox = (hx + p.r) - Math.abs(p.x - e.x), oz = (hz + p.r) - Math.abs(p.z - e.z);
      if (ox < oz) p.x += Math.sign(p.x - e.x) * ox; else p.z += Math.sign(p.z - e.z) * oz;
    }
  }
  // flight altitude
  if (G.flight > 0) { G.flight -= dt; p.alt += (8 + Math.sin(G.stats.play * 2) * 0.8 - p.alt) * Math.min(1, dt * 3); if (G.flight <= 0) { toast('The flight spell fades.'); } }
  else if (p.alt > 0.01) { p.alt = Math.max(0, p.alt - dt * 8); if (p.alt <= 0.01) { p.alt = 0; landSafely(); } }
  p.y = groundH(p.x, p.z) + p.alt;
}

function landSafely() {
  const p = G.player;
  const bad = (x, z) => solidAt(x, z) || tileAt(x, z) === T.WATER;
  if (!bad(p.x, p.z)) return;
  for (let r = 2; r < 40; r += 2) for (let a = 0; a < TAU; a += 0.5) {
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (!bad(x, z) && !bad(x + 0.8, z) && !bad(x - 0.8, z) && !bad(x, z + 0.8) && !bad(x, z - 0.8)) { setPos(p, x, z); return; }
  }
}

// ------------------------------------------------------------------ needs & progression
export function updateNeeds(dt) {
  const p = G.player;
  const slow = G.sleeping ? 0.3 : 1;
  p.food = clamp(p.food - 0.3 * dt * slow, 0, 100);
  p.water = clamp(p.water - 0.38 * dt * slow, 0, 100);
  if (!G.sleeping) p.energy = clamp(p.energy - 0.05 * dt + (p.speedNow < 0.5 ? 0.35 * dt : 0), 0, 100);
  if (p.food <= 0) p.hp -= 0.6 * dt;
  if (p.water <= 0) p.hp -= 0.8 * dt;
  if (p.food > 35 && p.water > 35 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + (G.sleeping ? 2 : 0.5) * dt);
  G.tipsy = Math.max(0, G.tipsy - 0.025 * dt);
  G.heat = clamp(G.heat - (G.tipsy > 0 ? 0.35 : 0.45) * dt, 0, 100);
  if (G.heat > 50) G.notoriety = Math.min(140, (G.notoriety || 0) + 0.3 * dt); else G.notoriety = Math.max(0, (G.notoriety || 0) - 0.06 * dt);
  if (p.hp <= 0) {
    p.hp = 35; p.food = Math.max(p.food, 30); p.water = Math.max(p.water, 30);
    toast('You collapse from exhaustion… and wake up later in the woods.');
    const c = pick(world.spawn.woods);
    setPos(p, c[0], c[1]);
    G.heat = 10;
    for (const m of [...G.pack.members]) leavePack(m, true);
  }
}

// ------------------------------------------------------------------ pack
export function joinPack(e) {
  if (G.pack.members.length >= 3 || e.pack) return false;
  const pk = G.pack;
  const first = pk.members.length === 0;
  e.pack = true; e.state = 'follow'; e.avoid = 0; e.emote = '💜';
  setTimeout(() => { e.emote = ''; }, 2000);
  pk.members.push(e);
  if (first) {
    pk.duration = rr(180, 400) + pk.cohesion * 1.2;
    pk.timer = pk.duration;
    G.stats.packs++;
  } else pk.timer += 40;
  if (e.kind === 'coyote') e.bond = Math.min(100, (e.bond || 0) + 25);
  if (e.kind === 'coyote') G.bonds[e.cid] = e.bond;
  pk.cohesion = clamp(Math.max(pk.cohesion, 40) + 6, 0, 100);
  G.stats.maxPack = Math.max(G.stats.maxPack, pk.members.length + 1);
  toast(`🐺 ${e.label || NAMES[e.kind]} joined your pack! (${pk.members.length + 1}/4)`);
  audio.good();
  gainXp(20);
  return true;
}
G.joinPack = joinPack;

export function leavePack(e, silent) {
  const pk = G.pack;
  const i = pk.members.indexOf(e);
  if (i < 0) return;
  pk.members.splice(i, 1);
  e.pack = false; e.state = 'wander'; e.timer = 3; e.sleeping = false; e.assist = null;
  if (e.kind === 'coyote') { e.bond = Math.min(100, (e.bond || 0) + Math.round(pk.cohesion / 10)); G.bonds[e.cid] = e.bond; e.avoid = 0; }
  if (!silent) toast(`${e.label || NAMES[e.kind]} wandered off. (They'll remember you.)`);
}

export function updatePack(dt) {
  const pk = G.pack, p = G.player;
  pk.members = pk.members.filter((m) => !m.dead);
  if (!pk.members.length) return;
  pk.timer -= dt * (G.sleeping ? 0.15 : 1);
  if (p.food < 25 || p.water < 20) pk.cohesion = clamp(pk.cohesion - 0.15 * dt, 0, 100);
  else pk.cohesion = clamp(pk.cohesion + 0.04 * dt, 0, 100);
  if (pk.timer <= 0) {
    if (chance(pk.cohesion / 110)) { pk.timer = rr(90, 200) + pk.cohesion; pk.duration = pk.timer; toast('Your pack is tight. They\'re sticking around.'); }
    else {
      const m = pk.members[pk.members.length - 1];
      leavePack(m);
      pk.timer = pk.members.length ? rr(8, 25) : 0;
      if (!pk.members.length) toast('The pack has dissolved. Howl near old friends to bring them back.');
    }
  }
}

// ------------------------------------------------------------------ hunting
function huntCheck() {
  const p = G.player;
  if (p.lungeHit) return;
  for (const e of G.ents) {
    if (e.dead || !PREY_KINDS.has(e.kind) || e.state === 'dead') continue;
    if (Math.hypot(e.x - p.x, e.z - p.z) < p.r + e.r + 0.9) {
      p.lungeHit = true;
      resolveKill(e);
      return;
    }
  }
}

function resolveKill(e) {
  const p = G.player;
  let allies = 0;
  for (const m of G.pack.members) if (!m.dead && Math.hypot(m.x - e.x, m.z - e.z) < 16) allies++;
  let c;
  if (e.kind === 'deer') c = allies >= 1 ? 0.22 + 0.2 * allies + 0.02 * p.level : 0;
  else if (e.kind === 'possum') c = (e.state === 'play' ? 0.95 : 0.7) + 0.02 * p.level;
  else c = (e.kind === 'rabbit' ? 0.5 : 0.42) + 0.025 * p.level + 0.14 * allies;
  c = Math.min(0.95, c);
  if (Math.random() < c) killPrey(e, allies);
  else {
    floater(e.x, 2, e.z, 'Missed!', '#ffd9a0');
    e.state = 'flee'; e.timer = 7; e.fast = true; e.slow = false;
    if (e.kind === 'deer') {
      if (allies === 0) { hurtPlayer(8, e, 3); toast('The deer is too big to take down alone. Find a pack!'); }
      else e.slow = true;
    }
    if (e.kind === 'goose') { hurtPlayer(3, e, 1); audio.hiss(); }
  }
}

function killPrey(e, allies) {
  e.dead = true;
  const def = PREY[e.kind];
  spawnItem('carcass', e.x, e.z, def.portions, { col: def.col, kind2: e.kind, ttl: 200 });
  gainXp(def.xp);
  G.stats.hunts++;
  floater(e.x, 2, e.z, `+${def.xp} XP`, '#a8e6a0');
  audio.growl();
  if (allies) G.pack.cohesion = clamp(G.pack.cohesion + 5, 0, 100);
  G.respawn.push({ kind: e.kind, t: rr(70, 130) });
  toast(e.kind === 'deer' ? '🦌 Teamwork! You brought down a deer.' : `You caught a ${e.kind}. Press 🍖 to eat.`);
}

// ------------------------------------------------------------------ actions
export function pressButton(btn) {
  if (G.mode !== 'play' || G.paused) return;
  if (G.social) { socialAnswer(btn); return; }
  if (G.dialogue || G.menu) { G.ui?.modalPress?.(btn); return; }
  if (G.sleeping) { if (btn === 'ok' || btn === 'paw') wake(false); return; }
  if (G.stun > 0) return;
  if (btn === 'paw') actPaw();
  else if (btn === 'wolf') actWolf();
  else if (btn === 'eat') actEat();
  else if (btn === 'ok') actOk();
}

export function releaseButton(btn, heldFor) {
  if (G.mode !== 'play' || G.paused || G.social || G.dialogue || G.menu) return;
  if (btn === 'wolf' && G.wolfPending) {
    G.wolfPending = false;
    if (heldFor < 0.6) bark();
  }
}

export function holdButton(btn) {
  if (btn === 'wolf' && G.wolfPending) { G.wolfPending = false; howl(); }
}

function actPaw() {
  const tg = G.tg;
  const t = tg.talk;
  if (t) {
    if (t.kind === 'coyote') return startSocial(t);
    G.stats.talks++;
    return G.ui?.openDialogue(dialogueSpec(t));
  }
  // sniff: report the nearest known food
  let best = null, bd = 1e9;
  const test = (x, z, label) => { const d = Math.hypot(x - G.player.x, z - G.player.z); if (d < bd) { bd = d; best = { x, z, label }; } };
  for (const b of world.bins) if (b.food > 0 && !b.tipped) test(b.x, b.z, 'a full bin');
  for (const b of world.bushes) if (b.food > 0) test(b.x, b.z, 'blackberries');
  for (const it of G.items) if (it.kind !== 'bag' || true) test(it.x, it.z, it.kind === 'carcass' ? 'a fresh kill' : it.kind === 'coffee' ? 'coffee' : 'food');
  if (!best) return toast('You sniff. Nothing but rain, exhaust, and lavender.');
  const dx = best.x - G.player.x, dz = best.z - G.player.z;
  const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north');
  floater(G.player.x, 2.6, G.player.z, '👃', '#fff');
  toast(`You smell ${best.label} to the ${dir} (about ${Math.round(bd)} paces).`);
}

function actWolf() {
  const tg = G.tg, p = G.player;
  if (p.cool > 0) return;
  if (tg.prey) return pounce(tg.prey);
  if (tg.bagHuman) return growlBag(tg.bagHuman);
  if (tg.bag) {
    tg.bag.kind = 'ripped'; tg.bag.portions = 4; tg.bag.ttl = 120;
    audio.chop(); gainXp(4); p.cool = 0.4;
    floater(tg.bag.x, 1.8, tg.bag.z, 'Rrrip!', '#ffe0a0');
    return;
  }
  if (tg.bin) return tipBin(tg.bin);
  if (tg.sealion && Math.hypot(tg.sealion.x - p.x, tg.sealion.z - p.z) < 6.5) { audio.growl(); slam(tg.sealion); p.cool = 1; return; }
  if (tg.dog) return growlDog(tg.dog);
  if (tg.human) return growlAround();
  if (tg.coyote && Math.hypot(tg.coyote.x - p.x, tg.coyote.z - p.z) < 8) {
    audio.growl(); p.cool = 0.8;
    tg.coyote.avoid = 20; tg.coyote.bond = Math.max(0, (tg.coyote.bond || 0) - 6); G.bonds[tg.coyote.cid] = tg.coyote.bond;
    tg.coyote.emote = '😠'; setTimeout(() => { tg.coyote.emote = ''; }, 1500);
    return toast(`${tg.coyote.cid} growls back and backs off. That wasn't friendly.`);
  }
  G.wolfPending = true;
  G.wolfDown = performance.now();
}

function pounce(t) {
  const p = G.player;
  p.cool = 0.9;
  const lead = 0.25;
  const tx = t.x + Math.sin(t.h) * (t.moving ? 2 : 0) * lead, tz = t.z - Math.cos(t.h) * (t.moving ? 2 : 0) * lead;
  const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz) || 1;
  p.ldx = dx / l; p.ldz = dz / l; p.lunge = Math.min(0.42, 0.14 + l / 20); p.lungeHit = false;
  p.h = Math.atan2(dx, -dz);
  audio.pounce();
  for (const m of G.pack.members) { m.assist = t; m.assistT = 3.5; }
}

function growlBag(h) {
  const p = G.player;
  p.cool = 0.9;
  audio.growl();
  p.crouch = 0.6;
  const c = 0.4 + 0.04 * p.level + 0.15 * G.pack.members.length;
  heatAdd(1.5);
  if (Math.random() < c) dropBag(h); else { h.emote = '😨'; scare(h, p, 6); toast('They clutch the bag tight. Keep at it — or bring friends.'); }
}

function growlDog(d) {
  const p = G.player;
  p.cool = 0.9;
  audio.growl();
  const power = p.level + G.pack.members.length * 4;
  if (Math.random() * 14 < power) { d.state = 'flee'; d.timer = 5; d.emote = '😧'; toast('The dog tucks its tail and bolts.'); }
  else { d.state = 'engage'; d.timer = 5; d.emote = '🐕‍🦺'; toast('The dog is not impressed!'); audio.bark(); }
  heatAdd(1);
}

function tipBin(b) {
  const p = G.player;
  p.cool = 0.7;
  if (b.tipped) return toast('Already tipped over. Nothing left but wrappers.');
  b.tipped = true; b.timer = 90;
  audio.chop();
  heatAdd(1.2);
  if (b.food > 0) {
    spawnItem('scraps', b.x + 1.2, b.z + 0.4, b.food, { ttl: 90 });
    toast('You tip the bin and root through it. Scraps!');
    b.food = 0; gainXp(5); G.stats.bins++;
  } else toast('The bin is empty. Just wrappers.');
}

function growlAround() {
  const p = G.player;
  p.cool = 1;
  audio.growl();
  const power = 1 + G.pack.members.length;
  const R = 8 + power * 2.5;
  let n = 0;
  for (const e of G.ents) {
    if (e.kind !== 'human' || e.dead || e.rider || e.role === 'cop') continue;
    if (Math.hypot(e.x - p.x, e.z - p.z) > R) continue;
    if (e.role === 'vendor') { if (power >= 3) { scare(e, p, 16); n++; } else { e.state = 'shoo'; e.timer = 1.6; e.emote = '😡'; e.broom = true; } continue; }
    if (Math.random() < 0.45 + 0.15 * power) { scare(e, p); n++; }
  }
  heatAdd(1 + n * 0.3);
  if (n) floater(p.x, 2.6, p.z, `${n} scared`, '#ffd9a0');
}

function bark() {
  const p = G.player;
  audio.bark();
  G.stats.barks++;
  p.cool = 0.3;
  p.headUp = 0.4;
  floater(p.x, 2.8, p.z, 'WOOF!', '#fff');
  let n = 0;
  for (const e of G.ents) {
    if (e.kind === 'human' && !e.dead && !e.rider && e.role !== 'cop' && e.role !== 'vendor' && Math.hypot(e.x - p.x, e.z - p.z) < 9 && chance(0.4)) { scare(e, p, 5); n++; }
  }
  heatAdd(0.8 + n * 0.2);
  for (const e of G.ents) if (e.kind === 'coyote' && !e.pack && !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 40) { e.emote = '🐺'; setTimeout(() => { e.emote = ''; }, 1500); }
}

export function howl() {
  const p = G.player;
  const mem = G.pack.members.length;
  p.howlT = 2.8;
  audio.howl(1 + mem);
  G.stats.howls++;
  heatAdd(G.clock.sunE < 0 ? 1.5 : 3);
  if (mem >= 1) {
    G.pack.cohesion = clamp(G.pack.cohesion + 10, 0, 100);
    G.pack.timer += 30;
    toast('🌙 Group howl! The pack is bonded — they\'ll stick together longer.');
    for (const m of G.pack.members) if (m.kind === 'coyote') { m.headUp = 1; m.emote = '🌙'; setTimeout(() => { m.emote = ''; }, 2500); }
  } else toast('🌙 You howl. Somewhere in the dark, someone listens.');
  let answered = 0;
  for (const e of G.ents) {
    if (e.kind !== 'coyote' || e.pack || e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if ((e.bond || 0) >= 40 && d < 160 && !e.avoid && G.pack.members.length < 3) { e.state = 'answer'; e.emote = '🌙'; answered++; }
    else if (d < 90) { e.emote = '🌙'; setTimeout(() => { e.emote = ''; }, 2500); }
  }
  if (answered) toast(`🐺 ${answered} old friend${answered > 1 ? 's are' : ' is'} answering your call!`);
}

function actEat() {
  const p = G.player, tg = G.tg;
  if (p.eatCd > 0) return;
  if (tg.item) {
    const it = tg.item;
    if (it.stall && !G.marketClaimed) {
      const v = G.ents.find((e) => e.role === 'vendor' && !e.dead && e.state !== 'flee' && Math.hypot(e.x - it.x, e.z - it.z) < 9);
      if (v) { v.state = 'shoo'; v.timer = 1.6; v.emote = '😡'; v.broom = true; p.eatCd = 1; heatAdd(2); return toast('The vendor guards the stall with a broom! You need a bigger pack.'); }
    }
    return bite(it);
  }
  if (tg.water) {
    p.eatCd = 0.45;
    audio.drink();
    if (tg.water === 'sea') { p.water = Math.min(100, p.water + 1); p.hp -= 1; return toast('Salty. Blech. Try the creek or a puddle.'); }
    p.water = Math.min(100, p.water + 9);
    G.stats.drinks++;
    gainXp(0.5);
    return;
  }
  if (tg.bush) {
    const b = tg.bush;
    b.food--; b.timer = 120; p.eatCd = 0.5;
    p.food = Math.min(100, p.food + 6);
    G.stats.berries++; G.stats.eaten++;
    audio.eat(); gainXp(1.5);
    floater(b.x, 2, b.z, 'Blackberries!', '#c8a0ff');
    return;
  }
  if (tg.bag) return toast('Rip the bag open first (🐺).');
  toast('Nothing to eat or drink here.');
}

function bite(it) {
  const p = G.player;
  p.eatCd = 0.5;
  it.portions--;
  audio.eat();
  G.stats.eaten++;
  if (it.kind === 'coffee') {
    audio.drink();
    p.water = Math.min(100, p.water + 5);
    G.tipsy = Math.min(1.5, G.tipsy + 0.35);
    G.stats.coffee++;
    floater(p.x, 2.6, p.z, '☕ ' + (G.tipsy > 0.8 ? 'JITTERY!' : 'Caffeinated'), '#d8b080');
    heatAdd(1);
  } else {
    p.food = Math.min(100, p.food + NUTRITION[it.kind]);
    if (it.kind === 'treat') { p.hp = Math.min(p.maxHp, p.hp + 15); }
    gainXp(it.kind === 'carcass' ? 3 : 1.5);
    floater(p.x, 2.6, p.z, '+' + NUTRITION[it.kind], '#a8e6a0');
    for (const m of G.pack.members) if (Math.hypot(m.x - p.x, m.z - p.z) < 10) G.pack.cohesion = clamp(G.pack.cohesion + 0.8, 0, 100);
  }
  if (it.shop && it.kind === 'crate') heatAdd(2);
  if (it.portions <= 0) { it.dead = true; G.items = G.items.filter((x) => x !== it); }
}

function actOk() {
  const items = [{ id: 'sleep', label: '😴 Sleep here (5 hours)' }];
  if (G.spells > 0) items.push({ id: 'fly', label: `✨ Cast flight spell (${G.spells} left, ~10 s)` });
  if (G.pack.members.length) items.push({ id: 'disband', label: '👋 Send the pack off' });
  items.push({ id: 'close', label: 'Never mind' });
  G.ui?.openMenu(items, (id) => {
    if (id === 'sleep') startSleep();
    else if (id === 'fly') castFlight();
    else if (id === 'disband') for (const m of [...G.pack.members]) leavePack(m);
  });
}

// ------------------------------------------------------------------ sleep & flight
function startSleep() {
  const p = G.player;
  if (G.flight > 0) return toast('You can\'t sleep while flying.');
  if (G.ents.some((e) => (e.role === 'cop' && e.state !== 'retreat') && Math.hypot(e.x - p.x, e.z - p.z) < 40) || G.ents.some((e) => e.kind === 'heli')) return toast('Too dangerous to sleep with cops or a helicopter around.');
  const safe = tileAt(p.x, p.z) === T.WOODS;
  G.sleeping = { hours: 0, safe, visitor: null, t: 0 };
  G.timeScale = 8;
  G.dim = 0.35;
  toast(safe ? '😴 You curl up in the woods. Nobody will bother you here.' : '😴 You curl up… in a spot where people might notice.');
}

export function updateSleep(dt, dHours) {
  const s = G.sleeping, p = G.player;
  if (!s) return;
  s.hours += dHours;
  s.t += dt;
  p.energy = clamp(p.energy + dHours * 20, 0, 100);
  p.hp = Math.min(p.maxHp, p.hp + dHours * 4);
  if (!s.safe) {
    const day = G.clock.sunE > 0;
    if (!s.visitor && chance(dt * (day ? 0.3 : 0.07)) && tileAt(p.x, p.z) !== T.WOODS) {
      let best = null, bd = 30;
      for (const e of G.ents) if (e.kind === 'human' && !e.rider && !e.dead && e.role !== 'cop' && e.state !== 'inshop') { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
      if (best) { s.visitor = best; best.emote = '🤔'; best.state = 'curious'; }
    }
    if (s.visitor) {
      const v = s.visitor;
      const dx = p.x - v.x, dz = p.z - v.z, l = Math.hypot(dx, dz);
      if (l > 1.6) { stepEnt(v, (dx / l) * 6 * dt, (dz / l) * 6 * dt); faceTo(v, dx, dz, 8, dt); v.walk += 0.2; v.moving = 1; }
      else return wake(true);
    }
  }
  if (s.hours >= 5) wake(false);
}

export function wake(interrupted) {
  const s = G.sleeping;
  if (!s) return;
  G.sleeping = null;
  G.timeScale = 1;
  G.dim = 0;
  G.stats.sleeps++;
  if (s.visitor) { s.visitor.state = 'flee'; s.visitor.timer = 4; s.visitor.fleeFrom = G.player; s.visitor.emote = ''; }
  const h = Math.min(5, s.hours);
  const p = G.player;
  p.food = clamp(p.food - 3 * h, 0, 100);
  p.water = clamp(p.water - 3 * h, 0, 100);
  toast(interrupted ? '😳 A curious passerby woke you up! (Sleep in the woods for peace.)' : `☀️ You wake up refreshed after ${h.toFixed(0)} hours.`);
}

function castFlight() {
  if (G.spells <= 0) return;
  G.spells--;
  G.flight = 10;
  G.stats.flights++;
  audio.spell();
  toast('✨ You are flying! About ten seconds…');
}

// ------------------------------------------------------------------ dialogue specs
function topicsFor(kind) {
  const base = { id: 'chat', label: 'Chat', topic: 'chat' };
  const bye = { id: 'bye', label: 'Goodbye', topic: 'bye', end: true };
  switch (kind) {
    case 'crow': return [{ id: 'news', label: 'Any news around town?', topic: 'news' }, { id: 'trade', label: 'Trade a scrap for a scouting flight', topic: 'trade' }, base, bye];
    case 'cat': case 'fox': return [base, { id: 'friend', label: 'Suggest running together', topic: 'friend' }, bye];
    case 'sealion': return [base, { id: 'help', label: 'Ask for advice', topic: 'help' }, { id: 'bye', label: 'Back away slowly', topic: 'bye', end: true }];
    case 'wizard': return [{ id: 'treat', label: 'Ask for a treat', topic: 'treat' }, { id: 'news', label: 'Ask what is happening', topic: 'news' }, base, bye];
    case 'witch': return [{ id: 'magic', label: 'Ask for magic', topic: 'magic' }, base, bye];
    case 'pumpkin': return [base, { id: 'scare', label: 'Suggest scaring someone together', topic: 'help' }, bye];
    case 'dog': return [{ id: 'sniff', label: 'Sniff politely', topic: 'friend' }, bye];
  }
  return [base, bye];
}

function dialogueSpec(t) {
  const kind = t.kind;
  return {
    speaker: kind, name: NAMES[kind] || kind, icon: ICONS[kind] || '🐾', topic: 'greet', target: t,
    choices: topicsFor(kind),
    onChoice: (id) => handleChoice(t, id),
  };
}

function handleChoice(t, id) {
  const p = G.player;
  const now = G.stats.play;
  if (t.kind === 'crow') {
    if (id === 'news') {
      const bits = [];
      if (world.ev.market) bits.push('The Plum Street market is open right now — lots of food, but the vendors carry brooms.');
      else bits.push('The Plum Street Farmer\'s Market is closed now. Mornings and midday, some days.');
      if (world.ev.picnic >= 0) { G.knownPicnic = true; bits.push('There is a picnic in Lavender Park — I marked it on your map.'); }
      else bits.push('No picnics in the park at the moment.');
      const shopOpen = world.shops.find((s) => s.kind === 'grocery' && s.open);
      bits.push(shopOpen ? `${shopOpen.name} has its doors open!` : 'The grocery doors are shut. Wait for them to slide open.');
      return { extra: bits.join(' ') };
    }
    if (id === 'trade') {
      if (p.food < 8) return { extra: '(You are too hungry to spare a scrap.)' };
      p.food -= 6;
      scout(t);
      return { extra: '(You drop a scrap. The crow takes off to scout and will report back.)' };
    }
  }
  if (t.kind === 'wizard' && id === 'treat') {
    if (now - (G.wizardAt ?? -999) < 80) return { extra: '(Ambrose pats his pockets. "Give me a minute to bake more.")' };
    G.wizardAt = now;
    spawnItem('treat', p.x + 1.2, p.z + 1, 2, { ttl: 90 });
    audio.good();
    return { extra: '(Ambrose sets a warm biscuit on the ground. Press 🍖 to eat.)' };
  }
  if (t.kind === 'wizard' && id === 'news') {
    G.knownPicnic = world.ev.picnic >= 0 ? true : G.knownPicnic;
    return { extra: '' };
  }
  if (t.kind === 'witch' && id === 'magic') {
    if (G.spells >= 3) return { extra: '(Your pouch of spells is full.)' };
    if (now - (G.witchAt ?? -999) < 100) return { extra: '(Hazel shakes her head. "The cauldron is still cooling.")' };
    G.witchAt = now;
    G.spells++;
    audio.spell();
    return { extra: `(You receive a flight spell! Open the ✔ menu to cast it. ${G.spells} stored.)` };
  }
  if ((t.kind === 'cat' || t.kind === 'fox') && id === 'friend') {
    t.trust = (t.trust || 0) + 1;
    if (t.trust >= 2 && G.pack.members.length < 3 && chance(0.6)) { joinPack(t); return { extra: `(The ${t.kind} falls in beside you.)` }; }
    return { extra: t.trust >= 2 ? '(It considers. Maybe try again later.)' : '(It flicks an ear. Keep being friendly.)' };
  }
  if (t.kind === 'pumpkin' && id === 'scare') {
    let n = 0;
    for (const e of G.ents) if (e.kind === 'human' && !e.dead && !e.rider && e.role !== 'cop' && Math.hypot(e.x - t.x, e.z - t.z) < 25) { scare(e, t, 8); n++; }
    return { extra: `(Jack bellows "BOO!" ${n} humans flee.)` };
  }
  if (t.kind === 'dog' && id === 'sniff') { t.friend = true; t.state = 'follow'; t.emote = '🐕'; return { extra: '(The dog wags its whole body.)' }; }
  return { extra: '' };
}

function scout(crow) {
  crow.scouting = true;
  crow.scoutT = 9;
  crow.alt = 1;
  crow.friend = true;
  G.scoutTimer = 70;
  G.knownPicnic = true;
  for (const e of G.ents) {
    if ((e.kind === 'coyote' || e.kind === 'deer' || e.kind === 'fox' || e.kind === 'sealion' || e.role === 'cop') && !e.pack) e.scouted = true;
  }
  toast('🐦‍⬛ The crow scouts the neighborhood. Check your minimap for what it spots.');
}

// ------------------------------------------------------------------ social minigame
function startSocial(c) {
  if (c.avoid > 0) return toast(`${c.cid} is wary of you right now.`);
  if (G.pack.members.length >= 3) return toast('Your pack is full (4 coyotes max).');
  const bond = c.bond || 0;
  const steps = bond >= 60 ? 1 : bond >= 30 ? 2 : 3;
  G.social = { e: c, steps, idx: 0, t: 5, wrong: 0, hint: '', ok: false, flash: 0 };
  G.stats.talks++;
  G.ui?.socialChanged?.();
}

export function updateSocial(dt) {
  const s = G.social;
  if (!s) return;
  s.t -= dt;
  s.flash = Math.max(0, s.flash - dt);
  if (s.t <= 0) { s.wrong++; s.t = 5; s.hint = 'Too slow! ' + CUE_DEFS[s.e.cueSeq[s.idx]].hint; if (s.wrong >= 3) finishSocial(false); G.ui?.socialChanged?.(); }
}

export function socialAnswer(btn) {
  const s = G.social;
  if (!s) return;
  const cue = s.e.cueSeq[s.idx];
  if (btn === CUE_DEFS[cue].answer) {
    G.cues[cue] = true;
    audio.good();
    s.idx++; s.t = 5; s.hint = ''; s.flash = 0.4;
    if (s.idx >= s.steps) return finishSocial(true);
  } else {
    s.wrong++; s.t = Math.max(s.t, 4); s.hint = 'Not quite. ' + CUE_DEFS[cue].hint;
    audio.bad();
    if (s.wrong >= 3) return finishSocial(false);
  }
  G.ui?.socialChanged?.();
}

function finishSocial(ok) {
  const s = G.social;
  G.social = null;
  const c = s.e;
  if (ok) {
    G.stats.friends++;
    joinPack(c);
    G.ui?.say?.('coyote', c.cid, 'friend');
  } else {
    c.avoid = 60; c.bond = Math.max(0, (c.bond || 0) - 5); G.bonds[c.cid] = c.bond;
    toast(`${c.cid} didn't trust the signals and trotted off. Try again later.`);
    audio.bad();
  }
  G.ui?.socialChanged?.();
}

export function checkTakeover() {
  if (!world.ev.market || G.marketClaimed || G.pack.members.length < 2) return;
  const p = G.player;
  if (p.x < 180 || p.x > 220 || p.z < 100 || p.z > 205) return;
  const vend = G.ents.filter((e) => e.role === 'vendor' && !e.dead);
  if (vend.length && vend.every((v) => v.state === 'flee')) {
    G.marketClaimed = true;
    G.stats.takeovers++;
    G.pack.cohesion = clamp(G.pack.cohesion + 15, 0, 100);
    gainXp(60);
    toast('🥕 MARKET TAKEOVER! The vendors fled — every stall is yours.');
    audio.howl(1 + G.pack.members.length);
    heatAdd(25);
  }
}
