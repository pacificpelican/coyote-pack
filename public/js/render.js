import { clamp, smooth, lerp, hash2, hex, TAU, mix } from './util.js';
import { world, T, TILE, N, tileAt, groundH, CELL, CELLS } from './world.js';
import { rigFor } from './rigs.js';

export const cam = { x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: -1, rx: 1, rz: 0, cp: 1, sp: 0, focal: 800, cx: 0, cy: 0, W: 0, H: 0, D: 11, Hc: 5.5, pitch: 0 };
export const L = {
  amb: 0.5, diff: 0.6, tint: [1, 1, 1], fog: [190, 200, 215], skyTop: [110, 160, 210], skyHor: [190, 200, 215], fogStart: 45, fogEnd: 105,
  kTop: 1, kXp: 1, kXm: 1, kZp: 1, kZm: 1, dir: [0, 1, 0], pal: [], leaf: { oak: [90, 130, 60], maple: [190, 100, 40], pine: [47, 79, 54] },
  night: 0, glow: 0, sunE: 1, season: 0, winter: 0,
};
const INK = [29, 26, 26];
const NEAR = 0.4;
let ctx;

const BASE = {
  [T.WATER]: [70, 110, 132], [T.SAND]: [208, 190, 150], [T.GRASS]: [118, 140, 80], [T.ROAD]: [92, 92, 96], [T.SIDEWALK]: [186, 178, 164],
  [T.WOODS]: [66, 86, 54], [T.LAWN]: [134, 158, 94], [T.PLAZA]: [172, 152, 130], [T.PATH]: [152, 122, 86], [T.CREEK]: [84, 136, 158],
};
const SEASON_GRASS = [[1.0, 1.06, 0.9], [1.06, 1.0, 0.82], [1.28, 0.9, 0.62], [1.0, 1.08, 1.15]];
const LEAF_OAK = [[130, 168, 76], [92, 132, 60], [196, 128, 48], [128, 112, 92]];
const LEAF_MAPLE = [[150, 176, 80], [96, 128, 58], [190, 66, 40], [124, 108, 92]];

const vb = new Float64Array(96);
const clipb = new Float64Array(96);
const stars = Array.from({ length: 110 }, (_, i) => ({ az: hash2(i, 3) * TAU, el: 0.08 + hash2(i, 9) * 1.2, tw: hash2(i, 5) * TAU, s: 0.6 + hash2(i, 7) * 1.2 }));
const clouds = Array.from({ length: 9 }, (_, i) => ({ az: hash2(i, 21) * TAU, el: 0.18 + hash2(i, 22) * 0.35, sz: 0.5 + hash2(i, 23) * 0.8 }));
const drops = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.8 }));
let grain = null, vignette = null, vigW = 0, vigH = 0;
let tileList = [];
let items = [];
let tt = 0;

function lerpCycle(arr, f) {
  const n = arr.length, i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  const t2 = t * t * (3 - 2 * t);
  return [lerp(arr[i][0], arr[j][0], t2), lerp(arr[i][1], arr[j][1], t2), lerp(arr[i][2], arr[j][2], t2)];
}

export function computeLight(G) {
  const c = G.clock;
  const dayAmt = smooth(-0.08, 0.3, c.sunE);
  const warm = Math.exp(-(((c.sunE - 0.02) / 0.16) ** 2));
  const rain = G.rain;
  const sunA = c.sunAng;
  const sd = c.sunE > -0.04 ? [Math.cos(sunA), Math.max(0.12, Math.sin(sunA)), 0.45] : [Math.cos(c.moonAng), Math.max(0.2, Math.sin(c.moonAng)), 0.4];
  const m = Math.hypot(...sd);
  const d = [sd[0] / m, sd[1] / m, sd[2] / m];
  L.dir = d;
  L.sunE = c.sunE;
  L.night = 1 - dayAmt;
  L.amb = lerp(0.3, 0.52, dayAmt) * (1 - rain * 0.18);
  L.diff = lerp(0.2, 0.62, dayAmt) * (1 - rain * 0.55);
  const nightTint = [0.52, 0.62, 1.0], dayTint = [1.0, 0.98, 0.92], warmTint = [1.08, 0.82, 0.66];
  let tint = mix(nightTint, dayTint, dayAmt);
  tint = mix(tint, warmTint, warm * 0.75 * dayAmt + warm * 0.15);
  tint = mix(tint, [0.82, 0.86, 0.95], rain * 0.5 * dayAmt);
  L.tint = tint;
  L.kTop = L.amb + L.diff * Math.max(0, d[1]);
  L.kXp = L.amb + L.diff * Math.max(0, d[0]);
  L.kXm = L.amb + L.diff * Math.max(0, -d[0]);
  L.kZp = L.amb + L.diff * Math.max(0, d[2]);
  L.kZm = L.amb + L.diff * Math.max(0, -d[2]);
  const skyDayTop = [96, 148, 206], skyDayHor = [196, 206, 218], skyNightTop = [10, 12, 36], skyNightHor = [34, 40, 80], duskTop = [90, 80, 140], duskHor = [238, 160, 110];
  let top = mix(skyNightTop, skyDayTop, dayAmt), hor = mix(skyNightHor, skyDayHor, dayAmt);
  top = mix(top, duskTop, warm * 0.6);
  hor = mix(hor, duskHor, warm * 0.7);
  const grey = mix([110, 116, 126], [20, 22, 32], 1 - dayAmt);
  top = mix(top, grey, rain * 0.7);
  hor = mix(hor, mix([150, 156, 164], [26, 28, 40], 1 - dayAmt), rain * 0.75);
  L.skyTop = top;
  L.skyHor = hor;
  L.fog = hor;
  L.fogStart = lerp(46, 26, rain);
  L.fogEnd = lerp(108, 72, rain);
  L.glow = clamp(1 - dayAmt * 1.15 + rain * 0.25, 0, 1);
  const seas = ((c.season % 4) + 4) % 4;
  L.season = seas;
  const sg = lerpCycle(SEASON_GRASS, seas);
  L.winter = smooth(2.6, 3.2, seas) * (1 - smooth(3.8, 4, seas));
  for (const k in BASE) {
    let col = BASE[k].slice();
    if (+k === T.GRASS || +k === T.LAWN || +k === T.WOODS) col = [col[0] * sg[0], col[1] * sg[1], col[2] * sg[2]];
    if (L.winter > 0 && (+k === T.GRASS || +k === T.LAWN)) col = mix(col, [226, 230, 236], L.winter * 0.32);
    if (+k === T.ROAD && rain > 0) col = [col[0] * (1 - rain * 0.2), col[1] * (1 - rain * 0.2), col[2] * (1 - rain * 0.12)];
    L.pal[k] = col;
  }
  L.leaf.oak = lerpCycle(LEAF_OAK, seas);
  L.leaf.maple = lerpCycle(LEAF_MAPLE, seas);
}

function sh(c, k, ft) {
  const t = L.tint;
  let r = c[0] * k * t[0], g = c[1] * k * t[1], b = c[2] * k * t[2];
  if (ft > 0) {
    const f = L.fog;
    r += (f[0] - r) * ft; g += (f[1] - g) * ft; b += (f[2] - b) * ft;
  }
  return 'rgb(' + (r > 255 ? 255 : r | 0) + ',' + (g > 255 ? 255 : g | 0) + ',' + (b > 255 ? 255 : b | 0) + ')';
}
const fogT = (d) => (d <= L.fogStart ? 0 : d >= L.fogEnd ? 1 : (d - L.fogStart) / (L.fogEnd - L.fogStart));
const inkS = (ft, a = 1) => 'rgba(29,26,26,' + (a * (1 - ft * 0.85)).toFixed(2) + ')';

export function placeCamera(px, py, pz, yaw, W, H, D = cam.D, Hc = cam.Hc) {
  cam.yaw = yaw;
  cam.fx = Math.sin(yaw); cam.fz = -Math.cos(yaw); cam.rx = Math.cos(yaw); cam.rz = Math.sin(yaw);
  const ty = py + 1.1;
  const cx = px - cam.fx * D, cz = pz - cam.fz * D;
  let cy = ty + Hc;
  cy = Math.max(cy, groundH(cx, cz) + 1.8);
  cam.x = cx; cam.y = cy; cam.z = cz;
  cam.pitch = Math.atan2(cy - ty, D);
  cam.cp = Math.cos(cam.pitch); cam.sp = Math.sin(cam.pitch);
  cam.W = W; cam.H = H; cam.focal = H * 1.05; cam.cx = W / 2; cam.cy = H * 0.58;
}

