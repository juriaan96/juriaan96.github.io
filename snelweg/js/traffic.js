import { COLS, LANES, VEHICLE_TYPES, EMERGENCY_TYPES, SPAWN_MARGIN, VEHICLE_HIT_INSET, levelParams } from './config.js';
import { THEMES } from './themes.js';

const ACCEL = 3; // vakjes/s², optrekken
const BRAKE = 8; // vakjes/s², afremmen
const WARMUP_SECONDS = 30;
const WARMUP_STEP = 1 / 30;

// Hulpdiensten (brandweer, ambulance, politie): af en toe één, ver buiten beeld, zodat je de
// sirene al hoort aankomen voordat hij voorbij raast. Hij rijdt met vaste hoge snelheid en
// vertrekt alleen als hij binnen beeld niemand kan inhalen; het verkeer erachter wacht tot hij
// voorbij is (gewone spawn-regels), dus er blijft altijd een haalbaar gat.
const EMERGENCY_FAR = 20; // vakjes extra buiten beeld (zo hoor je hem ruim 2 s van tevoren)
const EMERGENCY_FIRST = [2, 5]; // seconden tot de eerste (per spel; de wachttijd loopt door over levels)
const EMERGENCY_DELAY = [12, 25]; // seconden tussen twee hulpdiensten
const EMERGENCY_SPEED = [6, 11]; // vakjes/s (min, max)
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

  /**
   * @param {boolean} [freshGame] nieuw spel: de eerste hulpdienst komt snel. Anders loopt de
   *   wachttijd door vanaf het vorige level (een level duurt vaak korter dan de wachttijd).
   */
  reset(level, mode = 'normal', freshGame = true) {
    this.params = levelParams(level, mode);
    // Rijstroken en fietspaden van dit wegtype (zie themes.js); zonder eigen indeling 3 + 3
    const theme = THEMES[this.params.theme];
    const layout = (theme && theme.lanes) || LANES;
    this.lanes = layout.map((cfg) => ({ kind: 'road', ...cfg, vehicles: [], next: null }));
    this.laneByRow = new Map(this.lanes.map((lane) => [lane.row, lane]));
    for (const lane of this.lanes) this.planNext(lane);
    // Laat het verkeer alvast rijden zodat de weg meteen gevuld is (nog zonder hulpdiensten).
    const carry = this.emergencyIn;
    const wasPending = !!this.pendingEmergency; // was er al een onderweg? dan meteen weer
    this.emergencyIn = Infinity;
    this.pendingEmergency = null;
    for (let t = 0; t < WARMUP_SECONDS; t += WARMUP_STEP) this.update(WARMUP_STEP);
    if (!freshGame && wasPending) this.emergencyIn = 0.5;
    else if (!freshGame && carry > 0 && carry < EMERGENCY_DELAY[1]) this.emergencyIn = carry;
    else this.emergencyIn = this.between(EMERGENCY_FIRST);
  }

  between([lo, hi]) {
    return lo + this.rng() * (hi - lo);
  }

  emergencyDelay() {
    return this.between(EMERGENCY_DELAY);
  }

  /**
   * Past hij nog niet (hij zou binnen beeld iemand inhalen), dan maakt het verkeer ruimte:
   * in die rijstrook voegt even niemand meer in (lane.hold) tot het past, maximaal EMERGENCY_WAIT s.
   */
  updateEmergency(dt) {
    const p = this.pendingEmergency;
    if (p) {
      p.wait += dt;
      // De vastgehouden strook, of een andere rijstrook die toevallig al vrij genoeg is
      const order = [p.lane].concat(this.lanes.filter((l) => l.kind === 'road' && l !== p.lane));
      if (order.some((lane) => this.trySpawnEmergency(lane, p.type))) {
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
    // Alleen op de rijbaan (niet op het fietspad)
    const roads = this.lanes.filter((l) => l.kind === 'road');
    if (!roads.length) return;
    const type = EMERGENCY_TYPES[Math.floor(this.rng() * EMERGENCY_TYPES.length)];
    // Past hij al ergens? Anders ruimte maken in de rijstrook die het minst tekortkomt.
    let lane = null;
    let best = -Infinity;
    for (const l of roads.slice().sort(() => this.rng() - 0.5)) {
      const margin = this.emergencyMargin(l, type);
      if (margin >= 0 && this.trySpawnEmergency(l, type)) {
        this.emergencyIn = this.emergencyDelay();
        return;
      }
      if (margin > best) {
        best = margin;
        lane = l;
      }
    }
    lane.hold = true;
    this.pendingEmergency = { lane, type, wait: 0 };
  }

  /** Hoe en waar een hulpdienst in deze rijstrook zou ontstaan. */
  emergencyPlan(lane, type) {
    const L = VEHICLE_TYPES[type].length;
    const speed = Math.min(EMERGENCY_SPEED[1], Math.max(EMERGENCY_SPEED[0], this.params.baseSpeed * lane.speed * EMERGENCY_SPEED_FACTOR));
    const x = lane.dir > 0 ? -SPAWN_MARGIN - EMERGENCY_FAR - L : COLS + SPAWN_MARGIN + EMERGENCY_FAR;
    return { L, speed, x };
  }

  /**
   * Ruimte over (in vakjes) als de hulpdienst nu zou vertrekken: >= 0 betekent dat hij
   * niemand inhaalt voordat hij weer uit beeld is.
   */
  emergencyMargin(lane, type) {
    const { L, speed, x } = this.emergencyPlan(lane, type);
    // Zo lang duurt het voordat hij weer uit beeld (en uit de simulatie) is
    const travel = lane.dir > 0 ? COLS + SPAWN_MARGIN - x : x + L + SPAWN_MARGIN;
    const tGone = travel / speed;
    let margin = Infinity;
    for (const v of lane.vehicles) {
      // Vrije ruimte tussen zijn neus en de achterkant van dit voertuig
      const gap = lane.dir > 0 ? v.x - (x + L) : x - (v.x + v.length);
      // Tot dit voertuig zelf verdwijnt (iets voorzichtig gerekend: het kan nog wat afremmen)
      const vSpeed = Math.max(0.3, v.speed * 0.9);
      const vGone = lane.dir > 0 ? COLS + SPAWN_MARGIN - v.x : v.x + v.length + SPAWN_MARGIN;
      const t = Math.min(tGone, vGone / vSpeed);
      margin = Math.min(margin, gap < 0 ? -100 : gap - (speed - vSpeed) * t - 1.2);
    }
    return margin;
  }

  trySpawnEmergency(lane, type) {
    if (this.emergencyMargin(lane, type) < 0) return false;
    const { L, speed, x } = this.emergencyPlan(lane, type);
    lane.vehicles.push({ type, length: L, x, desired: speed, speed, color: VEHICLE_TYPES[type].colors[0], emergency: true });
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
        // Hulpdienst: vaste hoge snelheid (vertrekt alleen als de weg vrij genoeg is). Komt hij
        // toch vlak achter iemand (die onverwacht afremde), dan remt hij af: nooit erdoorheen.
        if (i > 0 && gapBetween(lane.dir, vs[i - 1], v) < 1.0) v.speed = Math.min(v.speed, vs[i - 1].speed);
        else v.speed = Math.min(v.desired, v.speed + ACCEL * 2 * dt);
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
