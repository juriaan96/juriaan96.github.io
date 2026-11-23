import { COLS, LANES, VEHICLE_TYPES, SPAWN_MARGIN, VEHICLE_HIT_INSET, levelParams } from './config.js';

const ACCEL = 3; // vakjes/s², optrekken
const BRAKE = 8; // vakjes/s², afremmen
const WARMUP_SECONDS = 30;
const WARMUP_STEP = 1 / 30;

function pickWeighted(mix, rng) {
  const entries = Object.entries(mix);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Vrije ruimte tussen de achterkant van de voorligger en de neus van de volger. */
function gapBetween(dir, leader, follower) {
  return dir > 0 ? leader.x - (follower.x + follower.length) : follower.x - (leader.x + leader.length);
}

function isGone(dir, v) {
  return dir > 0 ? v.x > COLS + SPAWN_MARGIN : v.x + v.length < -SPAWN_MARGIN;
}

/**
 * Verkeer per rijstrook. Een voertuig heeft x = linkerrand in vakjes.
 *
 * Haalbaarheid: de afstand tussen voertuigen wordt in tijd gekozen (minGapTime..maxGapTime)
 * en omgerekend naar afstand met de snelheid van de volger. Een sneller voertuig dat een
 * langzamer inhaalt, remt af en houdt minstens minGapTime aan. Zo is elk punt van een
 * rijstrook regelmatig minstens minGapTime seconden vrij.
 */
export class Traffic {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.params = levelParams(1);
    this.lanes = [];
    this.laneByRow = new Map();
  }

  reset(level) {
    this.params = levelParams(level);
    this.lanes = LANES.map((cfg) => ({ ...cfg, vehicles: [], next: null }));
    this.laneByRow = new Map(this.lanes.map((lane) => [lane.row, lane]));
    for (const lane of this.lanes) this.planNext(lane);
    // Laat het verkeer alvast rijden zodat de weg meteen gevuld is.
    for (let t = 0; t < WARMUP_SECONDS; t += WARMUP_STEP) this.update(WARMUP_STEP);
  }

  planNext(lane) {
    const type = pickWeighted(lane.mix, this.rng);
    const speed = this.params.baseSpeed * lane.speed * VEHICLE_TYPES[type].speed;
    const { minGapTime, maxGapTime } = this.params;
    const gapTime = minGapTime + this.rng() * (maxGapTime - minGapTime);
    lane.next = { type, speed, gap: gapTime * speed };
  }

  update(dt) {
    for (const lane of this.lanes) {
      this.moveLane(lane, dt);
      this.trySpawn(lane);
    }
  }

  moveLane(lane, dt) {
    const { minGapTime } = this.params;
    const vs = lane.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      let target = v.desired;
      let tooClose = false;
      if (i > 0) {
        const leader = vs[i - 1];
        const gap = gapBetween(lane.dir, leader, v);
        const safe = minGapTime * v.desired;
        if (gap < safe * 1.5) target = Math.min(target, leader.speed);
        tooClose = gap < safe;
        if (tooClose) v.speed = Math.min(v.speed, leader.speed);
      }
      if (v.speed < target && !tooClose) v.speed = Math.min(target, v.speed + ACCEL * dt);
      else if (v.speed > target) v.speed = Math.max(target, v.speed - BRAKE * dt);
      v.x += lane.dir * v.speed * dt;
    }
    // Voorste voertuigen staan vooraan in de lijst.
    while (vs.length && isGone(lane.dir, vs[0])) vs.shift();
  }

  trySpawn(lane) {
    const { type, speed, gap } = lane.next;
    const spec = VEHICLE_TYPES[type];
    const last = lane.vehicles[lane.vehicles.length - 1];
    if (last) {
      const room =
        lane.dir > 0 ? last.x + SPAWN_MARGIN : COLS + SPAWN_MARGIN - (last.x + last.length);
      if (room < gap) return;
    }
    lane.vehicles.push({
      type,
      length: spec.length,
      x: lane.dir > 0 ? -SPAWN_MARGIN - spec.length : COLS + SPAWN_MARGIN,
      desired: speed,
      speed: last ? Math.min(speed, last.speed) : speed,
      color: spec.colors[Math.floor(this.rng() * spec.colors.length)],
    });
    this.planNext(lane);
  }

  /** Geeft het voertuig terug dat het bereik [xMin, xMax] in deze rij raakt, of null. */
  hitTest(row, xMin, xMax) {
    const lane = this.laneByRow.get(row);
    if (!lane) return null;
    for (const v of lane.vehicles) {
      if (v.x + VEHICLE_HIT_INSET < xMax && v.x + v.length - VEHICLE_HIT_INSET > xMin) return v;
    }
    return null;
  }
}
