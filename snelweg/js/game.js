import {
  COLS,
  ROW_START,
  ROW_FINISH,
  ROW_MEDIAN,
  START_LIVES,
  NONCHA_LIVES,
  ROW_POINTS,
  FINISH_POINTS_PER_LEVEL,
  TIME_BONUS_WINDOW,
  TIME_BONUS_PER_SECOND,
  levelParams,
} from './config.js';
import { Traffic } from './traffic.js';
import { THEMES, pickPlace } from './themes.js';
import { Player } from './player.js';

const HIT_PAUSE = 1.2;
const NONCHA_REVEAL = 2.0; // noncha: na een aanrijding 2 s het (bevroren) speelveld tonen
const NONCHA_MULTIPLIER = 3;
const GLIMPSE_SHOW = 0.5; // noncha "even kijken": zo lang is het speelveld zichtbaar (s)
const GLIMPSE_FADE_IN = 0.08;
const GLIMPSE_FADE_OUT = 0.15;
const LEVEL_CLEAR_PAUSE = 1.6;
const LEVEL_BANNER = 1.3;
const MAX_QUEUED_MOVES = 2;
const DUEL_HIT_PAUSE = 1.0; // samen spelen: zo lang ligt een geraakte speler plat
const DUEL_WIN_PAUSE = 1.8; // feestje voordat het winnaarsscherm komt
const DUEL_START_COLS = [3, 9];
// Zware voertuigen drukken je plat; lichte laten je wegtollen
const HEAVY = ['truck', 'van', 'fire', 'ambulance'];
export const MAX_LEVEL = 30;

/**
 * Spelstatus: 'ready' | 'playing' | 'hit' | 'levelclear' | 'gameover' | 'duelwon' | 'duelover'.
 * Modus: 'normal' | 'noncha' | 'duel' (samen spelen: twee spelers, wie het eerst overstaat wint).
 * In 'ready' rijdt alleen het verkeer (achtergrond van het menu).
 * Pauze staat los daarvan (this.paused), zodat hervatten terugkeert naar dezelfde status.
 *
 * onEvent(type, data) meldt gebeurtenissen voor geluid en trillen:
 * 'levelstart', 'step', 'blocked', 'median', 'start', 'finish', 'hit', 'gameover', 'duelwin'.
 * In samen spelen bevat data.player de index van de speler (0 of 1).
 */
export class Game {
  constructor({ onGameOver = () => {}, onEvent = () => {}, onDuelOver = () => {} } = {}) {
    this.onGameOver = onGameOver;
    this.onDuelOver = onDuelOver;
    this.onEvent = onEvent;
    this.traffic = new Traffic();
    this.player = new Player();
    this.player2 = new Player();
    this.players = [this.player];
    this.wins = [0, 0];
    this.winner = -1;
    this.mode = 'normal';
    this.level = 1;
    this.score = 0;
    this.lives = START_LIVES;
    this.maxLives = START_LIVES;
    this.state = 'ready';
    this.paused = false;
    this.time = 0;
    this.timer = 0;
    this.crossTime = 0;
    this.glimpseEvery = 0; // noncha "even kijken": elke zoveel seconden (0 = nooit); main.js zet dit
    this.glimpseClock = 0;
    this.furthestRow = ROW_START;
    this.moves = [];
    this.moves2 = [];
    this.hitBy = null;
    this.message = null;
    this.messageTimer = 0;
    this.traffic.reset(1);
    this.place = pickPlace(this.params.theme); // plaats aan de overkant (wisselt per level)
  }

  get theme() {
    return THEMES[this.params.theme] || THEMES.nl130;
  }

  get params() {
    return this.traffic.params;
  }

  get multiplier() {
    return this.mode === 'noncha' ? NONCHA_MULTIPLIER : 1;
  }

  /**
   * Noncha: hoe donker het speelveld is (1 = helemaal zwart, 0 = zichtbaar).
   * Met glimpseEvery > 0 is het veld elke glimpseEvery seconden een halve seconde te zien
   * ("even kijken"), met een korte fade in en uit. Tijdens de onthulling na een aanrijding
   * is het altijd zichtbaar.
   */
  get darkness() {
    if (this.mode !== 'noncha' || !this.active || this.state === 'hit') return 0;
    const every = this.glimpseEvery;
    if (!every) return 1;
    const t = this.glimpseClock % every;
    const start = every - GLIMPSE_SHOW;
    if (t < start) return 1;
    const k = t - start;
    if (k < GLIMPSE_FADE_IN) return 1 - k / GLIMPSE_FADE_IN;
    if (k > GLIMPSE_SHOW - GLIMPSE_FADE_OUT) return (k - (GLIMPSE_SHOW - GLIMPSE_FADE_OUT)) / GLIMPSE_FADE_OUT;
    return 0;
  }

  /** Noncha: het speelveld is helemaal zwart. */
  get blind() {
    return this.darkness >= 1;
  }

