import { COLS, ROWS } from './config.js';
import { Game, MAX_LEVEL } from './game.js';
import { Renderer } from './render.js';
import { Renderer3D } from './render3d.js';
import { rowKinds } from './themes.js';
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
  loadProfiles,
  StorageError,
  NAME_MAX_LENGTH,
} from './storage.js';

// --- Noncha: "even kijken" (elke paar seconden kort het speelveld zien) -----------------

const glimpseGroup = document.getElementById('glimpse-group');
function renderGlimpse() {
  for (const btn of glimpseGroup.querySelectorAll('[data-glimpse]')) {
    const checked = Number(btn.dataset.glimpse) === settings.nonchaGlimpse;
    btn.setAttribute('aria-checked', String(checked));
    btn.tabIndex = checked ? 0 : -1;
  }
}
glimpseGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-glimpse]');
  if (!btn) return;
  settings.nonchaGlimpse = Number(btn.dataset.glimpse);
  renderGlimpse();
  trySaveSettings();
});

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
  duel: $('screen-duel'),
  duelover: $('screen-duelover'),
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
const game = new Game({ onGameOver: showGameOver, onEvent: onGameEvent, onDuelOver: showDuelOver });
const renderer2d = new Renderer(canvas);
const canvas3d = $('game3d');
let renderer3d = null; // pas aangemaakt bij de eerste keer 3D
let renderer = renderer2d;

// Browsers staan geluid pas toe na een gebruikersactie.
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => audio.unlock(), { capture: true });
}

// --- Geluid, trillen en meldingen bij spelgebeurtenissen ---------------------------

const VEHICLE_NAMES = { car: 'een auto', van: 'een bestelbus', truck: 'een vrachtwagen', motor: 'een motor', sport: 'een sportwagen', fire: 'de brandweer', ambulance: 'een ambulance', police: 'de politie', tractor: 'een trekker', bike: 'een fietser', bakfiets: 'een bakfiets', scooter: 'een snorfiets' };
/** Naam van een rij voor schermlezers; hangt af van het wegtype (fietspad, berm, rijstrook n). */
function rowName(row) {
  const kinds = rowKinds(game.params.theme);
  const fixed = { finish: 'de overkant', start: 'de startberm', median: 'de middenberm', bike: 'het fietspad', verge: 'de berm' };
  if (fixed[kinds[row]]) return fixed[kinds[row]];
  // Rijstroken genummerd vanaf de startkant
  const roads = [];
  for (let r = kinds.length - 1; r >= 0; r--) if (kinds[r] === 'road') roads.push(r);
  return `rijstrook ${roads.indexOf(row) + 1}`;
}

/** Links/rechts-positie van de speler voor geluid: -0.8 (links) … 0.8 (rechts). */
const playerPan = (i = 0) => (((game.players[i] || game.player).col - 6) / 6) * 0.8;

/** Melding voor schermlezers (zichtbaar voor niemand, hoorbaar voor wie er een gebruikt). */
function announce(text) {
  srStatus.textContent = '';
  // Kleine vertraging zodat dezelfde tekst opnieuw wordt voorgelezen.
  setTimeout(() => (srStatus.textContent = text), 30);
}

function vibrate(pattern) {
  // Browsers staan trillen pas toe na een tik of toets op de pagina.
  const activated = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  if (settings.vibrate && activated && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // niet ondersteund
    }
  }
}

