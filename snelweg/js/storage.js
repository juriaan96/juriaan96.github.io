// Opslag in localStorage.
//
// Het spel staat op GitHub Pages naast andere sites op hetzelfde domein en deelt daarmee
// localStorage (en de ±5 MB limiet). Daarom krijgt elke sleutel het voorvoegsel PREFIX.
// Elke sleutel bewaart { version, data }; bij een nieuwe opzet komt er een migratie bij in
// MIGRATIONS, zodat oude data blijft werken.

import { cleanLook, isFaceDataUrl, DEFAULT_LOOK } from './character.js';

const PREFIX = 'snelweg-oversteken:';
const VERSION = 1;

export const MODES = ['normal', 'noncha'];
export const HIGHSCORE_LIMIT = 10;
export const NAME_MAX_LENGTH = 14;
export const MAX_PROFILES = 8;
const FACE_MAX = 60000; // 128×128 JPEG als data-URL is ±5–12 kB
const FACE_SMALL_MAX = 12000; // 48×48 voor de highscorelijst

/** Opslaan mislukt. `message` is een Nederlandse melding voor de speler. */
export class StorageError extends Error {}

// key -> { [vanVersie]: (data) => data voor vanVersie + 1 }
const MIGRATIONS = {
  settings: {},
  highscores: {},
  profiles: {},
};

function isQuotaError(e) {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
  );
}

function readRaw(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.version)) return null;
    let { version, data } = parsed;
    if (version > VERSION) return null; // gemaakt door een nieuwere versie van het spel
    while (version < VERSION) {
      const migrate = MIGRATIONS[key] && MIGRATIONS[key][version];
      data = migrate ? migrate(data) : data;
      version += 1;
    }
    return data;
  } catch (e) {
    return null; // geen toegang (privémodus/blokkade) of kapotte JSON: val terug op standaard
  }
}

function writeRaw(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ version: VERSION, data }));
  } catch (e) {
    if (isQuotaError(e)) {
      throw new StorageError('De opslag van je browser is vol, daarom kon dit niet bewaard worden.');
    }
    throw new StorageError('Opslaan is niet gelukt. Mogelijk blokkeert je browser lokale opslag.');
  }
}

// --- Instellingen -----------------------------------------------------------

// touchAuto / smartboardAuto: zolang de speler deze instellingen niet zelf heeft aangepast,
// mag het spel ze automatisch aanzetten bij de eerste aanraking van het scherm.
function defaultSettings() {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    sound: true,
    volume: 0.8,
    vibrate: true,
    touchButtons: touch,
    tapToWalk: true,
    smartboard: false,
    touchAuto: true,
    smartboardAuto: true,
    nonchaGlimpse: 4, // noncha: elke zoveel seconden even het speelveld zien (0 = nooit)
    view: '2d', // weergave: '2d' (bovenaanzicht) of '3d' (schuin meekijken)
    lastName: '',
  };
}

export const VIEWS = ['2d', '3d'];

export const GLIMPSE_OPTIONS = [0, 6, 4, 2];

const BOOLEAN_SETTINGS = ['sound', 'vibrate', 'touchButtons', 'tapToWalk', 'smartboard', 'touchAuto', 'smartboardAuto'];

export function loadSettings() {
  const defaults = defaultSettings();
  const data = readRaw('settings');
  if (!data || typeof data !== 'object') return defaults;
  const out = { ...defaults };
  for (const key of BOOLEAN_SETTINGS) {
    if (typeof data[key] === 'boolean') out[key] = data[key];
  }
  if (Number.isFinite(data.volume)) out.volume = Math.min(1, Math.max(0, data.volume));
  if (GLIMPSE_OPTIONS.includes(data.nonchaGlimpse)) out.nonchaGlimpse = data.nonchaGlimpse;
  if (VIEWS.includes(data.view)) out.view = data.view;
  if (typeof data.lastName === 'string') out.lastName = data.lastName.slice(0, NAME_MAX_LENGTH);
  return out;
}

export function saveSettings(settings) {
  writeRaw('settings', settings);
}

// --- Profielen ----------------------------------------------------------------
// { activeId, list: [{ id, name, look, face?, faceSmall? }] }
// face: 128×128 JPEG (data-URL), faceSmall: 48×48 voor de highscorelijst.
// Foto's worden alleen lokaal verwerkt en opgeslagen; ze verlaten de browser nooit.

export function newProfile(name = '') {
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return { id, name, look: { ...DEFAULT_LOOK } };
}

