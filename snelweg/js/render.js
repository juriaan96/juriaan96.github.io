import { COLS, ROWS, ROW_FINISH } from './config.js';
import { drawCharacter } from './character.js';
import { THEMES, rowKinds, layoutFor } from './themes.js';
import { paintUnlimited, paintRoundSign, paintPlaceSign, paintFlag, paintCheckered, paintItem } from './signs.js';

const C = {
  grass: '#5a9443',
  grassDark: '#4b8037',
  grassLight: '#6aa452',
  asphalt: '#45484e',
  asphaltDark: '#3c3f44',
  asphaltLight: '#50545a',
  line: '#f3f3ee',
  rail: '#c9ced6',
  railShine: '#eef1f5',
  post: '#5b6068',
  shadow: 'rgba(0, 0, 0, 0.28)',
  glass: '#a9d3ee',
  glassRear: '#7fa8c4',
  headlight: '#fff6c2',
  taillight: '#ff3b3b',
  // Autobahn: lichte betonplaten met voegen
  concrete: '#9c9e9c',
  concreteDark: '#8f918f',
  concreteLight: '#a9aba9',
  joint: 'rgba(30, 30, 30, 0.28)',
};

/** Kleur lichter (amt > 0) of donkerder (amt < 0) maken. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c) => Math.round(Math.min(255, Math.max(0, amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

/** Kleuren van speler 1 en 2 in samen spelen (bolletje boven het hoofd, HUD). */
export const PLAYER_COLORS = ['#2563eb', '#ea580c'];

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Tekent het speelveld. Alles in grid-eenheden via een schaal-transform. */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.scale = 1;
    this.particles = [];
    const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = !!(motion && motion.matches);
    if (motion && motion.addEventListener) motion.addEventListener('change', (e) => (this.reducedMotion = e.matches));
  }

  resize(availW, availH) {
    this.avail = [availW, availH];
    const rows = this.rows;
    const tilePx = Math.max(10, Math.floor(Math.min(availW / COLS, availH / rows)));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(tilePx * COLS * dpr);
    const h = Math.round(tilePx * rows * dpr);
    this.canvas.style.width = `${tilePx * COLS}px`;
    this.canvas.style.height = `${tilePx * rows}px`;
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = this.bg.width = w;
    this.canvas.height = this.bg.height = h;
    this.scale = tilePx * dpr;
    this.drawBackground(this.bg.getContext('2d'));
  }

  /** Aantal rijen van het huidige wegtype (minder rijstroken = minder rijen = grotere vakjes). */
  get rows() {
    return this.themeId ? layoutFor(this.themeId).rows : ROWS;
  }

  /** Bij een ander wegtype: opnieuw schalen (ander aantal rijen) en de achtergrond tekenen. */
  syncBackground(game) {
    const id = game.params.theme;
    if (id === this.themeId) return;
    const before = this.rows;
    this.themeId = id;
    if (this.rows !== before && this.avail) {
      this.canvas.width = 0; // forceer opnieuw schalen
      this.resize(this.avail[0], this.avail[1]);
    } else {
      this.drawBackground(this.bg.getContext('2d'));
    }
  }

  /** Schermpositie → positie op het speelveld (in vakjes). */
  screenToGrid(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { gx: ((clientX - r.left) / r.width) * COLS, gy: ((clientY - r.top) / r.height) * this.rows };
  }

  // --- Statische achtergrond (één keer per resize) -------------------------

  drawBackground(ctx) {
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const rnd = seeded(7);
    const t = THEMES[this.themeId] || THEMES.nl130;
    const kinds = rowKinds(this.themeId);
    const grass = t.grass;
    const grassDark = shade(grass, -0.15);
    const grassLight = shade(grass, 0.12);
    const concrete = t.road === 'concrete';
    const road = concrete ? C.concrete : t.road;
    const roadDark = concrete ? C.concreteDark : shade(road, -0.12);
    const roadLight = concrete ? C.concreteLight : shade(road, 0.1);

    // 1. Ondergrond per rij: gras (overkant, start, berm), rijbaan, fietspad of middenberm
    for (let row = 0; row < kinds.length; row++) {
      const kind = kinds[row];
      if (kind === 'road' || kind === 'median') {
        ctx.fillStyle = road;
        ctx.fillRect(0, row, COLS, 1);
        for (let i = 0; i < COLS * 13; i++) {
          ctx.fillStyle = rnd() < 0.5 ? roadDark : roadLight;
          ctx.fillRect(rnd() * COLS, row + rnd(), 0.04, 0.04);
        }
        if (kind === 'road' && t.patches) {
          // België: lappen asfalt
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = rnd() < 0.6 ? shade(road, -0.18) : shade(road, 0.08);
            ctx.fillRect(rnd() * COLS - 0.5, row + 0.1 + rnd() * 0.4, 0.6 + rnd() * 1.6, 0.3 + rnd() * 0.4);
          }
        }
        if (kind === 'road' && concrete) {
          ctx.fillStyle = C.joint;
          for (let x = 0.4 + (row % 3) * 0.55; x < COLS; x += 1.65) ctx.fillRect(x, row, 0.025, 1);
        }
      } else if (kind === 'bike') {
        // Fietspad: rood asfalt met fietssymbolen
        ctx.fillStyle = t.bike || '#b4473a';
        ctx.fillRect(0, row, COLS, 1);
        for (let i = 0; i < COLS * 10; i++) {
          ctx.fillStyle = rnd() < 0.5 ? shade(t.bike, -0.1) : shade(t.bike, 0.08);
          ctx.fillRect(rnd() * COLS, row + rnd(), 0.04, 0.04);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.035;
        for (let x = 1.5; x < COLS; x += 4) this.bikeSymbol(ctx, x, row + 0.5);
      } else {
        ctx.fillStyle = grass;
        ctx.fillRect(0, row, COLS, 1);
        for (let i = 0; i < COLS * 10; i++) {
          ctx.fillStyle = rnd() < 0.5 ? grassDark : grassLight;
          ctx.fillRect(rnd() * COLS, row + rnd() * 0.95, 0.05, 0.08);
        }
      }
    }

    // 2. Strepen: kantstrepen langs elke rijbaan, onderbroken strepen tussen rijstroken
    const edgeLine = (y) => {
      if (t.edge === 'curbs') {
        // Circuit: rood-witte curbs
        for (let x = 0, i = 0; x < COLS; x += 0.5, i++) {
          ctx.fillStyle = i % 2 ? '#ffffff' : '#d62828';
          ctx.fillRect(x, y - 0.04, 0.5, 0.13);
        }
        ctx.fillStyle = C.line;
      } else if (t.edge === 'dashed') for (let x = 0.1; x < COLS; x += 1.0) ctx.fillRect(x, y, 0.55, 0.05);
      else ctx.fillRect(0, y, COLS, 0.05);
    };
    ctx.fillStyle = C.line;
    for (let row = 0; row < kinds.length; row++) {
      if (kinds[row] !== 'road') continue;
      const above = kinds[row - 1];
      const below = kinds[row + 1];
      if (above !== 'road' && above !== 'median') edgeLine(row + 0.04);
      if (below !== 'road' && below !== 'median') edgeLine(row + 1 - 0.09);
      if (above === 'median') edgeLine(row + 0.04);
      if (below === 'median') edgeLine(row + 1 - 0.09);
      if (below === 'road') for (let x = 0.3; x < COLS; x += 2.2) ctx.fillRect(x, row + 1 - 0.03, 1.1, 0.06);
    }

    // 3. Middenberm
    const m = kinds.indexOf('median');
    if (t.median === 'green') {
      // Nederland: groene middenmarkering tussen twee witte lijnen
      ctx.fillStyle = '#3f8a4e';
      ctx.fillRect(0, m + 0.28, COLS, 0.44);
      ctx.fillStyle = C.line;
      ctx.fillRect(0, m + 0.22, COLS, 0.06);
      ctx.fillRect(0, m + 0.72, COLS, 0.06);
    } else if (t.median === 'pitwall') {
      // Circuit: muur langs de pitstraat, met een hek erop
      ctx.fillStyle = C.shadow;
      ctx.fillRect(0, m + 0.62, COLS, 0.08);
      ctx.fillStyle = '#d4d4cf';
      ctx.fillRect(0, m + 0.32, COLS, 0.3);
      ctx.fillStyle = '#8f949b';
      for (let x = 0; x < COLS; x += 0.4) ctx.fillRect(x, m + 0.3, 0.03, 0.34);
      ctx.fillStyle = '#d62828';
      ctx.fillRect(0, m + 0.44, COLS, 0.05);
    } else if (t.median === 'double') {
      // België: dubbele doorgetrokken streep
      ctx.fillStyle = C.line;
      ctx.fillRect(0, m + 0.4, COLS, 0.06);
      ctx.fillRect(0, m + 0.54, COLS, 0.06);
    } else if (t.median === 'concrete') {
      // Betonnen barrier
      ctx.fillStyle = C.shadow;
      ctx.fillRect(0, m + 0.6, COLS, 0.07);
      ctx.fillStyle = '#b9b9b2';
      ctx.fillRect(0, m + 0.36, COLS, 0.26);
      ctx.fillStyle = '#dcdcd5';
      ctx.fillRect(0, m + 0.44, COLS, 0.1);
    } else {
      // Gras en een vangrail
      ctx.fillStyle = grass;
      ctx.fillRect(0, m + 0.18, COLS, 0.64);
      for (let i = 0; i < COLS * 4; i++) {
        ctx.fillStyle = grassDark;
        ctx.fillRect(rnd() * COLS, m + 0.2 + rnd() * 0.55, 0.05, 0.07);
      }
      ctx.fillStyle = C.shadow;
      ctx.fillRect(0, m + 0.54, COLS, 0.06);
      for (let x = 0.15; x < COLS; x += 0.6) {
        ctx.fillStyle = C.post;
        ctx.fillRect(x, m + 0.42, 0.07, 0.16);
      }
      ctx.fillStyle = C.rail;
      ctx.fillRect(0, m + 0.45, COLS, 0.09);
      ctx.fillStyle = C.railShine;
      ctx.fillRect(0, m + 0.46, COLS, 0.025);
    }

    // 4. Langs de weg op de overkant en de startberm: hectometerpaaltjes (NL) of straatlantaarns (BE)
    for (const row of [0, kinds.length - 1]) {
      // Aan de kant van de weg; op de overkant niet onder het plaatsbord
      const y = row === 0 ? 0.86 : row + 0.14;
      const maxX = row === 0 ? 9.4 : COLS;
      if (t.verge === 'hecto') {
        for (let x = 0.8; x < maxX; x += 3) {
          ctx.fillStyle = '#2f6b3a';
          ctx.fillRect(x, y - 0.08, 0.14, 0.16);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 0.03, y - 0.05, 0.08, 0.05);
        }
      } else if (t.verge === 'lamps') {
        const toward = y > row + 0.5 ? 1 : -1;
        for (let x = 1.2; x < maxX; x += 3.5) {
          // Paal met een arm naar de weg en een lamp
          ctx.fillStyle = '#4b5563';
          ctx.fillRect(x - 0.05, y - 0.05, 0.1, 0.1);
          ctx.fillRect(x - 0.015, Math.min(y, y + toward * 0.38), 0.03, 0.38);
          ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
          ctx.beginPath();
          ctx.arc(x, y + toward * 0.38, 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 5. Typisch voor het land, op de overkant (links van het plaatsbord)
    this.drawDecor2d(ctx, t, rnd);

    // 6. Circuit: geblokte start/finishlijn dwars over de baan
    if (t.edge === 'curbs') {
      kinds.forEach((k, row) => {
        if (k === 'road') paintCheckered(ctx, 6.3, row, 0.4, 1, 2, 5);
      });
    }
  }

  /** Klein fietssymbool (fietspad), in vakjes; lijnstijl moet al gezet zijn. */
  bikeSymbol(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x - 0.14, y + 0.05, 0.09, 0, Math.PI * 2);
    ctx.moveTo(x + 0.23, y + 0.05);
    ctx.arc(x + 0.14, y + 0.05, 0.09, 0, Math.PI * 2);
    ctx.moveTo(x - 0.14, y + 0.05);
    ctx.lineTo(x - 0.02, y - 0.08);
    ctx.lineTo(x + 0.1, y - 0.08);
    ctx.lineTo(x + 0.14, y + 0.05);
    ctx.moveTo(x - 0.02, y - 0.08);
    ctx.lineTo(x + 0.02, y + 0.05);
    ctx.lineTo(x + 0.14, y + 0.05);
    ctx.stroke();
  }

  /** Landschap per land op de overkant (rij 0), tussen x = 1.3 en 9.3. */
  drawDecor2d(ctx, t, rnd) {
    const y0 = ROW_FINISH;
    switch (t.decor) {
      case 'tulips': {
        // Tulpenveld: rijen rood, geel, roze, oranje
        const colors = ['#e63946', '#ffd60a', '#ff70a6', '#f77f00', '#ffffff'];
        for (let i = 0; i < 11; i++) {
          const x = 1.6 + i * 0.6;
          ctx.fillStyle = '#4a8a3a';
          ctx.fillRect(x, y0 + 0.12, 0.42, 0.76);
          ctx.fillStyle = colors[i % colors.length];
          for (let k = 0; k < 6; k++) {
            ctx.beginPath();
            ctx.arc(x + 0.1 + (k % 2) * 0.22, y0 + 0.2 + k * 0.12, 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'frituur': {
        // Frituur-kraampje
        const x = 2;
        ctx.fillStyle = C.shadow;
        ctx.fillRect(x + 0.08, y0 + 0.2, 2.2, 0.72);
        ctx.fillStyle = '#fff6d5';
        ctx.fillRect(x, y0 + 0.12, 2.2, 0.72);
        ctx.fillStyle = '#d62828';
        for (let i = 0; i < 6; i++) if (i % 2 === 0) ctx.fillRect(x + (i * 2.2) / 6, y0 + 0.12, 2.2 / 6, 0.18);
        ctx.fillStyle = '#ffd60a';
        ctx.fillRect(x + 0.05, y0 + 0.62, 2.1, 0.2);
        // Tekst in pixels (dit is het achtergrondcanvas, niet this.ctx)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = `900 ${Math.max(6, Math.round(0.24 * this.scale))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#d62828';
        ctx.fillText('FRITUUR', (x + 1.1) * this.scale, (y0 + 0.47) * this.scale);
        ctx.restore();
        // Puntzak friet
        ctx.fillStyle = '#d62828';
        ctx.beginPath();
        ctx.moveTo(x + 2.5, y0 + 0.86);
        ctx.lineTo(x + 2.3, y0 + 0.38);
        ctx.lineTo(x + 2.7, y0 + 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd60a';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 2.33 + i * 0.09, y0 + 0.16 + (i % 2) * 0.06, 0.06, 0.24);
        break;
      }
      case 'polder': {
        // Sloot en koeien
        ctx.fillStyle = '#3b6ea5';
        ctx.fillRect(0, y0, COLS, 0.14);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(0, y0 + 0.03, COLS, 0.02);
        for (const x of [2.2, 3.6, 5.8]) this.cow2d(ctx, x, y0 + 0.55);
        break;
      }
      case 'lavender': {
        // Lavendelvelden
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 ? '#9b7fd1' : '#7e5bbf';
          for (let x = 1.4; x < 9.2; x += 0.32) {
            ctx.beginPath();
            ctx.arc(x + (i % 2) * 0.16, y0 + 0.16 + i * 0.16, 0.08, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'chalet': {
        // Chalet met sneeuw op het dak, dennen en een koe
        const x = 2.2;
        ctx.fillStyle = '#7a4a26';
        ctx.fillRect(x, y0 + 0.32, 1.4, 0.58);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - 0.15, y0 + 0.36);
        ctx.lineTo(x + 0.7, y0 + 0.04);
        ctx.lineTo(x + 1.55, y0 + 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f5e6c8';
        ctx.fillRect(x + 0.2, y0 + 0.5, 0.25, 0.2);
        ctx.fillRect(x + 0.95, y0 + 0.5, 0.25, 0.2);
        ctx.fillStyle = '#d62828';
        ctx.fillRect(x + 0.55, y0 + 0.58, 0.3, 0.32);
        for (const fx of [4.4, 5.1, 7.6, 8.3]) this.fir2d(ctx, fx, y0 + 0.9);
        this.cow2d(ctx, 6.3, y0 + 0.6);
        break;
      }
      case 'afsluitdijk': {
        // Waddenzee achter de dijk, met basaltblokken op het talud
        ctx.fillStyle = '#5b7f95';
        ctx.fillRect(0, y0, COLS, 0.26);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 0.025;
        for (let x = 0.3; x < COLS; x += 0.9) {
          ctx.beginPath();
          ctx.arc(x, y0 + 0.13 + ((x * 7) % 3) * 0.03, 0.08, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        ctx.fillStyle = '#3d4045';
        ctx.fillRect(0, y0 + 0.26, COLS, 0.1);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let x = 0; x < COLS; x += 0.22) ctx.fillRect(x, y0 + 0.26, 0.02, 0.1);
        // Zeilbootje
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(6.0, y0 + 0.16, 0.4, 0.07);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(6.2, y0 + 0.16);
        ctx.lineTo(6.2, y0 - 0.02);
        ctx.lineTo(6.42, y0 + 0.16);
        ctx.closePath();
        ctx.fill();
        // Monument op de dijk (van boven: ronde stenen toren)
        ctx.fillStyle = C.shadow;
        ctx.beginPath();
        ctx.arc(2.5, y0 + 0.66, 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d8d2c4';
        ctx.beginPath();
        ctx.arc(2.45, y0 + 0.6, 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#9c9484';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(2.45, y0 + 0.6, 0.15, 0, Math.PI * 2);
        ctx.stroke();
        // IJsselmeer onder de startberm
        const ys = this.rows - 1;
        ctx.fillStyle = '#4f7fa0';
        ctx.fillRect(0, ys + 0.78, COLS, 0.22);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        for (let x = 0.7; x < COLS; x += 1.1) {
          ctx.beginPath();
          ctx.arc(x, ys + 0.9, 0.07, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        break;
      }
      case 'grandstand': {
        // Circuit: tribune vol publiek
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(1.2, y0 + 0.05, 7.6, 0.82);
        for (let r = 0; r < 4; r++) {
          for (let x = 1.35; x < 8.7; x += 0.22) {
            ctx.fillStyle = ['#e63946', '#ffd60a', '#1d4ed8', '#ffffff', '#f77f00', '#2a9d8f'][Math.floor(rnd() * 6)];
            ctx.beginPath();
            ctx.arc(x, y0 + 0.17 + r * 0.19, 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'noisewall': {
        // Geluidsscherm langs de snelweg
        ctx.fillStyle = '#7f8f7a';
        ctx.fillRect(0, y0, COLS, 0.22);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let x = 0; x < COLS; x += 1.2) ctx.fillRect(x, y0, 0.04, 0.22);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(0, y0 + 0.02, COLS, 0.03);
        break;
      }
      case 'turbines': {
        // Windmolens
        for (const x of [2.4, 4.6, 6.8]) {
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(x - 0.03, y0 + 0.35, 0.06, 0.58);
          ctx.save();
          ctx.translate(x, y0 + 0.35);
          for (let k = 0; k < 3; k++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.fillRect(-0.025, -0.3, 0.05, 0.3);
          }
          ctx.restore();
        }
        break;
      }
      default:
        break;
    }
  }

  /** Koe van bovenaf (wit met zwarte vlekken). */
  cow2d(ctx, x, y) {
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x - 0.24, y - 0.1, 0.56, 0.3);
    ctx.fillStyle = '#f5f5f5';
    roundRect(ctx, x - 0.3, y - 0.15, 0.56, 0.3, 0.1);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(x - 0.18, y - 0.15, 0.16, 0.14);
    ctx.fillRect(x + 0.05, y, 0.12, 0.12);
    ctx.fillRect(x + 0.26, y - 0.08, 0.12, 0.16); // kop
  }

  /** Den (driehoek) met de voet op (x, y). */
  fir2d(ctx, x, y) {
    ctx.fillStyle = '#1f5130';
    ctx.beginPath();
    ctx.moveTo(x - 0.25, y);
    ctx.lineTo(x, y - 0.75);
    ctx.lineTo(x + 0.25, y);
    ctx.closePath();
    ctx.fill();
  }

  // --- Per frame -------------------------------------------------------------

  draw(game, dt = 1 / 60) {
    const ctx = this.ctx;
    this.time = (this.time || 0) + dt;
    this.syncBackground(game);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (game.blind) {
      // Noncha mode: volledig zwart, geen auto's, strepen of speler.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.particles.length = 0;
      this.tap = null;
      return;
    }
    // Kort schudden direct na een aanrijding
    let sx = 0;
    let sy = 0;
    if (game.state === 'hit' && !game.paused && !this.reducedMotion) {
      const k = this.hitProgress(game) * (game.hitDuration || 1);
      if (k < 0.28) {
        const amp = 0.09 * (1 - k / 0.28) * this.scale;
        sx = (Math.random() - 0.5) * 2 * amp;
        sy = (Math.random() - 0.5) * 2 * amp;
        ctx.fillStyle = '#1b1f24';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
    this.shake = [sx, sy];
    ctx.drawImage(this.bg, sx, sy);
    ctx.setTransform(this.scale, 0, 0, this.scale, sx, sy);

    this.drawSigns(game);
    this.drawWorks(game);
    if (game.state !== 'ready' && game.state !== 'gameover') this.drawItems(game);
    for (const lane of game.traffic.lanes) {
      for (const v of lane.vehicles) this.drawVehicle(v, lane);
    }
    this.drawWrecks(game);
    if (game.mode === 'noncha' && game.state === 'hit' && game.hitBy) this.drawReveal(game);
    if (game.state !== 'ready' && game.state !== 'gameover') this.drawPlayers(game);
    this.drawParticles(game.paused ? 0 : dt);
    this.drawTapMarker(dt);
    this.drawWeather(game, game.paused ? 0 : dt);

    // Noncha "even kijken": in- en uitfaden naar zwart
    const dark = game.darkness;
    if (dark > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, dark)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Tik-om-te-lopen: kort kringetje op de plek van de tik (in vakjes). */
  markTap(x, y) {
    this.tap = { x, y, t: 0 };
  }

  drawTapMarker(dt) {
    if (!this.tap) return;
    this.tap.t += dt;
    const k = this.tap.t / 0.35;
    if (k >= 1) {
      this.tap = null;
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 212, 0, ${0.9 * (1 - k)})`;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(this.tap.x, this.tap.y, 0.15 + 0.3 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Noncha: na een aanrijding het voertuig markeren dat je raakte. */
  drawReveal(game) {
    const ctx = this.ctx;
    const v = game.hitBy;
    const lane = game.traffic.lanes.find((l) => l.vehicles.includes(v));
    if (!lane) return;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 10);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 60, 60, ${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 0.08;
    roundRect(ctx, v.x - 0.1, lane.row + 0.04, v.length + 0.2, 0.92, 0.15);
    ctx.stroke();
    ctx.restore();
  }

  /** Tekst in pixels tekenen; lettergrootte in vakjes. */
  text(str, x, y, size, color, weight = 700) {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${weight} ${Math.max(1, Math.round(size * s))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x * s, y * s);
    ctx.restore();
  }

  drawSigns(game) {
    const ctx = this.ctx;
    // Matrixbord op de middenberm met de "maximumsnelheid" van dit level.
    const t = game.theme;
    const s = this.scale;
    const [ox, oy] = this.shake || [0, 0];
    const mx = 0.15;
    const my = game.layout.median + 0.08;
    if (t.speedSign === 'checkered') {
      // Circuit: geblokt bord in plaats van een snelheid
      fillRound(ctx, mx, my, 0.84, 0.84, 0.08, '#111');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      paintCheckered(ctx, (mx + 0.1) * s, (my + 0.16) * s, 0.64 * s, 0.52 * s, 5, 4);
      ctx.restore();
    } else if (t.speedSign === 'round') {
      // Gewoon verkeersbord
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      paintRoundSign(ctx, (mx + 0.42) * s, (my + 0.42) * s, 0.38 * s, game.params.speedLimit);
      ctx.restore();
    } else {
      fillRound(ctx, mx, my, 0.84, 0.84, 0.08, '#111');
      if (t.speedSign === 'unlimited') {
        // Autobahn: geen limiet (Duits bord "einde snelheidsbeperking")
        paintUnlimited(ctx, mx + 0.42, my + 0.42, 0.29, 0.045);
      } else {
        // Matrixbord boven de snelweg
        ctx.strokeStyle = '#e0262b';
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.arc(mx + 0.42, my + 0.42, 0.31, 0, Math.PI * 2);
        ctx.stroke();
        const limit = String(game.params.speedLimit);
        this.text(limit, mx + 0.42, my + 0.44, limit.length > 2 ? 0.22 : 0.28, '#f5f5f5');
      }
    }

    // Plaatsbord aan de overkant (stijl per land/wegtype, elk level een andere plaats).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    paintPlaceSign(ctx, (COLS - 2.6) * s, (ROW_FINISH + 0.14) * s, 2.4 * s, 0.72 * s, t.placeSign, game.place);
    // Vlaggetje van het land ernaast
    ctx.fillStyle = '#5b6068';
    ctx.fillRect((COLS - 3.32) * s, (ROW_FINISH + 0.1) * s, 0.05 * s, 0.8 * s);
    paintFlag(ctx, (COLS - 3.27) * s, (ROW_FINISH + 0.12) * s, 0.54 * s, 0.36 * s, t.flag);
    ctx.restore();
  }

  /**
   * @param {object} [wreck] wrak na een aanrijding: { x, y, rot, phase, t } (eigen plek en draaiing)
   */
  drawVehicle(v, lane, wreck = null) {
    const ctx = this.ctx;
    const L = v.length;
    ctx.save();
    if (wreck) {
      ctx.translate(wreck.x, wreck.y);
      ctx.rotate(wreck.rot);
      if (wreck.phase === 'fade') ctx.globalAlpha = Math.max(0, 1 - wreck.t / 0.6);
    } else {
      ctx.translate(v.x + L / 2, lane.row + 0.5);
    }
    if (lane.dir < 0) ctx.scale(-1, 1); // tekenen alsof hij naar rechts rijdt
    switch (v.type) {
      case 'f1':
        this.drawF1(v, L);
        break;
      case 'werkwagen':
        this.drawCar(v, L, 0.72, true);
        this.drawChevrons(L, 0.72);
        this.drawLightBar(v, L / 2 - 0.7, 0.5, true);
        break;
      case 'pijlwagen':
        this.drawArrowTruck(v, L);
        break;
      case 'blade':
        this.drawBlade(v, L);
        break;
      case 'begeleider':
        this.drawCar(v, L, 0.62, false);
        this.drawLightBar(v, -0.1, 0.44, true);
        break;
      case 'dsi':
        // Zwarte auto met blauwe lichten in de grille
        this.drawCar(v, L, 0.64, false);
        this.drawGrilleLights(v, L);
        break;
      case 'policemotor':
        this.drawMotor(v, L);
        this.drawGrilleLights(v, L * 0.6);
        break;
      case 'truck':
        this.drawTruck(v, L);
        break;
      case 'van':
        this.drawCar(v, L, 0.72, true);
        break;
      case 'motor':
        this.drawMotor(v, L);
        break;
      case 'sport':
        this.drawSport(v, L);
        break;
      case 'tractor':
        this.drawTractor(v, L);
        break;
      case 'bike':
      case 'bakfiets':
        this.drawBike(v, L, v.type === 'bakfiets');
        break;
      case 'scooter':
        this.drawScooter(v, L);
        break;
      case 'fire':
        this.drawFire(v, L);
        break;
      case 'ambulance':
        this.drawCar(v, L, 0.72, true);
        this.drawChecks(L, 0.72, '#1f4fa0');
        this.drawLightBar(v, L / 2 - 0.75, 0.5);
        break;
      case 'police':
        this.drawCar(v, L, 0.62, false);
        this.drawPoliceStripes(L, 0.62);
        this.drawLightBar(v, -0.1, 0.44);
        break;
      default:
        this.drawCar(v, L, 0.62, false);
    }
    if (wreck && Math.floor((this.time || 0) * 3) % 2 === 0) {
      // Alarmlichten knipperen (oranje op de hoeken)
      ctx.fillStyle = '#ffb020';
      for (const [x, y] of [
        [L / 2 - 0.08, -0.26],
        [L / 2 - 0.08, 0.2],
        [-L / 2, -0.26],
        [-L / 2, 0.2],
      ]) {
        ctx.fillRect(x, y, 0.08, 0.06);
      }
    }
    ctx.restore();
  }

  /** Wegwerkzaamheden: gele strepen en pionnen langs de afgezette rijstrook. */
  drawWorks(game) {
    const ctx = this.ctx;
    for (const lane of game.traffic.lanes) {
      if (lane.kind !== 'work') continue;
      const y = lane.row;
      ctx.fillStyle = 'rgba(255, 194, 14, 0.18)';
      ctx.fillRect(0, y, COLS, 1);
      ctx.fillStyle = '#ffc20e';
      for (let x = 0.1; x < COLS; x += 0.7) {
        ctx.fillRect(x, y + 0.04, 0.4, 0.05);
        ctx.fillRect(x, y + 0.91, 0.4, 0.05);
      }
      for (let x = 0.5; x < COLS; x += 1) {
        for (const cy of [y + 0.14, y + 0.86]) {
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(x, cy, 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.03;
          ctx.beginPath();
          ctx.arc(x, cy, 0.06, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  /** Spulletjes om te verzamelen (wippen een beetje). */
  drawItems(game) {
    if (!game.items || !game.items.length) return;
    const ctx = this.ctx;
    const s = this.scale;
    const [ox, oy] = this.shake || [0, 0];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    for (const it of game.items) {
      const bob = Math.sin((this.time || 0) * 3 + it.t) * 0.04;
      paintItem(ctx, it.type, (it.col + 0.5) * s, (it.row + 0.5 + bob) * s, 0.62 * s);
    }
    ctx.restore();
  }

  /**
   * Weer: regen (strepen en donkerder), mist (je ziet alleen vlak om je heen) of nacht
   * (donker, met koplampen en een lichtkring om je poppetje).
   */
  drawWeather(game, dt) {
    const w = game.params.weather;
    if (!w || w === 'clear') return;
    const ctx = this.ctx;
    const s = this.scale;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const rows = this.rows;
    if (w === 'rain') {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(30, 45, 70, 0.22)';
      ctx.fillRect(0, 0, W, H);
      if (!this.drops) this.drops = Array.from({ length: 150 }, () => ({ x: Math.random() * (COLS + 2), y: Math.random() * ROWS }));
      ctx.strokeStyle = 'rgba(210, 225, 255, 0.55)';
      ctx.lineWidth = Math.max(1, 0.025 * s);
      ctx.beginPath();
      for (const d of this.drops) {
        d.y += 10 * dt;
        d.x -= 2 * dt;
        if (d.y > rows) {
          d.y -= rows;
          d.x = Math.random() * (COLS + 2);
        }
        if (d.x < -1) d.x += COLS + 2;
        ctx.moveTo(d.x * s, d.y * s);
        ctx.lineTo((d.x + 0.07) * s, (d.y - 0.35) * s);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    // Mist en nacht: een "lichtkaart" over het veld, met gaten waar je wél iets ziet
    if (!this.fx) this.fx = document.createElement('canvas');
    if (this.fx.width !== W || this.fx.height !== H) {
      this.fx.width = W;
      this.fx.height = H;
    }
    const f = this.fx.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, W, H);
    f.fillStyle = w === 'fog' ? 'rgba(222, 228, 234, 0.84)' : 'rgba(4, 8, 22, 0.86)';
    f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r0, r1, a = 1) => {
      const g = f.createRadialGradient(x * s, y * s, r0 * s, x * s, y * s, r1 * s);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = g;
      f.beginPath();
      f.arc(x * s, y * s, r1 * s, 0, Math.PI * 2);
      f.fill();
    };
    if (game.state !== 'ready' && game.state !== 'gameover') {
      for (const p of game.players) hole(p.col + 0.5, p.row + 0.5, w === 'fog' ? 1.6 : 0.9, w === 'fog' ? 4.0 : 2.4);
    }
    if (w === 'night') {
      // Koplampen schijnen vooruit, en het voertuig zelf is vaag te zien
      for (const lane of game.traffic.lanes) {
        for (const v of lane.vehicles) {
          if (v.x + v.length < -2 || v.x > COLS + 2) continue;
          const front = lane.dir > 0 ? v.x + v.length : v.x;
          hole(front + lane.dir * 0.9, lane.row + 0.5, 0.1, 1.2, 0.9);
          hole(v.x + v.length / 2, lane.row + 0.5, 0, Math.max(0.6, v.length / 2), 0.55);
        }
      }
      hole(0.57, game.layout.median + 0.5, 0, 0.7, 0.8); // verlicht bord
    }
    f.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fx, 0, 0);
    ctx.restore();
  }

  /** Raceauto van boven: smalle neus, voor- en achtervleugel, brede banden, helm. */
  drawF1(v, L) {
    const ctx = this.ctx;
    const x0 = -L / 2;
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x0 + 0.06, -0.3, L, 0.64);
    ctx.fillStyle = '#16181b';
    for (const [x, w] of [
      [L / 2 - 0.5, 0.26],
      [x0 + 0.12, 0.32],
    ]) {
      ctx.fillRect(x, -0.38, w, 0.16);
      ctx.fillRect(x, 0.22, w, 0.16);
    }
    fillRound(ctx, x0 + 0.2, -0.16, L - 0.45, 0.32, 0.12, v.color); // romp
    fillRound(ctx, L / 2 - 0.5, -0.07, 0.5, 0.14, 0.06, v.color); // neus
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(L / 2 - 0.12, -0.34, 0.1, 0.68); // voorvleugel
    ctx.fillRect(x0, -0.3, 0.14, 0.6); // achtervleugel
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(-0.02, 0, 0.09, 0, Math.PI * 2); // helm
    ctx.fill();
  }

  /** Rood-witte schuine strepen achterop (werkwagen). */
  drawChevrons(L, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-L / 2, -h / 2, 0.35, h);
    ctx.clip();
    for (let i = -4; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#d62828';
      ctx.beginPath();
      ctx.moveTo(-L / 2, -h / 2 + i * 0.16);
      ctx.lineTo(-L / 2 + 0.35, -h / 2 + i * 0.16 + 0.2);
      ctx.lineTo(-L / 2 + 0.35, -h / 2 + i * 0.16 + 0.36);
      ctx.lineTo(-L / 2, -h / 2 + i * 0.16 + 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Pijlwagen: geel, met een groot zwart bord met een knipperende pijl. */
  drawArrowTruck(v, L) {
    const ctx = this.ctx;
    this.drawCar(v, L, 0.72, true);
    fillRound(ctx, -L / 2 + 0.05, -0.34, 0.9, 0.68, 0.06, '#111111');
    if (Math.floor((this.time || 0) * 2.5) % 2 === 0) {
      // Pijl schuin naar de vrije rijstrook
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(-L / 2 + 0.2, 0.2);
      ctx.lineTo(-L / 2 + 0.75, -0.2);
      ctx.moveTo(-L / 2 + 0.5, -0.22);
      ctx.lineTo(-L / 2 + 0.75, -0.2);
      ctx.lineTo(-L / 2 + 0.72, 0.04);
      ctx.stroke();
    }
  }

  /** Exceptioneel transport: cabine met een heel lange witte windmolenwiek. */
  drawBlade(v, L) {
    const ctx = this.ctx;
    const x0 = -L / 2;
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x0 + 0.1, -0.3, L, 0.66);
    ctx.fillStyle = '#3b3f46';
    ctx.fillRect(x0 + 0.3, -0.2, L - 1.2, 0.4); // lange dieplader
    fillRound(ctx, L / 2 - 0.9, -0.36, 0.9, 0.72, 0.1, '#1d4ed8'); // cabine
    fillRound(ctx, L / 2 - 0.3, -0.26, 0.18, 0.52, 0.05, C.glass);
    // De wiek: breed bij de voet, smal bij de punt
    ctx.fillStyle = '#f1f3f5';
    ctx.strokeStyle = '#c6cbd2';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(L / 2 - 1.0, -0.3);
    ctx.lineTo(L / 2 - 1.0, 0.3);
    ctx.quadraticCurveTo(x0 + 4, 0.34, x0, 0.06);
    ctx.lineTo(x0, -0.02);
    ctx.quadraticCurveTo(x0 + 4, -0.2, L / 2 - 1.0, -0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d62828';
    ctx.fillRect(x0, -0.04, 0.25, 0.12); // rode vlag aan de punt
  }

  /** Wrakken na een aanrijding (gedraaid, met alarmlichten). */
  drawWrecks(game) {
    for (const w of game.traffic.wrecks) this.drawVehicle(w.v, { dir: w.dir }, w);
  }

  /** Blauwe flitslichten voorin (DSI, politiemotor). */
  drawGrilleLights(v, L) {
    const ctx = this.ctx;
    const phase = Math.floor((this.time || 0) * 9 + v.x * 0.5) % 2;
    for (const [side, on] of [
      [-1, phase === 0],
      [1, phase === 1],
    ]) {
      const x = L / 2 - 0.06;
      const y = side * 0.16;
      if (on) {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.5)';
        ctx.beginPath();
        ctx.arc(x, y, 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = on ? '#dbeafe' : '#1e3a8a';
      ctx.fillRect(x - 0.04, y - 0.05, 0.08, 0.1);
    }
  }

  /** Sportwagen (Autobahn): laag, breed, met strepen en een spoiler. */
  drawSport(v, L) {
    const ctx = this.ctx;
    const h = 0.6;
    const x0 = -L / 2;
    const y0 = -h / 2;
    fillRound(ctx, x0 + 0.05, y0 + 0.07, L, h, 0.22, C.shadow);
    fillRound(ctx, x0, y0, L, h, 0.22, v.color);
    const light = v.color === '#e5e7eb' || v.color === '#facc15' || v.color === '#84cc16';
    ctx.fillStyle = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.8)';
    ctx.fillRect(x0 + 0.08, -0.08, L - 0.16, 0.05);
    ctx.fillRect(x0 + 0.08, 0.03, L - 0.16, 0.05);
    fillRound(ctx, -0.05, y0 + 0.1, 0.32, h - 0.2, 0.08, C.glass); // lage voorruit
    fillRound(ctx, x0 + 0.38, y0 + 0.1, 0.34, h - 0.2, 0.06, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(x0 + 0.02, y0 + 0.04, 0.09, h - 0.08); // spoiler
    ctx.fillStyle = C.headlight;
    ctx.fillRect(L / 2 - 0.06, y0 + 0.06, 0.06, 0.1);
    ctx.fillRect(L / 2 - 0.06, -y0 - 0.16, 0.06, 0.1);
    ctx.fillStyle = C.taillight;
    ctx.fillRect(x0, y0 + 0.08, 0.04, 0.1);
    ctx.fillRect(x0, -y0 - 0.18, 0.04, 0.1);
  }

  /** Trekker: motorkap voor, cabine achter, grote achterwielen. */
  drawTractor(v, L) {
    const ctx = this.ctx;
    const x0 = -L / 2;
    fillRound(ctx, x0 + 0.06, -0.3, L, 0.66, 0.1, C.shadow);
    ctx.fillStyle = '#16181b';
    ctx.fillRect(x0 + 0.05, -0.38, 0.55, 0.16); // grote achterwielen
    ctx.fillRect(x0 + 0.05, 0.22, 0.55, 0.16);
    ctx.fillRect(L / 2 - 0.42, -0.3, 0.3, 0.1); // kleine voorwielen
    ctx.fillRect(L / 2 - 0.42, 0.2, 0.3, 0.1);
    fillRound(ctx, x0 + 0.62, -0.17, L - 0.66, 0.34, 0.06, v.color); // motorkap
    fillRound(ctx, x0, -0.24, 0.66, 0.48, 0.06, v.color); // cabine
    fillRound(ctx, x0 + 0.08, -0.18, 0.5, 0.36, 0.04, 'rgba(20,20,20,0.55)'); // dak/ruit
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(x0 + 0.85, -0.1, 0.07, 0.07); // uitlaat
  }

  /** Fiets (en bakfiets) van bovenaf, met fietser. */
  drawBike(v, L, bakfiets) {
    const ctx = this.ctx;
    const x0 = -L / 2;
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x0 + 0.04, -0.06, L, 0.16);
    if (bakfiets) {
      // Houten bak voorop, met een kind erin
      fillRound(ctx, L / 2 - 0.42, -0.2, 0.4, 0.4, 0.05, '#8b5a2b');
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(L / 2 - 0.2, 0, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(x0, -0.025, L - (bakfiets ? 0.4 : 0), 0.05); // frame en wielen
    ctx.fillRect(x0 + (bakfiets ? 0.32 : L - 0.2), -0.16, 0.04, 0.32); // stuur
    // Fietser: schouders en hoofd
    fillRound(ctx, x0 + 0.08, -0.17, 0.24, 0.34, 0.1, v.color);
    ctx.fillStyle = '#4a2c17';
    ctx.beginPath();
    ctx.arc(x0 + 0.22, 0, 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Snorfiets (scooter) met helm. */
  drawScooter(v, L) {
    const ctx = this.ctx;
    fillRound(ctx, -L / 2 + 0.04, -0.08, L, 0.2, 0.08, C.shadow);
    fillRound(ctx, -L / 2, -0.11, L, 0.22, 0.09, v.color);
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(L / 2 - 0.12, -0.16, 0.04, 0.32);
    fillRound(ctx, -0.18, -0.15, 0.24, 0.3, 0.1, '#30343b');
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(-0.04, 0, 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Brandweerauto: rood, met ladder op het dak en zwaailichten. */
  drawFire(v, L) {
    const ctx = this.ctx;
    const h = 0.8;
    const x0 = -L / 2;
    const y0 = -h / 2;
    fillRound(ctx, x0 + 0.06, y0 + 0.08, L, h, 0.1, C.shadow);
    fillRound(ctx, x0, y0, L, h, 0.1, v.color);
    // Ladder
    ctx.fillStyle = '#d4d8de';
    ctx.fillRect(x0 + 0.1, -0.17, L - 0.95, 0.05);
    ctx.fillRect(x0 + 0.1, 0.12, L - 0.95, 0.05);
    for (let x = x0 + 0.15; x < L / 2 - 0.85; x += 0.18) ctx.fillRect(x, -0.17, 0.03, 0.34);
    // Witte streep en cabine
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x0, y0 + 0.02, L, 0.05);
    ctx.fillRect(x0, -y0 - 0.07, L, 0.05);
    fillRound(ctx, L / 2 - 0.3, y0 + 0.1, 0.18, h - 0.2, 0.05, C.glass);
    ctx.fillStyle = C.headlight;
    ctx.fillRect(L / 2 - 0.05, y0 + 0.08, 0.05, 0.12);
    ctx.fillRect(L / 2 - 0.05, -y0 - 0.2, 0.05, 0.12);
    this.drawLightBar(v, L / 2 - 0.55, 0.6);
  }

  /** Ambulance: blokjespatroon langs de randen. */
  drawChecks(L, h, color) {
    const ctx = this.ctx;
    const y0 = -h / 2;
    ctx.fillStyle = color;
    for (let i = 0, x = -L / 2 + 0.08; x < L / 2 - 0.5; x += 0.16, i++) {
      if (i % 2) continue;
      ctx.fillRect(x, y0 + 0.01, 0.16, 0.07);
      ctx.fillRect(x, -y0 - 0.08, 0.16, 0.07);
    }
  }

  /** Politie: blauwe en oranje strepen schuin over de motorkap. */
  drawPoliceStripes(L, h) {
    const ctx = this.ctx;
    const y0 = -h / 2;
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-L / 2 + 0.05, y0 + 0.02, L - 0.1, 0.06);
    ctx.fillRect(-L / 2 + 0.05, -y0 - 0.08, L - 0.1, 0.06);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-L / 2 + 0.05, y0 + 0.08, L - 0.1, 0.03);
    ctx.fillRect(-L / 2 + 0.05, -y0 - 0.11, L - 0.1, 0.03);
  }

  /** Zwaailichten op het dak, om en om knipperend: blauw (hulpdiensten) of oranje (werk/transport). */
  drawLightBar(v, x, w, amber = false) {
    const ctx = this.ctx;
    const phase = Math.floor((this.time || 0) * 7 + v.x * 0.37) % 2;
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(x - 0.07, -w / 2, 0.14, w);
    for (const [side, on] of [
      [-1, phase === 0],
      [1, phase === 1],
    ]) {
      const y = (side * w) / 4;
      if (on) {
        ctx.fillStyle = amber ? 'rgba(255, 170, 30, 0.45)' : 'rgba(96, 165, 250, 0.45)';
        ctx.beginPath();
        ctx.arc(x, y, 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      if (amber) ctx.fillStyle = on ? '#ffe08a' : '#9a5b00';
      else ctx.fillStyle = on ? '#bfdbfe' : '#1e3a8a';
      ctx.fillRect(x - 0.06, y - w / 4 + 0.02, 0.12, w / 2 - 0.04);
    }
  }

  drawCar(v, L, h, isVan) {
    const ctx = this.ctx;
    const x0 = -L / 2;
    const y0 = -h / 2;
    fillRound(ctx, x0 + 0.05, y0 + 0.07, L, h, 0.15, C.shadow);
    fillRound(ctx, x0, y0, L, h, 0.15, v.color);
    // Voorruit, dak en achterruit.
    const wsX = isVan ? L / 2 - 0.42 : L / 2 - 0.55;
    fillRound(ctx, wsX, y0 + 0.08, 0.2, h - 0.16, 0.05, C.glass);
    if (isVan) {
      fillRound(ctx, x0 + 0.1, y0 + 0.08, wsX - x0 - 0.16, h - 0.16, 0.06, 'rgba(255,255,255,0.18)');
    } else {
      fillRound(ctx, x0 + 0.38, y0 + 0.09, wsX - x0 - 0.42, h - 0.18, 0.06, 'rgba(0,0,0,0.16)');
      fillRound(ctx, x0 + 0.16, y0 + 0.1, 0.14, h - 0.2, 0.04, C.glassRear);
    }
    ctx.fillStyle = C.headlight;
    ctx.fillRect(L / 2 - 0.06, y0 + 0.06, 0.06, 0.12);
    ctx.fillRect(L / 2 - 0.06, -y0 - 0.18, 0.06, 0.12);
    ctx.fillStyle = C.taillight;
    ctx.fillRect(x0, y0 + 0.06, 0.05, 0.11);
    ctx.fillRect(x0, -y0 - 0.17, 0.05, 0.11);
  }

  drawTruck(v, L) {
    const ctx = this.ctx;
    const h = 0.8;
    const x0 = -L / 2;
    const y0 = -h / 2;
    const cab = 0.8;
    fillRound(ctx, x0 + 0.06, y0 + 0.08, L, h, 0.08, C.shadow);
    // Oplegger
    fillRound(ctx, x0, y0, L - cab - 0.06, h, 0.06, '#e6e8eb');
    ctx.fillStyle = v.color;
    ctx.fillRect(x0 + 0.1, -0.05, L - cab - 0.26, 0.1);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = x0 + 0.5; x < L / 2 - cab - 0.2; x += 0.5) ctx.fillRect(x, y0 + 0.04, 0.03, h - 0.08);
    // Cabine
    fillRound(ctx, L / 2 - cab, y0 + 0.04, cab, h - 0.08, 0.12, v.color);
    fillRound(ctx, L / 2 - 0.3, y0 + 0.1, 0.18, h - 0.2, 0.05, C.glass);
    ctx.fillStyle = C.headlight;
    ctx.fillRect(L / 2 - 0.05, y0 + 0.08, 0.05, 0.12);
    ctx.fillRect(L / 2 - 0.05, -y0 - 0.2, 0.05, 0.12);
    ctx.fillStyle = C.taillight;
    ctx.fillRect(x0, y0 + 0.05, 0.05, 0.1);
    ctx.fillRect(x0, -y0 - 0.15, 0.05, 0.1);
  }

  drawMotor(v, L) {
    const ctx = this.ctx;
    fillRound(ctx, -L / 2 + 0.04, -0.09, L, 0.22, 0.1, C.shadow);
    fillRound(ctx, -L / 2, -0.11, L, 0.22, 0.1, '#2a2d33');
    ctx.fillStyle = C.headlight;
    ctx.fillRect(L / 2 - 0.05, -0.04, 0.05, 0.08);
    // Berijder met helm
    fillRound(ctx, -0.22, -0.2, 0.3, 0.4, 0.12, '#30343b');
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.arc(-0.02, 0, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0.04, -0.07, 0.06, 0.14);
  }

  /** Aanrijding van deze speler: { k: 0..1, style, dir } of null. */
  hitInfo(game, p) {
    if (game.mode === 'duel') {
      if (!(p.hitTimer > 0)) return null;
      return { k: Math.min(1, Math.max(0, 1 - p.hitTimer / p.hitDuration)), style: p.hitStyle, dir: p.hitDir };
    }
    if (game.state !== 'hit') return null;
    return { k: this.hitProgress(game), style: game.hitStyle, dir: game.hitDir };
  }

  drawPlayers(game) {
    game.players.forEach((p, i) => this.drawPlayer(game, p, game.mode === 'duel' ? i : -1));
  }

  /** @param {number} badge -1 = geen; 0/1 = bolletje "1"/"2" boven het hoofd (samen spelen) */
  drawPlayer(game, p, badge = -1) {
    const ctx = this.ctx;
    const look = p.look;
    const t = easeOut(p.moveT);
    let x = lerp(p.fromCol, p.col, t) + 0.5;
    let y = lerp(p.fromRow, p.row, t) + 0.5;
    const hop = Math.sin(p.moveT * Math.PI) * 0.12;
    const hit = this.hitInfo(game, p);

    // Knipperen na het (her)verschijnen
    if (!hit && p.flash > 0 && Math.floor(p.flash * 12) % 2 === 1) return;

    ctx.save();
    ctx.translate(x, y);
    if (hit) {
      const k = hit.k;
      if (hit.style === 'spin' && !this.reducedMotion) {
        // Wegtollen in de rijrichting van het voertuig, met een boogje omhoog.
        const dx = hit.dir * easeOut(Math.min(1, k * 1.6)) * 1.3;
        const dy = -Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.6;
        ctx.translate(dx, dy);
        x += dx;
        y += dy;
        ctx.rotate(hit.dir * Math.min(1, k * 1.6) * Math.PI * 3);
        const s = 1 - 0.3 * Math.min(1, k * 1.6);
        ctx.scale(s, s);
        drawCharacter(ctx, look, { hit: true, flat: 0, face: p.face, shadow: false });
      } else {
        // Plat als een pannenkoek, met een klein veertje na.
        const squash = this.reducedMotion ? 1 : Math.min(1, k * 8) * (1 + 0.12 * Math.sin(k * 30) * (1 - k));
        drawCharacter(ctx, look, { hit: true, flat: Math.min(1.05, squash), face: p.face });
      }
    } else if (hop > 0) {
      // Schaduw blijft op de grond terwijl het poppetje springt.
      ctx.fillStyle = C.shadow;
      ctx.beginPath();
      ctx.ellipse(0, 0.38, 0.24, 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -hop);
      drawCharacter(ctx, look, { shadow: false, face: p.face });
    } else {
      drawCharacter(ctx, look, { face: p.face });
    }
    ctx.restore();

    if (badge >= 0 && !hit) this.drawBadge(x, y - hop, badge);
    if (hit) this.drawHitEffect(x, y, game, hit.k);
  }

  /** Samen spelen: gekleurd bolletje met 1 of 2 boven het hoofd. */
  drawBadge(x, y, i) {
    const ctx = this.ctx;
    const by = y - 0.62;
    ctx.save();
    ctx.fillStyle = PLAYER_COLORS[i];
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.arc(x, by, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.text(String(i + 1), x, by + 0.01, 0.2, '#ffffff', 900);
  }

  /** 0 = moment van de aanrijding … 1 = einde van de aanrijdingspauze. */
  hitProgress(game) {
    return Math.min(1, Math.max(0, 1 - game.timer / (game.hitDuration || 1)));
  }

  drawHitEffect(x, y, game, k) {
    // Sterretjes die rondtollen
    for (let i = 0; i < 5; i++) {
      const a = game.time * 5 + (i * Math.PI * 2) / 5;
      const sx = x + Math.cos(a) * 0.42;
      const sy = y - 0.15 + Math.sin(a) * 0.14;
      this.text('★', sx, sy, 0.24, i % 2 ? '#ffffff' : '#ffd400');
    }
    // "AU!" springt in beeld (met overshoot) en zweeft omhoog
    const pop = this.reducedMotion ? 1 : Math.min(1, k * 6);
    const size = 0.46 * (pop < 1 ? pop * 1.25 : 1 + 0.25 * Math.max(0, 1 - (k - 1 / 6) * 8));
    const ay = y - 0.62 - k * 0.25;
    this.text('AU!', x + 0.03, ay + 0.03, size, '#000000', 900);
    this.text('AU!', x, ay, size, '#ffd400', 900);
  }
  // --- Confetti bij de overkant ---------------------------------------------------------

  confetti(x, y) {
    if (this.reducedMotion) return;
    const colors = ['#ffd400', '#e63946', '#4cc9f0', '#2a9d8f', '#f77f00', '#ffffff', '#7b2cbf'];
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 3 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        life: 1.1 + Math.random() * 0.5,
        color: colors[i % colors.length],
      });
    }
  }

  drawParticles(dt) {
    if (!this.particles.length) return;
    const ctx = this.ctx;
    for (const p of this.particles) {
      p.vy += 9 * dt; // zwaartekracht
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(-0.06, -0.03, 0.12, 0.06);
      ctx.restore();
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
