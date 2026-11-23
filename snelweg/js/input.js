const KEY_DIRS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

const SWIPE_MIN_PX = 20;

/**
 * Spelbesturing: toetsenbord en swipen.
 * Het toetsenbord wordt doorgegeven door main.js (handleKey), zodat menu's en spel elkaars
 * toetsen niet afvangen. Swipes tellen alleen als isEnabled() true is.
 *
 * handlers: { onMove(dx, dy), onPause(), onWhere() }
 */
export class Input {
  constructor(swipeTarget, handlers, isEnabled) {
    this.handlers = handlers;
    this.isEnabled = isEnabled;
    this.pointer = null;
    swipeTarget.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    swipeTarget.addEventListener('pointerup', (e) => this.onPointerUp(e));
    swipeTarget.addEventListener('pointercancel', () => (this.pointer = null));
    // Geen browsergebaren (fling/dubbeltik) op het speelveld: anders kan de eerste tik ná een
    // swipe "ingeslikt" worden. Pointer-events (onze swipes) blijven gewoon werken.
    swipeTarget.addEventListener(
      'touchstart',
      (e) => {
        if (this.isEnabled()) e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Geeft true terug als de toets door het spel is gebruikt. */
  handleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const dir = KEY_DIRS[e.code] ?? KEY_DIRS[e.key];
    if (dir) {
      e.preventDefault();
      // Ingedrukt houden laat de speler niet doorlopen: één stap per aanslag.
      if (!e.repeat) this.handlers.onMove(dir[0], dir[1]);
      return true;
    }
    if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      this.handlers.onPause();
      return true;
    }
    if (e.code === 'Space') {
      // "Waar sta ik?": positiegeluid (vooral handig in noncha mode)
      e.preventDefault();
      if (!e.repeat) this.handlers.onWhere?.();
      return true;
    }
    return false;
  }

  onPointerDown(e) {
    if (!e.isPrimary || !this.isEnabled()) return;
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  onPointerUp(e) {
    const start = this.pointer;
    this.pointer = null;
    if (!start || start.id !== e.pointerId || !this.isEnabled()) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) this.handlers.onMove(Math.sign(dx), 0);
    else this.handlers.onMove(0, Math.sign(dy));
  }
}
