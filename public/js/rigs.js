const B = (f, u, s, r, c, lit) => ({ k: 'b', f, u, s, r, c, lit });
const Lm = (f1, u1, s1, f2, u2, s2, w, c, lit) => ({ k: 'l', f1, u1, s1, f2, u2, s2, w, c, lit });

const NOSE = [30, 26, 28], EYE = [230, 200, 80], WHITE = [236, 232, 222];

let coyoteStyle = 'classic';
export function setCoyoteStyle(s) { coyoteStyle = s === 'natural' ? 'natural' : 'classic'; }
const coyote = (e, t) => (coyoteStyle === 'natural' && !e.sleeping ? coyoteNatural(e, t) : coyoteClassic(e, t));

// Two-segment legs with planted, lifting paws; low head and tail carriage like a trotting coyote.
function coyoteNatural(e, t) {
  const m = e.moving || 0, ph0 = e.walk;
  const fur = e.fur ? [e.fur[0] + 12, e.fur[1] - 4, e.fur[2] - 26] : [142, 128, 106];
  const back = [96, 88, 78], lt = [216, 206, 186], rust = [168, 112, 80], dk = [58, 50, 46];
  const crouch = e.crouch || 0, hu = e.headUp || 0;
  const bob = Math.abs(Math.sin(ph0 * 2)) * 0.035 * m;
  const hipU = 0.8 + bob - crouch * 0.2;
  const P = [];
  // diagonal trot: front-left + hind-right swing together
  const legs = [[0.45, 0.14, 0, 1], [0.45, -0.14, Math.PI, 1], [-0.42, 0.14, Math.PI, 0], [-0.42, -0.14, 0, 0]];
  for (const [hf, s, ph, front] of legs) {
    const a = ph0 + ph, sw = Math.sin(a) * 0.42 * m, lift = Math.max(0, Math.cos(a)) * 0.16 * m;
    const ff = hf + sw, fu = 0.03 + lift;
    const shade = s > 0 ? 1 : 0.82;
    const kf = (hf + ff) / 2 + (front ? 0.04 : -0.14), ku = (hipU - 0.05 + fu) / 2 + (front ? 0.02 : 0.06);
    P.push(Lm(hf, hipU - 0.05, s, kf, ku, s, front ? 0.13 : 0.16, fur, shade));
    P.push(Lm(kf, ku, s, ff, fu + 0.05, s, 0.08, [fur[0] * 0.8, fur[1] * 0.8, fur[2] * 0.8], shade));
    P.push(B(ff + 0.04, fu + 0.03, s, 0.065, dk, shade));
  }
  const sway = Math.sin(ph0) * 0.05 * m;
  P.push(Lm(-0.55, hipU - 0.02, 0, -1.25 - sway, 0.46 + (e.tailUp || 0) * 0.25, sway * 2, 0.22, fur));
  P.push(B(-1.3 - sway, 0.44 + (e.tailUp || 0) * 0.25, sway * 2, 0.11, dk));
  P.push(Lm(-0.48, hipU - 0.04, 0, 0.5, hipU + 0.07, 0, 0.44, fur));
  P.push(Lm(-0.48, hipU + 0.12, 0, 0.5, hipU + 0.2, 0, 0.24, back));
  P.push(Lm(-0.4, hipU - 0.2, 0, 0.45, hipU - 0.16, 0, 0.26, lt));
  P.push(B(0.5, hipU + 0.05, 0, 0.27, fur), B(-0.5, hipU - 0.02, 0, 0.25, fur));
  // ragged ruff along the spine
  for (let i = 0; i < 6; i++) {
    const f = -0.4 + i * 0.18, j = Math.sin(t * 17 + i * 3.1) * 0.02;
    P.push(B(f, hipU + 0.3 + (i % 2) * 0.04 + j, 0, 0.08, back));
  }
  const hx = 1.0 - hu * 0.15 - crouch * 0.08, hy = 0.9 + hu * 0.5 - crouch * 0.25 + bob * 0.5;
  P.push(Lm(0.55, hipU + 0.08, 0, hx - 0.05, hy - 0.02, 0, 0.26, fur));
  P.push(B(hx, hy, 0, 0.21, fur), B(hx - 0.02, hy - 0.12, 0, 0.17, lt));
  P.push(Lm(hx + 0.1, hy - 0.03 + hu * 0.04, 0, hx + 0.5, hy - 0.1 + hu * 0.3, 0, 0.12, rust), B(hx + 0.53, hy - 0.1 + hu * 0.3, 0, 0.055, dk));
  P.push(Lm(hx - 0.04, hy + 0.14, 0.1, hx - 0.2, hy + 0.52, 0.17, 0.13, rust), Lm(hx - 0.04, hy + 0.14, -0.1, hx - 0.2, hy + 0.52, -0.17, 0.13, rust));
  P.push(B(hx + 0.18, hy + 0.06, 0.1, 0.03, EYE), B(hx + 0.18, hy + 0.06, -0.1, 0.03, EYE));
  if (e.isPlayer) {
    P.push(Lm(hx - 0.03, hy + 0.22, -0.26, hx - 0.03, hy + 0.22, 0.26, 0.07, [74, 34, 130]));
    P.push(B(hx - 0.03, hy + 0.33, 0, 0.19, [109, 53, 184]));
  }
  return P;
}

