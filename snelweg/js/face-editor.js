// Gezicht uitsnijden: foto verschuiven en zoomen binnen een ronde uitsnede.
//
// Privacy: de foto wordt alleen in de browser verwerkt (object-URL → canvas). Er gaat niets
// over het netwerk; alleen de verkleinde uitsnede wordt lokaal opgeslagen.
//
// Bediening: slepen (muis/vinger), knijpen met twee vingers, scrollwiel, zoom-slider,
// en met het toetsenbord op het canvas: pijltjes = verschuiven, + / - = zoomen, R = draaien.

const MAX_SOURCE = 1024; // grote foto's eerst verkleinen (geheugen en snelheid)
const CROP = 0.8; // diameter van de uitsnede t.o.v. het canvas
const MAX_ZOOM = 5;
export const FACE_SIZE = 128;
export const FACE_SMALL_SIZE = 48;

/** Leest een afbeeldingsbestand lokaal in en verkleint het. Gooit een Error als het niet lukt. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('leeg'));
        return;
      }
      const k = Math.min(1, MAX_SOURCE / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('kapot'));
    };
    img.src = url;
  });
}

export class FaceEditor {
  constructor(canvas, zoomInput) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoomInput = zoomInput;
    this.source = null;
    this.pointers = new Map();
    this.rot = 0; // kwartslagen
    this.zoom = 1; // 1..MAX_ZOOM t.o.v. de minimale schaal
    this.cx = 0; // verschuiving van het fotomidden t.o.v. het canvasmidden (css-px)
    this.cy = 0;

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => this.pointers.delete(e.pointerId));
    }
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('keydown', (e) => this.onKeyDown(e));
    zoomInput.addEventListener('input', () => {
      this.zoom = MAX_ZOOM ** (Number(zoomInput.value) / 100);
      this.clampAndDraw(false);
    });
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
    else window.addEventListener('resize', () => this.resize()); // oude browsers
  }

  open(source) {
    this.source = source;
    this.rot = 0;
    this.zoom = 1;
    this.cx = 0;
    this.cy = 0;
    this.pointers.clear();
    this.resize();
  }

  close() {
    this.source = null;
    this.pointers.clear();
  }

  // --- Geometrie --------------------------------------------------------------

  get size() {
    return this.canvas.clientWidth || 280; // css-px
  }

  get crop() {
    return this.size * CROP;
  }

  /** Afmetingen van de bron na draaien. */
  get rotated() {
    const { width, height } = this.source;
    return this.rot % 2 ? [height, width] : [width, height];
  }

  /** Schaal bron-px → css-px. Minimaal zo groot dat de uitsnede helemaal gevuld is. */
  get scale() {
    const [w, h] = this.rotated;
    return (this.crop / Math.min(w, h)) * this.zoom;
  }

  clampAndDraw(syncSlider = true) {
    if (!this.source) return;
    this.zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom));
    const [w, h] = this.rotated;
    const maxX = Math.max(0, (w * this.scale - this.crop) / 2);
    const maxY = Math.max(0, (h * this.scale - this.crop) / 2);
    this.cx = Math.min(maxX, Math.max(-maxX, this.cx));
    this.cy = Math.min(maxY, Math.max(-maxY, this.cy));
    if (syncSlider) this.zoomInput.value = String(Math.round((100 * Math.log(this.zoom)) / Math.log(MAX_ZOOM)));
    this.draw();
  }

  zoomBy(factor) {
    const old = this.zoom;
    this.zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom * factor));
    // Zoomen rond het midden van de uitsnede
    const k = this.zoom / old;
    this.cx *= k;
    this.cy *= k;
    this.clampAndDraw();
  }

  rotate() {
    this.rot = (this.rot + 1) % 4;
    [this.cx, this.cy] = [-this.cy, this.cx];
    this.clampAndDraw();
  }

  // --- Tekenen ------------------------------------------------------------------

  resize() {
    if (!this.source) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(this.size * dpr);
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = this.canvas.height = px;
    }
    this.clampAndDraw();
  }

  /** Foto tekenen in een context waarvan de oorsprong in het midden van de uitsnede ligt (css-px). */
  paintSource(ctx) {
    const s = this.scale;
    ctx.translate(this.cx, this.cy);
    ctx.rotate((this.rot * Math.PI) / 2);
    ctx.scale(s, s);
    ctx.drawImage(this.source, -this.source.width / 2, -this.source.height / 2);
  }

  draw() {
    const { ctx, canvas } = this;
    const k = canvas.width / this.size;
    const half = this.size / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!this.source) return;
    ctx.setTransform(k, 0, 0, k, half * k, half * k);
    ctx.imageSmoothingQuality = 'high';
    this.paintSource(ctx);

    // Donker buiten de ronde uitsnede
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.beginPath();
    ctx.rect(0, 0, this.size, this.size);
    ctx.arc(half, half, this.crop / 2, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, this.crop / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** De uitsnede als vierkante JPEG-data-URL's (groot en klein). */
  export() {
    const big = this.renderCrop(FACE_SIZE);
    const small = document.createElement('canvas');
    small.width = small.height = FACE_SMALL_SIZE;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(big, 0, 0, FACE_SMALL_SIZE, FACE_SMALL_SIZE);
    return {
      face: big.toDataURL('image/jpeg', 0.85),
      faceSmall: small.toDataURL('image/jpeg', 0.8),
    };
  }

  renderCrop(size) {
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#d8b48f';
    ctx.fillRect(0, 0, size, size);
    const k = size / this.crop;
    ctx.setTransform(k, 0, 0, k, size / 2, size / 2);
    ctx.imageSmoothingQuality = 'high';
    this.paintSource(ctx);
    return out;
  }

  // --- Invoer -------------------------------------------------------------------

  onPointerDown(e) {
    if (!this.source) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  onPointerMove(e) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const others = [...this.pointers.entries()].filter(([id]) => id !== e.pointerId);
    if (others.length === 0) {
      this.cx += e.clientX - prev.x;
      this.cy += e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.clampAndDraw();
      return;
    }
    // Knijpen: zoom op basis van de afstand, verschuiven op basis van het midden.
    const other = others[0][1];
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    this.cx += (e.clientX - prev.x) / 2;
    this.cy += (e.clientY - prev.y) / 2;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (before > 10) this.zoomBy(after / before);
    else this.clampAndDraw();
  }

  onWheel(e) {
    if (!this.source) return;
    e.preventDefault();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015));
  }

  onKeyDown(e) {
    const step = e.shiftKey ? 30 : 8;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      // Pijltjes verschuiven de foto (dus het gezicht beweegt mee in die richting).
      this.cx += moves[e.key][0];
      this.cy += moves[e.key][1];
      this.clampAndDraw();
    } else if (e.key === '+' || e.key === '=') {
      this.zoomBy(1.1);
    } else if (e.key === '-' || e.key === '_') {
      this.zoomBy(1 / 1.1);
    } else if (e.key === 'r' || e.key === 'R') {
      this.rotate();
    } else {
      return;
    }
    e.preventDefault(); // main.js laat afgehandelde toetsen met rust
  }
}