function toView(x, y, z, i) {
  const rx = x - cam.x, ry = y - cam.y, rz = z - cam.z;
  const fw = rx * cam.fx + rz * cam.fz;
  vb[i] = rx * cam.rx + rz * cam.rz;
  vb[i + 1] = fw * cam.sp + ry * cam.cp;
  vb[i + 2] = fw * cam.cp - ry * cam.sp;
}

/** Projects a world point; returns depth (<=NEAR means behind) and fills out[0..1]. */
export function projectPoint(x, y, z, out) {
  toView(x, y, z, 0);
  const d = vb[2];
  if (d > NEAR) { out[0] = cam.cx + (vb[0] / d) * cam.focal; out[1] = cam.cy - (vb[1] / d) * cam.focal; }
  return d;
}

function buildPath(n) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const da = vb[i * 3 + 2] - NEAR, db = vb[j * 3 + 2] - NEAR;
    if (da >= 0) { clipb[m * 3] = vb[i * 3]; clipb[m * 3 + 1] = vb[i * 3 + 1]; clipb[m * 3 + 2] = vb[i * 3 + 2]; m++; }
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      clipb[m * 3] = vb[i * 3] + (vb[j * 3] - vb[i * 3]) * t;
      clipb[m * 3 + 1] = vb[i * 3 + 1] + (vb[j * 3 + 1] - vb[i * 3 + 1]) * t;
      clipb[m * 3 + 2] = NEAR;
      m++;
    }
  }
  if (m < 3) return false;
  ctx.beginPath();
  for (let i = 0; i < m; i++) {
    const d = clipb[i * 3 + 2];
    const X = cam.cx + (clipb[i * 3] / d) * cam.focal, Y = cam.cy - (clipb[i * 3 + 1] / d) * cam.focal;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.closePath();
  return true;
}

function quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, fill, stroke) {
  toView(x0, y0, z0, 0); toView(x1, y1, z1, 3); toView(x2, y2, z2, 6); toView(x3, y3, z3, 9);
  if (!buildPath(4)) return;
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) ctx.stroke();
}

function tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, fill, stroke) {
  toView(x0, y0, z0, 0); toView(x1, y1, z1, 3); toView(x2, y2, z2, 6);
  if (!buildPath(3)) return;
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) ctx.stroke();
}

// ---------------------------------------------------------------- sky
function skyDir(dx, dy, dz, out) {
  const m = Math.hypot(dx, dy, dz);
  dx /= m; dy /= m; dz /= m;
  const fw = dx * cam.fx + dz * cam.fz;
  const s = dx * cam.rx + dz * cam.rz;
  const d = fw * cam.cp - dy * cam.sp, u = fw * cam.sp + dy * cam.cp;
  if (d <= 0.02) return false;
  out[0] = cam.cx + (s / d) * cam.focal; out[1] = cam.cy - (u / d) * cam.focal;
  return true;
}

function horizonY() { return cam.cy - Math.tan(cam.pitch) * cam.focal; }

function ridge(az, k) {
  return 0.5 + 0.28 * Math.sin(az * 3 + k) + 0.17 * Math.sin(az * 7 + k * 2) + 0.04 * Math.sin(az * 11 + k * 3);
}

function drawSky(G, W, H) {
  const hy = clamp(horizonY(), -50, H);
  const g = ctx.createLinearGradient(0, 0, 0, Math.max(hy, 1));
  g.addColorStop(0, 'rgb(' + L.skyTop.map((v) => v | 0).join(',') + ')');
  g.addColorStop(1, 'rgb(' + L.skyHor.map((v) => v | 0).join(',') + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, Math.max(hy, 0) + 1);
  ctx.fillStyle = 'rgb(' + L.fog.map((v) => v | 0).join(',') + ')';
  ctx.fillRect(0, Math.max(hy, 0), W, H);
  const c = G.clock, p = [0, 0];
  // stars
  if (L.night > 0.25) {
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      if (!skyDir(Math.cos(s.az + c.tod * 0.6), s.el, Math.sin(s.az + c.tod * 0.6), p)) continue;
      if (p[1] > hy) continue;
      ctx.globalAlpha = (L.night - 0.2) * (0.5 + 0.5 * Math.sin(tt * 1.5 + s.tw)) * (1 - G.rain);
      ctx.fillRect(p[0], p[1], s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }
  // sun
  if (c.sunE > -0.12 && skyDir(Math.cos(c.sunAng), Math.max(0.01, Math.sin(c.sunAng) * 0.9) + (c.sunE < 0 ? c.sunE : 0), 0.45, p)) {
    const r = H * 0.045;
    const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 5);
    gl.addColorStop(0, 'rgba(255,236,190,' + (0.55 * (1 - G.rain * 0.8)) + ')');
    gl.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(p[0] - r * 5, p[1] - r * 5, r * 10, r * 10);
    ctx.fillStyle = 'rgba(255,244,214,' + (1 - G.rain * 0.7) + ')';
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
  }
  // moon
  if (c.moonE > -0.05 && skyDir(Math.cos(c.moonAng), Math.max(0.01, Math.sin(c.moonAng) * 0.8) + (c.moonE < 0 ? c.moonE : 0), 0.4, p)) {
    drawMoon(p[0], p[1], H * 0.035, c.moonPhase, 1 - G.rain * 0.8);
  }
  // clouds
  const nC = G.rain > 0.05 ? clouds.length : 4;
  for (let i = 0; i < nC; i++) {
    const cl = clouds[i];
    const az = cl.az + tt * 0.006;
    if (!skyDir(Math.cos(az), 0.3 + cl.el * 0.5, Math.sin(az), p)) continue;
    const a = (0.35 + G.rain * 0.5) * (L.night > 0.5 ? 0.35 : 1);
    const col = G.rain > 0.1 ? 'rgba(' + (120 - L.night * 90 | 0) + ',' + (126 - L.night * 90 | 0) + ',' + (136 - L.night * 80 | 0) + ',' + a + ')' : 'rgba(' + (250 - L.night * 190 | 0) + ',' + (248 - L.night * 190 | 0) + ',' + (244 - L.night * 150 | 0) + ',' + a + ')';
    ctx.fillStyle = col;
    const w = cl.sz * H * 0.2;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(p[0] + (k - 1.5) * w * 0.45, p[1] + (k % 2) * -4, w * 0.5, w * 0.17, 0, 0, TAU); ctx.fill(); }
  }
  // mountains: western range (Olympics-like) and eastern foothills
  const baseY = hy;
  const mt = mix(L.skyHor, mix([86, 92, 140], [36, 42, 84], L.night), 0.55 - L.night * 0.2 - G.rain * 0.2);
  const mt2 = mix(L.skyHor, mix([70, 84, 120], [32, 38, 76], L.night), 0.4);
  for (const [col, hmul, k] of [[mt2, 0.2, 2], [mt, 0.15, 0.5]]) {
    ctx.fillStyle = 'rgb(' + col.map((v) => v | 0).join(',') + ')';
    ctx.beginPath();
    ctx.moveTo(0, baseY + 2);
    for (let x = 0; x <= W; x += 10) {
      const az = cam.yaw + Math.atan((x - cam.cx) / cam.focal) / cam.cp;
      const west = Math.max(0, -Math.sin(az)) ** 0.6 * 1.0;
      const east = Math.max(0, Math.sin(az)) * 0.5;
      const north = Math.max(0, -Math.cos(az)) * 0.55;
      ctx.lineTo(x, baseY + 2 - ridge(az, k) * H * hmul * (0.35 + west + east * 0.5 + north * 0.35));
    }
    ctx.lineTo(W, baseY + 2);
    ctx.fill();
  }
}