function coyoteClassic(e, t) {
  const fur = e.fur || [128, 138, 142], dk = [92, 100, 106], lt = [206, 200, 188];
  const m = e.moving || 0, sw = Math.sin(e.walk) * 0.3 * m, bob = Math.abs(Math.sin(e.walk)) * 0.05 * m;
  const P = [];
  if (e.sleeping) {
    P.push(B(0, 0.34, 0, 0.5, fur), B(-0.2, 0.3, -0.3, 0.3, fur), B(0.5, 0.3, 0.3, 0.24, fur), B(0.66, 0.26, 0.4, 0.06, NOSE));
    P.push(Lm(-0.4, 0.2, 0.1, 0.1, 0.15, 0.55, 0.22, fur), Lm(0.5, 0.45, 0.2, 0.46, 0.7, 0.18, 0.09, dk), Lm(0.58, 0.45, 0.4, 0.58, 0.7, 0.42, 0.09, dk));
    if (e.isPlayer) P.push(B(0.52, 0.55, 0.3, 0.17, [109, 53, 184]));
    return P;
  }
  const crouch = e.crouch || 0;
  const hu = e.headUp || 0;
  const fy = 0.78 + bob - crouch * 0.18;
  for (const [f, s, ph] of [[0.42, 0.16, 0], [0.42, -0.16, Math.PI], [-0.4, 0.16, Math.PI], [-0.4, -0.16, 0]]) {
    const o = Math.sin(e.walk + ph) * 0.3 * m;
    P.push(Lm(f, 0.5 - crouch * 0.1, s, f + o, 0.02 + Math.max(0, Math.cos(e.walk + ph)) * 0.08 * m, s, 0.1, dk));
  }
  P.push(Lm(-0.7, 0.72 + bob, 0, -1.25, 0.46 + (e.tailUp || 0) * 0.3 + Math.sin(t * 4) * 0.04, 0.03, 0.22, fur));
  P.push(Lm(-0.42, fy - 0.05, 0, 0.42, fy, 0, 0.58, fur));
  P.push(Lm(-0.42, fy - 0.2, 0, 0.42, fy - 0.2, 0, 0.3, lt));
  P.push(B(0.45, fy, 0, 0.3, fur), B(-0.45, fy - 0.05, 0, 0.28, fur));
  const hx = 0.95 - hu * 0.12 - crouch * 0.1, hy = 1.0 + hu * 0.38 - crouch * 0.25;
  P.push(Lm(0.5, fy + 0.05, 0, hx, hy, 0, 0.3, fur));
  P.push(B(hx, hy, 0, 0.25, fur));
  P.push(Lm(hx + 0.12, hy - 0.03 + hu * 0.12, 0, hx + 0.42, hy - 0.08 + hu * 0.34, 0, 0.15, lt), B(hx + 0.45, hy - 0.08 + hu * 0.36, 0, 0.065, NOSE));
  P.push(Lm(hx - 0.07, hy + 0.15, 0.11, hx - 0.14, hy + 0.5, 0.15, 0.1, dk), Lm(hx - 0.07, hy + 0.15, -0.11, hx - 0.14, hy + 0.5, -0.15, 0.1, dk));
  P.push(B(hx + 0.2, hy + 0.08, 0.11, 0.035, EYE), B(hx + 0.2, hy + 0.08, -0.11, 0.035, EYE));
  if (e.isPlayer) {
    P.push(Lm(hx - 0.02, hy + 0.24, -0.28, hx - 0.02, hy + 0.24, 0.28, 0.07, [74, 34, 130]));
    P.push(B(hx - 0.02, hy + 0.35, 0, 0.2, [109, 53, 184]));
  }
  return P;
}

