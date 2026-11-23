// Vaste spelinstellingen. Alle posities en afmetingen zijn in grid-eenheden (1 = één vakje).

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
export const SPAWN_MARGIN = 1; // voertuigen ontstaan/verdwijnen zo ver buiten beeld

// Voertuigtypes: lengte in vakjes, snelheid als factor op de rijstrooksnelheid.
export const VEHICLE_TYPES = {
  car: { length: 1.5, speed: 1.0, colors: ['#d62828', '#1d4ed8', '#f1f1ee', '#26282c', '#9ca3af', '#15803d', '#f59e0b'] },
  van: { length: 2.0, speed: 0.92, colors: ['#f4f5f2', '#dfe3e8', '#f2c230', '#2b7fc1'] },
  truck: { length: 3.8, speed: 0.78, colors: ['#c8283f', '#2557c9', '#e86b1c', '#4b5563', '#1f8a4c'] },
  motor: { length: 0.8, speed: 1.25, colors: ['#15171b', '#b91c1c', '#f97316', '#e5e7eb'] },
};

// Rijstroken. Bovenste rijbaan rijdt naar links, onderste naar rechts (rechts rijden):
// de langzame strook ligt aan de buitenkant, de snelle strook tegen de middenberm.
export const LANES = [
  { row: 1, dir: -1, speed: 0.8, mix: { truck: 5, van: 3, car: 3 } },
  { row: 2, dir: -1, speed: 1.0, mix: { car: 6, van: 3, truck: 1, motor: 1 } },
  { row: 3, dir: -1, speed: 1.2, mix: { car: 6, motor: 2, van: 1 } },
  { row: 5, dir: 1, speed: 1.2, mix: { car: 6, motor: 2, van: 1 } },
  { row: 6, dir: 1, speed: 1.0, mix: { car: 6, van: 3, truck: 1, motor: 1 } },
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
    return {
      baseSpeed: Math.min(1.5 + 0.3 * n, 4.0),
      minGapTime: Math.max(2.0 - 0.06 * n, 1.4),
      maxGapTime: Math.max(4.2 - 0.2 * n, 2.6),
      speedLimit: 70 + 10 * level,
    };
  }
  const n = Math.max(0, level - 1);
  return {
    baseSpeed: Math.min(2.0 + 0.4 * n, 6.0),
    minGapTime: Math.max(1.4 - 0.07 * n, 0.9),
    maxGapTime: Math.max(3.4 - 0.25 * n, 1.7),
    speedLimit: 70 + 10 * level, // getoond op het matrixbord
  };
}

// Score
export const ROW_POINTS = 10;
export const FINISH_POINTS_PER_LEVEL = 50;
export const TIME_BONUS_WINDOW = 20; // seconden; sneller oversteken = meer bonus
export const TIME_BONUS_PER_SECOND = 10;
