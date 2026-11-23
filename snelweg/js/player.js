import { COLS, ROWS, ROW_START, STEP_COOLDOWN, HOP_TIME, PLAYER_HALF_WIDTH } from './config.js';
import { DEFAULT_LOOK } from './character.js';

export class Player {
  constructor() {
    // Uiterlijk; wordt in stap 3 (poppetje maken) instelbaar.
    this.look = { ...DEFAULT_LOOK };
    this.face = null; // data-URL van het eigen gezicht (stap 4)
    this.reset();
  }

  reset() {
    this.col = Math.floor(COLS / 2);
    this.row = ROW_START;
    this.fromCol = this.col;
    this.fromRow = this.row;
    this.moveT = 1;
    this.cooldown = 0;
    this.flash = 0.7; // knipperen na (her)verschijnen; alleen cosmetisch
  }

  /** Eén vakje stappen. Geeft false terug als het niet kan (cooldown of rand). */
  tryMove(dx, dy) {
    if (this.cooldown > 0) return false;
    const col = this.col + dx;
    const row = this.row + dy;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    this.fromCol = this.col;
    this.fromRow = this.row;
    this.col = col;
    this.row = row;
    this.moveT = 0;
    this.cooldown = STEP_COOLDOWN;
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.moveT = Math.min(1, this.moveT + dt / HOP_TIME);
    this.flash = Math.max(0, this.flash - dt);
  }

  /** Botsbereik in x (de speler staat altijd precies in één rij). */
  hitbox() {
    const cx = this.col + 0.5;
    return [cx - PLAYER_HALF_WIDTH, cx + PLAYER_HALF_WIDTH];
  }
}
