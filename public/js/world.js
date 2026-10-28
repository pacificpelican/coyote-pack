import { clamp, smooth, mulberry32, hash2, hex } from './util.js';

export const TILE = 4;
export const N = 96;
export const SIZE = N * TILE;
export const PITCH = 48;
export const STREET = 16;
export const T = { WATER: 0, SAND: 1, GRASS: 2, ROAD: 3, SIDEWALK: 4, WOODS: 5, LAWN: 6, PLAZA: 7, PATH: 8, CREEK: 9 };
export const BOUNDS = { x0: 42, x1: 372, z0: 20, z1: 372 };
export const CELL = 32;
const CELLS = Math.ceil(SIZE / CELL);

const WALLS = ['#d8c7a0', '#b9a07a', '#9a6b4f', '#7f8f64', '#c58b5c', '#8a6a5a', '#a8b0a0', '#c9b79c', '#6f7f8a', '#b5654a'];
const ROOFS = ['#5a4034', '#4b4a47', '#6b3f35', '#3f4f44', '#5b5c63'];
const MODERN = ['#e8e4da', '#3b3d3f', '#8a6f50', '#cfc8b8', '#56605a'];

const CREEK = [[376, 92], [340, 86], [310, 70], [280, 76], [250, 88], [224, 80], [190, 78], [150, 80], [120, 84], [96, 76], [70, 66], [48, 60], [38, 58]];

const SHOPS_N = [ // north side of the main strip (faces south), per block column 1..6
  [['Thai Basil', 'restaurant', 16], ['Froyo Fox', 'froyo', 16]],
  [['Green Heron Grocery', 'grocery', 32]],
  [['Moonbean Coffee', 'coffee', 16], ['Hammer & Nail', 'hardware', 16]],
  [['Hilltop Clinic', 'clinic', 16], ['Rise Bakery', 'bakery', 16]],
  [['Taqueria Luna', 'restaurant', 16], ['Page Turner Books', 'books', 16]],
  [["Dark Roast Dave's", 'coffee', 16], ['Clip Joint Barber', 'barber', 16]],
];
const SHOPS_S = [ // south side (faces north)
  [['Sushi Hill', 'restaurant', 16], ['The Gray Owl Pub', 'pub', 16]],
  [['Lavender Co-op', 'grocery', 32]],
  [['Hill Pharmacy', 'clinic', 16], ['Plum Street Diner', 'restaurant', 16]],
  [['Petal Florist', 'florist', 16], ['Cheese Please', 'bakery', 16]],
  [['Bluebird Gallery', 'books', 16], ['Suds Laundromat', 'hardware', 16]],
  [['Hill Yoga', 'clinic', 16], ['Scoop Dreams', 'froyo', 16]],
];
const SHOP_COLORS = { restaurant: '#b5654a', froyo: '#d98bb5', grocery: '#7f8f64', coffee: '#6a4a3a', hardware: '#8a8f94', clinic: '#9bb5bd', bakery: '#d9b27a', books: '#7a6a9a', barber: '#a8453a', pub: '#4a5a4a', florist: '#b57aa0' };

export const world = {
  tiles: new Uint8Array(N * N),
  roadDir: new Uint8Array(N * N),
  Hv: new Float32Array((N + 1) * (N + 1)),
  cells: Array.from({ length: CELLS * CELLS }, () => []),
  solidCells: new Map(),
  bins: [], bushes: [], shops: [], stalls: [], lamps: [], special: [],
  spawn: { humans: [], woods: [], parks: [], beach: [], plaza: [] },
  ev: { market: false, picnic: -1 },
  picnicSpots: [], marketRect: { x0: 192, x1: 208, z0: 112, z1: 192 },
  start: { x: 200, z: 30 },
  built: false,
};