function human(e, t) {
  const lk = e.look || {};
  const shirt = lk.shirt || [150, 110, 80], pants = lk.pants || [70, 80, 100], skin = lk.skin || [220, 180, 150], hair = lk.hair || [60, 44, 34];
  const m = e.moving || 0, sw = Math.sin(e.walk) * 0.4 * m;
  const flee = e.state === 'flee' || e.state === 'panic';
  const P = [];
  P.push(Lm(sw, 0.95, -0.16, sw * 0.9, 0.05, -0.16, 0.22, pants), Lm(-sw, 0.95, 0.16, -sw * 0.9, 0.05, 0.16, 0.22, pants));
  P.push(Lm(0, 0.95, 0, 0, 1.75, 0, 0.62, shirt));
  P.push(B(0, 2.1, 0, 0.3, skin), B(-0.06, 2.22, 0, 0.29, hair));
  if (flee) P.push(Lm(0, 1.7, -0.36, 0.15, 2.4, -0.42, 0.17, shirt), Lm(0, 1.7, 0.36, 0.15, 2.4, 0.42, 0.17, shirt));
  else P.push(Lm(sw * 0.7, 1.7, -0.38, -sw * 0.5, 1.0, -0.4, 0.17, shirt), Lm(-sw * 0.7, 1.7, 0.38, sw * 0.5, 1.0, 0.4, 0.17, shirt));
  if (e.role === 'cop') {
    P.push(B(0, 2.38, 0, 0.27, [30, 40, 80]), Lm(0.1, 2.3, -0.3, 0.1, 2.3, 0.3, 0.07, [20, 28, 60]), B(0.05, 1.5, 0.3, 0.08, [220, 200, 80]));
  } else if (e.role === 'vendor') {
    P.push(Lm(0.3, 1.5, -0.3, 0.3, 0.7, 0.3, 0.1, [240, 236, 226]));
  } else if (lk.hat) P.push(B(0, 2.4, 0, 0.28, lk.hat));
  if (e.bag) P.push(B(0.35, 1.05, 0.42, 0.3, [186, 142, 84]), B(0.37, 1.45, 0.42, 0.13, [120, 170, 80]));
  if (e.broom) P.push(Lm(0.5, 0.1, 0.5, 0.2, 1.9, 0.45, 0.08, [140, 100, 60]));
  if (e.bike) P.push(B(0.7, 0.35, 0, 0.35, [40, 40, 44]), B(-0.7, 0.35, 0, 0.35, [40, 40, 44]), Lm(-0.7, 0.4, 0, 0.7, 0.45, 0, 0.08, [170, 60, 60]), Lm(0.5, 0.45, 0, 0.5, 1.0, 0, 0.08, [170, 60, 60]));
  return P;
}

