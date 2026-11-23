import { START_LIVES } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { createAvatar } from './character.js';
import { Customizer, displayName } from './customizer.js';
import { FaceEditor, loadImageFile } from './face-editor.js';
import { AudioEngine } from './audio.js';
import {
  loadSettings,
  saveSettings,
  loadHighscores,
  qualifies,
  addHighscore,
  loadActiveProfile,
  StorageError,
  NAME_MAX_LENGTH,
} from './storage.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('game');
const toast = $('toast');
const hud = {
  root: $('hud'),
  level: $('hud-level'),
  score: $('hud-score'),
  lives: $('hud-lives'),
  pause: $('btn-pause'),
};
const screens = {
  menu: $('screen-menu'),
  pause: $('screen-pause'),
  gameover: $('screen-gameover'),
  highscores: $('screen-highscores'),
  settings: $('screen-settings'),
  customize: $('screen-customize'),
  face: $('screen-face'),
  noncha: $('screen-noncha'),
};
const srStatus = $('sr-status');

const settings = loadSettings();
let profile = loadActiveProfile();
const customizer = new Customizer(screens.customize, {
  onChange: (p) => {
    profile = p;
  },
  onPickPhoto: openFaceEditor,
});
const faceEditor = new FaceEditor($('face-canvas'), $('face-zoom'));
const audio = new AudioEngine();
audio.setVolume(settings.sound, settings.volume);
const game = new Game({ onGameOver: showGameOver, onEvent: onGameEvent });
const renderer = new Renderer(canvas);

// Browsers staan geluid pas toe na een gebruikersactie.
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => audio.unlock(), { capture: true });
}

// --- Geluid, trillen en meldingen bij spelgebeurtenissen ---------------------------

const VEHICLE_NAMES = { car: 'een auto', van: 'een bestelbus', truck: 'een vrachtwagen', motor: 'een motor' };
const ROW_NAMES = ['de overkant', 'rijstrook 6', 'rijstrook 5', 'rijstrook 4', 'de middenberm', 'rijstrook 3', 'rijstrook 2', 'rijstrook 1', 'de startberm'];

/** Links/rechts-positie van de speler voor geluid: -0.8 (links) … 0.8 (rechts). */
const playerPan = () => ((game.player.col - 6) / 6) * 0.8;

/** Melding voor schermlezers (zichtbaar voor niemand, hoorbaar voor wie er een gebruikt). */
function announce(text) {
  srStatus.textContent = '';
  // Kleine vertraging zodat dezelfde tekst opnieuw wordt voorgelezen.
  setTimeout(() => (srStatus.textContent = text), 30);
}

function vibrate(pattern) {
  if (settings.vibrate && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // niet ondersteund
    }
  }
}

function onGameEvent(type, data = {}) {
  audio.play(type, { pan: playerPan() });
  switch (type) {
    case 'finish':
      renderer.confetti(game.player.col + 0.5, game.player.row + 0.4);
      break;
    default:
      break;
  }
  switch (type) {
    case 'levelstart':
      announce(`Level ${data.level}. Maximaal ${game.params.speedLimit} kilometer per uur.`);
      break;
    case 'median':
      announce('Middenberm.');
      break;
    case 'finish':
      announce(`Overgestoken! Plus ${data.bonus} punten.`);
      break;
    case 'hit': {
      const left = game.lives;
      announce(
        `Geraakt door ${VEHICLE_NAMES[data.vehicle?.type] ?? 'een voertuig'}! ` +
          (left > 0 ? `Nog ${left} ${left === 1 ? 'leven' : 'levens'}.` : 'Geen levens meer.'),
      );
      vibrate([120, 60, 160]);
      break;
    }
    default:
      break;
  }
}

function where() {
  if (!game.active) return;
  const p = game.player;
  audio.play('where', { row: p.row, pan: playerPan() });
  const side = p.col < 5 ? 'links' : p.col > 7 ? 'rechts' : 'midden';
  announce(`Je staat op ${ROW_NAMES[p.row]}, ${side} (positie ${p.col + 1} van 13).`);
}

// Alleen tijdens het spelen klinkt het verkeer (zacht in de normale modus).
// Tijdens de onthulling in noncha staat het verkeer stil, dan zwijgen de motoren.
const ENGINE_LEVEL = { normal: 0.35, noncha: 1 };
function updateAudio() {
  const playing = game.active && game.state !== 'hit' && !game.paused && current === 'game';
  const p = game.player;
  audio.updateTraffic(game.traffic, playing ? { x: p.col + 0.5, row: p.row } : null, playing ? ENGINE_LEVEL[game.mode] : 0);
}

/**
 * Noncha: trillen als een voertuig heel dichtbij is in de huidige of de volgende rijstrook.
 * Sterker trillen voor de huidige strook. Maximaal één keer per 300 ms.
 */