  setMessage(message, duration = 0) {
    this.message = message;
    this.messageTimer = duration;
  }

  /**
   * @param {string} mode 'normal' | 'noncha' | 'duel'
   * @param {object} [opts] duel: { level: verkeersdrukte, resetWins: stand op 0 }
   */
  newGame(mode = 'normal', opts = {}) {
    this.mode = mode;
    this.level = opts.level || 1;
    // Oefenen: level gekozen of overgeslagen; telt niet voor de highscores
    this.practice = !!opts.practice;
    if (mode === 'duel') {
      this.players = [this.player, this.player2];
      DUEL_START_COLS.forEach((col, i) => (this.players[i].startCol = col));
      if (opts.resetWins) this.wins = [0, 0];
    } else {
      this.players = [this.player];
      this.player.startCol = Math.floor(COLS / 2);
    }
    this.score = 0;
    this.maxLives = mode === 'noncha' ? NONCHA_LIVES : START_LIVES;
    this.lives = this.maxLives;
    this.paused = false;
    this.startLevel();
  }

  startLevel() {
    this.traffic.reset(this.level, this.mode === 'duel' ? 'normal' : this.mode);
    this.place = pickPlace(this.params.theme, this.place);
    for (const p of this.players) p.reset();
    this.moves2 = [];
    this.winner = -1;
    this.furthestRow = ROW_START;
    this.crossTime = 0;
    this.glimpseClock = 0;
    this.moves = [];
    this.hitBy = null;
    this.state = 'playing';
    this.setMessage(this.levelMessage(), LEVEL_BANNER);
    this.onEvent('levelstart', { level: this.level });
  }

  levelMessage() {
    if (this.mode === 'duel') {
      return {
        title: 'Klaar? Lopen!',
        text: `Wie het eerst aan de overkant is, wint${this.params.autobahn ? ' · Autobahn!' : ''}`,
        toast: true,
      };
    }
    if (!this.params.autobahn) {
      return {
        title: `Level ${this.level}`,
        text: `${this.theme.label} · maximaal ${this.params.speedLimit} km/u · naar ${this.place}`,
        toast: true,
      };
    }
    // Eerste level boven de limiet: welkom op de Autobahn
    const first = this.level <= 1 || !levelParams(this.level - 1, this.mode).autobahn;
    return first
      ? { title: 'Welkom op de Autobahn!', text: `Level ${this.level} · geen snelheidslimiet · naar ${this.place}`, toast: true }
      : { title: `Level ${this.level}`, text: `Autobahn · geen snelheidslimiet · naar ${this.place}`, toast: true };
  }

  // --- Invoer -------------------------------------------------------------

  /** @param {number} who speler (0 of 1); alleen in samen spelen van belang */
  handleMove(dx, dy, who = 0) {
    if (this.paused || this.state !== 'playing') return;
    const queue = who === 1 && this.mode === 'duel' ? this.moves2 : this.moves;
    const p = this.players[who] || this.player;
    if (p.hitTimer > 0) return;
    if (queue.length < MAX_QUEUED_MOVES) queue.push([dx, dy]);
  }

  get active() {
    return this.state === 'playing' || this.state === 'hit' || this.state === 'levelclear';
  }

  /** Snelkoppeling: direct naar een ander level (telt daarna niet meer voor de highscores). */
  jumpLevel(delta) {
    if (this.mode === 'duel' || this.paused || !this.active) return;
    const level = Math.min(MAX_LEVEL, Math.max(1, this.level + delta));
    if (level === this.level) return;
    this.level = level;
    this.practice = true;
    this.startLevel();
  }

  togglePause() {
    if (!this.active) return;
    this.paused = !this.paused;
    this.moves = [];
    this.moves2 = [];
  }

  pause() {
    if (!this.paused) this.togglePause();
  }

  resume() {
    if (this.paused) this.togglePause();
  }

  /** Stoppen vanuit het pauzemenu: telt als game over (score kan nog in de highscores). */
  quit() {
    if (!this.active) return;
    this.paused = false;
    this.gameOver();
  }

  /** Terug naar het menu: alleen verkeer, geen speler-acties. */
  idle() {
    this.paused = false;
    this.state = 'ready';
    this.moves = [];
    this.moves2 = [];
    this.setMessage(null);
  }

  // --- Spelverloop --------------------------------------------------------

  update(dt) {
    if (this.paused) return;
    this.time += dt;
    // Noncha: tijdens de onthulling staat het verkeer stil, zodat je ziet wat je raakte.
    const frozen = this.state === 'hit' && this.mode === 'noncha';
    if (!frozen) this.traffic.update(dt);
    for (const p of this.players) p.update(dt);

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = null;
    }