function wizard(e, t) {
  const m = e.moving || 0, sw = Math.sin(e.walk) * 0.1 * m;
  const robe = [96, 86, 150], P = [];
  P.push(Lm(sw, 0.05, -0.15, sw, 0.5, -0.15, 0.2, [60, 50, 40]), Lm(-sw, 0.05, 0.15, -sw, 0.5, 0.15, 0.2, [60, 50, 40]));
  P.push(Lm(0, 0.35, 0, 0, 1.75, 0, 0.95, robe), Lm(0, 0.35, 0, 0, 1.0, 0, 1.15, [80, 70, 130]));
  P.push(B(0, 2.1, 0, 0.3, [226, 188, 160]), B(0.25, 1.85, 0, 0.22, WHITE), B(0.22, 1.65, 0, 0.18, WHITE));
  P.push(Lm(0, 2.3, -0.5, 0, 2.3, 0.5, 0.1, [70, 60, 120]));
  P.push(Lm(0, 2.3, 0, 0, 2.7, 0, 0.55, [90, 78, 150]), Lm(0, 2.7, 0, 0, 3.05, 0, 0.33, [90, 78, 150]), Lm(0, 3.05, 0, -0.1, 3.4, 0, 0.14, [90, 78, 150]));
  P.push(Lm(0.5, 0.1, 0.5, 0.5, 2.6, 0.5, 0.1, [140, 100, 60]), B(0.5, 2.7, 0.5, 0.16, [120, 220, 250], 3));
  P.push(Lm(0.1, 1.7, -0.4, 0.4, 1.4, -0.45, 0.17, robe), Lm(0.1, 1.7, 0.4, 0.5, 1.7, 0.48, 0.17, robe));
  return P;
}

function witch(e, t) {
  const m = e.moving || 0, sw = Math.sin(e.walk) * 0.1 * m;
  const robe = [54, 40, 84], P = [];
  P.push(Lm(sw, 0.05, -0.15, sw, 0.5, -0.15, 0.2, [30, 26, 30]), Lm(-sw, 0.05, 0.15, -sw, 0.5, 0.15, 0.2, [30, 26, 30]));
  P.push(Lm(0, 0.35, 0, 0, 1.7, 0, 0.8, robe), Lm(0, 0.35, 0, 0, 0.9, 0, 1.0, [70, 52, 104]));
  P.push(B(0, 2.05, 0, 0.29, [220, 186, 156]), B(-0.15, 1.9, 0, 0.3, [150, 70, 60]));
  P.push(Lm(0, 2.28, -0.46, 0, 2.28, 0.46, 0.09, [40, 30, 64]));
  P.push(Lm(0, 2.3, 0, 0, 2.65, 0, 0.5, [50, 36, 80]), Lm(0, 2.65, 0, 0.1, 3.0, 0, 0.28, [50, 36, 80]), Lm(0.1, 3.0, 0, 0.28, 3.25, 0, 0.12, [50, 36, 80]));
  P.push(Lm(0, 2.35, -0.25, 0, 2.35, 0.25, 0.09, [180, 120, 220]));
  P.push(Lm(0.1, 1.65, -0.38, 0.4, 1.3, -0.4, 0.16, robe), Lm(0.1, 1.65, 0.38, 0.4, 1.3, 0.4, 0.16, robe));
  P.push(B(0.5, 1.3, 0.2, 0.2, [150, 240, 190], 3));
  return P;
}

function pumpkin(e, t) {
  const m = e.moving || 0, sw = Math.sin(e.walk) * 0.45 * m, P = [];
  const glow = 2.6;
  P.push(Lm(sw, 0.5, -0.3, sw * 0.8, 0.05, -0.3, 0.2, [90, 60, 30]), Lm(-sw, 0.5, 0.3, -sw * 0.8, 0.05, 0.3, 0.2, [90, 60, 30]));
  P.push(B(0, 1.25, 0, 0.82, [226, 120, 30]), B(0, 1.3, -0.5, 0.5, [214, 108, 26]), B(0, 1.3, 0.5, 0.5, [214, 108, 26]));
  P.push(Lm(0, 2.0, 0, 0.1, 2.35, 0, 0.2, [80, 110, 50]));
  P.push(B(0.7, 1.45, 0.3, 0.14, [255, 220, 80], glow), B(0.7, 1.45, -0.3, 0.14, [255, 220, 80], glow));
  P.push(Lm(0.76, 1.05, -0.35, 0.76, 1.05, 0.35, 0.12, [255, 200, 60], glow));
  P.push(Lm(0, 1.6, -0.8, sw, 1.0, -1.05, 0.14, [90, 60, 30]), Lm(0, 1.6, 0.8, -sw, 1.0, 1.05, 0.14, [90, 60, 30]));
  return P;
}

