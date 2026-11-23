import { COLS, LANES, VEHICLE_TYPES, EMERGENCY_TYPES, SPAWN_MARGIN, VEHICLE_HIT_INSET, levelParams } from './config.js';

const ACCEL = 3; // vakjes/s², optrekken
const BRAKE = 8; // vakjes/s², afremmen
const WARMUP_SECONDS = 30;
const WARMUP_STEP = 1 / 30;

// Hulpdiensten (brandweer, ambulance, politie): af en toe één, ver buiten beeld, zodat je de
// sirene al hoort aankomen voordat hij voorbij raast. Hij rijdt met vaste hoge snelheid en
// vertrekt alleen als hij binnen beeld niemand kan inhalen; het verkeer erachter wacht tot hij
// voorbij is (gewone spawn-regels), dus er blijft altijd een haalbaar gat.
const EMERGENCY_FAR = 30; // vakjes extra buiten beeld
const EMERGENCY_DELAY = [15, 35]; // seconden tussen twee hulpdiensten
const EMERGENCY_SPEED = [7, 14]; // vakjes/s (min, max)
const EMERGENCY_SPEED_FACTOR = 2.4; // t.o.v. de rijstrooksnelheid
const EMERGENCY_WAIT = 15; // s maximaal ruimte maken; daarna (zelden) overslaan

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

  reset(level, mode = 'normal') {
    this.params = levelParams(level, mode);
    this.lanes = LANES.map((cfg) => ({ ...cfg, vehicles: [], next: null }));
    this.laneByRow = new Map(this.lanes.map((lane) => [lane.row, lane]));
    for (const lane of this.lanes) this.planNext(lane);
    // Laat het verkeer alvast rijden zodat de weg meteen gevuld is (nog zonder hulpdiensten).
    this.emergencyIn = Infinity;
    this.pendingEmergency = null;
    for (let t = 0; t < WARMUP_SECONDS; t += WARMUP_STEP) this.update(WARMUP_STEP);
    this.emergencyIn = this.emergencyDelay();
  }

  emergencyDelay() {
    return EMERGENCY_DELAY[0] + this.rng() * (EMERGENCY_DELAY[1] - EMERGENCY_DELAY[0]);
  }

  /**
   * Past hij nog niet (hij zou binnen beeld iemand inhalen), dan maakt het verkeer ruimte:
   * in die rijstrook voegt even niemand meer in (lane.hold) tot het past, maximaal EMERGENCY_WAIT s.
   */
  updateEmergency(dt) {
    const p = this.pendingEmergency;
    if (p) {
      p.wait += dt;
      if (this.trySpawnEmergency(p.lane, p.type)) {
        p.lane.hold = false;
        this.pendingEmergency = null;
        this.emergencyIn = this.emergencyDelay();
      } else if (p.wait > EMERGENCY_WAIT) {
        p.lane.hold = false;
        this.pendingEmergency = null;
        this.emergencyIn = 5;
      }
      return;
    }
    this.emergencyIn -= dt;
    if (this.emergencyIn > 0) return;
    const lane = this.lanes[Math.floor(this.rng() * this.lanes.length)];
    const type = EMERGENCY_TYPES[Math.floor(this.rng() * EMERGENCY_TYPES.length)];
    if (this.trySpawnEmergency(lane, type)) {
      this.emergencyIn = this.emergencyDelay();
      return;
    }
    lane.hold = true;
    this.pendingEmergency = { lane, type, wait: 0 };
  }

  trySpawnEmergency(lane, type) {
    const spec = VEHICLE_TYPES[type];
    const L = spec.length;
    const speed = Math.min(EMERGENCY_SPEED[1], Math.max(EMERGENCY_SPEED[0], this.params.baseSpeed * lane.speed * EMERGENCY_SPEED_FACTOR));
    const x = lane.dir > 0 ? -SPAWN_MARGIN - EMERGENCY_FAR - L : COLS + SPAWN_MARGIN + EMERGENCY_FAR;
    // Zo lang duurt het voordat hij weer uit beeld (en uit de simulatie) is
    const travel = lane.dir > 0 ? COLS + SPAWN_MARGIN - x : x + L + SPAWN_MARGIN;
    const tGone = travel / speed;
    for (const v of lane.vehicles) {
      // Vrije ruimte tussen zijn neus en de achterkant van dit voertuig
      const gap = lane.dir > 0 ? v.x - (x + L) : x - (v.x + v.length);
      if (gap < 0) return false;
      // Tot dit voertuig zelf verdwijnt (voorzichtig gerekend: het kan afremmen)
      const vGone = lane.dir > 0 ? COLS + SPAWN_MARGIN - v.x : v.x + v.length + SPAWN_MARGIN;
      const t = Math.min(tGone, vGone / Math.max(0.5, v.speed * 0.7));
      if (gap - (speed - v.speed * 0.7) * t < 1.5) return false;
    }
    lane.vehicles.push({ type, length: L, x, desired: speed, speed, color: spec.colors[0], emergency: true });
    return true;
  }

  planNext(lane) {
    const mix = this.params.autobahn && lane.autobahnMix ? lane.autobahnMix : lane.mix;
    const type = pickWeighted(mix, this.rng);
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
    this.updateEmergency(dt);
  }

  moveLane(lane, dt) {
    const { minGapTime } = this.params;
    const vs = lane.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.emergency) {
        // Hulpdienst: vaste hoge snelheid (vertrekt alleen als de weg vrij genoeg is)
        v.x += lane.dir * v.speed * dt;
        continue;
      }
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
    if (lane.hold) return; // ruimte maken voor een hulpdienst
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