function onGameEvent(type, data = {}) {
  const who = data.player || 0;
  audio.play(type === 'duelwin' ? 'finish' : type, { pan: playerPan(who) });
  if (game.mode === 'duel') {
    onDuelEvent(type, who, data);
    return;
  }
  switch (type) {
    case 'finish':
      renderer.confetti(game.player.col + 0.5, game.player.row + 0.4);
      break;
    default:
      break;
  }
  switch (type) {
    case 'levelstart':
      announce(
        game.params.autobahn
          ? `Level ${data.level}. Autobahn: geen snelheidslimiet. Aan de overkant: ${game.place}.`
          : `Level ${data.level}. ${game.theme.label}, maximaal ${game.params.speedLimit} kilometer per uur. Aan de overkant: ${game.place}.`,
      );
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
        `Geraakt door ${(data.vehicle && VEHICLE_NAMES[data.vehicle.type]) || 'een voertuig'}! ` +
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
  announce(`Je staat op ${rowName(p.row)}, ${side} (positie ${p.col + 1} van 13).`);
}

// Alleen tijdens het spelen klinkt het verkeer (zacht in de normale modus).
// Tijdens de onthulling in noncha staat het verkeer stil, dan zwijgen de motoren.
const ENGINE_LEVEL = { normal: 0.35, noncha: 1 };
function updateAudio() {
  const playing = game.active && game.state !== 'hit' && !game.paused && current === 'game';
  // Samen spelen: luisteren vanuit het midden tussen beide spelers
  const ps = game.players;
  const x = ps.reduce((s, p) => s + p.col + 0.5, 0) / ps.length;
  const row = ps.reduce((s, p) => s + p.row, 0) / ps.length;
  const level = ENGINE_LEVEL[game.mode] || ENGINE_LEVEL.normal;
  audio.updateTraffic(game.traffic, playing ? { x, row: Math.round(row) } : null, playing ? level : 0);
}

/**
 * Tijd (s) tot een voertuig in deze rij de speler bereikt; 0 als het er nu al staat,
 * null als er niets aankomt. Ook de kant waar het vandaan komt (pan -1 links … 1 rechts).
 */
function approaching(row) {
  const lane = game.traffic.laneByRow.get(row);
  if (!lane) return null;
  const [xMin, xMax] = game.player.hitbox();
  let best = null;
  for (const v of lane.vehicles) {
    const front = lane.dir > 0 ? v.x + v.length : v.x;
    const gap = lane.dir > 0 ? xMin - front : front - xMax;
    const passed = lane.dir > 0 ? v.x >= xMax : v.x + v.length <= xMin;
    if (passed) continue;
    const ttc = gap <= 0 ? 0 : gap / Math.max(0.1, v.speed);
    if (!best || ttc < best.ttc) best = { ttc, pan: lane.dir > 0 ? -0.7 : 0.7 };
  }
  return best;
}

/**
 * Noncha-hulp, als een parkeersensor:
 * - hoge piep: er komt iets aan in de strook vóór je (sneller = dichterbij);
 * - lage, dringende piep: er komt iets aan in jóuw strook;
 * - stilte: veilig om een stap vooruit te zetten.
 * Het piepje klinkt uit de kant waar het voertuig vandaan komt.
 */
const SENSOR_AHEAD = 1.4; // s vooruitkijken in de strook vóór je
const SENSOR_HERE = 1.0; // s vooruitkijken in je eigen strook
let nextBeepAt = 0;
function updateSensor(now) {
  if (game.mode !== 'noncha' || game.state !== 'playing' || game.paused || current !== 'game') return;
  if (now < nextBeepAt) return;
  const p = game.player;
  const here = approaching(p.row);
  const ahead = approaching(p.row - 1);
  if (here && here.ttc < SENSOR_HERE) {
    audio.play('danger', { pan: here.pan });
    nextBeepAt = now + 1000 * (0.08 + 0.25 * (here.ttc / SENSOR_HERE));
  } else if (ahead && ahead.ttc < SENSOR_AHEAD) {
    audio.play('sensor', { pan: ahead.pan });
    nextBeepAt = now + 1000 * (0.09 + 0.4 * (ahead.ttc / SENSOR_AHEAD));
  }
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

if (new URLSearchParams(location.search).has('debug')) window.__snelweg = {
    game,
    audio,
    get renderer3d() {
      return renderer3d;
    },
  };

// --- Schermwissel ------------------------------------------------------------

let current = 'menu'; // 'game' of een sleutel uit screens
let backTarget = 'menu'; // waar "Terug" naartoe gaat vanuit highscores/instellingen

function show(name, { focus = true } = {}) {
  current = name;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  hud.root.classList.toggle('is-hidden', name !== 'game' && name !== 'pause');
  app.classList.toggle('duel', game.mode === 'duel' && (name === 'game' || name === 'pause'));
  updateTouchControls();
  if (focus && screens[name]) focusFirst(screens[name]);
  if (name === 'game' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Elementen die met Tab of pijl omhoog/omlaag bereikbaar zijn (bij radiogroepen en tabs alleen de gekozen optie). */
function focusables(root) {
  return [...root.querySelectorAll('button, input, a[href], [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !el.disabled && !el.closest('[hidden]'),
  );
}

function focusFirst(root) {
  const el = root.querySelector('[data-autofocus]:not([hidden])') || focusables(root)[0];
  if (el) el.focus({ preventScroll: true });
  // Een lang paneel begint bovenaan (titel en uitleg eerst), ook als de focus lager staat.
  const panel = root.querySelector('.panel');
  if (panel) panel.scrollTop = 0;
}

// Snelkoppeling: ?level=7 achter de URL begint meteen op dat level (oefenen, geen highscore)
const startLevelParam = (() => {
  const n = parseInt(new URLSearchParams(location.search).get('level'), 10);
  return n >= 1 ? Math.min(MAX_LEVEL, n) : 0;
})();

function startGame(mode = 'normal') {
  game.player.look = { ...profile.look };
  game.player.face = profile.face || null;
  if (startLevelParam > 1) game.newGame(mode, { level: startLevelParam, practice: true });
  else game.newGame(mode);
  game.glimpseEvery = mode === 'noncha' ? settings.nonchaGlimpse : 0;
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
  who.textContent = '';
  who.append(createAvatar(profile.look, 32, profile.faceSmall || profile.face), 'Je speelt als ', name);
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
  } catch (e) {
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
  highscores: () => openHighscores(current === 'gameover' && lastResult ? lastResult.mode : 'normal'),
  settings: () => openSettings(),
  customize: () => {
    customizer.open();
    show('customize');
  },
  noncha: () => {
    renderGlimpse();
    show('noncha');
  },
  'noncha-start': () => startGame('noncha'),
  'noncha-test': () => {
    audio.unlock();
    audio.playPassBy();
    announce('Je hoort een auto van links naar rechts rijden.');
  },
  fullscreen: () => {
    // Dezelfde tik heeft net al automatisch volledig scherm aangevraagd: niet meteen weer sluiten.
    if (Date.now() - autoFullscreenAt < 1000) return;
    autoFullscreenTried = true; // zelf gekozen: niet meer automatisch
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
    $('btn-fs').blur();
  },
  view: () => {
    setView(settings.view === '3d' ? '2d' : '3d');
    trySaveSettings();
  },
  'face-use': () => closeFaceEditor(faceEditor.export()),
  'face-cancel': () => closeFaceEditor(null),
  resume: resumeGame,
  quit: () => (game.mode === 'duel' ? goMenu() : game.quit()),
  duel: openDuel,
  'duel-start': () => startDuel(true),
  'duel-again': () => startDuel(false),
  menu: goMenu,
  back: () => (backTarget === 'gameover' ? show('gameover') : goMenu()),
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action], [data-cz], [role="radio"], [role="tab"]');
  if (!btn || btn.disabled) return;
  audio.play('ui');
  if (btn.dataset.action && actions[btn.dataset.action]) actions[btn.dataset.action]();
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
const touchControlsLeft = $('touch-controls-left');
// ?smartboard in de URL zet de smartboard-modus aan (handig als bladwijzer in de klas).
const forceSmartboard = new URLSearchParams(location.search).has('smartboard');

/** De ruimte voor de knoppen blijft gereserveerd zolang de instelling aan staat (geen verspringend veld). */
function updateTouchControls() {
  const smartboard = settings.smartboard || forceSmartboard;
  document.documentElement.classList.toggle('smartboard', smartboard);
  app.classList.toggle('show-touch', settings.touchButtons);
  const visible = settings.touchButtons && current === 'game';
  touchControls.hidden = !visible;
  touchControlsLeft.hidden = !(visible && (smartboard || game.mode === 'duel'));
  if (!window.ResizeObserver) fit(); // zonder ResizeObserver zelf opnieuw meten
}

/**
 * Eerste aanraking van een touchscreen: pijlknoppen aan, en op een groot scherm de
 * smartboard-modus. Alleen zolang de speler die instellingen niet zelf heeft gekozen.
 */
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType !== 'touch') return;
    let changed = false;
    if (settings.touchAuto && !settings.touchButtons) {
      settings.touchButtons = true;
      changed = true;
    }
    if (settings.smartboardAuto && !settings.smartboard && Math.min(screen.width, innerWidth) >= 1700) {
      settings.smartboard = true;
      changed = true;
    }
    if (changed) {
      trySaveSettings();
      // Pas ná deze tik de layout aanpassen: anders schuift de knop onder de vinger weg
      // (smartboard-modus maakt alles groter) en mist de tik.
      setTimeout(updateTouchControls, 450);
    }
  },
  { capture: true },
);

// --- Volledig scherm -------------------------------------------------------------------
// Een webpagina kan de adresbalk niet zelf verbergen; dat kan alleen via de Fullscreen-API,
// en alleen direct na een tik/klik. In de smartboard-modus gebeurt dat bij de eerste tik
// (één keer per keer dat de pagina geopend wordt); daarnaast is er een knop.

const fsRoot = document.documentElement;
const fsSupported = !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

function quietly(result) {
  if (result && typeof result.catch === 'function') result.catch(() => {});
}

function enterFullscreen() {
  try {
    quietly(fsRoot.requestFullscreen ? fsRoot.requestFullscreen() : fsRoot.webkitRequestFullscreen());
  } catch (e) {
    // niet toegestaan of niet ondersteund
  }
}

function exitFullscreen() {
  try {
    if (document.exitFullscreen) quietly(document.exitFullscreen());
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) {
    // al uit volledig scherm
  }
}

function updateFullscreenButtons() {
  const on = isFullscreen();
  for (const btn of [$('btn-fs'), $('menu-fs')]) {
    btn.hidden = !fsSupported;
    btn.setAttribute('aria-label', on ? 'Volledig scherm sluiten' : 'Volledig scherm');
    btn.title = btn.getAttribute('aria-label');
  }
}

for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(type, () => {
    updateFullscreenButtons();
    fitAppHeight();
  });
}

let autoFullscreenTried = false;
let autoFullscreenAt = 0;
// pointerup (niet pointerdown): bij aanraking telt pas het loslaten als gebruikersactie.
window.addEventListener(
  'pointerup',
  () => {
    if (autoFullscreenTried || !fsSupported || !(settings.smartboard || forceSmartboard)) return;
    autoFullscreenTried = true;
    if (!isFullscreen()) {
      autoFullscreenAt = Date.now();
      enterFullscreen();
    }
  },
  { capture: true },
);

/**
 * Tik-om-te-lopen. Normaal: één stap in de richting van de tik, gezien vanaf het poppetje.
 * Noncha (poppetje onzichtbaar): vaste vlakken; bovenste derde = vooruit, onderste derde =
 * terug, middenband links/rechts = opzij.
 */
function onTap(clientX, clientY, pointerType) {
  if (!settings.tapToWalk || !game.active || game.state !== 'playing') return;
  // Samen spelen: linkerhelft van het scherm = speler 1, rechterhelft = speler 2
  const who = game.mode === 'duel' ? sideOf(clientX) : 0;
  // Muisklikken alleen in de smartboard-modus (sommige digiborden geven aanraking door als muis).
  if (pointerType === 'mouse' && !(settings.smartboard || forceSmartboard)) return;
  let dx;
  let dy;
  if (game.mode === 'noncha') {
    // Vaste vlakken van het (zwarte) speelveld, in 2D en 3D gelijk
    const r = renderer.canvas.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width;
    const fy = (clientY - r.top) / r.height;
    if (fy < 1 / 3) [dx, dy] = [0, -1];
    else if (fy > 2 / 3) [dx, dy] = [0, 1];
    else [dx, dy] = [fx < 0.5 ? -1 : 1, 0];
  } else {
    const pos = renderer.screenToGrid(clientX, clientY);
    if (!pos) return;
    const { gx, gy } = pos;
    const me = game.players[who] || game.player;
    const px = me.col + 0.5;
    const py = me.row + 0.5;
    const ox = gx - px;
    const oy = gy - py;
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) return; // op het poppetje zelf getikt
    [dx, dy] = Math.abs(ox) > Math.abs(oy) ? [Math.sign(ox), 0] : [0, Math.sign(oy)];
    renderer.markTap(gx, gy);
  }
  game.handleMove(dx, dy, who);
}