let lastVibrate = 0;
function updateVibration(now) {
  if (game.mode !== 'noncha' || game.state !== 'playing' || game.paused || current !== 'game') return;
  if (!settings.vibrate || typeof navigator.vibrate !== 'function' || now - lastVibrate < 300) return;
  const p = game.player;
  const [xMin, xMax] = p.hitbox();
  let ms = 0;
  for (const [row, maxSeconds, strength] of [
    [p.row, 0.8, 80],
    [p.row - 1, 0.5, 35],
  ]) {
    const lane = game.traffic.laneByRow.get(row);
    if (!lane) continue;
    for (const v of lane.vehicles) {
      // Afstand tot contact in de rijrichting (negatief = al voorbij of erop)
      const gap = lane.dir > 0 ? xMin - (v.x + v.length) : v.x - xMax;
      if (gap >= 0 && gap / Math.max(0.1, v.speed) < maxSeconds) ms = Math.max(ms, strength);
    }
  }
  if (ms) {
    vibrate(ms);
    lastVibrate = now;
  }
}

if (new URLSearchParams(location.search).has('debug')) window.__snelweg = { game, audio };

// --- Schermwissel ------------------------------------------------------------

let current = 'menu'; // 'game' of een sleutel uit screens
let backTarget = 'menu'; // waar "Terug" naartoe gaat vanuit highscores/instellingen

function show(name, { focus = true } = {}) {
  current = name;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  hud.root.classList.toggle('is-hidden', name !== 'game' && name !== 'pause');
  updateTouchControls();
  if (focus && screens[name]) focusFirst(screens[name]);
  if (name === 'game' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Elementen die met Tab of pijl omhoog/omlaag bereikbaar zijn (bij radiogroepen en tabs alleen de gekozen optie). */
function focusables(root) {
  return [...root.querySelectorAll('button, input, [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !el.disabled && !el.closest('[hidden]'),
  );
}

function focusFirst(root) {
  const el = root.querySelector('[data-autofocus]:not([hidden])') ?? focusables(root)[0];
  el?.focus();
}

function startGame(mode = 'normal') {
  game.player.look = { ...profile.look };
  game.player.face = profile.face ?? null;
  game.newGame(mode);
  show('game');
}

function goMenu() {
  game.idle();
  renderWho();
  show('menu');
}

/** "Je speelt als …" in het hoofdmenu. */
function renderWho() {
  const who = $('menu-who');
  const name = document.createElement('strong');
  name.textContent = displayName(profile);
  who.replaceChildren(createAvatar(profile.look, 32, profile.faceSmall ?? profile.face), 'Je speelt als ', name);
}

// --- Gezicht uitsnijden ----------------------------------------------------------

async function openFaceEditor(file) {
  customizer.setStatus('Foto openen…');
  try {
    const source = await loadImageFile(file);
    customizer.setStatus('');
    show('face', { focus: false });
    faceEditor.open(source);
    $('face-canvas').focus();
  } catch {
    customizer.setStatus('Deze foto kan niet worden geopend. Kies een andere afbeelding.', 'error');
  }
}

function closeFaceEditor(result) {
  faceEditor.close();
  show('customize', { focus: false });
  if (result) customizer.setFace(result);
  screens.customize.querySelector('[data-cz="photo"]').focus();
}

screens.face.querySelector('[data-face="rotate"]').addEventListener('click', () => faceEditor.rotate());

function pauseGame() {
  if (current !== 'game' || !game.active) return;
  game.pause();
  show('pause');
}

function resumeGame() {
  game.resume();
  show('game');
}

const actions = {
  play: () => startGame('normal'),
  'play-again': () => startGame(game.mode),
  highscores: () => openHighscores(current === 'gameover' ? lastResult?.mode : 'normal'),
  settings: () => openSettings(),
  customize: () => {
    customizer.open();
    show('customize');
  },
  noncha: () => show('noncha'),
  'noncha-start': () => startGame('noncha'),
  'noncha-test': () => {
    audio.unlock();
    audio.playPassBy();
    announce('Je hoort een auto van links naar rechts rijden.');
  },
  'face-use': () => closeFaceEditor(faceEditor.export()),
  'face-cancel': () => closeFaceEditor(null),
  resume: resumeGame,
  quit: () => game.quit(),
  menu: goMenu,
  back: () => (backTarget === 'gameover' ? show('gameover') : goMenu()),
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action], [data-cz], [role="radio"], [role="tab"]');
  if (!btn || btn.disabled) return;
  audio.play('ui');
  if (btn.dataset.action) actions[btn.dataset.action]?.();
});

hud.pause.addEventListener('click', pauseGame);
// Op touch direct bij aanraken reageren (net als de pijlknoppen).
hud.pause.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  e.preventDefault();
  pauseGame();
});

