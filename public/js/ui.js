import { G, toast as stateToast } from './state.js';
import { world } from './world.js';
import { audio } from './audio.js';
import { api } from './api.js';
import { speak } from './dialogue.js';
import { clamp, fmtDuration } from './util.js';
import { CUE_DEFS } from './npc.js';
import { pressButton, releaseButton, holdButton, xpNeed } from './player.js';
import { serialize, saveLocal, loadLocal, applySave, seasonName, moonName, clockString } from './game.js';
import { drawMinimap } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ui = { fps: 0, settingsFrom: null, tab: 'stats' };
const keys = new Set();
const padState = { id: null, x: 0, y: 0 };
let lastNavY = 0;

// ------------------------------------------------------------------ settings storage
const defaults = { music: 0.6, sfx: 0.8, quality: 'high', zoom: 11 };
export const settings = { ...defaults, ...JSON.parse(localStorage.getItem('coyotepack.settings') || '{}') };
export function applySettings() {
  audio.setVolumes(settings.music, settings.sfx);
  G.quality = settings.quality;
  G.camD = settings.zoom;
  try { localStorage.setItem('coyotepack.settings', JSON.stringify(settings)); } catch (e) { /* storage may be unavailable */ }
}

// ------------------------------------------------------------------ toasts
function toast(msg) {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}

// ------------------------------------------------------------------ input
function setVec(x, y) { G.input.x = x; G.input.y = y; }

function recomputeKeys() {
  if (padState.id !== null) return;
  const l = keys.has('ArrowLeft') || keys.has('a'), r = keys.has('ArrowRight') || keys.has('d');
  const u = keys.has('ArrowUp') || keys.has('w'), d = keys.has('ArrowDown') || keys.has('s');
  let x = (r ? 1 : 0) - (l ? 1 : 0), y = (u ? 1 : 0) - (d ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  const mag = keys.has('Shift') ? 1 : keys.has('Control') ? 0.4 : 0.72;
  setVec((x / len) * mag * (x || y ? 1 : 0), (y / len) * mag * (x || y ? 1 : 0));
}

const btnTimers = {};
const btnDownAt = {};
function btnDown(btn) {
  if (G.paused || G.mode !== 'play') return;
  const el = $('b-' + btn);
  el?.classList.add('down');
  btnDownAt[btn] = performance.now();
  G.input.held[btn] = true;
  pressButton(btn);
  if (btn === 'wolf') btnTimers.wolf = setTimeout(() => holdButton('wolf'), 600);
  if (btn === 'eat') { btnTimers.eat = setTimeout(() => { btnTimers.eatI = setInterval(() => pressButton('eat'), 480); }, 520); }
}
function btnUp(btn) {
  $('b-' + btn)?.classList.remove('down');
  if (!G.input.held[btn]) return;
  G.input.held[btn] = false;
  clearTimeout(btnTimers[btn]);
  if (btn === 'eat') clearInterval(btnTimers.eatI);
  releaseButton(btn, (performance.now() - (btnDownAt[btn] || 0)) / 1000);
}

function bindControls() {
  const pad = $('pad'), knob = $('knob');
  const upd = (e) => {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    const mag = clamp(l / (R * 0.85), 0, 1);
    if (l > R * 0.5) { dx = (dx / l) * R * 0.5; dy = (dy / l) * R * 0.5; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = l < R * 0.12 ? 0 : mag;
    setVec((dx / (l || 1)) * k, -(dy / (l || 1)) * k);
  };
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); padState.id = e.pointerId; upd(e); });
  pad.addEventListener('pointermove', (e) => { if (padState.id === e.pointerId) upd(e); });
  const end = (e) => { if (padState.id !== e.pointerId) return; padState.id = null; knob.style.transform = ''; setVec(0, 0); recomputeKeys(); };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  for (const btn of ['paw', 'wolf', 'eat', 'ok']) {
    const el = $('b-' + btn);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); audio.start(); btnDown(btn); });
    const up = () => btnUp(btn);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const KEYMAP = { j: 'paw', z: 'paw', k: 'wolf', x: 'wolf', l: 'eat', c: 'eat', v: 'ok', Enter: 'ok', ' ': 'ok' };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (k === 'm') { toggleMute(); return; }
    if (e.repeat) { if (['ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault(); return; }
    audio.start();
    if (G.dialogue || G.menu) {
      if (k === 'ArrowUp' || k === 'w') navModal(-1);
      else if (k === 'ArrowDown' || k === 's') navModal(1);
    }
    if (KEYMAP[k]) { e.preventDefault(); btnDown(KEYMAP[k]); return; }
    if (k === 'q') G.qHeld = true;
    if (k === 'e') G.eHeld = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift', 'Control'].includes(k) || 'wasd'.includes(k)) {
      if (k.startsWith('Arrow')) e.preventDefault();
      keys.add(k);
      recomputeKeys();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYMAP[k]) { btnUp(KEYMAP[k]); return; }
    if (k === 'q') G.qHeld = false;
    if (k === 'e') G.eHeld = false;
    keys.delete(k);
    recomputeKeys();
  });
  window.addEventListener('blur', () => { keys.clear(); recomputeKeys(); for (const b of ['paw', 'wolf', 'eat', 'ok']) btnUp(b); });

  // drag on the game view rotates the camera; wheel zooms
  const cv = $('game');
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; drag = { id: e.pointerId, x: e.clientX }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (drag && drag.id === e.pointerId) { G.camYaw += (e.clientX - drag.x) * 0.006; drag.x = e.clientX; } });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('wheel', (e) => { settings.zoom = clamp(settings.zoom + Math.sign(e.deltaY), 7, 18); applySettings(); }, { passive: true });
}

