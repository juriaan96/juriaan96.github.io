// Het poppetje: uiterlijk (look), validatie en tekenen.
// Gedeeld door het speelveld, de highscorelijst en de karaktereditor.
//
// Een look is klein en serialiseerbaar: { base, shirt, pants, hat, hatColor }.
// `base` kiest een ingebouwd poppetje (huid, haar, extra's); de rest is aanpasbaar.
// Tekencoördinaten: (0, 0) is het midden van een vakje van 1 × 1; voeten op y ≈ 0.4.

export const BASES = {
  sam: { name: 'Sam', skin: '#f1c27d', hair: '#4a2c17', hairStyle: 'short' },
  lotte: { name: 'Lotte', skin: '#ffdbac', hair: '#e0b043', hairStyle: 'long' },
  noor: { name: 'Noor', skin: '#8d5524', hair: '#1b1b1b', hairStyle: 'curly' },
  bram: { name: 'Bram', skin: '#e0ac69', hair: '#7a3e12', hairStyle: 'bald', beard: true },
  mei: { name: 'Mei', skin: '#f6d1a4', hair: '#151515', hairStyle: 'bun' },
  henk: { name: 'Opa Henk', skin: '#f3d3b5', hair: '#d4d4d4', hairStyle: 'short', glasses: true },
  robot: { name: 'Robot', skin: '#b8c4d0', hair: '#5b6b7a', hairStyle: 'antenna', square: true, eyes: '#39d0ff' },
};

export const HATS = [
  { id: 'none', name: 'Geen' },
  { id: 'cap', name: 'Pet' },
  { id: 'helmet', name: 'Helm' },
];

export const SHIRT_COLORS = [
  ['#e63946', 'Rood'],
  ['#f77f00', 'Oranje'],
  ['#ffd60a', 'Geel'],
  ['#2a9d8f', 'Groen'],
  ['#4cc9f0', 'Lichtblauw'],
  ['#1d4ed8', 'Blauw'],
  ['#7b2cbf', 'Paars'],
  ['#ff70a6', 'Roze'],
  ['#f1f1f1', 'Wit'],
  ['#26282c', 'Zwart'],
];

export const PANTS_COLORS = [
  ['#1d3557', 'Spijkerblauw'],
  ['#1f2124', 'Zwart'],
  ['#6b7280', 'Grijs'],
  ['#7c4a2a', 'Bruin'],
  ['#c8b08a', 'Beige'],
  ['#3f6212', 'Legergroen'],
  ['#9b2226', 'Donkerrood'],
  ['#f77f00', 'Oranje'],
];

export const HAT_COLORS = [
  ['#ffd60a', 'Geel'],
  ['#f77f00', 'Oranje'],
  ['#e63946', 'Rood'],
  ['#1d4ed8', 'Blauw'],
  ['#2a9d8f', 'Groen'],
  ['#f1f1f1', 'Wit'],
  ['#26282c', 'Zwart'],
];

export const DEFAULT_LOOK = { base: 'sam', shirt: '#e63946', pants: '#1d3557', hat: 'none', hatColor: '#ffd60a' };

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);

/** Maakt van willekeurige (opgeslagen) data een geldige look. */
export function cleanLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return out;
  if (typeof look.base === 'string' && Object.hasOwn(BASES, look.base)) out.base = look.base;
  for (const k of ['shirt', 'pants', 'hatColor']) if (isHex(look[k])) out[k] = look[k];
  if (HATS.some((h) => h.id === look.hat)) out.hat = look.hat;
  // Highscores uit stap 2 bewaarden huid/haar los; die blijven zo getekend.
  for (const k of ['skin', 'hair']) if (isHex(look[k])) out[k] = look[k];
  return out;
}

export function randomLook(rng = Math.random) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return {
    base: pick(Object.keys(BASES)),
    shirt: pick(SHIRT_COLORS)[0],
    pants: pick(PANTS_COLORS)[0],
    hat: pick(HATS).id,
    hatColor: pick(HAT_COLORS)[0],
  };
}