function drawMoon(x, y, r, phase, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(190,200,225,0.18)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  const psi = phase * TAU;
  const waxing = phase < 0.5;
  const ph = waxing ? psi : TAU - psi;
  ctx.translate(x, y);
  if (!waxing) ctx.scale(-1, 1);
  const cs = Math.cos(ph);
  ctx.fillStyle = '#f0ecd8';
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(0, 0, Math.max(0.5, Math.abs(r * cs)), r, 0, Math.PI / 2, -Math.PI / 2, cs > 0);
  ctx.fill();
  ctx.restore();
  const gl = ctx.createRadialGradient(x, y, r, x, y, r * 4);
  gl.addColorStop(0, 'rgba(210,220,255,' + 0.18 * alpha + ')');
  gl.addColorStop(1, 'rgba(210,220,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
}

// ---------------------------------------------------------------- ground
function drawGround(G, W, H) {
  const R = G.quality === 'low' ? 18 : 26;
  const ci = Math.floor(cam.x / TILE), cj = Math.floor(cam.z / TILE);
  const tanH = (W / 2) / cam.focal + 0.15;
  tileList.length = 0;
  const viewD = R * TILE;
  const i0 = ci - R - 4, i1 = ci + R + 4;
  for (let j = cj - R - 4; j <= cj + R + 4; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * TILE - cam.x, z = (j + 0.5) * TILE - cam.z;
      const fw = x * cam.fx + z * cam.fz;
      if (fw < -2 || fw > viewD + 6) continue;
      const sd = x * cam.rx + z * cam.rz;
      if (Math.abs(sd) > fw * tanH + 9) continue;
      tileList.push(fw, i, j);
    }
  }
  const n = tileList.length / 3;
  const order = new Array(n);
  for (let k = 0; k < n; k++) order[k] = k;
  order.sort((a, b) => tileList[b * 3] - tileList[a * 3]);
  const W1 = N + 1, Hv = world.Hv, Ld = L.dir;
  ctx.lineJoin = 'round';
  for (let o = 0; o < n; o++) {
    const k = order[o];
    const fw = tileList[k * 3], i = tileList[k * 3 + 1], j = tileList[k * 3 + 2];
    const inside = i >= 0 && j >= 0 && i < N && j < N;
    const type = inside ? world.tiles[j * N + i] : T.WATER;
    const x0 = i * TILE, z0 = j * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
    let ha, hb, hc, hd;
    if (type === T.WATER || !inside) { ha = hb = hc = hd = -0.3; }
    else {
      ha = Hv[j * W1 + i]; hb = Hv[j * W1 + i + 1]; hc = Hv[(j + 1) * W1 + i + 1]; hd = Hv[(j + 1) * W1 + i];
      if (type === T.CREEK) { ha -= 0.25; hb -= 0.25; hc -= 0.25; hd -= 0.25; }
    }
    const dx = (hb + hc - ha - hd) / (2 * TILE), dz = (hd + hc - ha - hb) / (2 * TILE);
    const nl = Math.hypot(dx, 1, dz);
    const dot = (-dx * Ld[0] + Ld[1] - dz * Ld[2]) / nl;
    const k2 = L.amb + L.diff * Math.max(0, dot) * 1.1;
    let base = L.pal[type];
    const seed = hash2(i, j);
    let kk = k2 * (0.94 + seed * 0.12);
    if (type === T.WATER) kk = 0.82 + 0.18 * Math.sin(tt * 1.3 + i * 0.7 + j * 0.45) + (1 - fw / 130) * 0.0;
    const ft = fogT(fw);
    toView(x0, ha, z0, 0); toView(x1, hb, z0, 3); toView(x1, hc, z1, 6); toView(x0, hd, z1, 9);
    if (vb[2] < NEAR || vb[5] < NEAR || vb[8] < NEAR || vb[11] < NEAR) continue;
    const X = (a) => cam.cx + (vb[a] / vb[a + 2]) * cam.focal, Y = (a) => cam.cy - (vb[a + 1] / vb[a + 2]) * cam.focal;
    const fill = sh(base, kk, ft);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(3), Y(3)); ctx.lineTo(X(6), Y(6)); ctx.lineTo(X(9), Y(9));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = fill; ctx.lineWidth = 1; ctx.stroke(); // seam hiding
    if (fw < 38 && inside) decorateTile(type, i, j, x0, z0, x1, z1, ha, hb, hc, hd, seed, ft, fw);
  }
}

function decorateTile(type, i, j, x0, z0, x1, z1, ha, hb, hc, hd, seed, ft, fw) {
  const lw = clamp(36 / (fw + 6), 0.6, 2);
  if (type === T.GRASS || type === T.LAWN || type === T.WOODS) {
    ctx.strokeStyle = type === T.WOODS ? 'rgba(20,26,16,0.28)' : 'rgba(40,60,24,0.22)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const u = hash2(i * 5 + k, j * 3 + 1), v = hash2(i * 3 + 2, j * 7 + k);
      const x = x0 + u * TILE, z = z0 + v * TILE, y = (ha + hb + hc + hd) / 4;
      toView(x, y, z, 0); toView(x + 0.3, y + 0.5, z, 3);
      if (vb[2] > NEAR && vb[5] > NEAR) {
        ctx.moveTo(cam.cx + (vb[0] / vb[2]) * cam.focal, cam.cy - (vb[1] / vb[2]) * cam.focal);
        ctx.lineTo(cam.cx + (vb[3] / vb[5]) * cam.focal, cam.cy - (vb[4] / vb[5]) * cam.focal);
      }
    }
    ctx.stroke();
  } else if (type === T.ROAD) {
    const dir = world.roadDir[j * N + i];
    if (dir === 1 || dir === 2) {
      const dash = dir === 1 ? i % 2 === 0 : j % 2 === 0;
      const lane = dir === 1 ? (((z0 / TILE) | 0) % 12 === 5 || ((z0 / TILE) | 0) % 12 === 1) : (((x0 / TILE) | 0) % 12 === 5 || ((x0 / TILE) | 0) % 12 === 1);
      if (dash && lane) {
        const y = (ha + hb + hc + hd) / 4 + 0.03;
        if (dir === 1) {
          const zz = (((z0 / TILE) | 0) % 12 === 1) ? z0 : z1;
          quad(x0 + 0.6, y, zz - 0.15, x1 - 0.6, y, zz - 0.15, x1 - 0.6, y, zz + 0.15, x0 + 0.6, y, zz + 0.15, sh([230, 205, 110], 1, ft), false);
        } else {
          const xx = (((x0 / TILE) | 0) % 12 === 1) ? x0 : x1;
          quad(xx - 0.15, y, z0 + 0.6, xx + 0.15, y, z0 + 0.6, xx + 0.15, y, z1 - 0.6, xx - 0.15, y, z1 - 0.6, sh([230, 205, 110], 1, ft), false);
        }
      }
    }
  } else if (type === T.SIDEWALK) {
    ctx.strokeStyle = 'rgba(60,50,40,0.22)'; ctx.lineWidth = lw;
    toView(x0, ha, z0, 0); toView(x1, hb, z0, 3); toView(x1, hc, z1, 6);
    if (vb[2] > NEAR && vb[5] > NEAR && vb[8] > NEAR) {
      ctx.beginPath();
      ctx.moveTo(cam.cx + (vb[3] / vb[5]) * cam.focal, cam.cy - (vb[4] / vb[5]) * cam.focal);
      ctx.lineTo(cam.cx + (vb[6] / vb[8]) * cam.focal, cam.cy - (vb[7] / vb[8]) * cam.focal);
      ctx.stroke();
    }
  } else if (type === T.WATER && fw < 30) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = lw;
    const y = -0.28, x = x0 + seed * 3, z = z0 + ((seed * 7) % 1) * 3;
    toView(x, y, z, 0); toView(x + 1.4, y, z, 3);
    if (vb[2] > NEAR && vb[5] > NEAR) {
      ctx.beginPath();
      ctx.moveTo(cam.cx + (vb[0] / vb[2]) * cam.focal, cam.cy - (vb[1] / vb[2]) * cam.focal);
      ctx.lineTo(cam.cx + (vb[3] / vb[5]) * cam.focal, cam.cy - (vb[4] / vb[5]) * cam.focal);
      ctx.stroke();
    }
  }
}