function onEscape() {
  if (!$('shot').classList.contains('hidden')) return closeShot();
  if (!$('settings').classList.contains('hidden')) return closeSettings();
  if (G.dialogue) return closeDialogue();
  if (G.menu) return closeMenu();
  if (G.social) return;
  if (G.mode === 'play') togglePause();
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
}

// ------------------------------------------------------------------ pause & screenshot
export function togglePause(force) {
  if (G.mode !== 'play') return;
  const to = force !== undefined ? force : !G.paused;
  G.paused = to;
  $('pause').classList.toggle('hidden', !to);
  $('btn-pause').textContent = to ? '▶' : '⏸';
  if (to) { setVec(0, 0); for (const b of ['paw', 'wolf', 'eat', 'ok']) btnUp(b); }
}

function takeShot() {
  const src = $('game');
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const s = c.width / 1000;
  const bar = Math.max(26, 32 * Math.max(0.6, s));
  g.fillStyle = 'rgba(25,16,40,0.78)';
  g.fillRect(0, c.height - bar, c.width, bar);
  g.fillStyle = '#f4efe4';
  g.font = `${Math.round(bar * 0.45)}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText('Coyote Pack by Daniel McKeown  https://altaredwood.work', bar * 0.4, c.height - bar / 2);
  const now = new Date();
  g.textAlign = 'right';
  g.fillText(now.toLocaleString(), c.width - bar * 0.4, c.height - bar / 2);
  const url = c.toDataURL('image/png');
  $('shot-img').src = url;
  const pad = (n) => String(n).padStart(2, '0');
  const dl = $('shot-dl');
  dl.href = url;
  dl.download = `coyote-pack-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
  $('shot').classList.remove('hidden');
}
function closeShot() { $('shot').classList.add('hidden'); }

// ------------------------------------------------------------------ dialogue
function ctxNow() {
  const h = G.clock.tod * 24;
  const p = G.player;
  return { time: h < 6 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night', weather: G.rain > 0.4 ? 'raining' : 'dry', level: p.level, pack: G.pack.members.length + 1, hunger: p.food < 30 ? 'hungry' : 'fed' };
}

let typeTimer = null;
function typeText(el, text, done) {
  clearInterval(typeTimer);
  el.textContent = '';
  let i = 0;
  const full = () => { clearInterval(typeTimer); el.textContent = text; done?.(); };
  el.onclick = full;
  typeTimer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i % 6 === 0) audio.blip();
    if (i >= text.length) full();
  }, 28);
}

export function openDialogue(spec) {
  G.dialogue = { spec, sel: 0, busy: true };
  setVec(0, 0);
  $('dialogue').classList.remove('hidden');
  $('dlg-icon').textContent = spec.icon;
  $('dlg-name').textContent = spec.name;
  $('dlg-src').textContent = '';
  $('dlg-choices').innerHTML = '';
  $('dlg-text').textContent = '…';
  speak(spec.speaker, 'greet', ctxNow()).then((r) => {
    if (!G.dialogue || G.dialogue.spec !== spec) return;
    $('dlg-src').textContent = r.source === 'ai' ? 'AI' : '';
    typeText($('dlg-text'), r.text, () => { G.dialogue.busy = false; renderChoices(); });
  });
}