function rawH(x, z) {
  const g = (dx, dz, sx, sz) => Math.exp(-((dx / sx) ** 2 + (dz / sz) ** 2));
  let h = 20 * g(x - 230, z - 170, 130, 120) + 12 * smooth(240, 380, x) + 11 * smooth(270, 380, z) + 2.2 * Math.sin(x / 37) * Math.sin(z / 29);
  h *= smooth(42, 110, x) * smooth(14, 70, z) * (1 - smooth(364, 378, x)) * (1 - smooth(364, 378, z));
  return Math.max(0.15, h);
}

export function groundH(x, z) {
  const fx = x / TILE, fz = z / TILE;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= N || j >= N) return -0.3;
  const tx = fx - i, tz = fz - j;
  const H = world.Hv, W = N + 1;
  const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function tileAt(x, z) {
  const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
  if (i < 0 || j < 0 || i >= N || j >= N) return T.WATER;
  return world.tiles[j * N + i];
}

export function zoneOf(bx, bz) {
  if (bx < 1) return 'water';
  if (bz === 3 || bz === 4) return bx <= 6 ? 'shops' : 'woods';
  if (bx >= 7 || bz >= 6 || (bx === 6 && (bz <= 1 || bz === 5))) return 'woods';
  if ((bz === 1 && (bx === 2 || bx === 3)) || (bz === 5 && bx === 2)) return 'park';
  return 'res';
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function creekDist(x, z) {
  let m = 99;
  for (let i = 0; i < CREEK.length - 1; i++) m = Math.min(m, distToSeg(x, z, ...CREEK[i], ...CREEK[i + 1]));
  return m;
}

function classify(x, z) {
  if (x < 40) return [T.WATER, 0];
  if (x < 48) return [T.SAND, 0];
  if (z < 16 || x >= 376 || z >= 376) return [T.WATER, 0];
  if (z < 20 || x >= 372 || z >= 372) return [T.SAND, 0];
  const cx = Math.floor(x / PITCH), cz = Math.floor(z / PITCH);
  const mx = x - cx * PITCH, mz = z - cz * PITCH;
  const sx = mx < STREET, sz = mz < STREET;
  if (sx || sz) {
    // park street segment and market plaza
    if (sx && cx === 3 && cz === 1 && mz >= 16) return [T.LAWN, 0];
    if (sx && cx === 4 && z >= 112 && z < 192) return [T.PLAZA, 0];
    if (sx && sz && cx === 4 && cz === 3) return [T.PLAZA, 0];
    const trail = (sz && !sx && cz >= 6) || (sx && !sz && cx >= 7) || (sx && sz && (cz >= 6 || cx >= 7));
    if (trail) return [T.PATH, 0];
    const ox = Math.floor(mx / TILE), oz = Math.floor(mz / TILE);
    if (sx && sz) return (ox === 1 || ox === 2 || oz === 1 || oz === 2) ? [T.ROAD, 3] : [T.SIDEWALK, 0];
    if (sz) return (oz === 1 || oz === 2) ? [T.ROAD, 1] : [T.SIDEWALK, 0];
    return (ox === 1 || ox === 2) ? [T.ROAD, 2] : [T.SIDEWALK, 0];
  }
  const zone = zoneOf(cx, cz);
  if (zone === 'woods') return [T.WOODS, 0];
  if (zone === 'park') return [T.LAWN, 0];
  if (zone === 'shops') return [T.PLAZA, 0];
  return [T.GRASS, 0];
}

function addSolid(box) {
  const x0 = Math.floor(box.x0 / 16), x1 = Math.floor(box.x1 / 16), z0 = Math.floor(box.z0 / 16), z1 = Math.floor(box.z1 / 16);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = j * 100 + i;
    let a = world.solidCells.get(k);
    if (!a) world.solidCells.set(k, (a = []));
    a.push(box);
  }
}

export function addStatic(s) {
  const i = clamp(Math.floor(s.x / CELL), 0, CELLS - 1), j = clamp(Math.floor(s.z / CELL), 0, CELLS - 1);
  world.cells[j * CELLS + i].push(s);
}
export { CELLS };

