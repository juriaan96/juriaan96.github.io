import { COLS, ROWS, ROW_FINISH, ROW_MEDIAN, ROW_START } from './config.js';
import { drawCharacter } from './character.js';

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
};

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
    const tilePx = Math.max(10, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(tilePx * COLS * dpr);
    const h = Math.round(tilePx * ROWS * dpr);
    this.canvas.style.width = `${tilePx * COLS}px`;
    this.canvas.style.height = `${tilePx * ROWS}px`;
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = this.bg.width = w;
    this.canvas.height = this.bg.height = h;
    this.scale = tilePx * dpr;
    this.drawBackground(this.bg.getContext('2d'));
  }

  // --- Statische achtergrond (één keer per resize) -------------------------

  drawBackground(ctx) {
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const rnd = seeded(7);

    for (const row of [ROW_FINISH, ROW_START]) {
      ctx.fillStyle = C.grass;
      ctx.fillRect(0, row, COLS, 1);
      for (let i = 0; i < COLS * 10; i++) {
        ctx.fillStyle = rnd() < 0.5 ? C.grassDark : C.grassLight;
        ctx.fillRect(rnd() * COLS, row + rnd() * 0.95, 0.05, 0.08);
      }
    }

    for (const top of [ROW_FINISH + 1, ROW_MEDIAN + 1]) {
      ctx.fillStyle = C.asphalt;
      ctx.fillRect(0, top, COLS, 3);
      for (let i = 0; i < COLS * 40; i++) {
        ctx.fillStyle = rnd() < 0.5 ? C.asphaltDark : C.asphaltLight;
        ctx.fillRect(rnd() * COLS, top + rnd() * 3, 0.04, 0.04);
      }
      // Doorgetrokken kantstrepen en onderbroken rijstrookstrepen.
      ctx.fillStyle = C.line;
      ctx.fillRect(0, top + 0.04, COLS, 0.05);
      ctx.fillRect(0, top + 3 - 0.09, COLS, 0.05);
      for (const y of [top + 1, top + 2]) {
        for (let x = 0.3; x < COLS; x += 2.2) ctx.fillRect(x, y - 0.03, 1.1, 0.06);
      }
    }

    // Middenberm: smalle asfaltstrook, gras en een vangrail.
    const m = ROW_MEDIAN;
    ctx.fillStyle = C.asphalt;
    ctx.fillRect(0, m, COLS, 1);
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, m + 0.18, COLS, 0.64);
    for (let i = 0; i < COLS * 4; i++) {
      ctx.fillStyle = C.grassDark;
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

  // --- Per frame -------------------------------------------------------------

  draw(game, dt = 1 / 60) {
    const ctx = this.ctx;
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
    ctx.drawImage(this.bg, sx, sy);
    ctx.setTransform(this.scale, 0, 0, this.scale, sx, sy);

    this.drawSigns(game);
    for (const lane of game.traffic.lanes) {
      for (const v of lane.vehicles) this.drawVehicle(v, lane);
    }
    if (game.mode === 'noncha' && game.state === 'hit' && game.hitBy) this.drawReveal(game);
    if (game.state !== 'ready' && game.state !== 'gameover') this.drawPlayers(game);
    this.drawParticles(game.paused ? 0 : dt);
    this.drawTapMarker(dt);

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
    const mx = 0.15;
    const my = ROW_MEDIAN + 0.08;
    fillRound(ctx, mx, my, 0.84, 0.84, 0.08, '#111');
    ctx.strokeStyle = '#e0262b';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(mx + 0.42, my + 0.42, 0.31, 0, Math.PI * 2);
    ctx.stroke();
    const limit = String(game.params.speedLimit);
    this.text(limit, mx + 0.42, my + 0.44, limit.length > 2 ? 0.22 : 0.28, '#f5f5f5');

    // Blauw bord op de finishberm.
    const bx = COLS - 2.6;
    const by = ROW_FINISH + 0.14;
    fillRound(ctx, bx, by, 2.4, 0.72, 0.08, '#f5f5f5');
    fillRound(ctx, bx + 0.05, by + 0.05, 2.3, 0.62, 0.06, '#1f4fa0');
    this.text('Overkant', bx + 1.2, by + 0.37, 0.34, '#ffffff');
  }

  drawVehicle(v, lane) {
    const ctx = this.ctx;
    const L = v.length;
    ctx.save();
    ctx.translate(v.x + L / 2, lane.row + 0.5);
    if (lane.dir < 0) ctx.scale(-1, 1); // tekenen alsof hij naar rechts rijdt
    switch (v.type) {
      case 'truck':
        this.drawTruck(v, L);
        break;
      case 'van':
        this.drawCar(v, L, 0.72, true);
        break;
      case 'motor':
        this.drawMotor(v, L);
        break;
      default:
        this.drawCar(v, L, 0.62, false);
    }
    ctx.restore();
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