function dogRig(e, t) {
  const fur = e.fur || [160, 120, 80];
  const m = e.moving || 0;
  const P = [];
  for (const [f, s, ph] of [[0.3, 0.12, 0], [0.3, -0.12, Math.PI], [-0.3, 0.12, Math.PI], [-0.3, -0.12, 0]]) {
    const o = Math.sin(e.walk + ph) * 0.25 * m;
    P.push(Lm(f, 0.4, s, f + o, 0.02, s, 0.1, fur));
  }
  P.push(Lm(-0.5, 0.6, 0, -0.72, 0.85 + Math.sin(t * 9) * 0.04, 0.05, 0.12, fur));
  P.push(Lm(-0.3, 0.6, 0, 0.3, 0.62, 0, 0.5, fur), B(0.3, 0.64, 0, 0.26, fur), B(-0.3, 0.6, 0, 0.25, fur));
  P.push(B(0.7, 0.85, 0, 0.22, fur), Lm(0.82, 0.8, 0, 1.02, 0.78, 0, 0.14, [220, 200, 170]), B(1.04, 0.79, 0, 0.05, NOSE));
  P.push(Lm(0.66, 0.95, 0.15, 0.6, 0.62, 0.22, 0.1, [90, 60, 40]), Lm(0.66, 0.95, -0.15, 0.6, 0.62, -0.22, 0.1, [90, 60, 40]));
  if (e.owner && !e.owner.dead) {
    const dx = e.owner.x - e.x, dz = e.owner.z - e.z;
    const fx = Math.sin(e.h), fz = -Math.cos(e.h), rx = Math.cos(e.h), rz = Math.sin(e.h);
    P.push(Lm(0.5, 0.75, 0, dx * fx + dz * fz, 1.2, dx * rx + dz * rz, 0.04, [200, 60, 60]));
  }
  return P;
}

function rabbit(e, t) {
  const m = e.moving || 0, hop = Math.abs(Math.sin(e.walk * 1.2)) * 0.45 * m, fur = e.fur || [172, 142, 104];
  const P = [];
  P.push(Lm(-0.2, 0.15 + hop, -0.12, -0.45, 0.02, -0.14, 0.12, fur), Lm(-0.2, 0.15 + hop, 0.12, -0.45, 0.02, 0.14, 0.12, fur));
  P.push(B(-0.1, 0.3 + hop, 0, 0.24, fur), B(0.15, 0.33 + hop, 0, 0.2, fur));
  P.push(B(0.38, 0.45 + hop, 0, 0.14, fur), B(0.5, 0.42 + hop, 0, 0.04, NOSE));
  P.push(Lm(0.32, 0.55 + hop, 0.06, 0.18, 0.95 + hop, 0.1, 0.07, fur), Lm(0.32, 0.55 + hop, -0.06, 0.18, 0.95 + hop, -0.1, 0.07, fur));
  P.push(B(-0.35, 0.3 + hop, 0, 0.1, WHITE));
  P.push(B(0.46, 0.5 + hop, 0.08, 0.025, [20, 20, 20]), B(0.46, 0.5 + hop, -0.08, 0.025, [20, 20, 20]));
  if (e.state === 'dead') return [B(0, 0.15, 0, 0.25, fur), B(0.25, 0.14, 0, 0.13, fur)];
  return P;
}

function goose(e, t) {
  const m = e.moving || 0, P = [];
  const body = [150, 138, 122], flap = e.state === 'chase' || e.state === 'flee' ? Math.sin(t * 18) * 0.5 : 0;
  P.push(Lm(0, 0.45, -0.1, Math.sin(e.walk) * 0.2 * m, 0.02, -0.1, 0.08, [230, 140, 50]), Lm(0, 0.45, 0.1, -Math.sin(e.walk) * 0.2 * m, 0.02, 0.1, 0.08, [230, 140, 50]));
  P.push(Lm(-0.3, 0.7, 0, 0.3, 0.75, 0, 0.55, body), B(0.3, 0.75, 0, 0.3, body), B(-0.35, 0.7, 0, 0.28, body));
  P.push(Lm(-0.6, 0.85, 0, -0.75, 0.9, 0, 0.12, [60, 56, 50]));
  P.push(Lm(0.4, 0.9, 0, 0.62, 1.4, 0, 0.14, [30, 28, 30]), B(0.66, 1.5, 0, 0.12, [30, 28, 30]), B(0.7, 1.46, 0.07, 0.05, WHITE), B(0.7, 1.46, -0.07, 0.05, WHITE));
  P.push(Lm(0.74, 1.46, 0, 0.92, 1.42, 0, 0.07, [220, 150, 50]));
  P.push(Lm(0, 0.85, 0.3, -0.2, 0.95 + flap, 0.7, 0.12, [130, 120, 108]), Lm(0, 0.85, -0.3, -0.2, 0.95 + flap, -0.7, 0.12, [130, 120, 108]));
  if (e.state === 'dead') return [B(0, 0.2, 0, 0.35, body), B(0.4, 0.15, 0, 0.12, [30, 28, 30])];
  return P;
}