function drawPuddles(G) {
  if (G.wet < 0.1) return;
  for (const p of G.puddles) {
    const fw = (p.x - cam.x) * cam.fx + (p.z - cam.z) * cam.fz;
    if (fw < 1 || fw > 70) continue;
    toView(p.x, groundH(p.x, p.z) + 0.05, p.z, 0);
    const d = vb[2];
    if (d < NEAR) continue;
    const X = cam.cx + (vb[0] / d) * cam.focal, Y = cam.cy - (vb[1] / d) * cam.focal;
    const rx = (p.r / d) * cam.focal;
    ctx.fillStyle = 'rgba(' + (96 * L.tint[0] | 0) + ',' + (140 * L.tint[1] | 0) + ',' + (170 * L.tint[2] | 0) + ',' + 0.7 * Math.min(1, G.wet) + ')';
    ctx.beginPath(); ctx.ellipse(X, Y, rx, rx * Math.sin(cam.pitch) * 0.9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(29,26,26,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  }
}

// ---------------------------------------------------------------- statics
function visible(s) {
  if (!s.ev) return true;
  const v = world.ev[s.ev];
  return s.evVal === undefined ? !!v : v === s.evVal;
}

function drawBox(b, d) {
  const c = b.c, ft = fogT(d);
  const near = d < 40;
  ctx.strokeStyle = inkS(ft);
  ctx.lineWidth = clamp(46 / (d + 6), 0.8, 2.6);
  ctx.lineJoin = 'round';
  const { x0, y0, z0, x1, y1, z1 } = b;
  if (cam.y > y1) quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, sh(b.roofC || c, L.kTop * (b.roof ? 0.9 : 1), ft), true);
  const sh0 = b.floor ? 1.05 : 1;
  if (cam.z < z0) { quad(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, sh(c, L.kZm * sh0, ft), true); decals(b, 'n', ft); if (near && b.house) siding(b, 'n', ft); }
  if (cam.z > z1) { quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, sh(c, L.kZp * sh0, ft), true); decals(b, 's', ft); if (near && b.house) siding(b, 's', ft); }
  if (cam.x < x0) { quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, sh(c, L.kXm * sh0, ft), true); decals(b, 'w', ft); if (near && b.house) siding(b, 'w', ft); }
  if (cam.x > x1) { quad(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, sh(c, L.kXp * sh0, ft), true); decals(b, 'e', ft); if (near && b.house) siding(b, 'e', ft); }
}

