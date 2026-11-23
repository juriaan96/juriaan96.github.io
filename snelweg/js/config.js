// Vaste spelinstellingen. Alle posities en afmetingen zijn in grid-eenheden (1 = één vakje).

import { themeIdFor } from './themes.js';

export const COLS = 13;
export const ROWS = 9;

// Rijen van boven (0) naar onder (8).
export const ROW_FINISH = 0;
export const ROW_MEDIAN = 4;
export const ROW_START = 8;

export const START_LIVES = 3;
export const NONCHA_LIVES = 5;

// Speler
export const STEP_COOLDOWN = 0.11; // seconden tussen twee stappen
export const HOP_TIME = 0.09; // duur van de stap-animatie
export const PLAYER_HALF_WIDTH = 0.28; // hitbox is smaller dan het poppetje (~0.8 breed)

// Verkeer
export const VEHICLE_HIT_INSET = 0.08; // botsrand van voertuigen iets naar binnen
// Voertuigen ontstaan/verdwijnen zo ver buiten het speelveld. In 3D zie je verder opzij dan
// het veld breed is; daar komen ze dan uit de nevel in plaats van ineens te verschijnen.
export const SPAWN_MARGIN = 6;

// Voertuigtypes: lengte in vakjes, snelheid als factor op de rijstrooksnelheid.
export const VEHICLE_TYPES = {
  car: { length: 1.5, speed: 1.0, colors: ['#d62828', '#1d4ed8', '#f1f1ee', '#26282c', '#9ca3af', '#15803d', '#f59e0b'] },
  van: { length: 2.0, speed: 0.92, colors: ['#f4f5f2', '#dfe3e8', '#f2c230', '#2b7fc1'] },
  truck: { length: 3.8, speed: 0.78, colors: ['#c8283f', '#2557c9', '#e86b1c', '#4b5563', '#1f8a4c'] },
  motor: { length: 0.8, speed: 1.25, colors: ['#15171b', '#b91c1c', '#f97316', '#e5e7eb'] },
  // Alleen op de Autobahn: laag en snel
  sport: { length: 1.4, speed: 1.6, colors: ['#facc15', '#dc2626', '#f97316', '#e5e7eb', '#111827', '#84cc16'] },
  // Provinciale weg: langzame trekker, en op het fietspad fietsers, bakfietsen en snorfietsen
  tractor: { length: 1.6, speed: 0.5, colors: ['#2e7d32', '#c62828', '#1565c0'] },
  bike: { length: 0.6, speed: 1.0, colors: ['#e63946', '#1d4ed8', '#f1f1f1', '#2a9d8f', '#f77f00', '#7b2cbf', '#26282c'] },
  bakfiets: { length: 0.95, speed: 0.8, colors: ['#1d4ed8', '#e63946', '#2a9d8f', '#f1f1f1'] },
  scooter: { length: 0.65, speed: 1.5, colors: ['#111827', '#e5e7eb', '#dc2626', '#0ea5e9'] },
  // Hulpdiensten: komen af en toe met sirene voorbij (zie EMERGENCY in traffic.js)
  fire: { length: 2.6, speed: 1, colors: ['#c8102e'], emergency: true },
  ambulance: { length: 2.0, speed: 1, colors: ['#ffd21f'], emergency: true },
  police: { length: 1.6, speed: 1, colors: ['#f5f7fa'], emergency: true },
};

export const EMERGENCY_TYPES = ['fire', 'ambulance', 'police'];

// Boven deze "maximumsnelheid" wordt de snelweg een Autobahn: geen limiet, betonnen weg en
// sportwagens op de snelle stroken.
export const AUTOBAHN_ABOVE = 130;

// Rijstroken. Bovenste rijbaan rijdt naar links, onderste naar rechts (rechts rijden):
// de langzame strook ligt aan de buitenkant, de snelle strook tegen de middenberm.
// autobahnMix: verkeer op de Autobahn (anders gewoon mix).
export const LANES = [
  { row: 1, dir: -1, speed: 0.8, mix: { truck: 5, van: 3, car: 3 } },
  { row: 2, dir: -1, speed: 1.0, mix: { car: 6, van: 3, truck: 1, motor: 1 }, autobahnMix: { car: 6, van: 3, truck: 1, motor: 1, sport: 1 } },
  { row: 3, dir: -1, speed: 1.2, mix: { car: 6, motor: 2, van: 1 }, autobahnMix: { car: 4, sport: 4, motor: 2, van: 1 } },
  { row: 5, dir: 1, speed: 1.2, mix: { car: 6, motor: 2, van: 1 }, autobahnMix: { car: 4, sport: 4, motor: 2, van: 1 } },
  { row: 6, dir: 1, speed: 1.0, mix: { car: 6, van: 3, truck: 1, motor: 1 }, autobahnMix: { car: 6, van: 3, truck: 1, motor: 1, sport: 1 } },
  { row: 7, dir: 1, speed: 0.8, mix: { truck: 5, van: 3, car: 3 } },
];

/**
 * Moeilijkheid per level.
 * - baseSpeed: basissnelheid in vakjes per seconde.
 * - minGapTime / maxGapTime: tijd (s) tussen de achterkant van een voertuig en de neus van
 *   de volgende op een vast punt. minGapTime is de gegarandeerde ondergrens: zo lang is een
 *   vakje in elke rijstrook minstens vrij, ook in de hoogste levels.
 */
export function levelParams(level, mode = 'normal') {
  if (mode === 'noncha') {
    // Blind oversteken: rustiger verkeer, ruimere gaten (minstens 1,4 s, standaard 2 s) en
    // de moeilijkheid stijgt maar half zo snel per level.
    const n = Math.max(0, level - 1) * 0.5;
    return withAutobahn({
      baseSpeed: Math.min(1.5 + 0.3 * n, 4.0),
      minGapTime: Math.max(2.0 - 0.06 * n, 1.4),
      maxGapTime: Math.max(4.2 - 0.2 * n, 2.6),
      speedLimit: 70 + 10 * level,
    });
  }
  const n = Math.max(0, level - 1);
  return withAutobahn({
    baseSpeed: Math.min(2.0 + 0.4 * n, 6.0),
    minGapTime: Math.max(1.4 - 0.07 * n, 0.9),
    maxGapTime: Math.max(3.4 - 0.25 * n, 1.7),
    speedLimit: 70 + 10 * level, // getoond op het matrixbord
  });
}

function withAutobahn(params) {
  // theme: soort weg (zie themes.js), alleen voor het uiterlijk
  return { ...params, autobahn: params.speedLimit > AUTOBAHN_ABOVE, theme: themeIdFor(params.speedLimit) };
}

// Score
export const ROW_POINTS = 10;
export const FINISH_POINTS_PER_LEVEL = 50;
export const TIME_BONUS_WINDOW = 20; // seconden; sneller oversteken = meer bonus
export const TIME_BONUS_PER_SECOND = 10;