function defaultProfiles() {
  return { activeId: 'p1', list: [{ id: 'p1', name: '', look: { ...DEFAULT_LOOK } }] };
}

function cleanProfile(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
  const out = {
    id: p.id.slice(0, 40),
    name: typeof p.name === 'string' ? p.name.slice(0, NAME_MAX_LENGTH) : '',
    look: cleanLook(p.look),
  };
  if (isFaceDataUrl(p.face, FACE_MAX)) out.face = p.face;
  if (out.face && isFaceDataUrl(p.faceSmall, FACE_SMALL_MAX)) out.faceSmall = p.faceSmall;
  return out;
}

export function loadProfiles() {
  const data = readRaw('profiles');
  const seen = new Set();
  const list = (data && Array.isArray(data.list) ? data.list : [])
    .map(cleanProfile)
    .filter((p) => p && !seen.has(p.id) && seen.add(p.id))
    .slice(0, MAX_PROFILES);
  if (!list.length) return defaultProfiles();
  const activeId = list.some((p) => p.id === data.activeId) ? data.activeId : list[0].id;
  return { activeId, list };
}

function saveProfiles(profiles) {
  writeRaw('profiles', profiles);
}

export function loadActiveProfile() {
  const profiles = loadProfiles();
  return profiles.list.find((p) => p.id === profiles.activeId);
}

/**
 * Bewaart (of voegt toe) een profiel en maakt het actief.
 * Gooit StorageError als opslaan mislukt of het maximum bereikt is.
 */
export function saveProfile(profile) {
  const clean = cleanProfile(profile);
  const profiles = loadProfiles();
  const i = profiles.list.findIndex((p) => p.id === clean.id);
  if (i === -1) {
    if (profiles.list.length >= MAX_PROFILES) {
      throw new StorageError(`Je kunt maximaal ${MAX_PROFILES} profielen bewaren. Verwijder er eerst een.`);
    }
    profiles.list.push(clean);
  } else {
    profiles.list[i] = clean;
  }
  profiles.activeId = clean.id;
  saveProfiles(profiles);
  return profiles;
}

/** Verwijdert een profiel. Het laatste profiel wordt vervangen door een standaardprofiel. */
export function deleteProfile(id) {
  let profiles = loadProfiles();
  profiles.list = profiles.list.filter((p) => p.id !== id);
  if (!profiles.list.length) profiles = defaultProfiles();
  if (!profiles.list.some((p) => p.id === profiles.activeId)) profiles.activeId = profiles.list[0].id;
  saveProfiles(profiles);
  return profiles;
}

// --- Highscores -------------------------------------------------------------

function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const score = Math.floor(Number(e.score));
  if (!Number.isFinite(score) || score < 0) return null;
  const entry = {
    name: String(e.name == null ? 'Speler' : e.name).slice(0, NAME_MAX_LENGTH) || 'Speler',
    score,
    level: Math.max(1, Math.floor(Number(e.level)) || 1),
    date: typeof e.date === 'string' ? e.date : '',
  };
  if (e.look && typeof e.look === 'object') entry.look = cleanLook(e.look);
  // Klein gezichtje (48×48), alleen als geldige data-URL van een afbeelding.
  if (isFaceDataUrl(e.face, FACE_SMALL_MAX)) entry.face = e.face;
  return entry;
}

export function loadHighscores() {
  const data = readRaw('highscores');
  const out = {};
  for (const mode of MODES) {
    const list = data && Array.isArray(data[mode]) ? data[mode] : [];
    out[mode] = list
      .map(cleanEntry)
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, HIGHSCORE_LIMIT);
  }
  return out;
}

/** Haalt deze score de top 10 van de modus? */
export function qualifies(mode, score) {
  if (score <= 0) return false;
  const list = loadHighscores()[mode];
  return list.length < HIGHSCORE_LIMIT || score > list[list.length - 1].score;
}

/**
 * Voegt een score toe en geeft de plek (1-based) terug.
 * Gooit StorageError als opslaan mislukt.
 */
export function addHighscore(mode, entry) {
  const all = loadHighscores();
  const clean = cleanEntry({ ...entry, date: new Date().toISOString() });
  const list = all[mode];
  // Bij gelijke score komt de nieuwe onder de bestaande.
  let index = list.findIndex((e) => clean.score > e.score);
  if (index === -1) index = list.length;
  list.splice(index, 0, clean);
  all[mode] = list.slice(0, HIGHSCORE_LIMIT);
  writeRaw('highscores', all);
  return index < HIGHSCORE_LIMIT ? index + 1 : null;
}