function siding(b, f, ft) {
  if (!b.y0 && b.y0 !== 0) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(29,26,26,' + (0.12 * (1 - ft)) + ')';
  ctx.lineWidth = 1;
  for (let y = b.y0 + 1.1; y < b.y1 - 0.4; y += 1.1) {
    if (f === 'n' || f === 's') {
      const z = f === 'n' ? b.z0 : b.z1;
      toView(b.x0, y, z, 0); toView(b.x1, y, z, 3);
    } else {
      const x = f === 'w' ? b.x0 : b.x1;
      toView(x, y, b.z0, 0); toView(x, y, b.z1, 3);
    }
    if (vb[2] > NEAR && vb[5] > NEAR) {
      ctx.beginPath();
      ctx.moveTo(cam.cx + (vb[0] / vb[2]) * cam.focal, cam.cy - (vb[1] / vb[2]) * cam.focal);
      ctx.lineTo(cam.cx + (vb[3] / vb[5]) * cam.focal, cam.cy - (vb[4] / vb[5]) * cam.focal);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function decals(b, f, ft) {
  const ds = b.decals;
  if (!ds || ft > 0.6) return;
  const prevS = ctx.strokeStyle, prevW = ctx.lineWidth;
  for (const d of ds) {
    if (d.f !== f) continue;
    const e = 0.04;
    let fill;
    if (d.glow && L.glow > 0.2) fill = 'rgb(' + (255) + ',' + (205 + 20 * (1 - L.glow) | 0) + ',' + (110 + 60 * (1 - L.glow) | 0) + ')';
    else fill = sh(d.c, d.glow ? L.amb * 1.4 : L.amb + 0.15, ft);
    if (f === 'n') quad(d.u0, d.v0, b.z0 - e, d.u1, d.v0, b.z0 - e, d.u1, d.v1, b.z0 - e, d.u0, d.v1, b.z0 - e, fill, true);
    else if (f === 's') quad(d.u0, d.v0, b.z1 + e, d.u1, d.v0, b.z1 + e, d.u1, d.v1, b.z1 + e, d.u0, d.v1, b.z1 + e, fill, true);
    else if (f === 'w') quad(b.x0 - e, d.v0, d.u0, b.x0 - e, d.v0, d.u1, b.x0 - e, d.v1, d.u1, b.x0 - e, d.v1, d.u0, fill, true);
    else quad(b.x1 + e, d.v0, d.u0, b.x1 + e, d.v0, d.u1, b.x1 + e, d.v1, d.u1, b.x1 + e, d.v1, d.u0, fill, true);
  }
  ctx.strokeStyle = prevS; ctx.lineWidth = prevW;
}

function drawGable(s, d) {
  const ft = fogT(d), c = s.c;
  ctx.strokeStyle = inkS(ft);
  ctx.lineWidth = clamp(46 / (d + 6), 0.8, 2.6);
  const { x0, x1, z0, z1, y0, y1 } = s;
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
  if (s.ridgeX) {
    const run = (z1 - z0) / 2, rise = y1 - y0, nl = Math.hypot(run, rise);
    const kN = L.amb + L.diff * Math.max(0, (run * L.dir[1] - rise * L.dir[2]) / nl);
    const kS = L.amb + L.diff * Math.max(0, (run * L.dir[1] + rise * L.dir[2]) / nl);
    const farS = cam.z < zm;
    const sl = (south) => south
      ? quad(x0, y0, z1, x1, y0, z1, x1, y1, zm, x0, y1, zm, sh(c, kS, ft), true)
      : quad(x0, y0, z0, x1, y0, z0, x1, y1, zm, x0, y1, zm, sh(c, kN, ft), true);
    sl(farS); sl(!farS);
    const gc = sh([200, 190, 170], L.kXm, ft);
    if (cam.x < x0) tri(x0, y0, z0, x0, y0, z1, x0, y1, zm, gc, true);
    if (cam.x > x1) tri(x1, y0, z0, x1, y0, z1, x1, y1, zm, sh([200, 190, 170], L.kXp, ft), true);
  } else {
    const run = (x1 - x0) / 2, rise = y1 - y0, nl = Math.hypot(run, rise);
    const kW = L.amb + L.diff * Math.max(0, (run * L.dir[1] - rise * L.dir[0]) / nl);
    const kE = L.amb + L.diff * Math.max(0, (run * L.dir[1] + rise * L.dir[0]) / nl);
    const farE = cam.x < xm;
    const sl = (east) => east
      ? quad(x1, y0, z0, x1, y0, z1, xm, y1, z1, xm, y1, z0, sh(c, kE, ft), true)
      : quad(x0, y0, z0, x0, y0, z1, xm, y1, z1, xm, y1, z0, sh(c, kW, ft), true);
    sl(farE); sl(!farE);
    if (cam.z < z0) tri(x0, y0, z0, x1, y0, z0, xm, y1, z0, sh([200, 190, 170], L.kZm, ft), true);
    if (cam.z > z1) tri(x0, y0, z1, x1, y0, z1, xm, y1, z1, sh([200, 190, 170], L.kZp, ft), true);
  }
}

function circle(X, Y, r, fill, lw, ft) {
  ctx.beginPath(); ctx.arc(X, Y, Math.max(r, 0.5), 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (lw > 0) { ctx.strokeStyle = inkS(ft); ctx.lineWidth = lw; ctx.stroke(); }
}

function drawTree(s, d) {
  const ft = fogT(d);
  const sc = s.s;
  const y = s.y;
  const lw = clamp(40 / (d + 5), 0.6, 2.2);
  ctx.lineCap = 'round';
  const p = [0, 0], p2 = [0, 0];
  const dd = projectPoint(s.x, y, s.z, p);
  if (dd < NEAR) return;
  const pxu = cam.focal / dd; // pixels per unit at this depth
  const trunkH = (s.kind === 'pine' ? 2.2 : 2.6) * sc;
  projectPoint(s.x, y + trunkH, s.z, p2);
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = 0.7 * sc * pxu + lw * 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
  ctx.strokeStyle = sh([96, 70, 50], L.amb + 0.2, ft); ctx.lineWidth = 0.7 * sc * pxu; ctx.stroke();
  if (s.kind === 'pine') {
    const cols = [[36, 66, 46], [46, 82, 56], [40, 74, 50]];
    for (let t = 0; t < 3; t++) {
      const by = y + (1.5 + t * 1.9) * sc, r = (2.5 - t * 0.55) * sc, ty = by + 2.6 * sc;
      const bp = [0, 0], tp = [0, 0];
      const d1 = projectPoint(s.x, by, s.z, bp), d2 = projectPoint(s.x, ty, s.z, tp);
      if (d1 < NEAR || d2 < NEAR) continue;
      const rx = (r / d1) * cam.focal, ry = rx * Math.sin(cam.pitch) * 0.9;
      const col = sh(cols[t], L.amb + L.diff * 0.5, ft);
      ctx.beginPath();
      ctx.moveTo(tp[0], tp[1]);
      ctx.lineTo(bp[0] - rx, bp[1]);
      ctx.quadraticCurveTo(bp[0], bp[1] + ry * 2, bp[0] + rx, bp[1]);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = inkS(ft); ctx.lineWidth = lw; ctx.stroke();
      if (L.winter > 0.3) { ctx.fillStyle = 'rgba(240,244,250,' + 0.5 * L.winter + ')'; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(tp[0] - rx * 0.5, tp[1] + (bp[1] - tp[1]) * 0.45); ctx.lineTo(tp[0] + rx * 0.5, tp[1] + (bp[1] - tp[1]) * 0.45); ctx.fill(); }
    }
  } else {
    const lc = s.kind === 'maple' ? L.leaf.maple : L.leaf.oak;
    const bare = L.winter > 0.4;
    const blobs = [[0, 3.6, 0, 1.9], [-1.2, 3.1, 0.6, 1.4], [1.2, 3.2, -0.4, 1.5], [0, 4.5, 0.2, 1.3]];
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const bp = [0, 0];
      const dd2 = projectPoint(s.x + b[0] * sc, y + b[1] * sc, s.z + b[2] * sc, bp);
      if (dd2 < NEAR) continue;
      const r = (b[3] * sc / dd2) * cam.focal;
      const col = [lc[0] * (0.9 + 0.1 * i), lc[1] * (0.9 + 0.1 * i), lc[2] * (0.9 + 0.05 * i)];
      ctx.globalAlpha = bare ? 0.28 : 1;
      circle(bp[0], bp[1], r, sh(col, L.amb + L.diff * (0.4 + 0.15 * i), ft), lw, ft);
    }
    ctx.globalAlpha = 1;
  }
}

function drawBush(s, d) {
  const ft = fogT(d);
  const p = [0, 0];
  const dd = projectPoint(s.x, s.y + 0.6 * s.s, s.z, p);
  if (dd < NEAR) return;
  const r = (1.1 * s.s / dd) * cam.focal;
  const lw = clamp(40 / (d + 5), 0.6, 2);
  const col = s.berry ? [46, 70, 46] : [78, 112, 58];
  circle(p[0] - r * 0.45, p[1] + r * 0.1, r * 0.8, sh(col, L.amb + 0.1, ft), lw, ft);
  circle(p[0] + r * 0.4, p[1] + r * 0.05, r * 0.85, sh(col, L.amb + L.diff * 0.4, ft), lw, ft);
  circle(p[0], p[1] - r * 0.35, r * 0.85, sh(col, L.amb + L.diff * 0.6, ft), lw, ft);
  if (s.berry && s.food > 0 && d < 60) {
    ctx.fillStyle = sh([90, 34, 110], 1.1, ft);
    for (let i = 0; i < 6; i++) {
      const a = hash2(i, (s.seed * 1000) | 0) * TAU, rr2 = hash2(i + 9, (s.seed * 1000) | 0);
      ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * r * 0.9 * rr2, p[1] - r * 0.3 + Math.sin(a) * r * 0.6 * rr2, Math.max(1, r * 0.1), 0, TAU); ctx.fill();
    }
  }
}

function drawSign(s, d) {
  if (d > 62) return;
  const p = [0, 0];
  const dd = projectPoint(s.x, s.y, s.z, p);
  if (dd < NEAR) return;
  const size = clamp((1.3 / dd) * cam.focal, 8, 22);
  ctx.font = 'bold ' + size + 'px Georgia, serif';
  const w = ctx.measureText(s.text).width + 12;
  ctx.globalAlpha = 1 - fogT(d) * 0.9;
  ctx.fillStyle = 'rgba(244,239,228,0.92)';
  ctx.strokeStyle = 'rgba(29,26,26,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(p[0] - w / 2, p[1] - size * 0.85, w, size * 1.5, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a2a22';
  ctx.textAlign = 'center';
  ctx.fillText(s.text, p[0], p[1] + size * 0.28);
  ctx.globalAlpha = 1;
}

function drawLamp(s, d) {
  const ft = fogT(d);
  const p = [0, 0], p2 = [0, 0];
  const d1 = projectPoint(s.x, s.y, s.z, p), d2 = projectPoint(s.x, s.y + 5, s.z, p2);
  if (d1 < NEAR || d2 < NEAR) return;
  ctx.lineCap = 'round';
  const w = Math.max(1.5, (0.25 / d1) * cam.focal);
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
  ctx.strokeStyle = sh([70, 74, 70], L.amb + 0.2, ft); ctx.lineWidth = w; ctx.stroke();
  const r = (0.45 / d2) * cam.focal;
  circle(p2[0], p2[1], r, L.glow > 0.3 ? 'rgb(255,226,150)' : sh([220, 220, 200], 1, ft), 1, ft);
  if (L.glow > 0.3 && d < 80) {
    const g = ctx.createRadialGradient(p2[0], p2[1], 0, p2[0], p2[1], r * 9);
    g.addColorStop(0, 'rgba(255,214,130,' + 0.4 * L.glow * (1 - ft) + ')');
    g.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p2[0] - r * 9, p2[1] - r * 9, r * 18, r * 18);
  }
}

function drawRock(s, d) {
  const p = [0, 0];
  const dd = projectPoint(s.x, s.y + 0.4 * s.s, s.z, p);
  if (dd < NEAR) return;
  const ft = fogT(d), r = (1.2 * s.s / dd) * cam.focal;
  ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * 0.7, 0, 0, TAU);
  ctx.fillStyle = sh([120, 116, 110], L.amb + 0.2, ft); ctx.fill();
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = 1.5; ctx.stroke();
}

function drawBin(s, d) {
  const b = s.bin;
  const y = s.y;
  const o = s.o || (s.o = { c: b.dumpster ? [64, 98, 76] : [72, 84, 96], house: false });
  if (b.dumpster) { o.x0 = s.x - 1.6; o.x1 = s.x + 1.6; o.z0 = s.z - 0.96; o.z1 = s.z + 0.96; o.y0 = y; o.y1 = y + 1.5; }
  else if (b.tipped) { o.x0 = s.x - 0.7; o.x1 = s.x + 0.7; o.z0 = s.z - 0.35; o.z1 = s.z + 0.35; o.y0 = y; o.y1 = y + 0.7; }
  else { o.x0 = s.x - 0.5; o.x1 = s.x + 0.5; o.z0 = s.z - 0.5; o.z1 = s.z + 0.5; o.y0 = y; o.y1 = y + 1.2; }
  drawBox(o, d);
  if (b.tipped && b.food > 0) {
    const p = [0, 0];
    if (projectPoint(s.x + 1.2, y + 0.15, s.z, p) > NEAR) { ctx.fillStyle = 'rgb(200,160,90)'; ctx.fillRect(p[0] - 3, p[1] - 2, 6, 4); }
  }
}

function drawBlanket(s, d) {
  const ft = fogT(d), y = s.y + 0.04;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const c = (i + j) % 2 ? [200, 90, 80] : [236, 228, 210];
    quad(s.x - 2 + i, y, s.z - 2 + j, s.x - 1 + i, y, s.z - 2 + j, s.x - 1 + i, y, s.z - 1 + j, s.x - 2 + i, y, s.z - 1 + j, sh(c, L.kTop, ft), false);
  }
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = 1.5;
  quad(s.x - 2, y, s.z - 2, s.x + 2, y, s.z - 2, s.x + 2, y, s.z + 2, s.x - 2, y, s.z + 2, null, true);
  const o = s.o || (s.o = { c: [150, 110, 70], house: false, x0: s.x - 0.4, x1: s.x + 0.4, z0: s.z - 0.4, z1: s.z + 0.4, y0: s.y, y1: s.y + 0.7 });
  drawBox(o, d);
}