/** Samen spelen: 0 = linkerhelft van het scherm (speler 1), 1 = rechterhelft (speler 2). */
function sideOf(clientX) {
  return clientX < window.innerWidth / 2 ? 0 : 1;
}

for (const btn of document.querySelectorAll('.touch-controls [data-dir]')) {
  const [dx, dy] = btn.dataset.dir.split(',').map(Number);
  // Samen spelen: linker pijlknoppen = speler 1, rechter = speler 2
  const side = btn.closest('.tc-side-left') ? 0 : 1;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // geen focus, geen zoom, direct reageren
    btn.classList.add('is-pressed');
    audio.unlock();
    game.handleMove(dx, dy, game.mode === 'duel' ? side : 0);
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
    onMove: (dx, dy, source) => {
      if (game.mode !== 'duel') return game.handleMove(dx, dy);
      // W A S D = speler 1, pijltjes = speler 2, swipe = de helft waar hij begon
      const who = source === 'wasd' ? 0 : source === 'arrows' ? 1 : sideOf(source.x);
      return game.handleMove(dx, dy, who);
    },
    onPause: pauseGame,
    onWhere: where,
    onTap,
  },
  () => current === 'game',
);

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return; // al afgehandeld (bijv. door de gezichteditor)
  if (current === 'game' && e.code === 'KeyV' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    actions.view(); // V: wissel tussen 2D en 3D
    return;
  }
  if (current === 'game' && (e.code === 'PageUp' || e.code === 'PageDown') && !e.repeat) {
    e.preventDefault();
    game.jumpLevel(e.code === 'PageUp' ? 1 : -1); // snelkoppeling naar een ander level
    return;
  }
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
    else if (current === 'customize' || current === 'noncha' || current === 'duel' || current === 'duelover') goMenu();
    else if (current === 'face') actions['face-cancel']();
    else if (current === 'gameover' && active !== goName) goMenu(); // niet per ongeluk tijdens naam typen
    return;
  }

  // Tabs en radiogroepen: links/rechts wisselt (en kiest) binnen de groep.
  const role = active && active.getAttribute('role');
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