// --- Pijlknoppen op het scherm -------------------------------------------------------

const app = $('app');
const touchControls = $('touch-controls');

/** De ruimte voor de knoppen blijft gereserveerd zolang de instelling aan staat (geen verspringend veld). */
function updateTouchControls() {
  app.classList.toggle('show-touch', settings.touchButtons);
  touchControls.hidden = !(settings.touchButtons && current === 'game');
}

for (const btn of touchControls.querySelectorAll('[data-dir]')) {
  const [dx, dy] = btn.dataset.dir.split(',').map(Number);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // geen focus, geen zoom, direct reageren
    btn.classList.add('is-pressed');
    audio.unlock();
    game.handleMove(dx, dy);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(type, () => btn.classList.remove('is-pressed'));
  }
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// --- Toetsenbord ---------------------------------------------------------------

const input = new Input(
  stage,
  {
    onMove: (dx, dy) => game.handleMove(dx, dy),
    onPause: pauseGame,
    onWhere: where,
  },
  () => current === 'game',
);

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return; // al afgehandeld (bijv. door de gezichteditor)
  if (current === 'game') {
    input.handleKey(e);
    return;
  }
  handleMenuKey(e);
});

/** Menu's zijn volledig met het toetsenbord te bedienen (ook pijltjes). */
function handleMenuKey(e) {
  const screen = screens[current];
  if (!screen || e.ctrlKey || e.metaKey || e.altKey) return;
  const active = document.activeElement;

  if (e.code === 'Escape' || (current === 'pause' && e.code === 'KeyP')) {
    e.preventDefault();
    if (current === 'pause') resumeGame();
    else if (current === 'highscores' || current === 'settings') actions.back();
    else if (current === 'customize' || current === 'noncha') goMenu();
    else if (current === 'face') actions['face-cancel']();
    else if (current === 'gameover' && active !== goName) goMenu(); // niet per ongeluk tijdens naam typen
    return;
  }

  // Tabs en radiogroepen: links/rechts wisselt (en kiest) binnen de groep.
  const role = active?.getAttribute('role');
  if ((role === 'tab' || role === 'radio') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    const group = active.closest('[role="tablist"], [role="radiogroup"]');
    const items = [...group.querySelectorAll(`[role="${role}"]`)];
    const next = items[(items.indexOf(active) + (e.code === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    next.click();
    next.focus();
    return;
  }

  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const list = focusables(screen);
    if (!list.length) return;
    const i = list.indexOf(active);
    const step = e.code === 'ArrowDown' ? 1 : -1;
    const next = i === -1 ? list[0] : list[(i + step + list.length) % list.length];
    next.focus();
  }
}

// --- Game over en highscores -----------------------------------------------------

const goScore = $('go-score');
const goForm = $('go-form');
const goName = $('go-name');
const goStatus = $('go-status');
let lastResult = null; // { mode, score, level }
let lastSaved = null; // { mode, rank }

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

function showGameOver(result) {
  lastResult = result;
  lastSaved = null;
  goScore.textContent = `${result.mode === 'noncha' ? 'Noncha · ' : ''}Score ${result.score} · Level ${result.level}`;
  announce(`Game over. ${goScore.textContent}.`);
  const canSave = qualifies(result.mode, result.score);
  goForm.hidden = !canSave;
  goName.maxLength = NAME_MAX_LENGTH;
  goName.value = profile.name?.trim() || settings.lastName;
  setStatus(goStatus, canSave ? '' : 'Geen highscore deze keer.');
  backTarget = 'gameover';
  show('gameover', { focus: false });
  if (canSave) {
    goName.focus();
    goName.select();
  } else {
    focusFirst(screens.gameover);
  }
}

goForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!lastResult) return;
  const name = goName.value.trim().slice(0, NAME_MAX_LENGTH) || 'Speler';
  try {
    const rank = addHighscore(lastResult.mode, {
      name,
      score: lastResult.score,
      level: lastResult.level,
      look: game.player.look,
      face: profile.faceSmall,
    });
    lastSaved = { mode: lastResult.mode, rank };
    goForm.hidden = true;
    setStatus(goStatus, `Opgeslagen op plek ${rank}!`, 'ok');
    screens.gameover.querySelector('[data-action="play-again"]').focus();
  } catch (err) {
    setStatus(goStatus, err instanceof StorageError ? err.message : 'Opslaan is niet gelukt.', 'error');
    return;
  }
  settings.lastName = name;
  trySaveSettings();
});

const hsList = $('hs-list');
const hsEmpty = $('hs-empty');