function drawDoor(s, d) {
  const sh0 = s.shop;
  const x0 = sh0.doorX0, x1 = sh0.doorX1, base = sh0.base;
  const z = sh0.face === 's' ? sh0.z1 - 0.4 : sh0.z0 + 0.4;
  const ft = fogT(d);
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = 1.5;
  const glass = sh([150, 190, 210], L.amb + 0.25, ft);
  ctx.globalAlpha = 0.55;
  if (!sh0.open) quad(x0, base, z, x1, base, z, x1, base + 4.6, z, x0, base + 4.6, z, glass, true);
  else {
    quad(x0, base, z, x0 + 0.9, base, z, x0 + 0.9, base + 4.6, z, x0, base + 4.6, z, glass, true);
    quad(x1 - 0.9, base, z, x1, base, z, x1, base + 4.6, z, x1 - 0.9, base + 4.6, z, glass, true);
  }
  ctx.globalAlpha = 1;
}

function drawBridge(s, d) {
  const ft = fogT(Math.max(0, d - 20));
  const xl = 193, xr = 207, hinge = 16, yb = 1.3;
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = 1.5;
  const steel = [112, 90, 70], rail = [160, 52, 44];
  // fixed deck from far north up to the leaf's far end
  quad(xl, yb, -150, xr, yb, -150, xr, yb, -24, xl, yb, -24, sh(steel, L.kTop, ft), true);
  quad(xl, yb - 0.8, -24, xr, yb - 0.8, -24, xr, yb, -24, xl, yb, -24, sh([80, 64, 50], L.kZp, ft), true);
  for (const x of [xl, xr]) {
    quad(x, yb, -150, x, yb, -24, x, yb + 1.2, -24, x, yb + 1.2, -150, sh(rail, L.kXp, ft), true);
  }
  // towers
  for (const x of [xl - 1.5, xr + 0.5]) {
    const o = { x0: x, x1: x + 1, z0: -30, z1: -29, y0: -1, y1: 18, c: [150, 70, 56] };
    drawBox(o, d);
  }
  // raised leaf (hinged at the shore)
  const ang = world.bridgeAng ?? 1.25, len = 40;
  const ez = hinge - Math.cos(ang) * len, ey = yb + Math.sin(ang) * len;
  quad(xl, yb, hinge, xr, yb, hinge, xr, ey, ez, xl, ey, ez, sh(steel, 0.85, ft), true);
  for (const x of [xl, xr]) quad(x, yb, hinge, x, yb + 1.2, hinge, x, ey + 1.2, ez, x, ey, ez, sh(rail, L.kXp, ft), true);
  // approach road stub
  quad(xl, yb, hinge, xr, yb, hinge, xr, yb, 20, xl, yb, 20, sh([92, 92, 96], L.kTop, ft), true);
}

// ---------------------------------------------------------------- entities
const pv = [];
export function drawRigParts(e, parts, ft, k, lw) {
  const sinH = Math.sin(e.h), cosH = Math.cos(e.h);
  const fx = sinH, fz = -cosH, rx = cosH, rz = sinH;
  const sc = e.scale || 1;
  pv.length = 0;
  for (const p of parts) {
    if (p.k === 'b') {
      const f = p.f * sc, u = p.u * sc, s = p.s * sc;
      const x = e.x + fx * f + rx * s, z = e.z + fz * f + rz * s, y = e.y + u;
      toView(x, y, z, 0);
      pv.push({ d: vb[2], p, X: vb[0], Y: vb[1] });
    } else {
      const f1 = p.f1 * sc, u1 = p.u1 * sc, s1 = p.s1 * sc, f2 = p.f2 * sc, u2 = p.u2 * sc, s2 = p.s2 * sc;
      toView(e.x + fx * f1 + rx * s1, e.y + u1, e.z + fz * f1 + rz * s1, 0);
      toView(e.x + fx * f2 + rx * s2, e.y + u2, e.z + fz * f2 + rz * s2, 3);
      pv.push({ d: (vb[2] + vb[5]) / 2, p, a: [vb[0], vb[1], vb[2]], b: [vb[3], vb[4], vb[5]] });
    }
  }
  pv.sort((a, b) => b.d - a.d);
  ctx.lineCap = 'round';
  const ink = inkS(ft);
  for (const q of pv) {
    const p = q.p;
    const col = sh(p.c, k * (p.lit || 1), ft);
    if (p.k === 'b') {
      if (q.d < NEAR) continue;
      const r = ((p.r * sc) / q.d) * cam.focal;
      const X = cam.cx + (q.X / q.d) * cam.focal, Y = cam.cy - (q.Y / q.d) * cam.focal;
      ctx.beginPath(); ctx.arc(X, Y, Math.max(r, 0.6), 0, TAU);
      ctx.fillStyle = col; ctx.fill();
      if (r > 3) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.arc(X - r * 0.3, Y - r * 0.3, r * 0.5, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(lw, r * 0.12);
      ctx.beginPath(); ctx.arc(X, Y, Math.max(r, 0.6), 0, TAU); ctx.stroke();
    } else {
      if (q.a[2] < NEAR || q.b[2] < NEAR) continue;
      const w = Math.max(1.2, ((p.w * sc) / q.d) * cam.focal);
      const ax = cam.cx + (q.a[0] / q.a[2]) * cam.focal, ay = cam.cy - (q.a[1] / q.a[2]) * cam.focal;
      const bx = cam.cx + (q.b[0] / q.b[2]) * cam.focal, by = cam.cy - (q.b[1] / q.b[2]) * cam.focal;
      ctx.strokeStyle = ink; ctx.lineWidth = w + lw * 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.stroke();
    }
  }
}

function vehBoxes(e) {
  const v = e.vb || (e.vb = { body: { c: e.col, house: false }, cab: { c: [200, 215, 225], house: false }, wheels: [0, 1, 2, 3].map(() => ({ c: [30, 30, 32], house: false })), light: { c: [255, 240, 180], house: false }, bar: { c: [210, 40, 50], house: false }, bar2: { c: [40, 80, 220], house: false } });
  const alongX = e.axis === 'x';
  const len = e.len, wid = e.wid, hgt = e.hgt;
  const hx = alongX ? len / 2 : wid / 2, hz = alongX ? wid / 2 : len / 2;
  const y = e.y;
  const B = v.body;
  B.x0 = e.x - hx; B.x1 = e.x + hx; B.z0 = e.z - hz; B.z1 = e.z + hz; B.y0 = y + 0.35; B.y1 = y + hgt * 0.62;
  const C = v.cab;
  const cl = e.kind === 'bus' ? 0.96 : 0.55, cw = 0.86;
  const chx = alongX ? hx * cl : hx * cw, chz = alongX ? hz * cw : hz * cl;
  const off = e.kind === 'bus' ? 0 : alongX ? -hx * 0.1 * e.dirSign : 0;
  const offz = e.kind === 'bus' ? 0 : alongX ? 0 : -hz * 0.1 * e.dirSign;
  C.x0 = e.x - chx + off; C.x1 = e.x + chx + off; C.z0 = e.z - chz + offz; C.z1 = e.z + chz + offz; C.y0 = B.y1; C.y1 = y + hgt;
  C.c = e.kind === 'bus' ? [150, 190, 205] : [185, 205, 215];
  v.wheels.forEach((w, i) => {
    const a = i % 2 ? 1 : -1, b = i < 2 ? 1 : -1;
    const wx = alongX ? e.x + a * hx * 0.62 : e.x + b * hx * 1.0, wz = alongX ? e.z + b * hz * 1.0 : e.z + a * hz * 0.62;
    w.x0 = wx - (alongX ? 0.42 : 0.12); w.x1 = wx + (alongX ? 0.42 : 0.12); w.z0 = wz - (alongX ? 0.12 : 0.42); w.z1 = wz + (alongX ? 0.12 : 0.42); w.y0 = y; w.y1 = y + 0.8;
  });
  return v;
}

function drawVehicle(e, d) {
  const ft = fogT(d);
  const v = vehBoxes(e);
  if (e.kind === 'bike' || e.kind === 'scooter') return;
  for (const w of v.wheels) drawBox(w, d);
  drawBox(v.body, d);
  drawBox(v.cab, d);
  if (e.cop) {
    const on = Math.floor(tt * 6) % 2;
    const bar = on ? v.bar : v.bar2;
    const cx = e.x, cz = e.z;
    bar.x0 = cx - 0.5; bar.x1 = cx + 0.5; bar.z0 = cz - 0.5; bar.z1 = cz + 0.5; bar.y0 = v.cab.y1; bar.y1 = v.cab.y1 + 0.3;
    drawBox(bar, d);
  }
  if (L.glow > 0.35 && d < 70) {
    const p = [0, 0];
    const fx = e.axis === 'x' ? e.dirSign : 0, fz = e.axis === 'z' ? e.dirSign : 0;
    const dd = projectPoint(e.x + fx * e.len / 2, e.y + 0.8, e.z + fz * e.len / 2, p);
    if (dd > NEAR) {
      const r = (1.2 / dd) * cam.focal * 2;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      g.addColorStop(0, 'rgba(255,240,180,' + 0.5 * L.glow + ')'); g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    }
  }
}

function drawShadow(e, ft) {
  const r = (e.r || 0.6) * 1.2 * (e.scale || 1);
  const alt = e.alt || 0;
  const p = [0, 0];
  const y = groundH(e.x, e.z);
  const d = projectPoint(e.x, y + 0.04, e.z, p);
  if (d < NEAR) return;
  const rx = (r / d) * cam.focal;
  ctx.fillStyle = 'rgba(20,16,24,' + (0.28 * (1 - ft) * (1 - Math.min(0.6, alt * 0.05))) + ')';
  ctx.beginPath(); ctx.ellipse(p[0], p[1], rx, rx * Math.sin(cam.pitch) * 0.85, 0, 0, TAU); ctx.fill();
}

function drawEntity(e, d) {
  const ft = fogT(d);
  if (e.axis) { drawVehicle(e, d); return; }
  const parts = rigFor(e, tt);
  if (!parts) return;
  const k = (L.amb + L.diff * 0.55) * (e.hurt > 0 ? 1.5 : 1);
  drawRigParts(e, parts, ft, k, clamp(34 / (d + 5), 0.8, 2.2));
}

function drawItem(it, d) {
  const ft = fogT(d), y = groundH(it.x, it.z);
  const p = [0, 0];
  const dd = projectPoint(it.x, y + 0.3, it.z, p);
  if (dd < NEAR) return;
  const u = cam.focal / dd;
  const lw = clamp(34 / (d + 5), 0.8, 2);
  ctx.strokeStyle = inkS(ft); ctx.lineWidth = lw;
  const blob = (dx, dy, r, c) => { ctx.beginPath(); ctx.arc(p[0] + dx * u, p[1] + dy * u, Math.max(1, r * u), 0, TAU); ctx.fillStyle = sh(c, L.amb + 0.3, ft); ctx.fill(); ctx.stroke(); };
  switch (it.kind) {
    case 'bag': {
      ctx.fillStyle = sh([186, 142, 84], L.amb + 0.3, ft);
      ctx.beginPath(); ctx.roundRect(p[0] - 0.45 * u, p[1] - 0.9 * u, 0.9 * u, 1.1 * u, 2); ctx.fill(); ctx.stroke();
      blob(0.15, -1.0, 0.25, [150, 190, 90]);
      break;
    }
    case 'ripped': blob(-0.2, 0, 0.35, [186, 142, 84]); blob(0.25, 0.05, 0.3, [214, 100, 70]); blob(0, -0.3, 0.3, [230, 190, 90]); break;
    case 'carcass': blob(0, 0, 0.45, it.col || [120, 94, 74]); blob(0.4, -0.1, 0.25, [90, 70, 56]); break;
    case 'scraps': blob(-0.2, 0, 0.2, [200, 180, 120]); blob(0.2, 0, 0.22, [170, 90, 70]); break;
    case 'treat': blob(0, -0.2, 0.3, [230, 190, 110]); if (d < 40) { ctx.fillStyle = 'rgba(255,230,150,' + (0.4 + 0.3 * Math.sin(tt * 4)) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1] - 0.2 * u, 0.7 * u, 0, TAU); ctx.fill(); } break;
    case 'crate': blob(-0.25, -0.1, 0.3, [190, 80, 60]); blob(0.25, -0.1, 0.3, [220, 170, 60]); blob(0, -0.5, 0.3, [110, 160, 80]); break;
    case 'coffee': blob(0, -0.3, 0.3, [240, 236, 226]); blob(0, -0.55, 0.22, [92, 60, 40]); break;
    case 'produce': blob(-0.2, -0.1, 0.28, [196, 70, 56]); blob(0.2, -0.1, 0.28, [126, 160, 70]); blob(0, -0.4, 0.28, [226, 150, 50]); break;
    default: blob(0, 0, 0.3, [200, 180, 120]);
  }
}