// --- Samen spelen ----------------------------------------------------------------------
// Twee spelers op één apparaat; wie het eerst aan de overkant is, wint.

const GUEST = { id: 'guest', name: 'Gast', look: { base: 'mei', shirt: '#f77f00', pants: '#1f2124', hat: 'cap', hatColor: '#1d4ed8' } };
const duelChoice = { ids: [null, null], level: 1 };
let duelPlayers = [GUEST, GUEST]; // profielen van speler 1 en 2 tijdens het spel

function duelOptions(i) {
  const list = loadProfiles().list;
  return i === 1 ? list.concat([GUEST]) : list;
}

function openDuel() {
  const list = loadProfiles().list;
  const options1 = duelOptions(0);
  const options2 = duelOptions(1);
  if (!options1.some((p) => p.id === duelChoice.ids[0])) duelChoice.ids[0] = profile.id;
  if (!options2.some((p) => p.id === duelChoice.ids[1])) {
    const other = list.find((p) => p.id !== duelChoice.ids[0]);
    duelChoice.ids[1] = other ? other.id : GUEST.id;
  }
  renderDuel();
  show('duel');
}

function renderDuel() {
  for (const i of [0, 1]) {
    const group = screens.duel.querySelector(`[data-duel="${i}"]`);
    group.textContent = '';
    for (const p of duelOptions(i)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cz-profile';
      btn.setAttribute('role', 'radio');
      const checked = p.id === duelChoice.ids[i];
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
      btn.dataset.id = p.id;
      const name = document.createElement('span');
      name.textContent = p.id === GUEST.id ? GUEST.name : displayName(p);
      btn.append(createAvatar(p.look, 40, p.faceSmall || p.face), name);
      group.append(btn);
    }
  }
  for (const btn of screens.duel.querySelectorAll('[data-level]')) {
    const checked = Number(btn.dataset.level) === duelChoice.level;
    btn.setAttribute('aria-checked', String(checked));
    btn.tabIndex = checked ? 0 : -1;
  }
}