function renderChoices() {
  const d = G.dialogue;
  if (!d) return;
  const box = $('dlg-choices');
  box.innerHTML = '';
  d.spec.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice' + (i === d.sel ? ' sel' : '');
    b.textContent = c.label;
    b.onclick = () => { d.sel = i; chooseDialogue(); };
    box.appendChild(b);
  });
}

function chooseDialogue() {
  const d = G.dialogue;
  if (!d || d.busy) return;
  const ch = d.spec.choices[d.sel];
  d.busy = true;
  $('dlg-choices').innerHTML = '';
  $('dlg-text').textContent = '…';
  const res = d.spec.onChoice(ch.id) || {};
  speak(d.spec.speaker, ch.topic, ctxNow()).then((r) => {
    if (!G.dialogue || G.dialogue !== d) return;
    $('dlg-src').textContent = r.source === 'ai' ? 'AI' : '';
    const text = res.extra ? `${r.text}\n\n${res.extra}` : r.text;
    typeText($('dlg-text'), text, () => {
      d.busy = false;
      if (ch.end) d.spec.choices = [{ id: 'close', label: 'Close', topic: 'bye', close: true }];
      d.sel = 0;
      renderChoices();
    });
  });
}

function closeDialogue() {
  clearInterval(typeTimer);
  G.dialogue = null;
  $('dialogue').classList.add('hidden');
}

// ------------------------------------------------------------------ menu
export function openMenu(items, cb) {
  G.menu = { items, sel: 0, cb };
  setVec(0, 0);
  const box = $('menu-items');
  box.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'choice' + (i === 0 ? ' sel' : '');
    b.textContent = it.label;
    b.onclick = () => { G.menu.sel = i; pickMenu(); };
    box.appendChild(b);
  });
  $('menu').classList.remove('hidden');
}
function pickMenu() {
  const m = G.menu;
  if (!m) return;
  const it = m.items[m.sel];
  closeMenu();
  if (it.id !== 'close') m.cb(it.id);
}
function closeMenu() { G.menu = null; $('menu').classList.add('hidden'); }

function navModal(dir) {
  const m = G.dialogue || G.menu;
  if (!m) return;
  const n = G.dialogue ? G.dialogue.spec.choices.length : G.menu.items.length;
  if (G.dialogue && G.dialogue.busy) return;
  m.sel = (m.sel + dir + n) % n;
  const list = G.dialogue ? $('dlg-choices') : $('menu-items');
  [...list.children].forEach((c, i) => c.classList.toggle('sel', i === m.sel));
}

function modalPress(btn) {
  if (btn === 'ok') {
    if (G.dialogue) {
      const d = G.dialogue;
      if (d.busy) { $('dlg-text').click(); return; }
      if (d.spec.choices[d.sel]?.close) return closeDialogue();
      chooseDialogue();
    } else pickMenu();
  } else if (btn === 'paw') navModal(-1);
  else if (btn === 'eat') navModal(1);
  else if (btn === 'wolf') { if (G.dialogue) closeDialogue(); else closeMenu(); }
}

// ------------------------------------------------------------------ social minigame UI
function socialChanged() {
  const s = G.social;
  const box = $('social');
  if (!s) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const cue = s.e.cueSeq[s.idx];
  $('soc-name').textContent = `${s.e.cid} (step ${s.idx + 1}/${s.steps})`;
  $('soc-cue').textContent = CUE_DEFS[cue].emoji;
  $('soc-text').textContent = CUE_DEFS[cue].text + (s.hint ? `  — ${s.hint}` : '');
}

