import { G } from './state.js';
import { buildWorld, world } from './world.js';
import { draw, placeCamera } from './render.js';
import { update, newGame, startIntro, finishIntro, introAdvance, INTRO_BEATS, loadLocal, applySave, saveLocal, tickClock } from './game.js';
import { initUI, updateHud, openSettings, ui, applySettings, togglePause, settings } from './ui.js';
import { api } from './api.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const mctx = $('minimap').getContext('2d');
let W = 0, H = 0, dpr = 1;
let shownMode = '';
let continueSave = null;

function resize() {
  const d = settings.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  if (w === W && h === H && d === dpr) return;
  W = w; H = h; dpr = d;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

function syncUI() {
  if (shownMode === G.mode) return;
  shownMode = G.mode;
  const play = G.mode === 'play';
  $('hud').classList.toggle('hidden', !play);
  $('controls').classList.toggle('hidden', !play);
  $('intro').classList.toggle('hidden', G.mode !== 'intro');
  $('title').classList.toggle('hidden', G.mode !== 'title');
}

function updateIntroUI() {
  if (G.mode !== 'intro' || !G.intro) return;
  let beat = INTRO_BEATS[0];
  for (const b of INTRO_BEATS) if (G.intro.t >= b.t) beat = b;
  if ($('intro-text').textContent !== beat.text) $('intro-text').textContent = beat.text;
}

async function loadContinue() {
  const local = loadLocal();
  continueSave = local;
  const st = await api.status();
  if (st?.user) {
    try {
      const r = await api.load();
      if (r.save && (!local || (r.save.savedAt || 0) > (local.savedAt || 0))) continueSave = r.save;
    } catch (e) { /* use local save */ }
  }
  $('t-continue').classList.toggle('hidden', !continueSave);
}

function bindTitle() {
  $('t-new').onclick = () => { audio.start(); startIntro(); };
  $('t-continue').onclick = () => { audio.start(); if (continueSave) { applySave(continueSave); } };
  $('t-settings').onclick = () => openSettings('credits');
  $('intro-next').onclick = () => { audio.start(); introAdvance(); };
  $('intro-skip').onclick = () => finishIntro();
  $('p-title').onclick = () => {
    saveLocal();
    togglePause(false);
    newGame();
    G.mode = 'title';
    loadContinue();
  };
  document.addEventListener('cp-loaded', () => { G.mode = 'play'; });
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { ui.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  resize();
  if (G.qHeld) G.camYaw -= 1.8 * dt;
  if (G.eHeld) G.camYaw += 1.8 * dt;
  if (G.mode === 'title') {
    tickClock(dt * 2);
    G.camYaw += dt * 0.08;
    placeCamera(150, 3, 120, G.camYaw, W, H, 40, 20);
  } else {
    update(dt);
    const p = G.player;
    const v = G.view;
    const D = v ? v.D : G.camD;
    const Hc = v ? v.Hc : D * 0.5;
    placeCamera(p.x, p.y, p.z, v ? v.yaw : G.camYaw, W, H, D, Hc);
  }
  syncUI();
  updateIntroUI();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(ctx, G, W, H, G.paused ? 0 : dt);
  if (G.mode === 'play') updateHud(dt, mctx);
  requestAnimationFrame(frame);
}

function boot() {
  buildWorld();
  applySettings();
  initUI();
  bindTitle();
  newGame();
  G.mode = 'title';
  G.hints = {};
  loadContinue();
  window.__cp = { G, world };
  requestAnimationFrame(frame);
}

boot();
