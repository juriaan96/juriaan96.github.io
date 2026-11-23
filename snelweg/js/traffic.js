import {
  COLS,
  LANES,
  VEHICLE_TYPES,
  EMERGENCY_TYPES,
  DSI_CONVOY,
  DSI_SPACING,
  SPAWN_MARGIN,
  VEHICLE_HIT_INSET,
  levelParams,
} from './config.js';
import { layoutFor } from './themes.js';

const ACCEL = 3; // vakjes/s², optrekken
const BRAKE = 8; // vakjes/s², afremmen
const WARMUP_SECONDS = 30;
const WARMUP_STEP = 1 / 30;

// Hulpdiensten (brandweer, ambulance, politie, af en toe een DSI-colonne): ver buiten beeld,
// zodat je de sirene al hoort aankomen voordat hij voorbij raast. Ze rijden met vaste hoge
// snelheid en vertrekken alleen als ze binnen beeld niemand kunnen inhalen; het verkeer erachter
// wacht tot ze voorbij zijn (gewone spawn-regels), dus er blijft altijd een haalbaar gat.
const EMERGENCY_FAR = 20; // vakjes extra buiten beeld (zo hoor je hem ruim 2 s van tevoren)
const EMERGENCY_FIRST = [2, 5]; // seconden tot de eerste (per spel; de wachttijd loopt door over levels)
const EMERGENCY_DELAY = [12, 25]; // seconden tussen twee hulpdiensten
const EMERGENCY_SPEED = [6, 11]; // vakjes/s (min, max)
const EMERGENCY_SPEED_FACTOR = 2.4; // t.o.v. de rijstrooksnelheid
const EMERGENCY_WAIT = 15; // s maximaal ruimte maken; daarna (zelden) overslaan
const CONVOY_CHANCE = 0.25; // kans dat het een DSI-colonne is

// Aanrijdingen: een auto remt piepend, de achterligger knalt erop en beide tollen weg, ook
// schuin over andere rijstroken. De wrakken blijven even liggen (verkeer erachter staat stil),
// daarna worden ze weggesleept. Je hoort eerst het gepiep, zodat je nog kunt uitwijken.
const CRASH_FIRST = [15, 30]; // s tot de eerste aanrijding in een spel
const CRASH_DELAY = [30, 60]; // s tussen twee aanrijdingen
const SKID_TIME = 0.55; // s remmen (gepiep) voor de klap
const WRECK_SLIDE = 1.4; // s maximaal wegtollen
const WRECK_STAY = 6; // s blijven liggen
const WRECK_FADE = 0.6; // s wegslepen (vervagen)

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

/** Halve afmetingen (x, rij) van een gedraaid wrak. */
function wreckExtent(w) {
  const c = Math.abs(Math.cos(w.rot));
  const s = Math.abs(Math.sin(w.rot));
  const hl = w.v.length / 2;
  return [hl * c + 0.32 * s, hl * s + 0.32 * c];
}

/**
 * Verkeer per rijstrook. Een voertuig heeft x = linkerrand in vakjes.
 *
 * Haalbaarheid: de afstand tussen voertuigen wordt in tijd gekozen (minGapTime..maxGapTime)
 * en omgerekend naar afstand met de snelheid van de volger. Een sneller voertuig dat een
 * langzamer inhaalt, remt af en houdt minstens minGapTime aan. Zo is elk punt van een
 * rijstrook regelmatig minstens minGapTime seconden vrij.
 *
 * events: gebeurtenissen voor geluid ('skid', 'crash'), de game leest ze uit.
 */