screens.duel.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-id]');
  const level = e.target.closest('[data-level]');
  let refocus;
  if (pick) {
    const i = Number(pick.closest('[data-duel]').dataset.duel);
    duelChoice.ids[i] = pick.dataset.id;
    refocus = `[data-duel="${i}"] [data-id="${pick.dataset.id}"]`;
  } else if (level) {
    duelChoice.level = Number(level.dataset.level);
    refocus = `[data-level="${level.dataset.level}"]`;
  } else {
    return;
  }
  renderDuel();
  // Focus terug op de zojuist gekozen optie (de profielknoppen zijn opnieuw opgebouwd)
  const again = screens.duel.querySelector(refocus);
  if (again) again.focus();
});

const duelName = (i) => {
  const p = duelPlayers[i];
  return p.id === GUEST.id ? GUEST.name : displayName(p);
};

function startDuel(resetWins) {
  const all = duelOptions(1);
  duelPlayers = duelChoice.ids.map((id) => all.find((p) => p.id === id) || GUEST);
  game.players = [game.player, game.player2];
  [game.player, game.player2].forEach((pl, i) => {
    pl.look = { ...duelPlayers[i].look };
    pl.face = duelPlayers[i].face || null;
  });
  game.newGame('duel', { level: duelChoice.level, resetWins });
  game.glimpseEvery = 0;
  shown.duel = null; // HUD opnieuw opbouwen
  show('game');
}

