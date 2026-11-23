// Wegtypes per "maximumsnelheid": elk level is een ander soort weg in een ander land, met een
// andere plaats aan de overkant. Hoe langzamer de weg, hoe minder rijstroken; de vrije rijen
// worden berm of fietspad. De moeilijkheid (snelheid, gaten) komt uit levelParams.
//
// lanes:     rijstroken en fietspaden (null = 3 + 3, zie LANES in config.js). kind: 'road' | 'bike'
// speedSign: 'round' (verkeersbord), 'matrix' (matrixbord boven de snelweg) of 'unlimited'
// median:    'rail' (vangrail), 'green' (groene middenmarkering), 'double' (dubbele witte streep),
//            'concrete' (betonnen barrier)
// edge:      'solid' of 'dashed' (onderbroken kantstreep)
// road:      kleur van het asfalt, of 'concrete' (betonplaten met voegen)
// bike:      kleur van het fietspad
// verge:     wat er in de berm staat: 'hecto' (hectometerpaaltjes), 'lamps' (straatlantaarns) of niets
// decor:     typisch voor het land, achter/op de overkant (2D en 3D)
// placeSign: stijl van het plaatsbord aan de overkant (zie signs.js)
// scenery:   bomen achter de overkant (3D): 'trees', 'poplars', 'firs'
// flag:      vlaggetje naast het plaatsbord

const MIX = {
  roadNl: { car: 6, van: 2, truck: 1, motor: 1, tractor: 1 }, // provinciale weg: soms een trekker
  roadBe: { car: 6, van: 2, truck: 1, motor: 1 },
  outer: { truck: 4, van: 3, car: 4 },
  inner: { car: 6, motor: 2, van: 1 },
  bikeNl: { bike: 6, bakfiets: 1, scooter: 2 },
  bikeBe: { bike: 7, scooter: 2 },
};
const road = (row, dir, speed, mix) => ({ row, dir, speed, mix, kind: 'road' });
const bike = (row, dir, mix) => ({ row, dir, speed: 0.42, mix, kind: 'bike' });

// 1 + 1 met fietspaden, en 2 + 2 met bermen. (Rij 0 = overkant, 4 = middenberm, 8 = start.)
const LANES_NL80 = [bike(1, -1, MIX.bikeNl), road(3, -1, 1.0, MIX.roadNl), road(5, 1, 1.0, MIX.roadNl), bike(7, 1, MIX.bikeNl)];
const LANES_BE90 = [bike(2, -1, MIX.bikeBe), road(3, -1, 1.0, MIX.roadBe), road(5, 1, 1.0, MIX.roadBe), bike(6, 1, MIX.bikeBe)];
const LANES_2X2 = [road(2, -1, 0.9, MIX.outer), road(3, -1, 1.15, MIX.inner), road(5, 1, 1.15, MIX.inner), road(6, 1, 0.9, MIX.outer)];