// ---------------------------------------------------------------- main frame
export function draw(c, G, W, H, dt) {
  ctx = c;
  tt += dt;
  computeLight(G);
  drawSky(G, W, H);
  drawGround(G, W, H);
  drawPuddles(G);

  // gather drawables
  items.length = 0;
  const tanH = (W / 2) / cam.focal + 0.2;
  const viewD = (G.quality === 'low' ? 82 : 112);
  const ci = Math.floor(cam.x / CELL), cj = Math.floor(cam.z / CELL);
  const cr = Math.ceil(viewD / CELL) + 1;
  for (let j = cj - cr; j <= cj + cr; j++) for (let i = ci - cr; i <= ci + cr; i++) {
    if (i < 0 || j < 0 || i >= CELLS || j >= CELLS) continue;
    for (const s of world.cells[j * CELLS + i]) {
      const dx = s.x - cam.x, dz = s.z - cam.z;
      const fw = dx * cam.fx + dz * cam.fz, rad = s.rad || 1;
      if (fw + rad < 0 || fw - rad > viewD) continue;
      if (Math.abs(dx * cam.rx + dz * cam.rz) - rad > fw * tanH + 6) continue;
      if (s.ev && !visible(s)) continue;
      if (s.shop && s.shop.inside && (s.roof || s.front)) continue;
      let key = fw;
      if (s.t === 'box') {
        if (s.floor) key = 1e5;
        else { const px = clamp(cam.x, s.x0, s.x1), pz = clamp(cam.z, s.z0, s.z1); key = (px - cam.x) * cam.fx + (pz - cam.z) * cam.fz; if (s.roof) key -= 0.5; }
      } else if (s.t === 'gable') { const px = clamp(cam.x, s.x0, s.x1), pz = clamp(cam.z, s.z0, s.z1); key = (px - cam.x) * cam.fx + (pz - cam.z) * cam.fz - 0.4; }
      items.push({ k: key, t: 0, s, fw });
    }
  }
  for (const s of world.special) {
    const fw = (s.x - cam.x) * cam.fx + (s.z - cam.z) * cam.fz;
    if (fw > -60 && fw < 190) items.push({ k: fw + 40, t: 0, s, fw: clamp(fw - 30, 8, 90) });
  }
  const ents = G.ents;
  for (const e of ents) {
    if (e.hidden) continue;
    const dx = e.x - cam.x, dz = e.z - cam.z;
    const fw = dx * cam.fx + dz * cam.fz;
    if (fw < -3 || fw > viewD) continue;
    if (Math.abs(dx * cam.rx + dz * cam.rz) > fw * tanH + 8) continue;
    items.push({ k: e.axis ? fw - 0.3 : fw, t: 1, s: e, fw });
  }
  for (const dd of G.darts) {
    const e = dd.ent, fw = (e.x - cam.x) * cam.fx + (e.z - cam.z) * cam.fz;
    if (fw > 0 && fw < viewD) items.push({ k: fw, t: 1, s: e, fw });
  }
  for (const it of G.items) {
    const fw = (it.x - cam.x) * cam.fx + (it.z - cam.z) * cam.fz;
    if (fw < -2 || fw > 85) continue;
    items.push({ k: fw + 0.2, t: 2, s: it, fw });
  }
  items.sort((a, b) => b.k - a.k);

  // shadows first
  for (const q of items) if (q.t === 1 && !q.s.axis && q.s.kind !== 'crow') drawShadow(q.s, fogT(q.fw));
  for (const q of items) {
    const s = q.s;
    if (q.t === 1) { drawEntity(s, q.fw); continue; }
    if (q.t === 2) { drawItem(s, q.fw); continue; }
    const d = Math.max(1, q.fw);
    if (d > 14 && (s.t === 'tree' || s.t === 'bush' || s.t === 'rock' || s.t === 'bin' || s.t === 'lamp') && hiddenByTerrain(s, d)) continue;
    switch (s.t) {
      case 'box': drawBox(s, d); break;
      case 'gable': drawGable(s, d); break;
      case 'tree': drawTree(s, d); break;
      case 'bush': drawBush(s, d); break;
      case 'bin': drawBin(s, d); break;
      case 'lamp': drawLamp(s, d); break;
      case 'sign': drawSign(s, d); break;
      case 'rock': drawRock(s, d); break;
      case 'blanket': drawBlanket(s, d); break;
      case 'door': drawDoor(s, d); break;
      case 'bridge': drawBridge(s, d); break;
    }
  }
  drawLabels(G);
  drawWeather(G, W, H, dt);
  drawOverlay(G, W, H);
}