export class Traffic {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.params = levelParams(1);
    this.layout = layoutFor(this.params.theme);
    this.lanes = [];
    this.laneByRow = new Map();
    this.wrecks = [];
    this.events = [];
  }

  /**
   * @param {boolean} [freshGame] nieuw spel: de eerste hulpdienst en aanrijding komen snel.
   *   Anders lopen de wachttijden door vanaf het vorige level (een level duurt vaak korter).
   */
  reset(level, mode = 'normal', freshGame = true) {
    this.params = levelParams(level, mode);
    // Rijstroken en fietspaden van dit wegtype (zie themes.js); zonder eigen indeling 3 + 3
    this.layout = layoutFor(this.params.theme);
    this.lanes = (this.layout.lanes || LANES).map((cfg) => ({ kind: 'road', ...cfg, vehicles: [], next: null }));
    this.laneByRow = new Map(this.lanes.map((lane) => [lane.row, lane]));
    this.wrecks = [];
    for (const lane of this.lanes) this.planNext(lane);
    // Laat het verkeer alvast rijden zodat de weg meteen gevuld is (zonder hulpdiensten/ongelukken).
    const carry = this.emergencyIn;
    const carryCrash = this.crashIn;
    const wasPending = !!this.pendingEmergency; // was er al een onderweg? dan meteen weer
    this.emergencyIn = Infinity;
    this.crashIn = Infinity;
    this.pendingEmergency = null;
    for (let t = 0; t < WARMUP_SECONDS; t += WARMUP_STEP) this.update(WARMUP_STEP);
    this.events.length = 0;
    if (!freshGame && wasPending) this.emergencyIn = 0.5;
    else if (!freshGame && carry > 0 && carry < EMERGENCY_DELAY[1]) this.emergencyIn = carry;
    else this.emergencyIn = this.between(EMERGENCY_FIRST);
    this.crashIn = !freshGame && carryCrash > 0 && carryCrash < CRASH_DELAY[1] ? carryCrash : this.between(CRASH_FIRST);
  }

  between([lo, hi]) {
    return lo + this.rng() * (hi - lo);
  }

  emergencyDelay() {
    return this.between(EMERGENCY_DELAY);
  }

  update(dt) {
    for (const lane of this.lanes) {
      this.moveLane(lane, dt);
      this.trySpawn(lane);
    }
    this.updateEmergency(dt);
    this.updateCrash(dt);
  }

  // --- Hulpdiensten -----------------------------------------------------------------------

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
    let type = this.nextEmergencyType;
    this.nextEmergencyType = null;
    if (!type) {
      type = this.rng() < CONVOY_CHANCE ? 'convoy' : EMERGENCY_TYPES[Math.floor(this.rng() * EMERGENCY_TYPES.length)];
    }
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

  /** Hoe en waar een hulpdienst (of de hele DSI-colonne) in deze rijstrook zou ontstaan. */
  emergencyPlan(lane, type) {
    const units = type === 'convoy' ? DSI_CONVOY : [type];
    const L = units.reduce((s, u) => s + VEHICLE_TYPES[u].length, 0) + DSI_SPACING * (units.length - 1);
    const speed = Math.min(EMERGENCY_SPEED[1], Math.max(EMERGENCY_SPEED[0], this.params.baseSpeed * lane.speed * EMERGENCY_SPEED_FACTOR));
    const x = lane.dir > 0 ? -SPAWN_MARGIN - EMERGENCY_FAR - L : COLS + SPAWN_MARGIN + EMERGENCY_FAR;
    return { units, L, speed, x };
  }

  /**
   * Ruimte over (in vakjes) als de hulpdienst nu zou vertrekken: >= 0 betekent dat hij
   * niemand inhaalt voordat hij weer uit beeld is. Een colonne telt als één lang voertuig.
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
    const { units, L, speed, x } = this.emergencyPlan(lane, type);
    // Voorste voertuig eerst (de lijst loopt van voor naar achter)
    let front = lane.dir > 0 ? x + L : x;
    for (const u of units) {
      const len = VEHICLE_TYPES[u].length;
      const vx = lane.dir > 0 ? front - len : front;
      lane.vehicles.push({ type: u, length: len, x: vx, desired: speed, speed, color: VEHICLE_TYPES[u].colors[0], emergency: true, convoy: units.length > 1 });
      front = lane.dir > 0 ? vx - DSI_SPACING : vx + len + DSI_SPACING;
    }
    return true;
  }

  // --- Aanrijdingen -------------------------------------------------------------------------

  updateCrash(dt) {
    // Voertuigen die aan het remmen zijn voor een aanrijding
    for (const lane of this.lanes) {
      for (const v of lane.vehicles) {
        if (v.skid === undefined) continue;
        v.skid -= dt;
        if (v.skid <= 0 && v.crashWith) this.impact(lane, v.crashWith, v);
      }
    }
    // Wrakken: wegtollen, blijven liggen, wegslepen
    for (const w of this.wrecks) {
      w.t += dt;
      if (w.phase === 'slide') {
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.rot += w.vr * dt;
        const f = Math.max(0, 1 - 2.6 * dt);
        w.vx *= f;
        w.vy *= f;
        w.vr *= Math.max(0, 1 - 2.2 * dt);
        // Niet de bermen op (overkant en startberm blijven veilig)
        const lo = 1 + 0.3;
        const hi = this.layout.start - 0.3;
        if (w.y < lo || w.y > hi) {
          w.y = Math.min(hi, Math.max(lo, w.y));
          w.vy = -w.vy * 0.3;
        }
        if (w.t > WRECK_SLIDE || Math.hypot(w.vx, w.vy) < 0.15) {
          w.phase = 'stay';
          w.t = 0;
        }
      } else if (w.phase === 'stay' && w.t > WRECK_STAY) {
        w.phase = 'fade';
        w.t = 0;
      }
    }
    this.wrecks = this.wrecks.filter((w) => !(w.phase === 'fade' && w.t > WRECK_FADE));

    this.crashIn -= dt;
    if (this.crashIn > 0) return;
    this.crashIn = this.tryCrash() ? this.between(CRASH_DELAY) : 2;
  }

  /** Kies twee voertuigen achter elkaar in beeld; de voorste remt, de achterste rijdt erop. */
  tryCrash() {
    if (this.wrecks.length) return false;
    const options = [];
    for (const lane of this.lanes) {
      if (lane.kind !== 'road') continue;
      const vs = lane.vehicles;
      for (let i = 0; i + 1 < vs.length; i++) {
        const a = vs[i];
        const b = vs[i + 1];
        if (a.emergency || b.emergency || a.skid !== undefined || b.skid !== undefined) continue;
        const centre = a.x + a.length / 2;
        if (centre < 2 || centre > COLS - 2) continue;
        if (gapBetween(lane.dir, a, b) > 4) continue;
        options.push([lane, a, b]);
      }
    }
    if (!options.length) return false;
    const [lane, a, b] = options[Math.floor(this.rng() * options.length)];
    a.skid = SKID_TIME * 0.6; // de voorste remt
    b.skid = SKID_TIME;
    b.crashWith = a;
    this.events.push({ type: 'skid', x: a.x + a.length / 2, row: lane.row });
    return true;
  }

  /** De klap: beide voertuigen worden wrakken die alle kanten op tollen. */
  impact(lane, a, b) {
    lane.vehicles = lane.vehicles.filter((v) => v !== a && v !== b);
    b.x = lane.dir > 0 ? a.x - b.length : a.x + a.length; // bumper tegen bumper
    const up = this.rng() < 0.5 ? -1 : 1;
    const make = (v, push, side) => ({
      v,
      dir: lane.dir,
      x: v.x + v.length / 2,
      y: lane.row + 0.5,
      vx: lane.dir * (v.speed * push + 1.2),
      vy: side * (1.2 + this.rng() * 1.6),
      rot: 0,
      vr: (this.rng() < 0.5 ? -1 : 1) * (5 + this.rng() * 6),
      phase: 'slide',
      t: 0,
    });
    this.wrecks.push(make(a, 0.6, up), make(b, 0.25, -up));
    this.events.push({ type: 'crash', x: a.x + a.length / 2, row: lane.row });
    // Even later komt er een ambulance of politie langs
    this.nextEmergencyType = this.rng() < 0.5 ? 'ambulance' : 'police';
    if (!this.pendingEmergency) this.emergencyIn = Math.min(this.emergencyIn, 3);
  }

  /** Dichtstbijzijnde wrak vóór een voertuig in deze rijstrook (vrije ruimte), of Infinity. */
  wreckGapAhead(lane, v) {
    let best = Infinity;
    for (const w of this.wrecks) {
      if (w.phase === 'fade') continue;
      const [hx, hy] = wreckExtent(w);
      if (Math.abs(w.y - (lane.row + 0.5)) > hy + 0.35) continue;
      const gap = lane.dir > 0 ? w.x - hx - (v.x + v.length) : v.x - (w.x + hx);
      if (gap > -hx) best = Math.min(best, Math.max(0, gap));
    }
    return best;
  }

  // --- Rijden -------------------------------------------------------------------------------

  planNext(lane) {
    const mix = this.params.autobahn && lane.autobahnMix ? lane.autobahnMix : lane.mix;
    const type = pickWeighted(mix, this.rng);
    const speed = this.params.baseSpeed * lane.speed * VEHICLE_TYPES[type].speed;
    const { minGapTime, maxGapTime } = this.params;
    const gapTime = minGapTime + this.rng() * (maxGapTime - minGapTime);
    lane.next = { type, speed, gap: gapTime * speed };
  }

  moveLane(lane, dt) {
    const { minGapTime } = this.params;
    const vs = lane.vehicles;
    const anyWreck = this.wrecks.length > 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      // Wrak voor je: stoppen (de rij erachter staat stil tot het is weggesleept)
      const wreckGap = anyWreck ? this.wreckGapAhead(lane, v) : Infinity;
      if (v.skid !== undefined) {
        // Remmen voor een aanrijding: de voorste remt hard, de achterste niet (en knalt erop)
        if (!v.crashWith) v.speed = Math.max(0, v.speed - BRAKE * 0.8 * dt);
        v.x += lane.dir * v.speed * dt;
        continue;
      }
      if (v.emergency) {
        // Hulpdienst: vaste hoge snelheid (vertrekt alleen als de weg vrij genoeg is). Komt hij
        // toch vlak achter iemand (die onverwacht afremde), dan remt hij af: nooit erdoorheen.
        if (wreckGap < 1.0) v.speed = 0;
        else if (i > 0 && gapBetween(lane.dir, vs[i - 1], v) < 1.0) v.speed = Math.min(v.speed, vs[i - 1].speed);
        else v.speed = Math.min(v.desired, v.speed + ACCEL * 2 * dt);
        v.x += lane.dir * v.speed * dt;
        continue;
      }
      let target = v.desired;
      let tooClose = false;
      const safe = minGapTime * v.desired;
      if (i > 0) {
        const leader = vs[i - 1];
        const gap = gapBetween(lane.dir, leader, v);
        if (gap < safe * 1.5) target = Math.min(target, leader.speed);
        tooClose = gap < safe;
        if (tooClose) v.speed = Math.min(v.speed, leader.speed);
      }
      if (wreckGap < safe * 1.5) {
        target = 0;
        if (wreckGap < 0.3) v.speed = 0;
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

  /** Geeft het voertuig (of wrak) terug dat het bereik [xMin, xMax] in deze rij raakt, of null. */
  hitTest(row, xMin, xMax) {
    for (const w of this.wrecks) {
      if (w.phase === 'fade') continue;
      const [hx, hy] = wreckExtent(w);
      if (Math.abs(w.y - (row + 0.5)) < hy + 0.2 && w.x - hx + 0.1 < xMax && w.x + hx - 0.1 > xMin) return w.v;
    }
    const lane = this.laneByRow.get(row);
    if (!lane) return null;
    for (const v of lane.vehicles) {
      if (v.x + VEHICLE_HIT_INSET < xMax && v.x + v.length - VEHICLE_HIT_INSET > xMin) return v;
    }
    return null;
  }
}