export const THEMES = {
  nl80: {
    label: 'Provinciale weg',
    lanes: LANES_NL80,
    speedSign: 'round',
    median: 'green',
    edge: 'dashed',
    road: '#45484e',
    bike: '#b4473a',
    grass: '#5a9443',
    verge: '',
    decor: 'tulips',
    placeSign: 'nl-kom',
    flag: 'nl',
    scenery: 'trees',
    places: ['Ommen', 'Dalfsen', 'Heeze', 'Zuidlaren', 'Bergeijk', 'Woudenberg', 'Hellendoorn', 'Garderen', 'Vriezenveen', 'Giethoorn'],
  },
  be90: {
    label: 'Belgische gewestweg',
    lanes: LANES_BE90,
    speedSign: 'round',
    median: 'double',
    edge: 'solid',
    road: '#4b4d51',
    patches: true, // lappen asfalt
    bike: '#8f3b30',
    grass: '#5d9446',
    verge: 'lamps',
    decor: 'frituur',
    placeSign: 'be-kom',
    flag: 'be',
    scenery: 'trees',
    places: ['Lokeren', 'Hamme', 'Zele', 'Diest', 'Lommel', 'Tielt', 'Poperinge', 'Bilzen', 'Ronse', 'Geel'],
  },
  nl100: {
    label: 'Autoweg',
    lanes: LANES_2X2,
    speedSign: 'round',
    median: 'rail',
    edge: 'solid',
    road: '#45484e',
    grass: '#5a9443',
    verge: 'hecto',
    decor: 'polder',
    placeSign: 'nl-autoweg',
    flag: 'nl',
    scenery: 'trees',
    places: ['Emmeloord', 'Lelystad', 'Hoorn', 'Purmerend', 'Drachten', 'Meppel', 'Harderwijk', 'Kampen'],
  },
  fr110: {
    label: 'Voie express in Frankrijk',
    lanes: LANES_2X2,
    speedSign: 'round',
    median: 'rail',
    edge: 'dashed',
    road: '#56585d',
    grass: '#86a04a',
    verge: '',
    decor: 'lavender',
    placeSign: 'fr-ville',
    flag: 'fr',
    scenery: 'poplars',
    places: ['Lille', 'Arras', 'Reims', 'Amiens', 'Dijon', 'Beaune', 'Orléans', 'Chartres', 'Rouen', 'Troyes'],
  },
  ch120: {
    label: 'Zwitserse snelweg',
    lanes: LANES_2X2,
    speedSign: 'round',
    median: 'concrete',
    edge: 'solid',
    road: '#47494e',
    grass: '#4f8c3c',
    verge: '',
    decor: 'chalet',
    placeSign: 'ch-green',
    flag: 'ch',
    scenery: 'firs',
    places: ['Basel', 'Bern', 'Luzern', 'Zürich', 'Chur', 'Thun', 'Lugano', 'Interlaken'],
  },
  nl130: {
    label: 'Afsluitdijk',
    lanes: null,
    speedSign: 'matrix',
    median: 'rail',
    edge: 'solid',
    road: '#45484e',
    grass: '#6a9a4a',
    verge: 'hecto',
    decor: 'afsluitdijk', // water aan beide kanten, basalt, monument, zeilboot
    placeSign: 'nl-anwb',
    flag: 'nl',
    scenery: 'none',
    places: ['Den Oever', 'Afsluitdijk', 'Kornwerderzand'],
  },
  de: {
    label: 'Autobahn',
    lanes: null,
    speedSign: 'unlimited',
    median: 'rail',
    edge: 'solid',
    road: 'concrete',
    grass: '#5a9443',
    verge: '',
    decor: 'turbines',
    placeSign: 'de-autobahn',
    flag: 'de',
    scenery: 'trees',
    places: [
      'Köln', 'Düsseldorf', 'Dortmund', 'Hannover', 'Kassel', 'Frankfurt', 'Würzburg', 'Nürnberg', 'München',
      'Stuttgart', 'Karlsruhe', 'Bremen', 'Hamburg', 'Berlin', 'Leipzig', 'Dresden', 'Münster', 'Bielefeld',
      'Oberhausen', 'Duisburg', 'Aachen', 'Mannheim', 'Heidelberg', 'Ulm',
    ],
  },
};

/** Welk wegtype hoort bij deze maximumsnelheid. */
export function themeIdFor(speedLimit) {
  if (speedLimit > 130) return 'de';
  if (speedLimit >= 130) return 'nl130';
  if (speedLimit >= 120) return 'ch120';
  if (speedLimit >= 110) return 'fr110';
  if (speedLimit >= 100) return 'nl100';
  if (speedLimit >= 90) return 'be90';
  return 'nl80';
}

const layoutCache = new Map();

/**
 * Indeling van het speelveld voor dit wegtype. Rijen zonder rijstrook of fietspad vallen weg,
 * zodat je nooit een lege rij hoeft over te steken: een weg met minder rijstroken heeft dus
 * minder rijen (en grotere vakjes op het scherm).
 * - rows:   aantal rijen (0 = overkant … rows - 1 = startberm)
 * - median: rij van de middenberm
 * - start:  rij van de startberm
 * - kinds:  soort per rij: 'finish', 'road', 'bike', 'median', 'start'
 * - lanes:  rijstroken met hun rij in deze indeling (null = 3 + 3 uit config.js, rijen 1–3 en 5–7)
 */
export function layoutFor(themeId) {
  let layout = layoutCache.get(themeId);
  if (layout) return layout;
  const t = THEMES[themeId] || THEMES.nl130;
  // Eerst op het volle raster van 9 rijen, daarna de lege rijen eruit
  const full = ['finish', 'verge', 'verge', 'verge', 'median', 'verge', 'verge', 'verge', 'start'];
  if (!t.lanes) for (const r of [1, 2, 3, 5, 6, 7]) full[r] = 'road';
  else for (const lane of t.lanes) full[lane.row] = lane.kind;
  const map = [];
  const kinds = [];
  full.forEach((k, r) => {
    map[r] = kinds.length;
    if (k !== 'verge') kinds.push(k);
  });
  layout = {
    rows: kinds.length,
    median: kinds.indexOf('median'),
    start: kinds.length - 1,
    kinds,
    lanes: t.lanes ? t.lanes.map((lane) => ({ ...lane, row: map[lane.row] })) : null,
  };
  layoutCache.set(themeId, layout);
  return layout;
}

/** Soort per rij voor dit wegtype (zie layoutFor). */
export function rowKinds(themeId) {
  return layoutFor(themeId).kinds;
}

/** Een plaats voor aan de overkant: willekeurig, en niet dezelfde als de vorige. */
export function pickPlace(themeId, previous = '', rng = Math.random) {
  const list = (THEMES[themeId] || THEMES.nl130).places;
  const options = list.filter((p) => p !== previous);
  return options[Math.floor(rng() * options.length)] || list[0];
}