function possum(e, t) {
  const m = e.moving || 0, P = [];
  const fur = [168, 164, 156];
  if (e.state === 'dead' || e.state === 'play') return [B(0, 0.18, 0, 0.3, fur), B(0.32, 0.14, 0, 0.14, WHITE), Lm(-0.3, 0.12, 0, -0.7, 0.06, 0.2, 0.06, [220, 160, 160])];
  for (const [f, s, ph] of [[0.2, 0.12, 0], [0.2, -0.12, Math.PI], [-0.2, 0.12, Math.PI], [-0.2, -0.12, 0]]) P.push(Lm(f, 0.25, s, f + Math.sin(e.walk + ph) * 0.15 * m, 0.02, s, 0.07, [80, 70, 70]));
  P.push(Lm(-0.4, 0.35, 0, -0.9, 0.2, 0.1, 0.07, [226, 170, 170]));
  P.push(B(0, 0.38, 0, 0.28, fur), B(0.25, 0.36, 0, 0.22, fur), B(-0.2, 0.36, 0, 0.24, fur));
  P.push(B(0.5, 0.36, 0, 0.14, WHITE), Lm(0.58, 0.34, 0, 0.78, 0.3, 0, 0.09, WHITE), B(0.8, 0.3, 0, 0.04, [226, 120, 130]));
  P.push(B(0.42, 0.52, 0.1, 0.06, [60, 56, 56]), B(0.42, 0.52, -0.1, 0.06, [60, 56, 56]));
  return P;
}

function deer(e, t) {
  const m = e.moving || 0, P = [];
  const fur = [152, 112, 78], lt = [214, 190, 160];
  for (const [f, s, ph] of [[0.8, 0.18, 0], [0.8, -0.18, Math.PI], [-0.8, 0.18, Math.PI], [-0.8, -0.18, 0]]) {
    const o = Math.sin(e.walk + ph) * 0.45 * m;
    P.push(Lm(f, 0.95, s, f + o, 0.03, s, 0.11, [100, 74, 54]));
  }
  P.push(Lm(-1.0, 1.35, 0, 1.0, 1.4, 0, 0.9, fur), Lm(-0.9, 1.0, 0, 0.9, 1.0, 0, 0.5, lt));
  P.push(B(-1.05, 1.4, 0, 0.45, fur), B(1.0, 1.45, 0, 0.45, fur));
  P.push(Lm(1.1, 1.6, 0, 1.55, 2.35, 0, 0.35, fur), B(1.65, 2.45, 0, 0.3, fur));
  P.push(Lm(1.8, 2.4, 0, 2.15, 2.28, 0, 0.18, [120, 90, 70]), B(2.2, 2.28, 0, 0.07, NOSE));
  P.push(Lm(1.6, 2.65, 0.2, 1.5, 3.0, 0.4, 0.12, [100, 74, 54]), Lm(1.6, 2.65, -0.2, 1.5, 3.0, -0.4, 0.12, [100, 74, 54]));
  if (e.stag) P.push(Lm(1.62, 2.7, 0.15, 1.5, 3.5, 0.3, 0.07, [226, 214, 190]), Lm(1.62, 2.7, -0.15, 1.5, 3.5, -0.3, 0.07, [226, 214, 190]));
  P.push(B(-1.45, 1.55, 0, 0.18, WHITE));
  P.push(B(1.8, 2.52, 0.18, 0.04, [20, 20, 20]), B(1.8, 2.52, -0.18, 0.04, [20, 20, 20]));
  if (e.state === 'dead') return [B(0, 0.5, 0, 0.8, fur), B(1.0, 0.4, 0, 0.3, fur), B(1.3, 0.35, 0, 0.1, NOSE)];
  return P;
}