// ------------------------------------------------------------------ HUD
let hudT = 0;
export function updateHud(dt, mctx) {
  hudT -= dt;
  const p = G.player;
  if (G.social) $('soc-bar').firstElementChild.style.transform = `scaleX(${clamp(G.social.t / 5, 0, 1)})`;
  // pad navigation for modals
  if (G.dialogue || G.menu) {
    const y = G.input.y;
    if (y > 0.65 && lastNavY <= 0.65) navModal(-1);
    if (y < -0.65 && lastNavY >= -0.65) navModal(1);
    lastNavY = y;
  } else lastNavY = 0;
  if (hudT > 0) return;
  hudT = 0.1;
  const pct = (id, v) => { $(id).style.width = clamp(v, 0, 100) + '%'; };
  pct('m-health', (p.hp / p.maxHp) * 100); pct('m-food', p.food); pct('m-water', p.water); pct('m-energy', p.energy); pct('m-heat', G.heat);
  const bits = [`Lv ${p.level}`, `XP ${Math.floor(p.xp)}/${xpNeed(p.level)}`];
  if (G.spells) bits.push(`✨×${G.spells}`);
  if (G.flight > 0) bits.push(`🪽 ${G.flight.toFixed(0)}s`);
  if (G.tipsy > 0.3) bits.push('☕ jittery');
  if (G.copsOut) bits.push('🚔');
  if (G.ents.some((e) => e.kind === 'heli')) bits.push('🚁');
  $('levelline').textContent = bits.join(' · ');
  const pk = G.pack;
  $('packline').textContent = pk.members.length ? `🐺 Pack ×${pk.members.length + 1} · ${fmtDuration(Math.max(0, pk.timer))} · bond ${Math.round(pk.cohesion)}%` : '';
  const c = G.clock;
  $('clock').textContent = `${G.rain > 0.4 ? '🌧' : c.sunE > 0 ? '☀️' : '🌙'} ${seasonName()} · Day ${Math.floor(c.day) + 1} · ${clockString()}${c.sunE < 0 ? ' · ' + moonName() : ''}`;
  const hn = G.hints || {};
  $('hint-paw').textContent = '🐾 ' + (hn.paw || '');
  $('hint-wolf').textContent = '🐺 ' + (hn.wolf || '');
  $('hint-eat').textContent = '🍖 ' + (hn.eat || '');
  $('hint-ok').textContent = '✔ ' + (hn.ok || '');
  const tg = G.tg || {};
  $('b-paw').classList.toggle('ready', !!tg.talk);
  $('b-wolf').classList.toggle('ready', !!(tg.prey || tg.bagHuman || tg.bag || tg.bin));
  $('b-eat').classList.toggle('ready', !!(tg.item || (tg.water && tg.water !== 'sea') || tg.bush));
  if (mctx) drawMinimap(mctx, G);
}

// ------------------------------------------------------------------ settings
const TABS = [['stats', 'Stats'], ['controls', 'Controls'], ['account', 'Account'], ['save', 'Save'], ['debug', 'Debug'], ['credits', 'Credits'], ['terms', 'Terms'], ['privacy', 'Privacy']];

export function openSettings(tab) {
  ui.settingsFrom = !$('pause').classList.contains('hidden') ? 'pause' : G.mode === 'play' ? 'play' : 'title';
  if (G.mode === 'play' && !G.paused) { G.paused = true; ui.pausedBySettings = true; }
  $('pause').classList.add('hidden');
  $('settings').classList.remove('hidden');
  showTab(tab || ui.tab);
}

function closeSettings() {
  $('settings').classList.add('hidden');
  if (ui.settingsFrom === 'pause') { $('pause').classList.remove('hidden'); }
  else if (ui.pausedBySettings) { G.paused = false; $('btn-pause').textContent = '⏸'; }
  ui.pausedBySettings = false;
}

function showTab(id) {
  ui.tab = id;
  const tabs = $('tabs');
  tabs.innerHTML = '';
  for (const [k, label] of TABS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = k === id ? 'on' : '';
    b.setAttribute('role', 'tab');
    b.onclick = () => showTab(k);
    tabs.appendChild(b);
  }
  const body = $('tab-body');
  const fn = { stats: tabStats, controls: tabControls, account: tabAccount, save: tabSave, debug: tabDebug, credits: tabCredits, terms: tabTerms, privacy: tabPrivacy }[id];
  fn(body);
}

function row(k, v) { return `<tr><td>${esc(k)}</td><td>${v}</td></tr>`; }