function openHighscores(mode = 'normal') {
  if (current !== 'gameover') backTarget = 'menu';
  show('highscores', { focus: false });
  selectHighscoreTab(mode);
  screens.highscores.querySelector(`[role="tab"][data-mode="${mode}"]`).focus();
}

function selectHighscoreTab(mode) {
  for (const tab of screens.highscores.querySelectorAll('[role="tab"]')) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  hsList.setAttribute('aria-labelledby', `tab-${mode}`);
  renderHighscores(mode);
}

screens.highscores.querySelector('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[role="tab"]');
  if (tab) selectHighscoreTab(tab.dataset.mode);
});

function renderHighscores(mode) {
  const list = loadHighscores()[mode];
  hsList.replaceChildren();
  hsEmpty.hidden = list.length > 0;
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    if (lastSaved && lastSaved.mode === mode && lastSaved.rank === i + 1) li.classList.add('is-new');

    const rank = document.createElement('span');
    rank.className = 'hs-rank';
    rank.textContent = i + 1;

    const name = document.createElement('span');
    name.className = 'hs-name';
    name.textContent = entry.name;

    const score = document.createElement('span');
    score.className = 'hs-score';
    score.textContent = entry.score;
    const level = document.createElement('span');
    level.className = 'hs-level';
    level.textContent = `level ${entry.level}`;
    score.append(level);

    li.append(rank, createAvatar(entry.look, 36, entry.face), name, score);
    hsList.append(li);
  });
}

// --- Instellingen ---------------------------------------------------------------

const settingsForm = $('settings-form');
const settingsStatus = $('settings-status');

function openSettings() {
  backTarget = 'menu';
  const f = settingsForm.elements;
  f.sound.checked = settings.sound;
  f.volume.value = Math.round(settings.volume * 100);
  f.vibrate.checked = settings.vibrate;
  f.touchButtons.checked = settings.touchButtons;
  setStatus(settingsStatus, '');
  show('settings');
}

settingsForm.addEventListener('input', () => {
  const f = settingsForm.elements;
  settings.sound = f.sound.checked;
  settings.volume = Number(f.volume.value) / 100;
  settings.vibrate = f.vibrate.checked;
  settings.touchButtons = f.touchButtons.checked;
  audio.setVolume(settings.sound, settings.volume);
  updateTouchControls();
  trySaveSettings(settingsStatus);
});
// Na het loslaten van de schuif of het aanzetten van geluid: even laten horen hoe hard het is.
settingsForm.addEventListener('change', () => audio.play('finish'));
settingsForm.addEventListener('submit', (e) => e.preventDefault());

function trySaveSettings(statusEl) {
  try {
    saveSettings(settings);
    if (statusEl) setStatus(statusEl, '');
  } catch (err) {
    if (statusEl) setStatus(statusEl, err.message, 'error');
  }
}

// --- Canvas-grootte en automatische pauze ------------------------------------------

function fit() {
  // Beschikbare ruimte zonder padding (die is gereserveerd voor o.a. de pijlknoppen).
  const cs = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  renderer.resize(w, h);
}
new ResizeObserver(fit).observe(stage);
fit();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('blur', pauseGame);

// --- HUD en meldingen alleen bijwerken als er iets verandert -------------------

function restartAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // forceer reflow zodat de animatie opnieuw start
  el.classList.add(cls);
}

const shown = {};
function syncHud() {
  if (shown.level !== game.level) hud.level.textContent = shown.level = game.level;
  if (shown.score !== game.score) {
    if (game.score > shown.score) restartAnimation(hud.score, 'bump');
    hud.score.textContent = shown.score = game.score;
  }
  if (shown.mult !== game.multiplier) {
    shown.mult = game.multiplier;
    $('hud-mult').hidden = game.multiplier === 1;
  }
  if (shown.lives !== game.lives) {
    if (game.lives < shown.lives) restartAnimation(hud.lives, 'hurt');
    shown.lives = game.lives;
    const lives = Math.max(0, game.lives);
    hud.lives.textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, START_LIVES - lives));
    hud.lives.setAttribute('aria-label', `${lives} ${lives === 1 ? 'leven' : 'levens'}`);
  }
  if (shown.message !== game.message) {
    shown.message = game.message;
    const m = game.message;
    toast.hidden = !m;
    if (m) {
      toast.querySelector('.toast-title').textContent = m.title ?? '';
      toast.querySelector('.toast-text').textContent = m.text ?? '';
    }
  }
}

// --- Game loop -------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); // grote sprongen (tab weg) afkappen
  last = now;
  game.update(dt);
  renderer.draw(game, dt);
  updateAudio();
  updateVibration(now);
  syncHud();
  requestAnimationFrame(frame);
}

renderWho();
show('menu');
requestAnimationFrame(frame);