function cat(e, t) {
  const m = e.moving || 0, P = [];
  const fur = e.fur || [120, 124, 130], dk = [70, 72, 78];
  if (e.sitting) {
    P.push(B(0, 0.3, 0, 0.3, fur), B(0.12, 0.62, 0, 0.2, fur), B(0.2, 0.9, 0, 0.19, fur));
    P.push(Lm(0.2, 1.0, 0.1, 0.18, 1.25, 0.14, 0.09, dk), Lm(0.2, 1.0, -0.1, 0.18, 1.25, -0.14, 0.09, dk));
    P.push(B(0.36, 0.92, 0.08, 0.035, [140, 210, 90]), B(0.36, 0.92, -0.08, 0.035, [140, 210, 90]));
    P.push(Lm(-0.2, 0.15, 0, -0.5, 0.1, 0.35, 0.09, fur));
    return P;
  }
  for (const [f, s, ph] of [[0.25, 0.1, 0], [0.25, -0.1, Math.PI], [-0.25, 0.1, Math.PI], [-0.25, -0.1, 0]]) P.push(Lm(f, 0.3, s, f + Math.sin(e.walk + ph) * 0.2 * m, 0.02, s, 0.07, dk));
  P.push(Lm(-0.4, 0.5, 0, -0.75, 0.9 + Math.sin(t * 3) * 0.05, 0, 0.08, fur));
  P.push(Lm(-0.25, 0.45, 0, 0.25, 0.47, 0, 0.36, fur), B(0.25, 0.47, 0, 0.2, fur), B(-0.25, 0.45, 0, 0.19, fur));
  P.push(B(0.5, 0.58, 0, 0.17, fur));
  P.push(Lm(0.48, 0.7, 0.1, 0.44, 0.88, 0.12, 0.08, dk), Lm(0.48, 0.7, -0.1, 0.44, 0.88, -0.12, 0.08, dk));
  P.push(B(0.64, 0.6, 0.07, 0.03, [140, 210, 90]), B(0.64, 0.6, -0.07, 0.03, [140, 210, 90]));
  return P;
}

function fox(e, t) {
  const m = e.moving || 0, P = [];
  const fur = [206, 108, 52], dk = [60, 44, 40];
  for (const [f, s, ph] of [[0.35, 0.13, 0], [0.35, -0.13, Math.PI], [-0.33, 0.13, Math.PI], [-0.33, -0.13, 0]]) P.push(Lm(f, 0.42, s, f + Math.sin(e.walk + ph) * 0.25 * m, 0.02, s, 0.08, dk));
  P.push(Lm(-0.55, 0.6, 0, -1.2, 0.5, 0, 0.32, fur), B(-1.25, 0.5, 0, 0.14, WHITE));
  P.push(Lm(-0.35, 0.6, 0, 0.35, 0.64, 0, 0.42, fur), B(0.35, 0.64, 0, 0.24, WHITE), B(-0.35, 0.6, 0, 0.22, fur));
  P.push(B(0.78, 0.78, 0, 0.2, fur), Lm(0.9, 0.74, 0, 1.2, 0.7, 0, 0.12, WHITE), B(1.22, 0.7, 0, 0.05, NOSE));
  P.push(Lm(0.72, 0.9, 0.1, 0.66, 1.25, 0.14, 0.09, dk), Lm(0.72, 0.9, -0.1, 0.66, 1.25, -0.14, 0.09, dk));
  P.push(B(0.95, 0.84, 0.09, 0.03, EYE), B(0.95, 0.84, -0.09, 0.03, EYE));
  return P;
}