function tabStats(body) {
  const s = G.stats, p = G.player;
  if (!p || G.mode === 'title' && !G.player) { body.innerHTML = '<p>Start a game to see your stats.</p>'; return; }
  const cues = Object.keys(CUE_DEFS).filter((k) => G.cues[k]).length;
  const bonds = Object.entries(G.bonds).map(([n, b]) => `${esc(n)} ${Math.round(b)}%`).join(', ') || 'none yet';
  body.innerHTML = `<table>
    ${row('Level', `${p.level} (XP ${Math.floor(p.xp)}/${xpNeed(p.level)})`)}
    ${row('Time played', fmtDuration(s.play))}
    ${row('In-game day', `${Math.floor(G.clock.day) + 1} · ${seasonName()} · ${moonName()}`)}
    ${row('Distance traveled', `${Math.round(s.dist)} paces`)}
    ${row('Prey caught', s.hunts)}
    ${row('Bites eaten', s.eaten)}
    ${row('Groceries stolen', s.groceries)}
    ${row('Bins raided', s.bins)}
    ${row('Blackberries', s.berries)}
    ${row('Drinks / coffees', `${s.drinks} / ${s.coffee}`)}
    ${row('Humans scared', s.scared)}
    ${row('Barks / howls', `${s.barks} / ${s.howls}`)}
    ${row('Conversations', s.talks)}
    ${row('Friends made', s.friends)}
    ${row('Packs formed · biggest', `${s.packs} · ${s.maxPack}`)}
    ${row('Market takeovers', s.takeovers)}
    ${row('Cops evaded · times caught', `${s.evaded} · ${s.caught}`)}
    ${row('Naps · flights', `${s.sleeps} · ${s.flights}`)}
    ${row('Coyote signals learned', `${cues} of ${Object.keys(CUE_DEFS).length}`)}
    ${row('Known coyote bonds', bonds)}
  </table>`;
}

function tabControls(body) {
  const guide = Object.entries(CUE_DEFS).map(([k, c]) => (G.cues[k] ? `<li>${c.emoji} ${esc(c.text)} → ${esc(c.hint)}</li>` : '<li>❔ Not learned yet — meet a coyote and watch how it behaves.</li>')).join('');
  body.innerHTML = `
    <h3>Touch / on-screen</h3>
    <table>
      ${row('Left pad', 'Move. Push further to run. Drag on the game view to rotate the camera.')}
      ${row('🐾 (left)', 'Interact and socialize: talk to crows, cats, foxes, the wizard, the witch, Jack, dogs and sea lions. With a coyote it starts the body-language greeting. With nothing nearby, sniff for food.')}
      ${row('🐺 (top)', 'Act wild: pounce on rabbits, geese, possums and (with a pack) deer; growl at someone holding groceries; rip open a dropped bag; tip a bin. Tap for a bark, hold for a howl (a group howl if you have a pack).')}
      ${row('🍖 (right)', 'Consume: drink at a creek or puddle, eat from a ripped bag, kill, scraps, crate, berries. Hold to keep eating. Coffee is more of an intoxicant than a meal.')}
      ${row('✔ (bottom)', 'Select / confirm. Opens the action menu (sleep, cast flight, release pack). In a dialogue it selects the highlighted choice.')}
      ${row('⏸ / 🔊', 'Pause (with screenshot) and mute.')}
    </table>
    <h3>Keyboard</h3>
    <table>
      ${row('Move', 'WASD or arrow keys (Shift = run, Ctrl = sneak)')}
      ${row('Camera', 'Q / E to rotate, mouse wheel to zoom, or drag')}
      ${row('Buttons', 'J or Z = 🐾 · K or X = 🐺 · L or C = 🍖 · V, Enter or Space = ✔')}
      ${row('Pause / mute', 'Esc / M')}
    </table>
    <h3>Coyote body language</h3>
    <ul>${guide}</ul>
    <p>Making friends takes a few correct replies in a row. Friends form an ad hoc pack of up to four. Packs last a few minutes; successes (food, evading cops) keep them together longer, and old friends answer a howl.</p>
    <h3>Options</h3>
    <label class="opt">Music <input type="range" id="o-music" min="0" max="1" step="0.05" value="${settings.music}"></label>
    <label class="opt">Effects <input type="range" id="o-sfx" min="0" max="1" step="0.05" value="${settings.sfx}"></label>
    <label class="opt">Camera distance <input type="range" id="o-zoom" min="7" max="18" step="1" value="${settings.zoom}"></label>
    <label class="opt">Quality <select id="o-q"><option value="high">High</option><option value="low">Low (faster)</option></select></label>`;
  $('o-q').value = settings.quality;
  $('o-music').oninput = (e) => { settings.music = +e.target.value; applySettings(); };
  $('o-sfx').oninput = (e) => { settings.sfx = +e.target.value; applySettings(); audio.blip(); };
  $('o-zoom').oninput = (e) => { settings.zoom = +e.target.value; applySettings(); };
  $('o-q').onchange = (e) => { settings.quality = e.target.value; applySettings(); };
}