function resolve(look) {
  const base = BASES[look?.base] ?? BASES[DEFAULT_LOOK.base];
  return { ...base, ...DEFAULT_LOOK, ...look };
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

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const HEAD_Y = -0.25;
const HEAD_R = 0.17;
const FACE_Y = -0.27;
const FACE_R = 0.2; // een foto-gezicht is iets groter, zodat het herkenbaar blijft

// --- Gezichten (data-URL's) ------------------------------------------------------

const FACE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const isFaceDataUrl = (v, maxLength = 100000) =>
  typeof v === 'string' && v.length <= maxLength && FACE_DATA_URL.test(v);

const faceCache = new Map();

/**
 * Geeft het geladen gezicht terug, of null als het (nog) niet geladen is.
 * onLoad wordt eenmalig aangeroepen zodra het geladen is.
 */
export function getFace(url, onLoad) {
  if (!url) return null;
  let entry = faceCache.get(url);
  if (!entry) {
    if (faceCache.size > 40) faceCache.delete(faceCache.keys().next().value);
    const img = new Image();
    entry = { img, ready: false, failed: false, waiting: [] };
    img.onload = () => {
      entry.ready = true;
      entry.waiting.splice(0).forEach((fn) => fn());
    };
    img.onerror = () => {
      entry.failed = true;
      entry.waiting.length = 0;
    };
    img.src = url;
    faceCache.set(url, entry);
  }
  if (entry.ready) return entry.img;
  if (onLoad && !entry.failed) entry.waiting.push(onLoad);
  return null;
}

/**
 * @param {CanvasRenderingContext2D} ctx  met een transform waarin 1 eenheid = 1 vakje
 * @param {object} look
 * @param {object} [opts] { hit, flat: 0..1 (platdrukken, standaard 1 bij hit), shadow,
 *                          face: data-URL, onFaceLoad: callback }
 */
export function drawCharacter(ctx, look = DEFAULT_LOOK, opts = {}) {
  const { hit = false, shadow = true } = opts;
  const flat = opts.flat ?? (hit ? 1 : 0);
  const a = resolve(look);
  const faceImg = getFace(opts.face, opts.onFaceLoad);
  ctx.save();

  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0.38, 0.24 + 0.18 * flat, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (flat > 0) {
    // Plat als een pannenkoek (vanaf de voeten).
    ctx.translate(0, 0.4);
    ctx.scale(1 + 0.35 * flat, 1 - 0.68 * flat);
    ctx.translate(0, -0.4);
  }

  drawHairBack(ctx, a);

  // Benen
  ctx.fillStyle = a.pants;
  ctx.fillRect(-0.15, 0.1, 0.12, 0.3);
  ctx.fillRect(0.03, 0.1, 0.12, 0.3);
  // Armen
  ctx.fillStyle = a.skin;
  ctx.fillRect(-0.28, -0.08, 0.08, 0.24);
  ctx.fillRect(0.2, -0.08, 0.08, 0.24);
  // Shirt
  ctx.fillStyle = a.shirt;
  roundRect(ctx, -0.21, -0.12, 0.42, 0.3, 0.08);
  ctx.fill();

  if (faceImg) {
    // Eigen gezicht als hoofd; haar, ogen en bril zitten al op de foto.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, FACE_Y, FACE_R, 0, Math.PI * 2);
    ctx.fillStyle = a.skin;
    ctx.fill();
    ctx.clip();
    ctx.drawImage(faceImg, -FACE_R, FACE_Y - FACE_R, FACE_R * 2, FACE_R * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.arc(0, FACE_Y, FACE_R, 0, Math.PI * 2);
    ctx.stroke();
    drawHat(ctx, a, FACE_Y, FACE_R);
    ctx.restore();
    return;
  }

  // Hoofd
  ctx.fillStyle = a.skin;
  if (a.square) {
    roundRect(ctx, -HEAD_R, HEAD_Y - HEAD_R, HEAD_R * 2, HEAD_R * 2 - 0.02, 0.05);
    ctx.fill();
  } else {
    circle(ctx, 0, HEAD_Y, HEAD_R, a.skin);
  }

  drawHairFront(ctx, a);
  if (a.beard) {
    ctx.fillStyle = a.hair;
    ctx.beginPath();
    ctx.arc(0, HEAD_Y + 0.005, HEAD_R - 0.005, Math.PI * 0.08, Math.PI * 0.92);
    ctx.closePath();
    ctx.fill();
  }
  drawEyes(ctx, a, hit);
  if (a.glasses) {
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 0.018;
    for (const ex of [-0.058, 0.058]) {
      ctx.beginPath();
      ctx.arc(ex, HEAD_Y, 0.042, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-0.016, HEAD_Y);
    ctx.lineTo(0.016, HEAD_Y);
    ctx.stroke();
  }
  drawHat(ctx, a, HEAD_Y, HEAD_R);

  ctx.restore();
}

function drawHairBack(ctx, a) {
  ctx.fillStyle = a.hair;
  if (a.hairStyle === 'long') {
    roundRect(ctx, -0.2, HEAD_Y - 0.13, 0.4, 0.36, 0.1);
    ctx.fill();
  } else if (a.hairStyle === 'curly') {
    for (const [x, y, r] of [
      [-0.15, -0.3, 0.1],
      [0.15, -0.3, 0.1],
      [-0.09, -0.4, 0.1],
      [0.09, -0.4, 0.1],
      [0, -0.43, 0.09],
      [-0.18, -0.2, 0.07],
      [0.18, -0.2, 0.07],
    ]) {
      circle(ctx, x, y, r, a.hair);
    }
  }
}

function drawHairFront(ctx, a) {
  const hasHat = a.hat !== 'none';
  switch (a.hairStyle) {
    case 'short':
    case 'long':
    case 'curly':
    case 'bun':
      ctx.fillStyle = a.hair;
      ctx.beginPath();
      ctx.arc(0, HEAD_Y - 0.02, HEAD_R, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      if (a.hairStyle === 'bun' && !hasHat) circle(ctx, 0, HEAD_Y - 0.2, 0.07, a.hair);
      break;
    case 'antenna':
      if (hasHat) break;
      ctx.strokeStyle = a.hair;
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(0, HEAD_Y - HEAD_R);
      ctx.lineTo(0, HEAD_Y - HEAD_R - 0.1);
      ctx.stroke();
      circle(ctx, 0, HEAD_Y - HEAD_R - 0.11, 0.035, a.eyes ?? '#e63946');
      break;
    default:
      break; // kaal
  }
}

function drawEyes(ctx, a, hit) {
  if (hit) {
    // Kruisjes als ogen
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.025;
    for (const ex of [-0.06, 0.06]) {
      ctx.beginPath();
      ctx.moveTo(ex - 0.03, HEAD_Y - 0.03);
      ctx.lineTo(ex + 0.03, HEAD_Y + 0.03);
      ctx.moveTo(ex + 0.03, HEAD_Y - 0.03);
      ctx.lineTo(ex - 0.03, HEAD_Y + 0.03);
      ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = a.eyes ?? '#222';
  const w = a.eyes ? 0.05 : 0.035;
  ctx.fillRect(-0.058 - w / 2, HEAD_Y - 0.022, w, 0.045);
  ctx.fillRect(0.058 - w / 2, HEAD_Y - 0.022, w, 0.045);
}

/** Hoofddeksel op een hoofd met middelpunt (0, cy) en straal r. */
function drawHat(ctx, a, cy, r) {
  const k = r / HEAD_R; // schaal mee met een groter (foto)hoofd
  if (a.hat === 'cap') {
    const y = cy - 0.035 * k - (r - HEAD_R) * 0.6;
    ctx.fillStyle = a.hatColor;
    ctx.beginPath();
    ctx.arc(0, y, r + 0.01, Math.PI, Math.PI * 2);
    ctx.fill();
    // Klep
    ctx.beginPath();
    ctx.ellipse(0.04 * k, y, 0.2 * k, 0.04 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0.04 * k, y + 0.005, 0.2 * k, 0.03 * k, 0, 0, Math.PI);
    ctx.fill();
    circle(ctx, 0, y - r - 0.005, 0.02 * k, 'rgba(0, 0, 0, 0.25)');
  } else if (a.hat === 'helmet') {
    // Bouwhelm
    const y = cy - 0.03 * k - (r - HEAD_R) * 0.6;
    ctx.fillStyle = a.hatColor;
    ctx.beginPath();
    ctx.arc(0, y, r + 0.03, Math.PI, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, -0.25 * k, y - 0.02, 0.5 * k, 0.045 * k, 0.02);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(-0.025 * k, y - r - 0.03, 0.05 * k, r + 0.02);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(-0.25 * k, y + 0.015, 0.5 * k, 0.012);
  }
}

/** Tekent een avatar (bovenlijf, ingezoomd) op een bestaand canvas. */
export function paintAvatar(canvas, look, face = null) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = canvas.width * 1.25;
  ctx.setTransform(s, 0, 0, s, canvas.width / 2, canvas.height * 0.7);
  drawCharacter(ctx, look, { shadow: false, face, onFaceLoad: () => paintAvatar(canvas, look, face) });
}

/** Nieuw klein avatar-canvas (bijv. voor de highscorelijst). */
export function createAvatar(look, cssSize = 36, face = null) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = canvas.height = Math.round(cssSize * dpr);
  canvas.style.width = canvas.style.height = `${cssSize}px`;
  canvas.className = 'avatar';
  canvas.setAttribute('aria-hidden', 'true');
  paintAvatar(canvas, look, face);
  return canvas;
}

/** Hele poppetje op een canvas (voorbeeld in de editor). */
export function paintFull(canvas, look, face = null) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  // Grasvlak als ondergrond
  ctx.fillStyle = '#5a9443';
  ctx.beginPath();
  ctx.ellipse(w / 2, w * 0.8, w * 0.42, w * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const s = w * 0.75;
  ctx.setTransform(s, 0, 0, s, w / 2, w * 0.49);
  drawCharacter(ctx, look, { face, onFaceLoad: () => paintFull(canvas, look, face) });
}
