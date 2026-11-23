import {
  ROW_START,
  ROW_FINISH,
  ROW_MEDIAN,
  START_LIVES,
  NONCHA_LIVES,
  ROW_POINTS,
  FINISH_POINTS_PER_LEVEL,
  TIME_BONUS_WINDOW,
  TIME_BONUS_PER_SECOND,
} from './config.js';
import { Traffic } from './traffic.js';
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

/**
 * Spelstatus: 'ready' | 'playing' | 'hit' | 'levelclear' | 'gameover'.
 * In 'ready' rijdt alleen het verkeer (achtergrond van het menu).
 * Pauze staat los daarvan (this.paused), zodat hervatten terugkeert naar dezelfde status.
 *
 * onEvent(type, data) meldt gebeurtenissen voor geluid en trillen:
 * 'levelstart', 'step', 'blocked', 'median', 'start', 'finish', 'hit', 'gameover'.
 */
export class Game {
  constructor({ onGameOver = () => {}, onEvent = () => {} } = {}) {
    this.onGameOver = onGameOver;
    this.onEvent = onEvent;
    this.traffic = new Traffic();
    this.player = new Player();
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
    this.hitBy = null;
    this.message = null;
    this.messageTimer = 0;
    this.traffic.reset(1);
  }

  get params() {
    return this.traffic.params;
  }

  get multiplier() {
    return this.mode === 'noncha' ? NONCHA_MULTIPLIER : 1;
  }

  /** Noncha: het speelveld is zwart, behalve tijdens de onthulling na een aanrijding. */
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

  newGame(mode = 'normal') {
    this.mode = mode;
    this.level = 1;
    this.score = 0;
    this.maxLives = mode === 'noncha' ? NONCHA_LIVES : START_LIVES;
    this.lives = this.maxLives;
    this.paused = false;
    this.startLevel();
  }

  startLevel() {
    this.traffic.reset(this.level, this.mode);
    this.player.reset();
    this.furthestRow = ROW_START;
    this.crossTime = 0;
    this.glimpseClock = 0;
    this.moves = [];
    this.hitBy = null;
    this.state = 'playing';
    this.setMessage(
      { title: `Level ${this.level}`, text: `Maximaal ${this.params.speedLimit} km/u`, toast: true },
      LEVEL_BANNER,
    );
    this.onEvent('levelstart', { level: this.level });
  }

  // --- Invoer -------------------------------------------------------------

  handleMove(dx, dy) {
    if (this.paused) return;
    if (this.state === 'playing' && this.moves.length < MAX_QUEUED_MOVES) this.moves.push([dx, dy]);
  }

  get active() {
    return this.state === 'playing' || this.state === 'hit' || this.state === 'levelclear';
  }

  togglePause() {
    if (!this.active) return;
    this.paused = !this.paused;
    this.moves = [];
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
    this.setMessage(null);
  }

  // --- Spelverloop --------------------------------------------------------

  update(dt) {
    if (this.paused) return;
    this.time += dt;
    // Noncha: tijdens de onthulling staat het verkeer stil, zodat je ziet wat je raakte.
    const frozen = this.state === 'hit' && this.mode === 'noncha';
    if (!frozen) this.traffic.update(dt);
    this.player.update(dt);

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = null;
    }

    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
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

  hit(vehicle) {
    this.lives -= 1;
    this.hitBy = vehicle;
    this.state = 'hit';
    this.timer = this.mode === 'noncha' ? NONCHA_REVEAL : HIT_PAUSE;
    this.hitDuration = this.timer;
    // Aanrijdingseffect: zwaar voertuig = plat als een pannenkoek, licht voertuig = wegtollen.
    this.hitStyle = vehicle.type === 'truck' || vehicle.type === 'van' ? 'flat' : 'spin';
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
    this.onGameOver({ mode: this.mode, score: this.score, level: this.level });
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
