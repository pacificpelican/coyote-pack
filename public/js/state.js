import { world } from './world.js';

export const DAY_LEN = 180; // real seconds per game day
export const YEAR_DAYS = 24;

export const G = {
  mode: 'title', // title | intro | play
  paused: false,
  frozen: false, // true while a dialogue / menu is open
  quality: 'high',
  clock: { tod: 0.3, day: 0, season: 0, sunE: 1, sunAng: 0.5, moonAng: 0, moonE: -1, moonPhase: 0.3, nightAmt: 0 },
  timeScale: 1,
  rain: 0, rainTarget: 0, wet: 0, weatherTimer: 70, puddles: [],
  player: null, ents: [], items: [], floaters: [], darts: [],
  focus: null, focusItem: null, tg: {},
  heat: 0, heatHigh: 0, copTimer: 0, copsOut: 0, copGone: 0, notoriety: 0, respawn: [], hints: {}, social: null, dialogue: null, menu: null, wolfPending: false, camLock: false,
  pack: { members: [], timer: 0, cohesion: 40, duration: 0, bestSize: 1 },
  bonds: {},
  cues: {},
  spells: 0, flight: 0, sleeping: null, tipsy: 0, dim: 0, stun: 0,
  marketClaimed: false, knownPicnic: false, scoutTimer: 0,
  stats: {
    play: 0, dist: 0, hunts: 0, eaten: 0, groceries: 0, bins: 0, packs: 0, maxPack: 1, takeovers: 0, howls: 0, barks: 0,
    talks: 0, evaded: 0, caught: 0, sleeps: 0, flights: 0, coffee: 0, berries: 0, drinks: 0, scared: 0, friends: 0,
  },
  input: { x: 0, y: 0, run: false, held: { paw: false, wolf: false, eat: false, ok: false } },
  camYaw: 0, camD: 11,
  ui: null,
  hasServer: false, server: { user: null, persistence: null, ai: null, csrf: '' },
  lastSave: null,
};

let nextId = 1;
export function addEnt(e) {
  e.id = nextId++;
  e.walk = e.walk || 0;
  e.moving = 0;
  e.h = e.h || 0;
  e.y = e.y || 0;
  G.ents.push(e);
  return e;
}

export function toast(msg) { G.ui?.toast(msg); }
export function floater(x, y, z, text, color) { G.floaters.push({ x, y, z, text, color, life: 1.6, max: 1.6 }); }
export const evWorld = world.ev;