function crow(e, t) {
  const fly = (e.alt || 0) > 0.4, P = [];
  const k = [34, 32, 42], u = e.alt || 0;
  const fl = fly ? Math.sin(t * 22) * 0.6 : 0;
  P.push(B(0, 0.35 + u, 0, 0.2, k), B(-0.18, 0.33 + u, 0, 0.15, k), B(0.2, 0.5 + u, 0, 0.13, k));
  P.push(Lm(0.3, 0.5 + u, 0, 0.5, 0.46 + u, 0, 0.06, [80, 80, 90]));
  P.push(Lm(-0.2, 0.32 + u, 0, -0.55, 0.22 + u, 0, 0.1, k));
  if (fly) P.push(Lm(0, 0.5 + u, 0.1, -0.1, 0.5 + u + fl, 0.8, 0.16, k), Lm(0, 0.5 + u, -0.1, -0.1, 0.5 + u + fl, -0.8, 0.16, k));
  else {
    P.push(Lm(0, 0.18, 0.05, 0, 0.0, 0.05, 0.03, [90, 80, 70]), Lm(0, 0.18, -0.05, 0, 0.0, -0.05, 0.03, [90, 80, 70]));
    P.push(Lm(0, 0.4, 0.12, -0.3, 0.32, 0.18, 0.1, k), Lm(0, 0.4, -0.12, -0.3, 0.32, -0.18, 0.1, k));
  }
  P.push(B(0.3, 0.54 + u, 0.07, 0.025, WHITE), B(0.3, 0.54 + u, -0.07, 0.025, WHITE));
  return P;
}

function sealion(e, t) {
  const fur = [112, 92, 78], P = [];
  P.push(Lm(-1.4, 0.7, 0, 1.2, 0.9, 0, 1.7, fur), B(1.2, 0.95, 0, 0.9, fur), B(-1.4, 0.65, 0, 0.8, fur));
  P.push(Lm(1.3, 1.1, 0, 1.9, 1.7, 0, 0.7, fur), B(2.0, 1.85, 0, 0.5, fur), Lm(2.2, 1.8, 0, 2.55, 1.7, 0, 0.3, [90, 72, 60]), B(2.6, 1.7, 0, 0.1, NOSE));
  P.push(B(2.1, 1.98, 0.28, 0.07, [20, 20, 20]), B(2.1, 1.98, -0.28, 0.07, [20, 20, 20]));
  P.push(Lm(0.8, 0.5, 0.7, 0.3, 0.1, 1.5, 0.3, [90, 72, 60]), Lm(0.8, 0.5, -0.7, 0.3, 0.1, -1.5, 0.3, [90, 72, 60]));
  P.push(Lm(-2.0, 0.5, 0, -2.8, 0.25, 0.4, 0.4, [90, 72, 60]), Lm(-2.0, 0.5, 0, -2.8, 0.25, -0.4, 0.4, [90, 72, 60]));
  return P;
}

function heli(e, t) {
  const P = [];
  const c = [46, 52, 58];
  P.push(B(0, 0, 0, 1.3, c), B(0.5, 0.1, 0, 0.8, [120, 160, 190]));
  P.push(Lm(-0.6, 0.1, 0, -3.6, 0.5, 0, 0.35, c), Lm(-3.6, 0.2, 0, -3.6, 1.0, 0, 0.1, c));
  P.push(Lm(0, 1.3, 0, 0, 1.0, 0, 0.14, c));
  const a = t * 40;
  P.push(Lm(Math.cos(a) * 4.5, 1.5, Math.sin(a) * 4.5, -Math.cos(a) * 4.5, 1.5, -Math.sin(a) * 4.5, 0.1, [200, 200, 210]));
  P.push(Lm(Math.cos(a + 1.57) * 4.5, 1.5, Math.sin(a + 1.57) * 4.5, -Math.cos(a + 1.57) * 4.5, 1.5, -Math.sin(a + 1.57) * 4.5, 0.1, [200, 200, 210]));
  P.push(Lm(0.6, -1.2, -0.9, -0.6, -1.2, -0.9, 0.1, c), Lm(0.6, -1.2, 0.9, -0.6, -1.2, 0.9, 0.1, c));
  return P;
}

const dart = () => [B(0, 0, 0, 0.2, [255, 90, 90], 3)];
const RIGS = { coyote, human, wizard, witch, pumpkin, dog: dogRig, rabbit, goose, possum, deer, cat, fox, crow, sealion, heli, dart };

export function rigFor(e, t) {
  const f = RIGS[e.kind];
  return f ? f(e, t) : null;
}