// Painter's order draws props over all terrain, so props behind a crest need an explicit line-of-sight test.
function hiddenByTerrain(s, d) {
  const ty = (s.y ?? groundH(s.x, s.z)) + 4 * (s.s || 1);
  const n = Math.min(24, Math.ceil(d / 4));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = cam.x + (s.x - cam.x) * t, z = cam.z + (s.z - cam.z) * t;
    if (groundH(x, z) > cam.y + (ty - cam.y) * t + 0.2) return true;
  }
  return false;
}

function drawLabels(G) {
  const p = [0, 0];
  ctx.textAlign = 'center';
  for (const e of G.ents) {
    if (e.hidden) continue;
    if (!e.emote && !e.label && G.focus !== e) continue;
    const dd = projectPoint(e.x, e.y + (e.top || 2), e.z, p);
    if (dd < NEAR || dd > 40) continue;
    const size = clamp((0.9 / dd) * cam.focal, 11, 26);
    if (e.emote) {
      ctx.font = size + 'px "Segoe UI Emoji", sans-serif';
      ctx.fillText(e.emote, p[0], p[1] - size * 0.6);
    }
    if (e.label && dd < 22) {
      ctx.font = 'bold ' + Math.max(10, size * 0.6) + 'px Trebuchet MS, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,28,0.8)'; ctx.strokeText(e.label, p[0], p[1]);
      ctx.fillStyle = '#f4efe4'; ctx.fillText(e.label, p[0], p[1]);
    }
    if (G.focus === e && !e.isPlayer) {
      const by = Math.sin(tt * 5) * 3;
      ctx.fillStyle = 'rgba(203,168,255,0.95)';
      ctx.strokeStyle = '#1d1a1a'; ctx.lineWidth = 2;
      const yy = p[1] - size * 1.5 + by;
      ctx.beginPath(); ctx.moveTo(p[0] - 7, yy - 10); ctx.lineTo(p[0] + 7, yy - 10); ctx.lineTo(p[0], yy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  if (G.focusItem) {
    const it = G.focusItem;
    if (projectPoint(it.x, groundH(it.x, it.z) + 1.6, it.z, p) > NEAR) {
      const by = Math.sin(tt * 5) * 3;
      ctx.fillStyle = 'rgba(255,230,150,0.95)'; ctx.strokeStyle = '#1d1a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1] - 8 + by); ctx.lineTo(p[0] + 6, p[1] - 8 + by); ctx.lineTo(p[0], p[1] + by); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // floating text (damage, +xp)
  for (const f of G.floaters) {
    if (projectPoint(f.x, f.y + (1 - f.life / f.max) * 1.5, f.z, p) > NEAR) {
      ctx.globalAlpha = clamp(f.life / (f.max * 0.4), 0, 1);
      ctx.font = 'bold 16px Trebuchet MS, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,28,0.85)'; ctx.strokeText(f.text, p[0], p[1]);
      ctx.fillStyle = f.color || '#fff'; ctx.fillText(f.text, p[0], p[1]);
      ctx.globalAlpha = 1;
    }
  }
}

function drawWeather(G, W, H, dt) {
  if (G.rain > 0.03) {
    ctx.strokeStyle = 'rgba(200,215,235,' + 0.32 * G.rain + ')';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.floor(drops.length * G.rain);
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y += dt * d.v * 1.6; d.x -= dt * 0.12;
      if (d.y > 1) { d.y -= 1.1; d.x = Math.random() * 1.2; }
      if (d.x < -0.05) d.x += 1.1;
      const x = d.x * W, y = d.y * H;
      ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16);
    }
    ctx.stroke();
  }
}

function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 200;
  const g = c.getContext('2d');
  const img = g.createImageData(200, 200);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 14;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawOverlay(G, W, H) {
  if (!grain) grain = ctx.createPattern(makeGrain(), 'repeat');
  ctx.fillStyle = grain;
  ctx.fillRect(0, 0, W, H);
  if (!vignette || vigW !== W || vigH !== H) {
    vigW = W; vigH = H;
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vignette.addColorStop(0, 'rgba(24,12,40,0)');
    vignette.addColorStop(1, 'rgba(24,12,40,0.45)');
  }
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  const dim = G.dim || 0;
  if (dim > 0) { ctx.fillStyle = 'rgba(8,6,20,' + dim + ')'; ctx.fillRect(0, 0, W, H); }
  if (G.tipsy > 0.02) {
    ctx.fillStyle = 'rgba(190,120,255,' + 0.12 * Math.min(1, G.tipsy) * (0.6 + 0.4 * Math.sin(tt * 3)) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (G.sleeping) {
    ctx.font = 'bold 40px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('💤', W / 2, H * 0.4 + Math.sin(tt * 2) * 8);
  }
}

// ---------------------------------------------------------------- minimap
let mapCanvas = null;
export function drawMinimap(mctx, G) {
  const S = mctx.canvas.width;
  if (!mapCanvas) {
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = mapCanvas.height = N;
    const g = mapCanvas.getContext('2d');
    const col = { [T.WATER]: '#4a7a92', [T.SAND]: '#d0be96', [T.GRASS]: '#7a9a56', [T.ROAD]: '#55555a', [T.SIDEWALK]: '#b9b2a4', [T.WOODS]: '#3d5a38', [T.LAWN]: '#98b866', [T.PLAZA]: '#a8957f', [T.PATH]: '#9a7a56', [T.CREEK]: '#5a9ab8' };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { g.fillStyle = col[world.tiles[j * N + i]]; g.fillRect(i, j, 1, 1); }
  }
  mctx.clearRect(0, 0, S, S);
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(mapCanvas, 0, 0, S, S);
  const k = S / (N * TILE);
  const dot = (x, z, r, c, ring) => { mctx.beginPath(); mctx.arc(x * k, z * k, r, 0, TAU); mctx.fillStyle = c; mctx.fill(); if (ring) { mctx.strokeStyle = '#1d1a1a'; mctx.lineWidth = 1; mctx.stroke(); } };
  for (const s of world.shops) dot((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, 2.6, s.kind === 'grocery' ? '#2e7d32' : '#8a5a3a', true);
  if (world.ev.market) { mctx.fillStyle = '#ff9a3c'; mctx.fillRect(194 * k, 112 * k, 12 * k, 80 * k); }
  if (world.ev.picnic >= 0 && G.knownPicnic) { const p = world.picnicSpots[world.ev.picnic]; dot(p.x, p.z, 3, '#e45a6a', true); }
  for (const e of G.ents) {
    if (e.kind === 'cop' || e.cop) dot(e.x, e.z, 2.2, '#4a7cff', true);
    else if (e.kind === 'heli') dot(e.x, e.z, 3, '#222', true);
    else if (e.pack && !e.isPlayer) dot(e.x, e.z, 2.2, '#c9a7ff', true);
    else if (e.scouted) dot(e.x, e.z, 2, '#fff', true);
  }
  const p = G.player;
  dot(p.x, p.z, 3.2, '#ffffff', true);
  mctx.strokeStyle = '#6d35b8'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(p.x * k, p.z * k); mctx.lineTo(p.x * k + Math.sin(p.h) * 8, p.z * k - Math.cos(p.h) * 8); mctx.stroke();
}
