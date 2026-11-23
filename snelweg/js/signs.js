// Verkeersborden tekenen op een 2D-canvas, in pixels. Gedeeld door de 2D- en 3D-weergave
// (in 3D worden ze een textuur).

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

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

/** Tekst zo groot mogelijk (tot maxPx) binnen maxW, gecentreerd op (cx, cy). */
function fitText(ctx, str, cx, cy, maxW, maxPx, color, weight = 700) {
  let px = maxPx;
  ctx.font = `${weight} ${px}px ${FONT}`;
  const w = ctx.measureText(str).width;
  if (w > maxW) {
    px = Math.max(6, Math.floor((px * maxW) / w));
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, cx, cy + px * 0.04);
}

/**
 * Vlaggen: banen van boven naar onder ('h') of van links naar rechts ('v').
 * Zwitserland is apart (rood met wit kruis).
 */
export const FLAGS = {
  nl: { dir: 'h', colors: ['#ae1c28', '#ffffff', '#21468b'] },
  be: { dir: 'v', colors: ['#111111', '#fdda24', '#ef3340'] },
  fr: { dir: 'v', colors: ['#0055a4', '#ffffff', '#ef4135'] },
  de: { dir: 'h', colors: ['#111111', '#dd0000', '#ffce00'] },
  ch: { dir: 'cross', colors: ['#da291c', '#ffffff'] },
};

/** Vlaggetje in de rechthoek (x, y, w, h). */
export function paintFlag(ctx, x, y, w, h, flag) {
  const f = FLAGS[flag];
  if (!f) return;
  if (f.dir === 'cross') {
    ctx.fillStyle = f.colors[0];
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = f.colors[1];
    const c = Math.min(w, h);
    ctx.fillRect(x + w / 2 - c * 0.1, y + h / 2 - c * 0.32, c * 0.2, c * 0.64);
    ctx.fillRect(x + w / 2 - c * 0.32, y + h / 2 - c * 0.1, c * 0.64, c * 0.2);
    return;
  }
  f.colors.forEach((color, i) => {
    ctx.fillStyle = color;
    if (f.dir === 'h') ctx.fillRect(x, y + (i * h) / 3, w, h / 3 + 0.5);
    else ctx.fillRect(x + (i * w) / 3, y, w / 3 + 0.5, h);
  });
}

/** Duits bord "einde snelheidsbeperking": witte cirkel met schuine strepen. */
export function paintUnlimited(ctx, cx, cy, r, lineWidth) {
  ctx.save();
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - lineWidth, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineWidth = lineWidth * 0.75;
  for (let i = -2; i <= 2; i++) {
    const o = i * r * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + o + r, cy - r);
    ctx.lineTo(cx + o - r, cy + r);
    ctx.stroke();
  }
  ctx.restore();
}

/** Rond verkeersbord met maximumsnelheid: wit met rode rand en zwart getal. */
export function paintRoundSign(ctx, cx, cy, r, limit) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d7261e';
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const s = String(limit);
  fitText(ctx, s, cx, cy, r * 1.25, Math.round(r * (s.length > 2 ? 0.75 : 0.95)), '#111111', 800);
}

/** Autobahn-symbool (weg onder een viaduct), gecentreerd op (cx, cy) met grootte s. */
export function paintAutobahnSymbol(ctx, cx, cy, s, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 0.42 * s, cy + 0.48 * s);
  ctx.lineTo(cx - 0.07 * s, cy - 0.18 * s);
  ctx.lineTo(cx + 0.07 * s, cy - 0.18 * s);
  ctx.lineTo(cx + 0.42 * s, cy + 0.48 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(cx - 0.04 * s, cy + 0.48 * s);
  ctx.lineTo(cx, cy - 0.1 * s);
  ctx.lineTo(cx + 0.04 * s, cy + 0.48 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillRect(cx - 0.5 * s, cy - 0.4 * s, s, 0.13 * s);
  ctx.fillRect(cx - 0.5 * s, cy - 0.4 * s, 0.1 * s, 0.35 * s);
  ctx.fillRect(cx + 0.4 * s, cy - 0.4 * s, 0.1 * s, 0.35 * s);
  ctx.restore();
}

/** Nederlands autoweg-symbool: witte rechthoek met een blauwe auto. */
function paintAutowegSymbol(ctx, cx, cy, s) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx - 0.5 * s, cy - 0.42 * s, s, 0.84 * s, 0.08 * s);
  ctx.fill();
  ctx.fillStyle = '#1f4fa0';
  roundRect(ctx, cx - 0.36 * s, cy - 0.02 * s, 0.72 * s, 0.2 * s, 0.05 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 0.2 * s, cy - 0.02 * s);
  ctx.lineTo(cx - 0.1 * s, cy - 0.2 * s);
  ctx.lineTo(cx + 0.14 * s, cy - 0.2 * s);
  ctx.lineTo(cx + 0.24 * s, cy - 0.02 * s);
  ctx.closePath();
  ctx.fill();
  for (const x of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.arc(cx + x * s, cy + 0.2 * s, 0.08 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Plaatsbord aan de overkant, in de rechthoek (x, y, w, h).
 * Stijlen: nl-kom, be-kom, nl-autoweg, fr-ville, ch-green, nl-anwb, de-autobahn.
 */
export function paintPlaceSign(ctx, x, y, w, h, style, place) {
  const name = place || 'Overkant';
  const border = Math.max(2, h * 0.07);
  const textPx = Math.round(h * 0.56);
  ctx.save();
  // Achtergrond en rand
  const bg = {
    'nl-kom': '#1f4fa0',
    'be-kom': '#ffffff',
    'nl-autoweg': '#1f4fa0',
    'fr-ville': '#ffffff',
    'ch-green': '#1b7a3e',
    'nl-anwb': '#1f4fa0',
    'de-autobahn': '#1f4fa0',
  }[style] || '#1f4fa0';
  const edge = { 'be-kom': '#111111', 'fr-ville': '#d7261e' }[style] || '#ffffff';
  const ink = style === 'be-kom' || style === 'fr-ville' ? '#111111' : '#ffffff';
  ctx.fillStyle = edge;
  roundRect(ctx, x, y, w, h, h * 0.12);
  ctx.fill();
  const inset = style === 'fr-ville' ? border * 1.6 : border;
  ctx.fillStyle = bg;
  roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, h * 0.08);
  ctx.fill();
  if (style === 'be-kom') {
    // Belgisch kombord: dunne zwarte binnenrand
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = border * 0.5;
    roundRect(ctx, x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4, h * 0.06);
    ctx.stroke();
  }
  ctx.restore();

  // Symbool links (snelwegen) en de naam
  let tx = x + w / 2;
  let tw = w - inset * 4;
  if (style === 'de-autobahn' || style === 'ch-green' || style === 'nl-autoweg') {
    const s = h * 0.62;
    const sx = x + inset + h * 0.45;
    if (style === 'nl-autoweg') paintAutowegSymbol(ctx, sx, y + h / 2, s * 0.9);
    else paintAutobahnSymbol(ctx, sx, y + h / 2, s);
    tx = x + (h * 0.9 + w) / 2;
    tw = w - h * 0.9 - inset * 2;
  }
  fitText(ctx, style === 'fr-ville' ? name.toUpperCase() : name, tx, y + h / 2, tw, textPx, ink, style === 'nl-kom' ? 600 : 700);
}