async function tabAccount(body) {
  body.innerHTML = '<p>Checking the server…</p>';
  const st = await api.status();
  G.server = st ? { ...G.server, user: st.user, persistence: st.persistence, ai: st.ai } : { user: null };
  if (!st) { body.innerHTML = '<p>Accounts and cloud saves need the PHP backend, which isn\'t reachable here. You can still play and save locally in this browser.</p>'; return; }
  const msg = (t, ok) => { const m = body.querySelector('.msg'); if (m) { m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); } };
  if (st.user) {
    body.innerHTML = `<p>Logged in as <b>${esc(st.user)}</b>.</p>
      <button class="big" id="a-out">Log out</button>
      <h3>Delete account</h3>
      <p>This permanently deletes your account and server save. Enter your password to confirm.</p>
      <input type="password" id="a-dpw" placeholder="Password" autocomplete="current-password"><br>
      <button class="big alt" id="a-del">Delete my account</button>
      <p class="msg"></p>`;
    $('a-out').onclick = async () => { try { await api.logout(); showTab('account'); } catch (e) { msg(e.message); } };
    $('a-del').onclick = async () => {
      if (!confirm('Delete your account and its server save? This cannot be undone.')) return;
      try { await api.deleteAccount($('a-dpw').value); showTab('account'); } catch (e) { msg(e.message); }
    };
  } else {
    body.innerHTML = `<p>Log in to keep your progress on the server. Playing as a guest saves in this browser only.</p>
      <input type="text" id="a-user" placeholder="Username (3-24 characters)" autocomplete="username" maxlength="24"><br>
      <input type="password" id="a-pass" placeholder="Password (8+ characters)" autocomplete="current-password" maxlength="128"><br>
      <button class="big" id="a-in">Log in</button><button class="big alt" id="a-reg">Create account</button>
      <p class="msg"></p>`;
    const go = (fn) => async () => {
      try { await fn($('a-user').value.trim(), $('a-pass').value); showTab('account'); } catch (e) { msg(e.message); }
    };
    $('a-in').onclick = go(api.login);
    $('a-reg').onclick = go(api.register);
  }
}