function onDuelEvent(type, who, data) {
  switch (type) {
    case 'levelstart':
      announce(`Samen spelen. ${duelName(0)} tegen ${duelName(1)}. Lopen!`);
      break;
    case 'hit':
      announce(`${duelName(who)} is geraakt door ${(data.vehicle && VEHICLE_NAMES[data.vehicle.type]) || 'een voertuig'}! Terug naar de start.`);
      vibrate(120);
      break;
    case 'duelwin': {
      const p = game.players[who];
      renderer.confetti(p.col + 0.5, p.row + 0.4);
      game.setMessage({ title: `${duelName(who)} wint!`, text: 'Als eerste aan de overkant', toast: true }, 1.8);
      announce(`${duelName(who)} wint!`);
      break;
    }
    default:
      break;
  }
}

function showDuelOver({ winner, wins }) {
  $('duelover-title').textContent = `${duelName(winner)} wint!`;
  $('duel-score').textContent = `Stand: ${duelName(0)} ${wins[0]} – ${wins[1]} ${duelName(1)}`;
  show('duelover');
  announce(`${$('duelover-title').textContent} ${$('duel-score').textContent}`);
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
  const canSave = !result.practice && qualifies(result.mode, result.score);
  goForm.hidden = !canSave;
  goName.maxLength = NAME_MAX_LENGTH;
  goName.value = (profile.name && profile.name.trim()) || settings.lastName;
  setStatus(
    goStatus,
    canSave ? '' : result.practice ? 'Oefenpotje (level gekozen): telt niet voor de highscores.' : 'Geen highscore deze keer.',
  );
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
  hsList.textContent = '';
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
  f.tapToWalk.checked = settings.tapToWalk;
  f.smartboard.checked = settings.smartboard || forceSmartboard;
  f.view3d.checked = settings.view === '3d';
  setStatus(settingsStatus, '');
  show('settings');
}

