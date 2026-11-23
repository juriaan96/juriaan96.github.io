// Wegtypes per "maximumsnelheid": elk level ziet er anders uit, met een andere plaats aan de
// overkant. Alleen uiterlijk (2D en 3D): de moeilijkheid zelf komt uit levelParams.
//
// speedSign: 'round' (verkeersbord), 'matrix' (matrixbord boven de snelweg) of 'unlimited'
// median:    'rail' (vangrail), 'green' (groene middenmarkering, geen vangrail), 'concrete' (betonnen barrier)
// edge:      'solid' of 'dashed' (onderbroken kantstreep)
// road:      kleur van het asfalt, of 'concrete' (betonplaten met voegen)
// placeSign: stijl van het plaatsbord aan de overkant (zie signs.js)
// scenery:   wat er achter de overkant staat (3D)
// flag:      vlaggetje naast het plaatsbord

export const THEMES = {
  nl80: {
    label: 'Provinciale weg',
    speedSign: 'round',
    median: 'green',
    edge: 'dashed',
    road: '#45484e',
    grass: '#5a9443',
    placeSign: 'nl-kom',
    flag: 'nl',
    scenery: 'windmill',
    places: ['Ommen', 'Dalfsen', 'Heeze', 'Zuidlaren', 'Bergeijk', 'Woudenberg', 'Hellendoorn', 'Garderen', 'Vriezenveen', 'Giethoorn'],
  },
  be90: {
    label: 'Belgische gewestweg',
    speedSign: 'round',
    median: 'concrete',
    edge: 'solid',
    road: '#4b4d51',
    patches: true, // lappen asfalt
    grass: '#5d9446',
    placeSign: 'be-kom',
    flag: 'be',
    scenery: 'trees',
    places: ['Lokeren', 'Hamme', 'Zele', 'Diest', 'Lommel', 'Tielt', 'Poperinge', 'Bilzen', 'Ronse', 'Geel'],
  },
  nl100: {
    label: 'Autoweg',
    speedSign: 'round',
    median: 'rail',
    edge: 'solid',
    road: '#45484e',
    grass: '#5a9443',
    placeSign: 'nl-autoweg',
    flag: 'nl',
    scenery: 'trees',
    places: ['Emmeloord', 'Lelystad', 'Hoorn', 'Purmerend', 'Drachten', 'Meppel', 'Harderwijk', 'Kampen'],
  },
  fr110: {
    label: 'Voie express in Frankrijk',
    speedSign: 'round',
    median: 'rail',
    edge: 'dashed',
    road: '#56585d',
    grass: '#86a04a',
    placeSign: 'fr-ville',
    flag: 'fr',
    scenery: 'poplars',
    places: ['Lille', 'Arras', 'Reims', 'Amiens', 'Dijon', 'Beaune', 'Orléans', 'Chartres', 'Rouen', 'Troyes'],
  },
  ch120: {
    label: 'Zwitserse snelweg',
    speedSign: 'round',
    median: 'rail',
    edge: 'solid',
    road: '#47494e',
    grass: '#4f8c3c',
    placeSign: 'ch-green',
    flag: 'ch',
    scenery: 'firs',
    places: ['Basel', 'Bern', 'Luzern', 'Zürich', 'Chur', 'Thun', 'Lugano', 'Interlaken'],
  },
  nl130: {
    label: 'Snelweg',
    speedSign: 'matrix',
    median: 'rail',
    edge: 'solid',
    road: '#45484e',
    grass: '#5a9443',
    placeSign: 'nl-anwb',
    flag: 'nl',
    scenery: 'trees',
    places: ['Utrecht', 'Amersfoort', 'Eindhoven', 'Zwolle', 'Arnhem', 'Breda', 'Groningen', 'Den Haag', 'Nijmegen', 'Venlo'],
  },
  de: {
    label: 'Autobahn',
    speedSign: 'unlimited',
    median: 'rail',
    edge: 'solid',
    road: 'concrete',
    grass: '#5a9443',
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

/** Een plaats voor aan de overkant: willekeurig, en niet dezelfde als de vorige. */
export function pickPlace(themeId, previous = '', rng = Math.random) {
  const list = (THEMES[themeId] || THEMES.nl130).places;
  const options = list.filter((p) => p !== previous);
  return options[Math.floor(rng() * options.length)] || list[0];
}