async function tabSave(body) {
  const local = loadLocal();
  const st = api.available ? await api.status() : null;
  const when = (t) => (t ? new Date(t).toLocaleString() : 'never');
  body.innerHTML = `<table>
    ${row('Last local save', when(local?.savedAt))}
    ${row('Server account', st?.user ? esc(st.user) : st ? 'not logged in' : 'server unavailable')}
  </table>
  <p>${G.mode === 'play' ? 'Saves progress: level, stats, food and water, position, time, friends and spells.' : 'Start or continue a game to save it.'}</p>
  <button class="big" id="s-save" ${G.mode === 'play' ? '' : 'disabled'}>Save now</button>
  <button class="big alt" id="s-local" ${local ? '' : 'disabled'}>Load local save</button>
  <button class="big alt" id="s-server" ${st?.user ? '' : 'disabled'}>Load server save</button>
  <p class="msg"></p>`;
  const msg = (t, ok) => { const m = body.querySelector('.msg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
  $('s-save').onclick = async () => {
    const d = saveLocal();
    if (!d) return msg('Could not save in this browser.');
    if (st?.user) { try { await api.save(d); return msg('Saved to this browser and your account.', true); } catch (e) { return msg('Saved locally, but the server said: ' + e.message); } }
    msg('Saved in this browser. Log in to also save to the server.', true);
  };
  $('s-local').onclick = () => { applySave(local); closeSettings(); afterLoad(); };
  $('s-server').onclick = async () => {
    try { const r = await api.load(); if (!r.save) return msg('No server save yet.'); applySave(r.save); closeSettings(); afterLoad(); } catch (e) { msg(e.message); }
  };
}

function afterLoad() {
  document.dispatchEvent(new CustomEvent('cp-loaded'));
}

async function tabDebug(body) {
  body.innerHTML = '<p>Loading…</p>';
  let d = null;
  try { d = await api.debug(false); } catch (e) { /* no backend */ }
  const rows = [];
  if (d) {
    const per = d.persistence || {};
    rows.push(row('Data persistence', `<b>${esc(per.driver)}</b> — ${esc(per.type || '')}`), row('Storage target', esc(per.target || '')));
    if (per.note) rows.push(row('Note', esc(per.note)));
    rows.push(row('PHP', `${esc(d.php)} (${esc(d.sapi)})`));
    rows.push(row('Extensions', Object.entries(d.extensions).map(([k, v]) => `${esc(k)}: ${v ? 'yes' : 'no'}`).join(', ')));
    rows.push(row('Session', esc(d.session)));
    const ai = d.ai || {};
    rows.push(row('AI dialogue', ai.enabled ? `${esc(ai.provider)} · ${esc(ai.model)} · ${esc(ai.endpoint)}${ai.provider !== 'ollama' ? (ai.keySet ? ' · key set' : ' · NO KEY') : ''}` : 'disabled (built-in lines)'));
    rows.push(row('Server time', esc(d.serverTime)));
  } else rows.push(row('Backend', 'not reachable — running as a static page; saves are local and dialogue uses built-in lines.'));
  rows.push(row('Client', `${esc(navigator.userAgent.slice(0, 90))}`));
  rows.push(row('Canvas', `${$('game').width}×${$('game').height} · quality ${esc(G.quality)} · ${ui.fps.toFixed(0)} fps`));
  rows.push(row('Entities / items', `${G.ents.length} / ${G.items.length}`));
  rows.push(row('Time scale · audio', `${G.timeScale}× · ${audio.started ? (audio.muted ? 'muted' : 'on') : 'not started'}`));
  rows.push(row('Weather', `rain ${G.rain.toFixed(2)} · wet ${G.wet.toFixed(2)} · next change in ${Math.max(0, G.weatherTimer).toFixed(0)}s`));
  rows.push(row('Heat · notoriety', `${G.heat.toFixed(0)} · ${(G.notoriety || 0).toFixed(0)}`));
  body.innerHTML = `<table>${rows.join('')}</table><button class="big alt" id="d-ping" ${d ? '' : 'disabled'}>Test AI dialogue</button><p class="msg" id="d-msg"></p>`;
  $('d-ping').onclick = async () => {
    $('d-msg').textContent = 'Testing…';
    try { const r = await api.debug(true); $('d-msg').textContent = r.aiPing?.ok ? `AI responded in ${r.aiPing.ms} ms.` : 'No AI response (check config.php); the game will use built-in lines.'; $('d-msg').className = 'msg ' + (r.aiPing?.ok ? 'ok' : 'err'); } catch (e) { $('d-msg').textContent = e.message; }
  };
}

function tabCredits(body) {
  body.innerHTML = `<h3>Coyote Pack</h3>
    <p>Coyote Pack by <a href="https://altaredwood.work" target="_blank" rel="noopener">Daniel McKeown</a></p>
    <p>Visual style inspired by the marker-and-ink drawings in the <code>art</code> folder. Everything in the game is drawn and synthesized live: no stock assets, and the soundtrack is generated in your browser.</p>
    <p>Lavender Hill is a fictional neighborhood. Any resemblance to a certain hilly Seattle district is entirely intentional.</p>`;
}

function tabTerms(body) {
  body.innerHTML = `<h3>Terms of Service</h3>
    <p><i>Last updated: October 2026.</i></p>
    <p><b>1. Who we are.</b> Coyote Pack ("the Game") is a hobby project by Daniel McKeown ("the Operator", altaredwood.work). By playing, you agree to these terms. If you do not agree, please do not use the Game.</p>
    <p><b>2. Playing the Game.</b> The Game is provided free of charge for personal, non-commercial use. You may play as a guest or, where the backend is enabled, create an account to store progress.</p>
    <p><b>3. Your account.</b> You are responsible for your password and for activity under your account. Choose a username that is not offensive and does not impersonate others. We may remove accounts that abuse the service.</p>
    <p><b>4. Acceptable use.</b> Do not attack, overload, scrape or reverse-engineer the service beyond what the law allows; do not attempt to access other players' data; do not use the Game to harass others. Cheating in a single-player game is between you and your conscience.</p>
    <p><b>5. AI-generated dialogue.</b> When enabled, some animal dialogue is generated by a language model. It may be unexpected or inaccurate, is fictional, and should not be relied on. Do not treat it as advice of any kind.</p>
    <p><b>6. Content and ownership.</b> The Game, its artwork, code and music are the property of the Operator. You may take and share screenshots of your play, including the credit line the Game adds to them.</p>
    <p><b>7. No warranty.</b> The Game is provided "as is" without warranties of any kind. We do not promise that it will be uninterrupted, error-free, or that saves will never be lost; please keep a local save if your progress matters to you.</p>
    <p><b>8. Limitation of liability.</b> To the maximum extent permitted by law, the Operator is not liable for indirect or consequential losses arising from your use of the Game.</p>
    <p><b>9. Fiction.</b> Coyotes in the Game steal groceries and body-slam nothing in particular. Please do not do this in real life. Real coyotes are wild animals; keep your distance and never feed them.</p>
    <p><b>10. Changes.</b> We may update these terms or the Game. Continued use after a change means you accept the updated terms.</p>
    <p><b>11. Contact.</b> See <a href="https://altaredwood.work" target="_blank" rel="noopener">altaredwood.work</a>.</p>`;
}

function tabPrivacy(body) {
  body.innerHTML = `<h3>Privacy Policy</h3>
    <p><i>Last updated: October 2026.</i> This policy explains what Coyote Pack stores and why, whether you run it locally or play it on a website.</p>
    <p><b>What we collect.</b></p>
    <ul>
      <li><b>Account data (optional):</b> if you create an account, we store your username, a salted hash of your password (never the password itself), the creation date, and failed-login counters used to slow down guessing.</li>
      <li><b>Game saves:</b> your progress (level, stats, position, time, friendships, spells) is stored in your account if you choose Save while logged in.</li>
      <li><b>In your browser:</b> settings and a local save are kept in <code>localStorage</code> on your device. A single session cookie (<code>coyotepack</code>, HttpOnly, same-site) is used to keep you logged in and to protect requests from forgery. It is strictly necessary and contains no personal data.</li>
      <li><b>Server logs:</b> like most web servers, the hosting server may record your IP address, user agent, request URLs and timestamps for security and troubleshooting. The Game does not add analytics, advertising or tracking scripts.</li>
    </ul>
    <p><b>AI dialogue.</b> If the Operator has enabled AI dialogue, a short prompt is sent from the server to the configured model: which animal is speaking, a topic such as "greeting", and coarse game state like time of day, weather, level and pack size. No account name, IP address or personal information is included. By default this goes to a local Ollama server. If the server is configured with a cloud provider, that provider receives the prompt and handles it under its own policy.</p>
    <p><b>How we use data.</b> To run the Game, keep you signed in, save your progress, prevent abuse and fix bugs. We do not sell your data or use it for advertising.</p>
    <p><b>Retention and deletion.</b> Account and save data are kept until you delete your account (Settings → Account → Delete account), which removes them from the database. Server logs are typically rotated within a few weeks. You can clear local data any time by clearing this site's data in your browser.</p>
    <p><b>Security.</b> Passwords are hashed with bcrypt-class hashing, sessions are protected with a CSRF token, and inputs are validated, but no system is perfectly secure; please use a unique password.</p>
    <p><b>Children.</b> The Game is family-friendly but is not directed at children under 13 and we do not knowingly collect their personal data. Please do not create an account if you are under 13.</p>
    <p><b>Your rights.</b> Depending on where you live (for example under GDPR or CCPA), you may have rights to access, correct, export or delete your data. Use the in-game delete option or contact us through <a href="https://altaredwood.work" target="_blank" rel="noopener">altaredwood.work</a>.</p>
    <p><b>Running locally.</b> If you run the Game on your own machine, all data stays on that machine (apart from any AI provider you configure).</p>
    <p><b>Changes.</b> If this policy changes, the date above will be updated.</p>`;
}

// ------------------------------------------------------------------ boot
export function initUI() {
  bindControls();
  applySettings();
  G.ui = {
    toast, openDialogue, openMenu, socialChanged, modalPress,
    say: (speaker, name, topic) => speak(speaker, topic, ctxNow()).then((r) => toast(`${name}: “${r.text}”`)),
  };
  $('btn-pause').onclick = () => togglePause();
  $('btn-mute').onclick = () => { audio.start(); toggleMute(); };
  $('btn-settings').onclick = () => openSettings();
  $('p-resume').onclick = () => togglePause(false);
  $('p-shot').onclick = takeShot;
  $('p-settings').onclick = () => openSettings();
  $('shot-close').onclick = closeShot;
  $('set-close').onclick = closeSettings;
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('contextmenu', (e) => e.preventDefault()));
}