    switch (this.state) {
      case 'playing':
        if (this.mode === 'duel') this.updateDuel(dt);
        else this.updatePlaying(dt);
        break;
      case 'duelwon':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'duelover';
          this.onDuelOver({ winner: this.winner, wins: this.wins.slice() });
        }
        break;
      case 'hit':
        this.timer -= dt;
        if (this.timer <= 0) this.afterHit();
        break;
      case 'levelclear':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.level += 1;
          this.startLevel();
        }
        break;
      default:
        break;
    }
  }

  updatePlaying(dt) {
    this.crossTime += dt;
    this.glimpseClock += dt;
    if (this.moves.length && this.player.cooldown <= 0) {
      const [dx, dy] = this.moves.shift();
      if (this.player.tryMove(dx, dy)) {
        const row = this.player.row;
        if (row === ROW_MEDIAN) this.onEvent('median');
        else if (row === ROW_START && dy > 0) this.onEvent('start');
        else if (row !== ROW_FINISH) this.onEvent('step');
      } else if (this.player.cooldown <= 0) {
        this.onEvent('blocked');
      }
    }

    // Alleen punten voor rijen die je in deze oversteek nog niet gehaald had.
    if (this.player.row < this.furthestRow) {
      this.score += ROW_POINTS * (this.furthestRow - this.player.row) * this.multiplier;
      this.furthestRow = this.player.row;
    }

    if (this.player.row === ROW_FINISH) {
      this.levelClear();
      return;
    }

    const [xMin, xMax] = this.player.hitbox();
    const vehicle = this.traffic.hitTest(this.player.row, xMin, xMax);
    if (vehicle) this.hit(vehicle);
  }

  // --- Samen spelen ----------------------------------------------------------

  updateDuel(dt) {
    this.crossTime += dt;
    for (let i = 0; i < this.players.length && this.state === 'playing'; i++) {
      const p = this.players[i];
      const queue = i === 1 ? this.moves2 : this.moves;
      if (p.hitTimer > 0) {
        p.hitTimer -= dt;
        if (p.hitTimer <= 0) p.reset(); // terug naar de start
        continue;
      }
      if (queue.length && p.cooldown <= 0) {
        const [dx, dy] = queue.shift();
        if (p.tryMove(dx, dy)) {
          if (p.row === ROW_MEDIAN) this.onEvent('median', { player: i });
          else if (p.row !== ROW_FINISH) this.onEvent('step', { player: i });
        } else {
          this.onEvent('blocked', { player: i });
        }
      }
      if (p.row === ROW_FINISH) {
        this.duelWin(i);
        return;
      }
      const [xMin, xMax] = p.hitbox();
      const vehicle = this.traffic.hitTest(p.row, xMin, xMax);
      if (vehicle) {
        p.hitTimer = p.hitDuration = DUEL_HIT_PAUSE;
        p.hitStyle = HEAVY.includes(vehicle.type) ? 'flat' : 'spin';
        const lane = this.traffic.laneByRow.get(p.row);
        p.hitDir = lane ? lane.dir : 1;
        queue.length = 0;
        this.onEvent('hit', { vehicle, player: i });
      }
    }
  }

  duelWin(i) {
    this.winner = i;
    this.wins[i] += 1;
    this.state = 'duelwon';
    this.timer = DUEL_WIN_PAUSE;
    this.moves = [];
    this.moves2 = [];
    this.onEvent('duelwin', { player: i });
  }

  hit(vehicle) {
    this.lives -= 1;
    this.hitBy = vehicle;
    this.state = 'hit';
    this.timer = this.mode === 'noncha' ? NONCHA_REVEAL : HIT_PAUSE;
    this.hitDuration = this.timer;
    // Aanrijdingseffect: zwaar voertuig = plat als een pannenkoek, licht voertuig = wegtollen.
    this.hitStyle = HEAVY.includes(vehicle.type) ? 'flat' : 'spin';
    const lane = this.traffic.laneByRow.get(this.player.row);
    this.hitDir = lane ? lane.dir : 1;
    this.moves = [];
    this.onEvent('hit', { vehicle });
  }

  afterHit() {
    this.hitBy = null;
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.player.reset();
    this.state = 'playing';
  }

  gameOver() {
    this.state = 'gameover';
    this.moves = [];
    this.setMessage(null);
    this.onEvent('gameover');
    this.onGameOver({ mode: this.mode, score: this.score, level: this.level, practice: this.practice });
  }

  levelClear() {
    const timeBonus = Math.round(Math.max(0, TIME_BONUS_WINDOW - this.crossTime) * TIME_BONUS_PER_SECOND);
    const bonus = (FINISH_POINTS_PER_LEVEL * this.level + timeBonus) * this.multiplier;
    this.score += bonus;
    this.state = 'levelclear';
    this.timer = LEVEL_CLEAR_PAUSE;
    this.moves = [];
    this.onEvent('finish', { bonus });
    this.setMessage(
      {
        title: 'Overgestoken!',
        text: `+${bonus} punten (tijdbonus ${timeBonus}${this.multiplier > 1 ? `, ×${this.multiplier}` : ''})`,
        toast: true,
      },
      LEVEL_CLEAR_PAUSE,
    );
  }
}