/** Resolve a circle against solid boxes. Returns {x,z,hit}. */
export function collide(x, z, r) {
  let hit = false;
  const i0 = Math.floor((x - r) / 16), i1 = Math.floor((x + r) / 16), j0 = Math.floor((z - r) / 16), j1 = Math.floor((z + r) / 16);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = world.solidCells.get(j * 100 + i);
    if (!a) continue;
    for (const b of a) {
      if (b.off) continue;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 < 1e-6) {
        const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bt = b.z1 - z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) x = b.x0 - r; else if (m === rr) x = b.x1 + r; else if (m === t) z = b.z0 - r; else z = b.z1 + r;
      } else {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      }
    }
  }
  return { x, z, hit };
}

export function solidAt(x, z) {
  const a = world.solidCells.get(Math.floor(z / 16) * 100 + Math.floor(x / 16));
  if (!a) return false;
  for (const b of a) if (!b.off && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
  return false;
}

export function insideShop(s, x, z) {
  return x > s.x0 + 0.6 && x < s.x1 - 0.6 && z > s.z0 + 0.6 && z < s.z1 - 0.6;
}
export function shopAt(x, z) {
  for (const s of world.shops) if (insideShop(s, x, z)) return s;
  return null;
}

export function buildWorld() {
  if (world.built) return world;
  const rng = mulberry32(1337);
  const R = (a, b) => a + rng() * (b - a);
  const P = (arr) => arr[Math.floor(rng() * arr.length)];

  // heights
  const W = N + 1;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) world.Hv[j * W + i] = rawH(i * TILE, j * TILE);

  // tiles
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * TILE, z = (j + 0.5) * TILE;
    let [t, d] = classify(x, z);
    if ((t === T.GRASS || t === T.LAWN || t === T.WOODS || t === T.SAND || t === T.PATH) && x > 40 && creekDist(x, z) < 2.6 && z > 20) t = T.CREEK;
    world.tiles[j * N + i] = t;
    world.roadDir[j * N + i] = d;
  }

  const footprintFree = (x0, z0, x1, z1, pad = 1) => {
    for (let x = x0 - pad; x <= x1 + pad; x += 2) for (let z = z0 - pad; z <= z1 + pad; z += 2) {
      const t = tileAt(x, z);
      if (t === T.CREEK || t === T.WATER || t === T.ROAD) return false;
    }
    return true;
  };

  const box = (x0, y0, z0, x1, y1, z1, c, extra) => {
    const s = { t: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, rad: Math.hypot(x1 - x0, z1 - z0) / 2, x0, y0, z0, x1, y1, z1, c: hex(c), ...extra };
    addStatic(s);
    return s;
  };
  const solid = (x0, z0, x1, z1) => { const b = { x0, z0, x1, z1 }; addSolid(b); return b; };

  const decor = (b, face, u0, u1, v0, v1, c, glow) => { (b.decals ||= []).push({ f: face, u0, u1, v0, v1, c: hex(c), glow: !!glow }); };

  // ---- houses
  const makeHouse = (lx, lz, face, modern) => {
    const w = R(9, 11.5), d = R(8, 10.5);
    let cx = lx + 8, cz = lz + 8;
    if (face === 'n') cz -= 2.5; else if (face === 's') cz += 2.5; else if (face === 'w') cx -= 2.5; else cx += 2.5;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (!footprintFree(x0, z0, x1, z1)) return false;
    let base = 0;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]]) base = Math.max(base, groundH(x, z));
    const wc = modern ? P(MODERN) : P(WALLS);
    const along = face === 'n' || face === 's' ? [x0, x1] : [z0, z1];
    const doorU = along[0] + (along[1] - along[0]) * R(0.3, 0.6);
    const addWindows = (b, glowChance) => {
      for (const f of ['n', 's', 'e', 'w']) {
        const [a0, a1] = f === 'n' || f === 's' ? [b.x0, b.x1] : [b.z0, b.z1];
        const n = Math.max(1, Math.floor((a1 - a0) / 3.6));
        for (let k = 0; k < n; k++) {
          const u = a0 + ((k + 0.5) * (a1 - a0)) / n;
          if (f === face && Math.abs(u - doorU) < 1.8) continue;
          const mw = modern ? 1.3 : 0.8;
          decor(b, f, u - mw, u + mw, b.y0 + (modern ? 2.4 : 2.3), b.y0 + (modern ? 4.2 : 3.9), modern ? '#3d5566' : '#6a8aa0', rng() < glowChance);
        }
      }
    };
    const body = box(x0, base - 2.5, z0, x1, base + (modern ? 6.4 : 5), z1, wc, { house: true });
    body.y0 = base;
    solid(x0, z0, x1, z1);
    decor(body, face, doorU - 0.8, doorU + 0.8, base, base + 3.2, modern ? '#3b3d3f' : '#5a3a2a', false);
    addWindows(body, 0.55);
    if (modern) {
      const up = box(x0 - 1.5, base + 6.4, z0 - 1.5, x1 - 2, base + 9.4, z1 + 0.5, P(MODERN), { house: true });
      up.y0 = base + 6.4;
      decor(up, face, up.x0 + 1, up.x1 - 1, base + 7.2, base + 8.7, '#3d5566', rng() < 0.6);
      box(x0 - 1.7, base + 9.4, z0 - 1.7, x1 - 1.8, base + 9.8, z1 + 0.7, '#4a4a48');
      box(x0 - 0.2, base + 6.4, z0 - 0.2, x1 + 0.2, base + 6.7, z1 + 0.2, '#4a4a48');
    } else {
      const ridgeX = w >= d;
      addStatic({ t: 'gable', x: cx, z: cz, rad: Math.max(w, d) / 2 + 1, x0: x0 - 0.7, z0: z0 - 0.7, x1: x1 + 0.7, z1: z1 + 0.7, y0: base + 5, y1: base + 8.2, ridgeX, c: hex(P(ROOFS)) });
      if (rng() < 0.6) box(x1 - 2.2, base + 5, z0 + 1.2, x1 - 1.2, base + 9.4, z0 + 2.2, '#8a5a48');
      // porch
      const pw = 4, pd = 2.2;
      let px0, px1, pz0, pz1;
      if (face === 's') { px0 = doorU - pw / 2; px1 = doorU + pw / 2; pz0 = z1; pz1 = z1 + pd; }
      else if (face === 'n') { px0 = doorU - pw / 2; px1 = doorU + pw / 2; pz0 = z0 - pd; pz1 = z0; }
      else if (face === 'e') { pz0 = doorU - pw / 2; pz1 = doorU + pw / 2; px0 = x1; px1 = x1 + pd; }
      else { pz0 = doorU - pw / 2; pz1 = doorU + pw / 2; px0 = x0 - pd; px1 = x0; }
      box(px0, base - 0.6, pz0, px1, base + 0.3, pz1, '#b9a98c');
      box(px0, base + 3.1, pz0, px1, base + 3.5, pz1, '#6b5a4a');
      for (const [x, z] of [[px0 + 0.2, pz0 + 0.2], [px1 - 0.2, pz1 - 0.2], [px0 + 0.2, pz1 - 0.2], [px1 - 0.2, pz0 + 0.2]]) box(x - 0.15, base + 0.3, z - 0.15, x + 0.15, base + 3.1, z + 0.15, '#f3eee2');
    }
    // trash bin at the curb
    const binPos = face === 'n' ? [lx + R(2, 14), lz + 1.2] : face === 's' ? [lx + R(2, 14), lz + 14.8] : face === 'w' ? [lx + 1.2, lz + R(2, 14)] : [lx + 14.8, lz + R(2, 14)];
    if (rng() < 0.75 && tileAt(binPos[0], binPos[1]) !== T.ROAD) addBin(binPos[0], binPos[1], false);
    // yard plants
    for (let k = 0; k < 3; k++) {
      const tx = lx + R(1.5, 14.5), tz = lz + R(1.5, 14.5);
      if (tx > x0 - 2 && tx < x1 + 2 && tz > z0 - 2 && tz < z1 + 2) continue;
      if (!footprintFree(tx, tz, tx, tz, 0.5)) continue;
      if (k === 0) addTree(tx, tz, rng() < 0.3 ? 'pine' : 'oak', R(0.8, 1.2));
      else addBush(tx, tz, false, R(0.7, 1.1));
    }
    return true;
  };

  function addBin(x, z, dumpster) {
    const b = { x, z, food: rng() < 0.6 ? 2 : 0, timer: 0, tipped: false, dumpster };
    world.bins.push(b);
    const sz = dumpster ? 1.6 : 0.5;
    solid(x - sz, z - sz * (dumpster ? 0.6 : 1), x + sz, z + sz * (dumpster ? 0.6 : 1));
    addStatic({ t: 'bin', x, z, rad: 2, y: groundH(x, z), bin: b });
  }
  function addTree(x, z, kind, s) {
    const y = groundH(x, z);
    addStatic({ t: 'tree', x, z, rad: 5 * s, y, kind, s, seed: hash2(x * 10, z * 10) });
    solid(x - 0.45 * s, z - 0.45 * s, x + 0.45 * s, z + 0.45 * s);
  }
  function addBush(x, z, berry, s) {
    const b = { t: 'bush', x, z, rad: 2.5 * s, y: groundH(x, z), s, berry, food: berry ? 3 : 0, timer: 0, seed: hash2(x * 7, z * 7) };
    addStatic(b);
    if (berry) world.bushes.push(b);
  }

  // ---- shops
  const makeShop = (name, kind, x0, w, face, frontZ, isNorthSide) => {
    const enter = kind === 'grocery' || kind === 'coffee';
    const d = kind === 'grocery' ? 20 : 14;
    const x1 = x0 + w;
    const z0 = face === 's' ? frontZ - d : frontZ;
    const z1 = face === 's' ? frontZ : frontZ + d;
    let base = 0;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) base = Math.max(base, groundH(x, z));
    const H = 7.5, col = SHOP_COLORS[kind] || '#aaa';
    const doorC = (x0 + x1) / 2;
    if (rng() < 0.85) addBin(x0 + 3 + rng() * (w - 6), face === 's' ? z0 - 1.8 : z1 + 1.8, true);
    if (!enter) {
      const b = box(x0, base - 2.5, z0, x1, base + H, z1, col, { house: true });
      b.y0 = base;
      solid(x0, z0, x1, z1);
      box(x0 - 0.3, base + H, z0 - 0.3, x1 + 0.3, base + H + 0.6, z1 + 0.3, '#4a4a48');
      const n = Math.floor(w / 5);
      for (let k = 0; k < n; k++) {
        const u = x0 + ((k + 0.5) * w) / n;
        decor(b, face, u - 1.6, u + 1.6, base + 1.2, base + 4.2, '#8fb4c4', true);
      }
      decor(b, face, doorC - 0.9, doorC + 0.9, base, base + 3.2, '#3a2a22', false);
      decor(b, face, x0 + 0.5, x1 - 0.5, base + 5, base + 6.6, '#f3eee2', false);
      addStatic({ t: 'sign', x: doorC, z: face === 's' ? z1 + 0.5 : z0 - 0.5, y: base + 8.4, text: name });
      return;
    }
    const shop = { name, kind, x0, z0, x1, z1, face, base, open: false, inside: false, doorX0: doorC - 3, doorX1: doorC + 3, spots: [], staff: [], openUntil: 0 };
    world.shops.push(shop);
    const th = 0.8;
    const wall = (ax0, az0, ax1, az1, extra) => {
      const b = box(ax0, base - 2.5, az0, ax1, base + H, az1, col, { shop, house: true, ...extra });
      b.y0 = base;
      solid(ax0, az0, ax1, az1);
      return b;
    };
    wall(x0, z0, x1, z0 + th);
    wall(x0, z0, x0 + th, z1);
    wall(x1 - th, z0, x1, z1);
    const fz0 = face === 's' ? z1 - th : z0, fz1 = face === 's' ? z1 : z0 + th;
    const fl = wall(x0, fz0, shop.doorX0, fz1, { front: true });
    const fr = wall(shop.doorX1, fz0, x1, fz1, { front: true });
    decor(fl, face, x0 + 1, shop.doorX0 - 1, base + 1.2, base + 4.4, '#8fb4c4', true);
    decor(fr, face, shop.doorX1 + 1, x1 - 1, base + 1.2, base + 4.4, '#8fb4c4', true);
    box(shop.doorX0, base + 4.6, fz0, shop.doorX1, base + H, fz1, col, { shop, front: true });
    box(x0 + th, base - 0.05, z0 + th, x1 - th, base + 0.12, z1 - th, kind === 'grocery' ? '#c9c2b0' : '#9a7a5a', { floor: true, shop });
    box(x0 - 0.3, base + H, z0 - 0.3, x1 + 0.3, base + H + 0.7, z1 + 0.3, '#4a4a48', { shop, roof: true });
    shop.door = { t: 'door', x: doorC, z: face === 's' ? z1 - 0.4 : z0 + 0.4, rad: 4, shop, y: base };
    addStatic(shop.door);
    shop.barrier = solid(shop.doorX0, fz0, shop.doorX1, fz1);
    addStatic({ t: 'sign', x: doorC, z: face === 's' ? z1 + 0.5 : z0 - 0.5, y: base + 9, text: name, shop });
    // interior
    const inZ0 = z0 + th + 1, inZ1 = z1 - th - 1;
    if (kind === 'grocery') {
      for (let r = 0; r < 3; r++) {
        const sz = z0 + 4 + r * 4.2;
        if (face === 'n' ? sz > z1 - 7 : sz > z1 - 7) continue;
        for (let k = 0; k < 2; k++) {
          const sx0 = x0 + 3 + k * 14;
          box(sx0, base, sz, sx0 + 11, base + 2, sz + 1.1, '#a87a4a', { shop, shelf: true });
          solid(sx0, sz, sx0 + 11, sz + 1.1);
          shop.spots.push({ x: sx0 + 3, z: sz + 2.1 }, { x: sx0 + 8, z: sz - 1 });
        }
      }
      shop.spots.push({ x: x0 + 3, z: (z0 + z1) / 2 }, { x: x1 - 3, z: (z0 + z1) / 2 });
      for (const s of shop.spots) { s.x = clamp(s.x, x0 + 2, x1 - 2); s.z = clamp(s.z, inZ0, inZ1); }
    } else {
      const bz = face === 's' ? z0 + th : z1 - th - 1.4;
      box(x0 + 2, base, bz, x1 - 2, base + 1.3, bz + 1.4, '#6a4a3a', { shop, shelf: true });
      solid(x0 + 2, bz, x1 - 2, bz + 1.4);
      const sz = face === 's' ? bz + 2.6 : bz - 1.4;
      for (const u of [0.25, 0.5, 0.75]) shop.spots.push({ x: x0 + w * u, z: sz });
      for (const u of [0.3, 0.7]) {
        const tz = (z0 + z1) / 2 + (face === 's' ? 1 : -1);
        box(x0 + w * u - 0.8, base, tz - 0.8, x0 + w * u + 0.8, base + 1, tz + 0.8, '#8a6a4a', { shop, shelf: true });
        solid(x0 + w * u - 0.8, tz - 0.8, x0 + w * u + 0.8, tz + 0.8);
      }
    }
  };

  // ---- generate blocks
  const treeLine = (x, z) => { if (footprintFree(x, z, x, z, 0.5)) addTree(x, z, 'oak', R(0.7, 1)); };
  for (let bz = 0; bz < 8; bz++) for (let bx = 1; bx < 8; bx++) {
    const zone = zoneOf(bx, bz);
    const bx0 = bx * PITCH + STREET, bz0 = bz * PITCH + STREET;
    if (bz0 + 8 > BOUNDS.z1 || bx0 + 8 > BOUNDS.x1) continue;
    if (zone === 'res') {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const lx = bx0 + a * 16, lz = bz0 + b * 16;
        const face = rng() < 0.5 ? (a === 0 ? 'w' : 'e') : (b === 0 ? 'n' : 's');
        if (!makeHouse(lx, lz, face, rng() < 0.38)) {
          // creek lot: add a bush instead
          if (footprintFree(lx + 8, lz + 8, lx + 8, lz + 8, 1)) addBush(lx + 8, lz + 8, false, 1);
        }
      }
    } else if (zone === 'park') {
      const n = 14;
      for (let k = 0; k < n; k++) {
        const x = bx0 + R(1, 31), z = bz0 + R(1, 31);
        if (!footprintFree(x, z, x, z, 1)) continue;
        if (k < 6) addTree(x, z, k % 2 ? 'maple' : 'oak', R(0.9, 1.3));
        else if (k < 9) addBush(x, z, true, R(0.8, 1.1));
        else {
          const y = groundH(x, z);
          box(x - 1.2, y, z - 0.4, x + 1.2, y + 0.5, z + 0.4, '#8a6a4a');
          box(x - 1.2, y + 0.5, z - 0.5, x + 1.2, y + 1.1, z - 0.3, '#8a6a4a');
          solid(x - 1.2, z - 0.5, x + 1.2, z + 0.4);
        }
      }
      world.spawn.parks.push([bx0 + 16, bz0 + 16]);
    } else if (zone === 'woods') {
      const n = 34;
      for (let k = 0; k < n; k++) {
        const x = bx0 + R(0.5, 31.5), z = bz0 + R(0.5, 31.5);
        if (!footprintFree(x, z, x, z, 0.5)) continue;
        if (k < 24) addTree(x, z, rng() < 0.8 ? 'pine' : 'oak', R(1, 1.6));
        else addBush(x, z, true, R(1, 1.5));
      }
      world.spawn.woods.push([bx0 + 16, bz0 + 16]);
    } else if (zone === 'shops') {
      const north = bz === 3;
      const list = (north ? SHOPS_N : SHOPS_S)[bx - 1];
      if (list) {
        let x = bx0;
        for (const [name, kind, w] of list) {
          makeShop(name, kind, x, w, north ? 's' : 'n', north ? bz0 + 32 : bz0, north);
          x += w;
        }
      }
    }
  }

  // ---- street furniture
  for (let cx = 1; cx <= 7; cx++) for (let cz = 0; cz <= 5; cz++) {
    const ox = cx * PITCH, oz = cz * PITCH;
    if (ox + 16 > BOUNDS.x1 || cx === 4 && cz === 3) continue;
    for (const [lx, lz] of [[2, 2], [14, 2], [2, 14], [14, 14]]) {
      const x = ox + lx, z = oz + lz;
      if (tileAt(x, z) !== T.SIDEWALK) continue;
      const y = groundH(x, z);
      world.lamps.push({ x, z, y });
      addStatic({ t: 'lamp', x, z, rad: 3, y });
      solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
    if (cz !== 4 && cz !== 3) {
      for (const [x, z] of [[ox + 16 + 16, oz + 2], [ox + 16 + 16, oz + 14], [ox + 2, oz + 16 + 16], [ox + 14, oz + 16 + 16]]) {
        if (tileAt(x, z) === T.SIDEWALK && zoneOf(cx, cz) !== 'woods') treeLine(x, z);
      }
    }
  }

  // ---- market stalls (only visible while the market runs)
  for (let k = 0; k < 11; k++) {
    for (const side of [0, 1]) {
      const z = 116 + k * 6.5;
      const x0 = side ? 204.2 : 192.6, x1 = side ? 207.6 : 196;
      const y = groundH(200, z);
      const hue = P(['#c46d4a', '#7f8f64', '#d9b27a', '#a8453a', '#6f7f8a', '#b57aa0']);
      const stall = { x: (x0 + x1) / 2, z: z + 1.3, side, food: 3, timer: 0, y };
      world.stalls.push(stall);
      const o = { ev: 'market' };
      box(x0, y, z, x1, y + 1.2, z + 2.6, '#8a6a4a', o);
      box(x0 - 0.2, y + 3.0, z - 0.3, x1 + 0.2, y + 3.4, z + 2.9, hue, o);
      for (const [px, pz] of [[x0 + 0.1, z + 0.1], [x1 - 0.1, z + 0.1], [x0 + 0.1, z + 2.5], [x1 - 0.1, z + 2.5]]) box(px - 0.1, y + 1.2, pz - 0.1, px + 0.1, y + 3, pz + 0.1, '#5a4a3a', o);
      stall.solid = solid(x0, z, x1, z + 2.6);
      stall.solid.off = true;
    }
  }

  // ---- picnic spots
  [[130, 70], [168, 68], [124, 92]].forEach(([x, z], i) => {
    world.picnicSpots.push({ x, z });
    addStatic({ t: 'blanket', x, z, rad: 3, y: groundH(x, z), ev: 'picnic', evVal: i });
  });

  // ---- landmarks: wizard hut, witch hut
  const hut = (x0, z0, x1, z1, wc, rc) => {
    const y = Math.max(groundH(x0, z0), groundH(x1, z1));
    const b = box(x0, y - 2, z0, x1, y + 3.6, z1, wc, { house: true });
    b.y0 = y;
    solid(x0, z0, x1, z1);
    decor(b, 's', (x0 + x1) / 2 - 0.7, (x0 + x1) / 2 + 0.7, y, y + 2.4, '#4a3020', false);
    decor(b, 'e', (z0 + z1) / 2 - 0.8, (z0 + z1) / 2 + 0.8, y + 1.2, y + 2.6, '#e6c35a', true);
    addStatic({ t: 'gable', x: (x0 + x1) / 2, z: (z0 + z1) / 2, rad: 5, x0: x0 - 0.5, z0: z0 - 0.5, x1: x1 + 0.5, z1: z1 + 0.5, y0: y + 3.6, y1: y + 7.8, ridgeX: true, c: hex(rc) });
  };
  hut(184, 86, 190, 92, '#8a7a9a', '#4b3a6b');
  hut(321, 85, 327, 91, '#6a5a3a', '#2f4a30');
  world.landmarks = { wizard: { x: 187, z: 96 }, witch: { x: 324, z: 95 } };

  // ---- beach rocks and spawn spots
  for (let k = 0; k < 14; k++) addStatic({ t: 'rock', x: 38 + R(-1, 5), z: 40 + k * 22 + R(-5, 5), rad: 2, y: 0, s: R(0.8, 2) });
  world.spawn.beach = [[43, 110], [44, 175], [43, 255], [44, 330]];

  // ---- bridge (north edge): drawn as a special object
  world.special.push({ t: 'bridge', x: 200, z: -40, rad: 120 });

  // ---- sampling pools for spawns
  for (let n = 0; n < 2000 && world.spawn.humans.length < 500; n++) {
    const x = R(BOUNDS.x0 + 10, BOUNDS.x1 - 10), z = R(BOUNDS.z0 + 5, BOUNDS.z1 - 10);
    const t = tileAt(x, z);
    if (t === T.SIDEWALK && !solidAt(x, z)) world.spawn.humans.push([x, z]);
    else if (t === T.PLAZA && !solidAt(x, z)) world.spawn.plaza.push([x, z]);
  }

  world.built = true;
  return world;
}