settingsForm.addEventListener('input', (e) => {
  const f = settingsForm.elements;
  settings.sound = f.sound.checked;
  settings.volume = Number(f.volume.value) / 100;
  settings.vibrate = f.vibrate.checked;
  settings.touchButtons = f.touchButtons.checked;
  settings.tapToWalk = f.tapToWalk.checked;
  settings.smartboard = f.smartboard.checked;
  // Zelf gekozen: niet meer automatisch aanpassen bij aanraking.
  if (e.target.name === 'touchButtons') settings.touchAuto = false;
  if (e.target.name === 'smartboard') settings.smartboardAuto = false;
  if (e.target.name === 'view3d') {
    const ok3d = setView(f.view3d.checked ? '3d' : '2d');
    f.view3d.checked = settings.view === '3d';
    if (!ok3d) {
      trySaveSettings();
      setStatus(settingsStatus, '3D werkt niet in deze browser (geen WebGL). Het spel blijft in 2D.', 'error');
      return;
    }
  }
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

// --- Weergave: 2D (bovenaanzicht) of 3D (schuin meekijken) ---------------------------------

/**
 * Wisselt de weergave. Zonder WebGL blijft het 2D; geeft dan false terug.
 * De spellogica merkt er niets van: alleen het tekenen verandert.
 */
function setView(view) {
  let ok = true;
  if (view === '3d' && !renderer3d) {
    renderer3d = Renderer3D.create(canvas3d);
    if (!renderer3d) ok = false;
  }
  if (view === '3d' && (!renderer3d || renderer3d.lost)) {
    view = '2d';
    ok = false;
  }
  settings.view = view;
  renderer = view === '3d' ? renderer3d : renderer2d;
  canvas.hidden = view === '3d';
  canvas3d.hidden = view !== '3d';
  const next = view === '3d' ? '2D' : '3D';
  for (const btn of [$('btn-view'), $('menu-view')]) {
    btn.textContent = next;
    btn.setAttribute('aria-label', `Wissel naar ${next}-weergave`);
    btn.title = btn.getAttribute('aria-label');
  }
  fit();
  return ok;
}

/** 3D te traag of de grafische kaart haakt af: terug naar 2D, met een melding. */
function checkRenderer3d() {
  if (renderer !== renderer3d || !(renderer3d.tooSlow || renderer3d.lost)) return;
  setView('2d');
  trySaveSettings();
  announce('3D liep niet soepel op dit scherm. Het spel staat weer in 2D.');
  if (game.active) game.setMessage({ title: 'Terug naar 2D', text: '3D liep niet soepel op dit scherm', toast: true }, 2.5);
}
/**
 * Het spel vult precies het zichtbare deel van het scherm. Oude browsers (o.a. op digiborden)
 * kennen geen 100dvh en tellen bij 100vh de adres-/navigatiebalk mee, waardoor je zou moeten
 * scrollen. window.innerHeight is wél de echt zichtbare hoogte.
 */
function fitAppHeight() {
  app.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', fitAppHeight);
window.addEventListener('orientationchange', () => setTimeout(fitAppHeight, 200));
fitAppHeight();

if (window.ResizeObserver) {
  new ResizeObserver(fit).observe(stage);
} else {
  // Oude browsers (bijv. op digiborden): bij venstergrootte en schermwissels opnieuw meten.
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 250));
}
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

function syncDuelHud() {
  const key = `${game.wins[0]}-${game.wins[1]}`;
  if (shown.duel === key) return;
  shown.duel = key;
  const el = $('hud-duel-score');
  el.textContent = '';
  const a = document.createElement('span');
  a.className = 'p1';
  a.textContent = `${duelName(0)} ${game.wins[0]}`;
  const b = document.createElement('span');
  b.className = 'p2';
  b.textContent = `${game.wins[1]} ${duelName(1)}`;
  el.append(a, ' – ', b);
}

function syncHud() {
  if (shown.level !== game.level) hud.level.textContent = shown.level = game.level;
  if (game.mode === 'duel') syncDuelHud();
  $('hud-duel').hidden = game.mode !== 'duel';
  if (shown.score !== game.score) {
    if (game.score > shown.score) restartAnimation(hud.score, 'bump');
    hud.score.textContent = shown.score = game.score;
  }
  if (shown.mult !== game.multiplier) {
    shown.mult = game.multiplier;
    $('hud-mult').hidden = game.multiplier === 1;
  }
  if (shown.lives !== game.lives || shown.maxLives !== game.maxLives) {
    shown.maxLives = game.maxLives;
    if (game.lives < shown.lives) restartAnimation(hud.lives, 'hurt');
    shown.lives = game.lives;
    const lives = Math.max(0, game.lives);
    hud.lives.textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, game.maxLives - lives));
    hud.lives.setAttribute('aria-label', `${lives} ${lives === 1 ? 'leven' : 'levens'}`);
  }
  if (shown.message !== game.message) {
    shown.message = game.message;
    const m = game.message;
    toast.hidden = !m;
    if (m) {
      toast.querySelector('.toast-title').textContent = m.title || '';
      toast.querySelector('.toast-text').textContent = m.text || '';
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
  checkRenderer3d();
  updateAudio();
  updateVibration(now);
  updateSensor(now);
  syncHud();
  requestAnimationFrame(frame);
}

// "Terug naar de klokken": alleen op de site waar het spel naast de klokken staat (een map hoger).
// Lokaal of los gehost zou de link nergens heen gaan. Met ?klokken is hij altijd te zien.
$('menu-home').hidden = !(/\.github\.io$/.test(location.hostname) || new URLSearchParams(location.search).has('klokken'));

renderWho();
updateFullscreenButtons();
setView(settings.view);
show('menu');
requestAnimationFrame(frame);
window.__snelwegStarted = true; // voor de startcontrole in index.html
const bootError = document.querySelector('.boot-error');
if (bootError) bootError.remove(); // toch gestart (bijv. na trage verbinding)
