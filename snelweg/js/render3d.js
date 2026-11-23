// 3D-weergave: schuin meekijkende camera, getekend met WebGL 1 zonder bibliotheek.
//
// Waarom zo: digiborden draaien vaak een oude ingebouwde browser met een zwakke grafische
// chip. WebGL 1 werkt vrijwel overal, en zonder bibliotheek blijft alles ES2018 en klein.
//
// - Alles is opgebouwd uit blokjes. De vaste omgeving (weg, vangrail, bomen) staat één keer
//   in een buffer; voertuigen en confetti worden elke frame in één buffer gezet en in één
//   keer getekend (weinig draw calls).
// - Het poppetje is een "kartonnen" figuur: de bestaande 2D-tekening (drawCharacter) als
//   textuur die naar de camera kijkt. Zo werken alle poppetjes, kleuren en eigen gezichten.
// - De camera kijkt schuin van achteren en schuift een beetje mee met de speler, maar het hele
//   speelveld blijft altijd in beeld (verkeer van opzij moet je zien aankomen).
// - Aan de zijkanten en in de verte zit nevel, zodat voertuigen er geleidelijk uit opdoemen.
// - Loopt het te traag, dan gaat de resolutie omlaag; helpt dat niet, dan zet `tooSlow` het
//   spel terug naar 2D (main.js).
//
// Zelfde interface als Renderer (render.js): resize, draw, confetti, markTap, screenToGrid.

import { COLS, ROWS } from './config.js';
import { drawCharacter } from './character.js';
import { PLAYER_COLORS, shade } from './render.js';
import { THEMES, rowKinds } from './themes.js';
import { paintUnlimited, paintRoundSign, paintPlaceSign, FLAGS } from './signs.js';

// Camera kijkt zo schuin naar beneden: liggend schuin, staand (telefoon) steiler, zodat het
// smalle scherm beter gevuld wordt.
const PITCH_WIDE = (54 * Math.PI) / 180;
const PITCH_TALL = (70 * Math.PI) / 180;
const FOV = (38 * Math.PI) / 180;
const LEAN_FACTOR = 0.55; // poppetjes leunen iets achterover, zodat ze niet gedrongen ogen
const SPRITE_SCALE = 1.3;
const FOG = [0.79, 0.84, 0.89];
const MAX_BOXES = 2700; // 2700 × 24 hoekpunten past in 16-bit indices
const MAX_QUADS = 256;
const MAX_PIXELS = 2.2e6; // bovengrens voor de tekenresolutie (4K-borden)
// Vangrail iets achter het midden van de middenberm, zodat je ervóór staat (z = middenberm + 0.28)
// Plekken van het landschap per land (x, z) achter de overkant
const WINDMILL = [3.8, -2.0]; // molen (NL provinciale weg)
const FRITUUR = [3.4, -1.5]; // frituur (België)
const CHALET = [3.6, -2.2]; // chalet (Zwitserland)
const TURBINES = [
  [2.2, -2.4],
  [6.6, -3.2],
  [10.4, -2.6],
]; // windmolens (Duitsland)
const TURBINE_H = 2.3; // hoogte van de mast

// Poppetje-textuur: 1 eenheid = SPR_W px; x -0.5..0.5, y -SPR_TOP..(SPR_H/SPR_W - SPR_TOP)
const SPR_W = 128;
const SPR_H = 144;
const SPR_TOP = 0.68;
const SPR_HU = SPR_H / SPR_W; // hoogte in eenheden
const FEET_FROM_BOTTOM = SPR_HU - SPR_TOP - 0.4; // voeten staan op y = 0.4 in drawCharacter

// Punten die altijd in beeld moeten zijn (het hele speelveld)
/** Punten die altijd in beeld moeten zijn (het hele speelveld), voor een veld van ows rijen. */
const fitPoints = (rows) => [
  [-0.15, 0, -0.1],
  [COLS + 0.15, 0, -0.1],
  [-0.15, 0, rows + 0.1],
  [COLS + 0.15, 0, rows + 0.1],
  [0.6, 2.05, 0.3], // bovenkant van de borden op de overkant
  [COLS - 1.5, 1.7, 0.3],
  [COLS / 2, 1.8, -1.6], // een strookje landschap achter de overkant (molen, bomen)
];

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const colorCache = new Map();
function rgb(hex) {
  let c = colorCache.get(hex);
  if (c) return c;
  let h = String(hex).slice(1);
  if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  colorCache.set(hex, c);
  return c;
}

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// --- Matrices (kolom-volgorde, zoals WebGL verwacht) ------------------------------------

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function lookAt(eye, c, up) {
  let zx = eye[0] - c[0];
  let zy = eye[1] - c[1];
  let zz = eye[2] - c[2];
  let l = Math.hypot(zx, zy, zz);
  zx /= l;
  zy /= l;
  zz /= l;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz);
  xx /= l;
  xy /= l;
  xz /= l;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return [
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ];
}

function multiply(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  }
  return o;
}

function project(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, w];
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// --- Shaders --------------------------------------------------------------------------

const FOG_GLSL = `
uniform vec3 uFogColor;
float fogAt(vec3 p) {
  float side = smoothstep(7.2, 12.0, abs(p.x - 6.5));
  float far = smoothstep(2.0, 26.0, -p.z) * 0.9;
  return max(side, far);
}`;

const LIT_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uViewProj;
uniform vec3 uLight;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vWorld = aPos;
  float d = max(dot(aNormal, uLight), 0.0);
  vColor = aColor * (0.6 + 0.5 * d);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const LIT_FS = `
precision mediump float;
varying vec3 vColor;
varying vec3 vWorld;
uniform float uAlpha;
${FOG_GLSL}
void main() {
  gl_FragColor = vec4(mix(vColor, uFogColor, fogAt(vWorld)), uAlpha);
}`;

const TEX_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uViewProj;
varying vec2 vUV;
varying vec3 vWorld;
void main() {
  vUV = aUV;
  vWorld = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const TEX_FS = `
precision mediump float;
varying vec2 vUV;
varying vec3 vWorld;
uniform sampler2D uTex;
uniform vec4 uColor;
uniform float uFog;
${FOG_GLSL}
void main() {
  vec4 c = texture2D(uTex, vUV) * uColor;
  if (c.a < 0.03) discard;
  c.rgb = mix(c.rgb, uFogColor, fogAt(vWorld) * uFog);
  gl_FragColor = c;
}`;

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  const info = { prog, attr: {}, uni: {} };
  const na = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const a = gl.getActiveAttrib(prog, i);
    info.attr[a.name] = gl.getAttribLocation(prog, a.name);
  }
  const nu = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const u = gl.getActiveUniform(prog, i);
    info.uni[u.name] = gl.getUniformLocation(prog, u.name);
  }
  return info;
}

// --- Blokjes ----------------------------------------------------------------------------

// Per zijvlak: normaal en 4 hoeken van een eenheidsblok (-0.5..0.5)
const FACES = [
  [[1, 0, 0], [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]]],
  [[-1, 0, 0], [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]]],
  [[0, 1, 0], [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]]],
  [[0, -1, 0], [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]]],
  [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
  [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
];
const FLOATS_PER_BOX = 24 * 9;

class BoxBatch {
  constructor(gl, maxBoxes, dynamic) {
    this.gl = gl;
    this.max = maxBoxes;
    this.data = new Float32Array(maxBoxes * FLOATS_PER_BOX);
    this.count = 0;
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  }

  reset() {
    this.count = 0;
  }

  /**
   * Blok met middelpunt (cx, cz), onderkant y0, afmetingen sx × sy × sz, gedraaid om de y-as
   * (en eventueel eerst om de z-as, bijv. voor molenwieken; dan is y0 het middelpunt).
   */
  box(cx, y0, cz, sx, sy, sz, color, rotY = 0, rotZ = 0) {
    if (this.count >= this.max) return;
    const d = this.data;
    let o = this.count * FLOATS_PER_BOX;
    const cy = rotZ ? y0 : y0 + sy / 2;
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const cz2 = Math.cos(rotZ);
    const sz2 = Math.sin(rotZ);
    for (const [n, corners] of FACES) {
      const n0 = n[0] * cz2 - n[1] * sz2;
      const n1 = n[0] * sz2 + n[1] * cz2;
      const nx = n0 * c + n[2] * s;
      const nz = -n0 * s + n[2] * c;
      for (const p of corners) {
        const px = p[0] * sx;
        const py = p[1] * sy;
        const lx = px * cz2 - py * sz2;
        const ly = px * sz2 + py * cz2;
        const lz = p[2] * sz;
        d[o++] = cx + lx * c + lz * s;
        d[o++] = cy + ly;
        d[o++] = cz - lx * s + lz * c;
        d[o++] = nx;
        d[o++] = n1;
        d[o++] = nz;
        d[o++] = color[0];
        d[o++] = color[1];
        d[o++] = color[2];
      }
    }
    this.count += 1;
  }

  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * FLOATS_PER_BOX));
  }

  draw(prog) {
    if (!this.count) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = 36;
    gl.vertexAttribPointer(prog.attr.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(prog.attr.aNormal, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(prog.attr.aColor, 3, gl.FLOAT, false, stride, 24);
    gl.drawElements(gl.TRIANGLES, this.count * 36, gl.UNSIGNED_SHORT, 0);
  }
}

/** Rechthoekjes met textuur: hoekpunten (pos + uv), 6 per rechthoek. */
class QuadBatch {
  constructor(gl) {
    this.gl = gl;
    this.data = new Float32Array(MAX_QUADS * 6 * 5);
    this.count = 0;
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
  }

  /** Rechthoek rond middelpunt C, met richtingen R (breedte) en U (hoogte). */
  add(C, R, U, w, h) {
    if (this.count >= MAX_QUADS) return;
    const hw = w / 2;
    const hh = h / 2;
    const pt = (sx, sy) => [C[0] + R[0] * hw * sx + U[0] * hh * sy, C[1] + R[1] * hw * sx + U[1] * hh * sy, C[2] + R[2] * hw * sx + U[2] * hh * sy];
    const bl = pt(-1, -1);
    const br = pt(1, -1);
    const tr = pt(1, 1);
    const tl = pt(-1, 1);
    let o = this.count * 30;
    const d = this.data;
    for (const [p, u, v] of [
      [bl, 0, 1],
      [br, 1, 1],
      [tr, 1, 0],
      [bl, 0, 1],
      [tr, 1, 0],
      [tl, 0, 0],
    ]) {
      d[o++] = p[0];
      d[o++] = p[1];
      d[o++] = p[2];
      d[o++] = u;
      d[o++] = v;
    }
    this.count += 1;
  }

  flush(prog) {
    if (!this.count) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * 30));
    gl.vertexAttribPointer(prog.attr.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(prog.attr.aUV, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, this.count * 6);
    this.count = 0;
  }
}

// --- Renderer -----------------------------------------------------------------------------

export class Renderer3D {
  /** Geeft een Renderer3D terug, of null als WebGL niet beschikbaar is. */
  static create(canvas) {
    try {
      const opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
      const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) return null;
      return new Renderer3D(canvas, gl);
    } catch (e) {
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.lost = false;
    this.tooSlow = false;
    this.quality = 1;
    this.samples = [];
    this.slowChecks = 0;
    this.cssW = 1;
    this.cssH = 1;
    this.time = 0;
    this.particles = [];
    this.tap = null;
    this.cam = { tx: COLS / 2, tz: ROWS / 2 + 0.1 };
    this.rows = ROWS;
    this.pitch = PITCH_WIDE;
    this.sprites = new Map();
    this.textures = new Map();
    const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = !!(motion && motion.matches);
    if (motion && motion.addEventListener) motion.addEventListener('change', (e) => (this.reducedMotion = e.matches));

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });

    this.lit = compile(gl, LIT_VS, LIT_FS);
    this.tex = compile(gl, TEX_VS, TEX_FS);

    const idx = new Uint16Array(MAX_BOXES * 36);
    for (let b = 0, o = 0; b < MAX_BOXES; b++) {
      for (let f = 0; f < 6; f++) {
        const v = b * 24 + f * 4;
        idx[o++] = v;
        idx[o++] = v + 1;
        idx[o++] = v + 2;
        idx[o++] = v;
        idx[o++] = v + 2;
        idx[o++] = v + 3;
      }
    }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    this.static = new BoxBatch(gl, MAX_BOXES, false);
    this.dynamic = new BoxBatch(gl, MAX_BOXES, true);
    this.fx = new BoxBatch(gl, 8, true);
    this.quads = new QuadBatch(gl);
    this.buildStatic('nl80');
    this.static.upload();
  }

  // --- Grootte en snelheid ------------------------------------------------------------

  resize(availW, availH) {
    this.cssW = Math.max(1, Math.floor(availW));
    this.cssH = Math.max(1, Math.floor(availH));
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.applySize();
  }

  applySize() {
    let pr = Math.min(window.devicePixelRatio || 1, 1.5) * this.quality;
    const area = this.cssW * this.cssH;
    if (area * pr * pr > MAX_PIXELS) pr = Math.sqrt(MAX_PIXELS / area);
    const w = Math.max(1, Math.round(this.cssW * pr));
    const h = Math.max(1, Math.round(this.cssH * pr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Te traag? Eerst de resolutie omlaag; helpt dat niet, dan tooSlow (terug naar 2D). */
  trackPerf(dt) {
    if (!(dt > 0) || dt >= 0.1 || document.hidden) return;
    this.samples.push(dt);
    if (this.samples.length < 90) return;
    const s = this.samples.sort((a, b) => a - b);
    const median = s[s.length >> 1];
    this.samples = [];
    if (median > 1 / 28) {
      if (this.quality > 0.5) {
        this.quality = Math.max(0.5, this.quality - 0.2);
        this.applySize();
      } else if (median > 1 / 20) {
        this.slowChecks += 1;
        if (this.slowChecks >= 2) this.tooSlow = true;
      }
    } else {
      this.slowChecks = 0;
    }
  }

  // --- Texturen --------------------------------------------------------------------------

  upload(source, tex = null) {
    const gl = this.gl;
    const t = tex || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** Textuur uit een 2D-tekening, gecachet op naam. */
  canvasTex(key, w, h, paint) {
    let t = this.textures.get(key);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    t = this.upload(c);
    this.textures.set(key, t);
    // Snelheidsborden wisselen per level; houd de cache klein
    if (this.textures.size > 40) {
      const [oldKey, oldTex] = this.textures.entries().next().value;
      this.gl.deleteTexture(oldTex);
      this.textures.delete(oldKey);
    }
    return t;
  }

  text(ctx, str, x, y, px, color, weight = 800) {
    ctx.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  get white() {
    return this.canvasTex('white', 4, 4, (ctx) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 4, 4);
    });
  }

  get blob() {
    return this.canvasTex('blob', 64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.32)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
  }

  get glow() {
    return this.canvasTex('glow', 64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, 'rgba(191,219,254,0.95)');
      g.addColorStop(0.35, 'rgba(96,165,250,0.55)');
      g.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
  }

  speedSign(limit) {
    return this.canvasTex(`speed:${limit}`, 128, 128, (ctx) => {
      const key = String(limit);
      if (key.indexOf('round:') === 0) {
        paintRoundSign(ctx, 64, 64, 60, key.slice(6)); // gewoon verkeersbord (doorzichtige hoeken)
        return;
      }
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 128, 128);
      if (key.indexOf('unlimited') === 0) {
        paintUnlimited(ctx, 64, 64, 46, 7); // Autobahn: geen limiet
        return;
      }
      ctx.strokeStyle = '#e0262b';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(64, 64, 46, 0, Math.PI * 2);
      ctx.stroke();
      const s = String(limit);
      this.text(ctx, s, 64, 67, s.length > 2 ? 38 : 48, '#f5f5f5');
    });
  }

  // --- Vaste omgeving ------------------------------------------------------------------

  /** Vaste omgeving voor dit wegtype (zie themes.js): weg, middenberm, landschap, borden. */
  buildStatic(themeId = 'nl80') {
    const t = THEMES[themeId] || THEMES.nl130;
    const b = this.static;
    b.reset();
    this.builtTheme = themeId;
    const X0 = -60;
    const X1 = COLS + 60;
    const W = X1 - X0;
    const XC = (X0 + X1) / 2;
    const rnd = seeded(11);
    const grass = rgb(t.grass);
    const grassDark = rgb(shade(t.grass, -0.15));
    const grassLight = rgb(shade(t.grass, 0.12));
    const concrete = t.road === 'concrete';
    const roadHex = concrete ? '#a3a5a3' : t.road;
    const asphalt = rgb(roadHex);
    const line = rgb('#f3f3ee');
    const post = rgb('#5b6068');
    // Kantstreep: doorgetrokken of onderbroken
    const edgeLine = (z) => {
      if (t.edge === 'dashed') for (let x = -20; x < COLS + 20; x += 1.0) b.box(x + 0.28, 0.01, z, 0.55, 0.004, 0.05, line);
      else b.box(XC, 0.01, z, W, 0.004, 0.05, line);
    };

    if (t.decor === 'afsluitdijk') {
      // Afsluitdijk: alleen de dijk zelf is grond; het talud en het water liggen lager (zie buildDecor)
      const zA = -0.25;
      const zB = rowKinds(themeId).length + 0.35;
      b.box(XC, -0.2, (zA + zB) / 2, W, 0.2, zB - zA, grass);
    } else {
      b.box(XC, -0.2, 0, W, 0.2, 140, grass); // de grond
    }

    // Per rij: rijbaan, middenberm of fietspad (de rest is gras: overkant, start, berm)
    const kinds = rowKinds(themeId);
    const median = kinds.indexOf('median');
    const railZ = median + 0.28;
    this.rows = kinds.length; // minder rijstroken = minder rijen
    const joint = rgb('#7f817f');
    const bikeHex = t.bike || '#b4473a';
    for (let row = 0; row < kinds.length; row++) {
      const k = kinds[row];
      const zc = row + 0.5;
      if (k === 'road' || k === 'median') {
        b.box(XC, 0, zc, W, 0.01, 1, asphalt);
        if (k === 'road' && concrete) {
          // Betonplaten: dwarsvoegen, per rijstrook verspringend
          for (let x = -20 + (row % 3) * 0.55; x < COLS + 20; x += 1.65) b.box(x, 0.01, zc, 0.03, 0.002, 0.98, joint);
        }
        if (k === 'road' && t.patches) {
          // België: lappen asfalt
          for (let i = 0; i < 9; i++) {
            const c = rgb(rnd() < 0.6 ? shade(roadHex, -0.18) : shade(roadHex, 0.08));
            b.box(-8 + rnd() * (COLS + 16), 0.01, row + 0.3 + rnd() * 0.4, 0.6 + rnd() * 1.6, 0.002, 0.25 + rnd() * 0.3, c);
          }
        }
      } else if (k === 'bike') {
        // Fietspad: rood asfalt met witte fietssymbolen
        b.box(XC, 0, zc, W, 0.012, 1, rgb(bikeHex));
        const white = rgb('#f3f3ee');
        for (let x = -10.5; x < COLS + 10; x += 4) {
          for (const wx of [x - 0.15, x + 0.15]) {
            b.box(wx, 0.012, zc - 0.09, 0.2, 0.003, 0.03, white);
            b.box(wx, 0.012, zc + 0.09, 0.2, 0.003, 0.03, white);
            b.box(wx - 0.09, 0.012, zc, 0.03, 0.003, 0.2, white);
            b.box(wx + 0.09, 0.012, zc, 0.03, 0.003, 0.2, white);
          }
          b.box(x, 0.012, zc - 0.05, 0.3, 0.003, 0.03, white); // frame
        }
      }
    }

    // Strepen: kantstrepen langs elke rijbaan, onderbroken strepen tussen rijstroken
    for (let row = 0; row < kinds.length; row++) {
      if (kinds[row] !== 'road') continue;
      const above = kinds[row - 1];
      const below = kinds[row + 1];
      if (above !== 'road') edgeLine(row + 0.065);
      if (below !== 'road') edgeLine(row + 1 - 0.065);
      if (below === 'road') for (let x = -20.6; x < COLS + 20; x += 2.2) b.box(x + 0.55, 0.01, row + 1, 1.1, 0.004, 0.06, line);
    }

    // Middenberm
    if (t.median === 'green') {
      // Nederland: groene middenmarkering tussen twee witte lijnen
      b.box(XC, 0.01, median + 0.5, W, 0.004, 0.44, rgb('#3f8a4e'));
      b.box(XC, 0.011, median + 0.25, W, 0.004, 0.06, line);
      b.box(XC, 0.011, median + 0.75, W, 0.004, 0.06, line);
    } else if (t.median === 'double') {
      // België: dubbele doorgetrokken streep
      b.box(XC, 0.011, median + 0.43, W, 0.004, 0.06, line);
      b.box(XC, 0.011, median + 0.57, W, 0.004, 0.06, line);
    } else if (t.median === 'concrete') {
      // Betonnen barrier (breed onder, smal boven)
      const beton = rgb('#c4c4bd');
      b.box(XC, 0, railZ + 0.05, W, 0.18, 0.42, beton);
      b.box(XC, 0.18, railZ + 0.05, W, 0.3, 0.18, beton);
    } else {
      b.box(XC, 0.01, median + 0.5, W, 0.006, 0.64, grass);
      for (let x = -14.85; x < COLS + 15; x += 0.6) b.box(x, 0, railZ, 0.07, 0.4, 0.07, post);
      b.box(XC, 0.27, railZ + 0.03, W, 0.13, 0.05, rgb('#c9ced6'));
      b.box(XC, 0.39, railZ + 0.03, W, 0.012, 0.055, rgb('#eef1f5'));
    }

    // Grasplukjes en in de berm: hectometerpaaltjes (NL) of straatlantaarns (BE)
    for (let row = 0; row < kinds.length; row++) {
      const k = kinds[row];
      if (k !== 'finish' && k !== 'start' && k !== 'verge') continue;
      for (let i = 0; i < 70; i++) {
        b.box(-1 + rnd() * (COLS + 2), 0, row + 0.06 + rnd() * 0.88, 0.05, 0.03, 0.05, rnd() < 0.5 ? grassDark : grassLight);
      }
      // Langs de weg op de overkant en de startberm (op de overkant niet bij het plaatsbord)
      const toward = k === 'finish' ? 1 : -1; // kant van de weg
      const z = row + 0.5 + toward * 0.36;
      const free = (x) => k !== 'finish' || x < 9.3 || x > COLS + 0.3;
      if (t.verge === 'hecto') {
        for (let x = -8.2; x < COLS + 8; x += 3) {
          if (!free(x)) continue;
          b.box(x, 0, z, 0.09, 0.45, 0.07, rgb('#2f6b3a'));
          b.box(x, 0.3, z + 0.01, 0.07, 0.1, 0.07, rgb('#ffffff'));
        }
      } else if (t.verge === 'lamps' && k === 'finish') {
        // Alleen aan de overkant: aan de startkant zouden de palen het verkeer verbergen
        for (let x = -9.3; x < COLS + 9; x += 3.5) {
          if (!free(x)) continue;
          b.box(x, 0, z - toward * 0.25, 0.07, 1.7, 0.07, rgb('#4b5563'));
          b.box(x, 1.65, z + toward * 0.08, 0.06, 0.06, 0.7, rgb('#4b5563'));
          b.box(x, 1.57, z + toward * 0.4, 0.2, 0.08, 0.26, rgb('#ffe39a'));
        }
      }
    }

    // Landschap achter de overkant (op de Afsluitdijk: geen haag maar het water)
    if (t.decor !== 'afsluitdijk') b.box(XC, 0, -0.32, W, 0.32, 0.36, rgb(shade(t.grass, -0.3))); // haag
    const trunk = rgb('#6b4423');
    const greens = ['#3f7d34', '#4a8a3a', '#356b2c', '#5b9640'].map(rgb);
    const tree = (x, z, i) => {
      const s = 0.8 + rnd() * 0.6;
      b.box(x, 0, z, 0.16, 0.55, 0.16, trunk);
      b.box(x, 0.45, z, s, 0.7 + rnd() * 0.7, s, greens[i % greens.length], rnd() * Math.PI);
    };
    if (t.scenery === 'poplars') {
      // Frankrijk: rijen populieren
      for (const z of [-1.6, -5.5]) {
        for (let x = -14; x < COLS + 14; x += 1.5) {
          b.box(x, 0, z, 0.14, 0.6, 0.14, trunk);
          b.box(x, 0.5, z, 0.5, 2.2 + rnd() * 0.8, 0.5, greens[2], 0.4);
        }
      }
      for (let i = 0; i < 10; i++) tree(-14 + rnd() * (COLS + 28), -8 - rnd() * 4, i);
    } else if (t.scenery === 'firs') {
      // Zwitserland: dennenbomen (getrapt, donkergroen)
      const fir = rgb('#1f5130');
      for (let i = 0; i < 46; i++) {
        const x = -14 + rnd() * (COLS + 28);
        const z = -1.2 - rnd() * 8;
        const s = 0.7 + rnd() * 0.4;
        b.box(x, 0, z, 0.14, 0.35, 0.14, trunk);
        for (let k = 0; k < 4; k++) b.box(x, 0.3 + k * 0.45, z, s * (1 - k * 0.22), 0.46, s * (1 - k * 0.22), fir, Math.PI / 4);
      }
    } else if (t.scenery !== 'none') {
      for (let i = 0; i < 48; i++) tree(-14 + rnd() * (COLS + 28), -1.1 - rnd() * 8, i);
    }
    // Typisch voor het land, achter de overkant
    this.buildDecor(b, t, rnd, post);

    // Vlaggetje van het land naast het plaatsbord
    const flag = FLAGS[t.flag];
    if (flag) {
      const fx = COLS - 3.0;
      const fz = 0.3;
      b.box(fx - 0.33, 0, fz, 0.05, 1.75, 0.05, post);
      const fw = 0.6;
      const fh = 0.4;
      const fy = 1.3;
      const x0 = fx - 0.3;
      if (flag.dir === 'cross') {
        b.box(x0 + fw / 2, fy, fz, fw, fh, 0.03, rgb(flag.colors[0]));
        b.box(x0 + fw / 2, fy + 0.07, fz + 0.02, 0.07, fh - 0.14, 0.01, rgb(flag.colors[1]));
        b.box(x0 + fw / 2, fy + fh / 2 - 0.035, fz + 0.02, fh - 0.14, 0.07, 0.01, rgb(flag.colors[1]));
      } else {
        flag.colors.forEach((c, i) => {
          if (flag.dir === 'h') b.box(x0 + fw / 2, fy + fh - ((i + 1) * fh) / 3, fz, fw, fh / 3, 0.03, rgb(c));
          else b.box(x0 + (i + 0.5) * (fw / 3), fy, fz, fw / 3, fh, 0.03, rgb(c));
        });
      }
    }

    // Snelheidsbord (matrixbord of gewoon bord op een paal) en plaatsbord op de overkant
    b.box(0.6, 0, 0.3, 0.08, 1.2, 0.08, post);
    if (t.speedSign !== 'round') b.box(0.6, 1.1, 0.3, 0.9, 0.9, 0.1, rgb('#111111'));
    b.box(COLS - 2.3, 0, 0.3, 0.08, 1.0, 0.08, post);
    b.box(COLS - 0.7, 0, 0.3, 0.08, 1.0, 0.08, post);
    b.box(COLS - 1.5, 0.9, 0.3, 2.4, 0.76, 0.06, rgb('#d9dde2'));
  }

  /** Koe (wit met zwarte vlekken), kop naar rechts. */
  cow(b, x, z, bell = false) {
    const white = rgb('#f5f5f5');
    const black = rgb('#1b1b1b');
    for (const [dx, dz] of [
      [-0.26, -0.13],
      [-0.26, 0.13],
      [0.26, -0.13],
      [0.26, 0.13],
    ]) {
      b.box(x + dx, 0, z + dz, 0.08, 0.34, 0.08, black);
    }
    b.box(x, 0.32, z, 0.78, 0.36, 0.4, white);
    b.box(x - 0.15, 0.33, z, 0.26, 0.36, 0.42, black); // vlek
    b.box(x + 0.2, 0.45, z, 0.18, 0.24, 0.41, black);
    b.box(x + 0.48, 0.5, z, 0.24, 0.24, 0.26, white); // kop
    b.box(x + 0.6, 0.5, z, 0.06, 0.12, 0.2, rgb('#f0a8a8')); // snuit
    if (bell) b.box(x + 0.42, 0.36, z + 0.0, 0.1, 0.12, 0.1, rgb('#d4a017'));
  }

  /** Landschap per land achter de overkant (3D). */
  buildDecor(b, t, rnd, post) {
    switch (t.decor) {
      case 'tulips': {
        // Tulpenveld en een molen (de wieken draaien, zie drawWindmill)
        const colors = ['#e63946', '#ffd60a', '#ff70a6', '#f77f00', '#ffffff', '#7b2cbf'].map(rgb);
        const stem = rgb('#3f7d34');
        for (let r = 0; r < 7; r++) {
          const z = -0.9 - r * 0.42;
          b.box(9, 0, z, 7.6, 0.08, 0.3, stem);
          for (let x = 5.4; x < 12.6; x += 0.34) b.box(x, 0.08, z, 0.2, 0.2, 0.2, colors[r % colors.length]);
        }
        const [wx, wz] = WINDMILL;
        const body = rgb('#5a4636');
        for (let k = 0; k < 5; k++) b.box(wx, k * 0.42, wz, 1.1 - k * 0.1, 0.43, 1.1 - k * 0.1, body, Math.PI / 8);
        b.box(wx, 2.1, wz, 0.7, 0.36, 0.7, rgb('#3a2e24'));
        b.box(wx, 0.65, wz, 1.7, 0.06, 1.7, rgb('#7a6a55'), Math.PI / 8); // stelling
        break;
      }
      case 'frituur': {
        // Frituur-kraampje met een reuzenpuntzak friet op het dak
        const [fx, fz] = FRITUUR;
        b.box(fx, 0, fz, 2.4, 1.2, 1.3, rgb('#fff6d5'));
        b.box(fx, 1.2, fz, 2.6, 0.16, 1.5, rgb('#d62828')); // dak
        for (let i = 0; i < 6; i++) {
          b.box(fx - 1.1 + i * 0.44, 1.0, fz + 0.72, 0.44, 0.22, 0.16, rgb(i % 2 ? '#ffffff' : '#d62828')); // luifel
        }
        b.box(fx, 0.45, fz + 0.66, 2.0, 0.08, 0.06, rgb('#8b5a2b')); // toonbank
        b.box(fx + 0.6, 1.36, fz, 0.5, 0.55, 0.5, rgb('#d62828'), Math.PI / 4); // puntzak
        for (let i = 0; i < 5; i++) b.box(fx + 0.45 + i * 0.08, 1.8, fz - 0.1 + (i % 2) * 0.15, 0.07, 0.45 + (i % 3) * 0.1, 0.07, rgb('#ffd60a'));
        break;
      }
      case 'polder': {
        // Sloot en koeien in de wei
        b.box(COLS / 2, 0.004, -1.05, 120, 0.006, 0.55, rgb('#3b6ea5'));
        for (const [x, z] of [
          [2.4, -2.2],
          [4.4, -2.9],
          [8.4, -2.3],
          [10.8, -3.2],
          [-1.5, -2.6],
        ]) {
          this.cow(b, x, z);
        }
        break;
      }
      case 'lavender': {
        // Lavendelvelden
        const purple = ['#7e5bbf', '#9b7fd1'].map(rgb);
        for (let r = 0; r < 7; r++) {
          const z = -0.9 - r * 0.45;
          for (let x = 0.2 + (r % 2) * 0.25; x < 13; x += 0.5) b.box(x, 0, z, 0.36, 0.28, 0.3, purple[r % 2], 0.3);
        }
        break;
      }
      case 'chalet': {
        // Chalet met sneeuw op het dak, en koeien met een bel
        const [cx, cz] = CHALET;
        const wood = rgb('#7a4a26');
        b.box(cx, 0, cz, 2.4, 1.2, 1.6, wood);
        b.box(cx, 0.55, cz + 0.81, 2.6, 0.08, 0.2, rgb('#f5e6c8')); // balkon
        for (const wx of [-0.7, 0.7]) b.box(cx + wx, 0.62, cz + 0.8, 0.4, 0.34, 0.03, rgb('#f5e6c8')); // ramen
        b.box(cx, 0, cz + 0.8, 0.4, 0.62, 0.03, rgb('#d62828')); // deur
        const snow = rgb('#f4f6f8');
        b.box(cx - 0.62, 1.48, cz, 1.55, 0.14, 1.9, snow, 0, 0.48);
        b.box(cx + 0.62, 1.48, cz, 1.55, 0.14, 1.9, snow, 0, -0.48);
        this.cow(b, 7.4, -1.8, true);
        this.cow(b, 9.6, -2.7, true);
        break;
      }
      case 'afsluitdijk': {
        // Afsluitdijk: Waddenzee achter de overkant (met basalt op het talud), IJsselmeer achter de start
        // Alles ligt op een eigen hoogte (geen vlakken op dezelfde hoogte, dus geen flikkeren):
        // dijk (grond, bovenkant 0) → talud in treden omlaag → water op -0.3.
        const wad = rgb('#5b7f95');
        const meer = rgb('#4f7fa0');
        const basalt = rgb('#3d4045');
        const seam = rgb('#55595f');
        // Waddenzee-kant: basalt in twee treden
        for (const [z, top] of [
          [-0.4, -0.08],
          [-0.7, -0.17],
        ]) {
          b.box(COLS / 2, top - 0.25, z, 140, 0.25, 0.3, basalt);
          for (let x = -20; x < COLS + 20; x += 0.5) b.box(x, top, z, 0.03, 0.004, 0.3, seam);
        }
        b.box(COLS / 2, -0.5, -30.85, 140, 0.2, 60.3, wad); // Waddenzee (bovenkant -0.3)
        // IJsselmeer-kant: grastalud in twee treden
        const z0 = this.rows + 0.35;
        b.box(COLS / 2, -0.35, z0 + 0.15, 140, 0.25, 0.3, rgb(shade(t.grass, -0.12))); // bovenkant -0.1
        b.box(COLS / 2, -0.45, z0 + 0.45, 140, 0.25, 0.3, rgb(shade(t.grass, -0.25))); // bovenkant -0.2
        b.box(COLS / 2, -0.5, z0 + 30.6, 140, 0.2, 60, meer); // IJsselmeer (bovenkant -0.3)
        // Het monument: stenen uitkijktoren
        const stone = rgb('#d8d2c4');
        b.box(2.6, -0.3, -0.15, 0.8, 1.9, 0.8, stone, Math.PI / 4); // voet reikt tot in het talud
        b.box(2.6, 1.6, -0.15, 0.95, 0.12, 0.95, rgb('#b9b1a0'), Math.PI / 4);
        b.box(2.6, 1.72, -0.15, 0.5, 0.35, 0.5, stone, Math.PI / 4);
        b.box(2.6, 0.4, 0.27, 0.22, 0.5, 0.02, rgb('#2b2b2b'), 0); // deur
        break;
      }
      case 'noisewall': {
        // Geluidsscherm langs de snelweg
        const panel = rgb('#7f8f7a');
        const frame = rgb('#5c6658');
        b.box(COLS / 2, 0, -0.66, 60, 1.7, 0.12, panel);
        b.box(COLS / 2, 1.7, -0.66, 60, 0.08, 0.16, frame);
        for (let x = -20; x < COLS + 20; x += 2.4) b.box(x, 0, -0.6, 0.1, 1.75, 0.14, frame);
        break;
      }
      case 'turbines': {
        // Windmolens (wieken draaien, zie drawTurbines)
        for (const [x, z] of TURBINES) {
          b.box(x, 0, z, 0.14, TURBINE_H, 0.14, rgb('#eef0f2'));
          b.box(x, TURBINE_H - 0.06, z + 0.03, 0.2, 0.18, 0.36, rgb('#e5e7eb'));
        }
        break;
      }
      default:
        break;
    }
  }

  /** Afsluitdijk: zeilbootjes die langzaam over de Waddenzee varen. */
  drawBoats(b) {
    const white = rgb('#f5f5f5');
    const hull = rgb('#6b4423');
    for (const [speed, z, offset, sail] of [
      [0.35, -1.6, 0, '#f5f5f5'],
      [-0.25, -2.6, 9, '#e63946'],
    ]) {
      const x = ((((this.time * speed + offset) % 40) + 40) % 40) - 13;
      // Op het water (bovenkant -0.3)
      b.box(x, -0.34, z, 0.9, 0.18, 0.32, hull);
      b.box(x, -0.16, z, 0.04, 1.0, 0.04, white); // mast
      b.box(x + 0.22 * Math.sign(speed), -0.08, z, 0.4, 0.8, 0.02, rgb(sail)); // zeil
    }
  }

  /** Windmolens: drie wieken die rustig draaien. */
  drawTurbines(b) {
    const a0 = this.reducedMotion ? 0.3 : this.time * 1.2;
    const white = rgb('#f5f6f7');
    for (const [x, z] of TURBINES) {
      for (let i = 0; i < 3; i++) {
        const a = a0 + (i * Math.PI * 2) / 3 + x;
        b.box(x + Math.cos(a) * 0.6, TURBINE_H + 0.03 + Math.sin(a) * 0.6, z + 0.24, 1.2, 0.1, 0.04, white, 0, a);
      }
    }
  }

  /** Molenwieken (draaien langzaam). */
  drawWindmill(b) {
    const [wx, wz] = WINDMILL;
    const hub = [wx, 2.3, wz + 0.42];
    const a0 = this.reducedMotion ? 0.4 : this.time * 0.9;
    const wood = rgb('#e8e2d4');
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i * Math.PI) / 2;
      b.box(hub[0] + Math.cos(a) * 0.95, hub[1] + Math.sin(a) * 0.95, hub[2], 1.9, 0.24, 0.04, wood, 0, a);
    }
    b.box(hub[0], hub[1] - 0.08, hub[2], 0.16, 0.16, 0.16, rgb('#3a2e24'));
  }

  // --- Camera --------------------------------------------------------------------------

  camera(tx, tz, dist, aspect, shake = [0, 0]) {
    const target = [tx + shake[0], shake[1], tz];
    const eye = [target[0], target[1] + Math.sin(this.pitch) * dist, target[2] + Math.cos(this.pitch) * dist];
    const vp = multiply(perspective(FOV, aspect, 0.5, 200), lookAt(eye, target, [0, 1, 0]));
    return { eye, vp };
  }

  fitDistance(tx, tz, aspect) {
    let lo = 2;
    let hi = 120;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const { vp } = this.camera(tx, tz, mid, aspect);
      let fits = true;
      for (const p of fitPoints(this.rows)) {
        const [x, y, w] = project(vp, p[0], p[1], p[2]);
        if (w <= 0 || Math.abs(x) > 0.97 || Math.abs(y) > 0.95) {
          fits = false;
          break;
        }
      }
      if (fits) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /**
   * Waar de camera standaard naar kijkt (z), zo gekozen dat er boven en onder evenveel ruimte
   * is rond het speelveld en het strookje landschap. Per schermverhouding één keer berekend.
   */
  balancedTz(aspect) {
    const key = `${aspect.toFixed(2)}:${this.pitch.toFixed(3)}:${this.rows}`;
    if (this.balanced && this.balanced.key === key) return this.balanced.tz;
    let tz = this.rows / 2;
    for (let it = 0; it < 6; it++) {
      const dist = this.fitDistance(COLS / 2, tz, aspect);
      const { vp } = this.camera(COLS / 2, tz, dist, aspect);
      let ymin = Infinity;
      let ymax = -Infinity;
      for (const p of fitPoints(this.rows)) {
        const y = project(vp, p[0], p[1], p[2])[1];
        ymin = Math.min(ymin, y);
        ymax = Math.max(ymax, y);
      }
      // Inhoud te hoog in beeld → verder weg kijken (kleinere z), en andersom
      tz -= ((ymin + ymax) / 2) * dist * 0.4;
    }
    this.balanced = { key, tz };
    return tz;
  }

  updateCamera(game, dt) {
    // Een beetje meekijken met de speler (of het midden tussen twee spelers)
    let fx = COLS / 2;
    let fz = this.rows / 2;
    if (game.state !== 'ready' && game.state !== 'gameover') {
      const ps = game.players;
      fx = ps.reduce((s, p) => s + p.col + 0.5, 0) / ps.length;
      fz = ps.reduce((s, p) => s + p.row + 0.5, 0) / ps.length;
    } else if (!this.reducedMotion) {
      fx += Math.sin(this.time * 0.25) * 2; // menu: rustig heen en weer
    }
    const aspect = this.cssW / this.cssH;
    this.pitch = lerp(PITCH_TALL, PITCH_WIDE, clamp01((aspect - 0.6) / 0.6));
    const tx = COLS / 2 + (fx - COLS / 2) * 0.3;
    const tz = this.balancedTz(aspect) + (fz - this.rows / 2) * 0.3;
    const k = Math.min(1, dt * 4);
    this.cam.tx += (tx - this.cam.tx) * k;
    this.cam.tz += (tz - this.cam.tz) * k;

    let shake = [0, 0];
    if (game.state === 'hit' && !game.paused && !this.reducedMotion) {
      const since = (1 - game.timer / (game.hitDuration || 1)) * (game.hitDuration || 1);
      if (since < 0.28) {
        const amp = 0.12 * (1 - since / 0.28);
        shake = [(Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * 2 * amp];
      }
    }
    const dist = this.fitDistance(this.cam.tx, this.cam.tz, aspect);
    const { eye, vp } = this.camera(this.cam.tx, this.cam.tz, dist, aspect, shake);
    this.eye = eye;
    this.vp = vp;
    this.aspect = aspect;
  }

  /** Schermpositie → positie op het speelveld (in vakjes), via de grond onder de vinger. */
  screenToGrid(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    if (!this.eye || !r.width || !r.height) return null;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((clientY - r.top) / r.height) * 2;
    const t = Math.tan(FOV / 2);
    const sp = Math.sin(this.pitch);
    const cp = Math.cos(this.pitch);
    // forward (0, -sp, -cp), right (1, 0, 0), up (0, cp, -sp)
    const dx = nx * t * this.aspect;
    const dy = -sp + ny * t * cp;
    const dz = -cp - ny * t * sp;
    if (dy >= -1e-4) return null; // boven de horizon
    const s = -this.eye[1] / dy;
    return { gx: this.eye[0] + dx * s, gy: this.eye[2] + dz * s };
  }

  // --- Effecten (zelfde aanroepen als de 2D-renderer) ------------------------------------

  markTap(x, y) {
    this.tap = { x, y, t: 0 };
  }

  confetti(x, y) {
    if (this.reducedMotion) return;
    const colors = ['#ffd400', '#e63946', '#4cc9f0', '#2a9d8f', '#f77f00', '#ffffff', '#7b2cbf'].map(rgb);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 2.2;
      this.particles.push({
        x,
        y: 0.8,
        z: y,
        vx: Math.cos(a) * v,
        vy: 3 + Math.random() * 3,
        vz: Math.sin(a) * v * 0.6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        life: 1.3 + Math.random() * 0.5,
        color: colors[i % colors.length],
      });
    }
  }

  // --- Tekenen -------------------------------------------------------------------------------

  draw(game, dt = 1 / 60) {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    this.trackPerf(dt);
    this.time += dt;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    if (game.blind) {
      // Noncha mode: volledig zwart, geen auto's, strepen of speler
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.particles.length = 0;
      this.tap = null;
      return;
    }

    const theme = game.theme;
    if (game.params.theme !== this.builtTheme) {
      this.buildStatic(game.params.theme);
      this.static.upload();
    }
    this.updateCamera(game, dt);
    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    // Ondoorzichtige blokjes: omgeving, voertuigen, confetti
    const lit = this.useLit(1);
    this.static.draw(lit);
    const dyn = this.dynamic;
    dyn.reset();
    this.glows = [];
    for (const lane of game.traffic.lanes) {
      for (const v of lane.vehicles) {
        if (v.x + v.length < -9 || v.x > COLS + 9) continue;
        this.addVehicle(dyn, v, lane);
      }
    }
    // Wrakken na een aanrijding (tijdens het wegslepen verdwijnen ze)
    for (const w of game.traffic.wrecks) {
      if (w.phase === 'fade' && w.t > 0.3) continue;
      this.addVehicle(dyn, w.v, { dir: w.dir }, w);
    }
    if (theme.decor === 'afsluitdijk') this.drawBoats(dyn);
    if (theme.decor === 'tulips') this.drawWindmill(dyn);
    if (theme.decor === 'turbines') this.drawTurbines(dyn);
    this.updateParticles(game.paused ? 0 : dt, dyn);
    dyn.upload();
    dyn.draw(lit);

    // Doorzichtig: schaduwen, borden, poppetjes, effecten
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const tex = this.useTex(this.vp, 1);

    gl.depthMask(false);
    const Rg = [1, 0, 0];
    const Ug = [0, 0, -1]; // plat op de grond, "omhoog" = van de camera af
    for (const lane of game.traffic.lanes) {
      for (const v of lane.vehicles) {
        if (v.x + v.length < -9 || v.x > COLS + 9) continue;
        const narrow = v.type === 'motor' || v.type === 'bike' || v.type === 'scooter';
        const w = narrow ? 0.4 : v.type === 'bakfiets' ? 0.55 : v.type === 'truck' || v.type === 'fire' ? 1.0 : 0.9;
        this.quads.add([v.x + v.length / 2 + 0.08, 0.015, lane.row + 0.56], Rg, Ug, v.length + 0.3, w);
      }
    }
    const showPlayers = game.state !== 'ready' && game.state !== 'gameover';
    if (showPlayers) {
      for (const p of game.players) {
        const t = easeOut(p.moveT);
        this.quads.add([lerp(p.fromCol, p.col, t) + 0.5, 0.02, lerp(p.fromRow, p.row, t) + 0.55], Rg, Ug, 0.7, 0.34);
      }
    }
    this.drawQuads(tex, this.blob, [1, 1, 1, 1]);

    // Blauwe gloed van zwaailichten
    if (this.glows.length) {
      const camU = [0, Math.cos(this.pitch), -Math.sin(this.pitch)];
      for (const g of this.glows) this.quads.add(g, [1, 0, 0], camU, 0.85, 0.85);
      this.drawQuads(tex, this.glow, [1, 1, 1, 0.9]);
    }

    // Borden: snelheid van dit level (rond bord, matrixbord of geen limiet) en de plaats aan de overkant
    this.quads.add([0.6, 1.55, 0.356], [1, 0, 0], [0, 1, 0], 0.82, 0.82);
    this.drawQuads(tex, this.speedSign(theme.speedSign === 'matrix' ? game.params.speedLimit : `${theme.speedSign}:${game.params.speedLimit}`), [1, 1, 1, 1]);
    this.quads.add([COLS - 1.5, 1.28, 0.334], [1, 0, 0], [0, 1, 0], 2.36, 0.72);
    this.drawQuads(
      tex,
      this.canvasTex(`place:${theme.placeSign}:${game.place}`, 256, 78, (ctx, w, h) => paintPlaceSign(ctx, 0, 0, w, h, theme.placeSign, game.place)),
      [1, 1, 1, 1],
    );

    if (theme.decor === 'frituur') {
      // Bord "FRITUUR" op het kraampje
      this.quads.add([FRITUUR[0] - 0.2, 0.78, FRITUUR[1] + 0.66], [1, 0, 0], [0, 1, 0], 1.6, 0.36);
      this.drawQuads(
        tex,
        this.canvasTex('frituur', 160, 36, (ctx, w, h) => {
          ctx.fillStyle = '#ffd60a';
          ctx.fillRect(0, 0, w, h);
          this.text(ctx, 'FRITUUR', w / 2, h / 2 + 1, 28, '#d62828', 900);
        }),
        [1, 1, 1, 1],
      );
    }

    // Tik-markering op de grond
    if (this.tap) {
      this.tap.t += dt;
      const k = this.tap.t / 0.35;
      if (k >= 1) {
        this.tap = null;
      } else {
        const s = 0.3 + 0.6 * k;
        this.quads.add([this.tap.x, 0.04, this.tap.y], Rg, Ug, s, s);
        this.drawQuads(
          tex,
          this.canvasTex('ring', 64, 64, (ctx) => {
            ctx.strokeStyle = '#ffd400';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(32, 32, 26, 0, Math.PI * 2);
            ctx.stroke();
          }),
          [1, 1, 1, 0.9 * (1 - k)],
        );
      }
    }

    // Noncha: het voertuig dat je raakte krijgt een rode gloed
    if (game.mode === 'noncha' && game.state === 'hit' && game.hitBy) this.drawReveal(game);

    // Poppetjes (met diepte, zodat voertuigen ervoor langs kunnen)
    gl.depthMask(true);
    const overlays = [];
    if (showPlayers) {
      game.players.forEach((p, i) => this.drawPlayer(game, p, game.mode === 'duel' ? i : -1, overlays));
    }

    // Altijd bovenop: "AU!", sterretjes, nummerbolletjes
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.useTex(this.vp, 0);
    for (const o of overlays) o();

    // Noncha "even kijken": in- en uitfaden naar zwart
    const dark = game.darkness;
    if (dark > 0) {
      this.useTex(IDENTITY, 0);
      this.quads.add([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 2);
      this.drawQuads(tex, this.white, [0, 0, 0, Math.min(1, dark)]);
    }
  }

  /** Alleen de attributen van het huidige programma aan (een los aanstaand attribuut geeft fouten). */
  setAttribs(locs) {
    const gl = this.gl;
    const want = locs.filter((l) => typeof l === 'number' && l >= 0);
    for (const l of this.enabled || []) if (want.indexOf(l) === -1) gl.disableVertexAttribArray(l);
    for (const l of want) gl.enableVertexAttribArray(l);
    this.enabled = want;
  }

  useLit(alpha) {
    const gl = this.gl;
    const p = this.lit;
    gl.useProgram(p.prog);
    this.setAttribs([p.attr.aPos, p.attr.aNormal, p.attr.aColor]);
    gl.uniformMatrix4fv(p.uni.uViewProj, false, this.vp);
    gl.uniform3f(p.uni.uLight, -0.33, 0.85, 0.41);
    gl.uniform3f(p.uni.uFogColor, FOG[0], FOG[1], FOG[2]);
    gl.uniform1f(p.uni.uAlpha, alpha);
    return p;
  }

  useTex(vp, fog) {
    const gl = this.gl;
    const p = this.tex;
    gl.useProgram(p.prog);
    this.setAttribs([p.attr.aPos, p.attr.aUV]);
    gl.uniformMatrix4fv(p.uni.uViewProj, false, vp);
    gl.uniform3f(p.uni.uFogColor, FOG[0], FOG[1], FOG[2]);
    gl.uniform1f(p.uni.uFog, fog);
    gl.uniform1i(p.uni.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    return p;
  }

  drawQuads(prog, texture, color) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform4f(prog.uni.uColor, color[0], color[1], color[2], color[3]);
    this.quads.flush(prog);
  }

  drawReveal(game) {
    const gl = this.gl;
    const v = game.hitBy;
    const lane = game.traffic.lanes.find((l) => l.vehicles.includes(v));
    if (!lane) return;
    const fx = this.fx;
    fx.reset();
    const h = v.type === 'truck' || v.type === 'fire' ? 1.25 : v.type === 'van' || v.type === 'ambulance' ? 0.95 : 0.8;
    fx.box(v.x + v.length / 2, 0, lane.row + 0.5, v.length + 0.25, h, 0.95, [1, 0.24, 0.24]);
    fx.upload();
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 10);
    const lit = this.useLit(0.25 + 0.25 * pulse);
    fx.draw(lit);
    this.useTex(this.vp, 1);
  }

  // --- Voertuigen -------------------------------------------------------------------------

  /** @param {object} [wreck] wrak na een aanrijding: { x, y, rot } (eigen plek en draaiing) */
  addVehicle(b, v, lane, wreck = null) {
    const L = v.length;
    const cx = wreck ? wreck.x : v.x + L / 2;
    const cz = wreck ? wreck.y : lane.row + 0.5;
    const f = lane.dir; // neus wijst in de rijrichting
    const color = rgb(v.color);
    // Draaiing om de y-as (zelfde draairichting als in 2D)
    const r = wreck ? -wreck.rot : 0;
    const rc = Math.cos(r);
    const rs = Math.sin(r);
    // Onderdeel: van a0 tot a1 in de lengte (positief = voorkant), y0..y1, breedte w
    const part = (a0, a1, y0, y1, w, c, dz = 0) => {
      const lx = (f * (a0 + a1)) / 2;
      b.box(cx + lx * rc + dz * rs, y0, cz - lx * rs + dz * rc, Math.abs(a1 - a0), y1 - y0, w, c, r);
    };
    if (wreck && Math.floor(this.time * 3) % 2 === 0) {
      // Alarmlichten knipperen
      for (const a of [L / 2 - 0.05, -L / 2 + 0.05]) for (const s of [-1, 1]) part(a - 0.05, a + 0.05, 0.3, 0.4, 0.1, rgb('#ffb020'), s * 0.3);
    }
    const tyre = rgb('#16181b');
    const glass = rgb('#2c3e50');
    const head = rgb('#fff6c2');
    const tail = rgb('#ff3b3b');
    const wheels = (positions, w, r = 0.18) => {
      for (const a of positions) for (const s of [-1, 1]) part(a - r * 0.75, a + r * 0.75, 0, r, 0.1, tyre, (s * w) / 2);
    };
    const lights = (front, back, y0, y1, w) => {
      for (const s of [-1, 1]) {
        part(front - 0.02, front + 0.01, y0, y1, 0.12, head, s * w);
        part(back - 0.01, back + 0.02, y0, y1, 0.12, tail, s * w);
      }
    };

    switch (v.type) {
      case 'truck': {
        const cab = 0.85;
        part(-L / 2 + 0.05, L / 2 - 0.05, 0.12, 0.26, 0.6, tyre); // chassis
        part(L / 2 - cab, L / 2, 0.15, 1.0, 0.74, color); // cabine
        part(L / 2 - 0.02, L / 2 + 0.012, 0.58, 0.9, 0.62, glass); // voorruit
        part(L / 2 - 0.45, L / 2 - 0.1, 0.6, 0.9, 0.752, glass); // zijruiten
        part(-L / 2, L / 2 - cab - 0.06, 0.26, 1.15, 0.8, rgb('#e6e8eb')); // oplegger
        part(-L / 2 + 0.12, L / 2 - cab - 0.18, 0.6, 0.74, 0.812, color); // streep
        wheels([L / 2 - 0.35, -L / 2 + 1.3, -L / 2 + 0.75, -L / 2 + 0.35], 0.66, 0.2);
        lights(L / 2, -L / 2, 0.22, 0.32, 0.27);
        break;
      }
      case 'van':
        part(-L / 2, L / 2, 0.1, 0.8, 0.7, color);
        part(L / 2 - 0.02, L / 2 + 0.012, 0.44, 0.72, 0.6, glass);
        part(L / 2 - 0.55, L / 2 - 0.12, 0.48, 0.72, 0.712, glass);
        wheels([L / 2 - 0.35, -L / 2 + 0.35], 0.62);
        lights(L / 2, -L / 2, 0.24, 0.34, 0.24);
        break;
      case 'sport': {
        const light = v.color === '#e5e7eb' || v.color === '#facc15' || v.color === '#84cc16';
        const stripe = rgb(light ? '#1b1d21' : '#f5f5f5');
        const dark = rgb('#1b1d21');
        part(-L / 2, L / 2, 0.08, 0.3, 0.66, color);
        part(-0.3, 0.28, 0.3, 0.45, 0.5, glass);
        part(-0.25, 0.18, 0.45, 0.48, 0.5, color); // dak
        for (const s of [-1, 1]) {
          part(0.28, L / 2 - 0.02, 0.3, 0.306, 0.06, stripe, s * 0.07);
          part(-L / 2 + 0.06, -0.08, 0.36, 0.4, 0.05, dark, s * 0.25); // spoilerpootjes
        }
        part(-L / 2, -L / 2 + 0.14, 0.4, 0.44, 0.66, dark); // spoiler
        wheels([L / 2 - 0.3, -L / 2 + 0.32], 0.6, 0.16);
        lights(L / 2, -L / 2, 0.16, 0.24, 0.22);
        break;
      }
      case 'dsi': {
        // Zwarte auto (DSI) met getinte ruiten en blauwe flitslichten in de grille
        const tint = rgb('#0d1117');
        part(-L / 2, L / 2, 0.1, 0.4, 0.66, color);
        part(-L / 2 + 0.28, L / 2 - 0.4, 0.4, 0.66, 0.58, tint);
        part(-L / 2 + 0.32, L / 2 - 0.46, 0.66, 0.7, 0.6, color);
        wheels([L / 2 - 0.32, -L / 2 + 0.32], 0.6);
        lights(L / 2, -L / 2, 0.22, 0.3, 0.22);
        const phase = Math.floor(this.time * 9 + v.x * 0.5) % 2;
        for (const [s, on] of [
          [-1, phase === 0],
          [1, phase === 1],
        ]) {
          part(L / 2 - 0.01, L / 2 + 0.02, 0.2, 0.3, 0.12, rgb(on ? '#dbeafe' : '#1e3a8a'), s * 0.12);
          if (on) this.glows.push([cx + f * (L / 2 + 0.05), 0.28, cz + s * 0.12]);
        }
        break;
      }
      case 'policemotor': {
        // Politiemotor met blauw licht
        wheels([0.3, -0.3], 0, 0.2);
        part(-0.38, 0.4, 0.14, 0.32, 0.18, color);
        part(-0.2, 0.1, 0.32, 0.64, 0.3, rgb('#1d4ed8')); // agent
        part(-0.1, 0.12, 0.62, 0.82, 0.22, rgb('#f5f5f5')); // helm
        const on = Math.floor(this.time * 9 + v.x * 0.5) % 2 === 0;
        part(0.3, 0.38, 0.4, 0.5, 0.12, rgb(on ? '#dbeafe' : '#1e3a8a'));
        if (on) this.glows.push([cx + f * 0.36, 0.5, cz]);
        break;
      }
      case 'tractor': {
        // Trekker: grote achterwielen, motorkap, cabine met ruiten, uitlaat
        const dark = rgb('#1b1d21');
        for (const s of [-1, 1]) {
          part(-L / 2 + 0.05, -L / 2 + 0.65, 0, 0.6, 0.18, tyre, s * 0.36);
          part(L / 2 - 0.42, L / 2 - 0.1, 0, 0.3, 0.12, tyre, s * 0.27);
        }
        part(-L / 2 + 0.55, L / 2, 0.22, 0.55, 0.36, color); // motorkap
        part(-L / 2, -L / 2 + 0.7, 0.25, 0.6, 0.5, color); // cabine onder
        part(-L / 2 + 0.04, -L / 2 + 0.66, 0.6, 0.98, 0.46, glass); // ruiten
        part(-L / 2 - 0.02, -L / 2 + 0.72, 0.98, 1.04, 0.54, dark); // dak
        part(0.2, 0.26, 0.55, 0.95, 0.06, dark, 0.1); // uitlaat
        lights(L / 2, -L / 2, 0.3, 0.38, 0.12);
        break;
      }
      case 'bike':
      case 'bakfiets': {
        // Fiets met fietser (en bij een bakfiets een bak met kind voorop)
        const frame = rgb('#2b2d33');
        const skin = rgb('#f1c27d');
        const bak = v.type === 'bakfiets';
        const front = bak ? L / 2 - 0.05 : L / 2 - 0.12;
        part(front - 0.14, front + 0.12, 0, 0.26, 0.03, tyre); // voorwiel
        part(-L / 2 + 0.02, -L / 2 + 0.28, 0, 0.26, 0.03, tyre); // achterwiel
        part(-L / 2 + 0.15, front, 0.22, 0.27, 0.04, frame);
        if (bak) {
          part(L / 2 - 0.45, L / 2 - 0.08, 0.2, 0.5, 0.42, rgb('#8b5a2b'));
          part(L / 2 - 0.32, L / 2 - 0.18, 0.5, 0.64, 0.14, skin); // kind
        }
        const rider = bak ? -L / 2 + 0.25 : -0.05;
        part(rider - 0.04, rider + 0.06, 0.25, 0.5, 0.16, rgb('#1d3557')); // benen
        part(rider - 0.08, rider + 0.12, 0.5, 0.82, 0.26, color); // jas
        part(rider - 0.02, rider + 0.12, 0.82, 0.98, 0.15, skin); // hoofd
        part(rider - 0.04, rider + 0.08, 0.95, 1.01, 0.16, rgb('#4a2c17')); // haar
        part(rider + 0.12, rider + 0.32, 0.62, 0.68, 0.06, color, 0.1); // armen
        part(rider + 0.12, rider + 0.32, 0.62, 0.68, 0.06, color, -0.1);
        break;
      }
      case 'scooter': {
        // Snorfiets met berijder en helm
        part(0.15, 0.33, 0, 0.18, 0.06, tyre);
        part(-0.33, -0.15, 0, 0.18, 0.06, tyre);
        part(-0.3, 0.3, 0.12, 0.3, 0.2, color);
        part(0.2, 0.26, 0.3, 0.62, 0.05, rgb('#2b2d33')); // stuur
        part(-0.18, 0.06, 0.3, 0.62, 0.26, rgb('#30343b'));
        part(-0.1, 0.1, 0.6, 0.8, 0.2, rgb('#e5e7eb')); // helm
        break;
      }
      case 'fire': {
        const white = rgb('#f5f5f5');
        const grey = rgb('#c3c8cf');
        part(-L / 2 + 0.05, L / 2 - 0.05, 0.12, 0.26, 0.6, tyre);
        part(L / 2 - 0.8, L / 2, 0.15, 0.95, 0.76, color); // cabine
        part(L / 2 - 0.02, L / 2 + 0.012, 0.55, 0.86, 0.64, glass);
        part(L / 2 - 0.42, L / 2 - 0.1, 0.58, 0.86, 0.772, glass);
        part(-L / 2, L / 2 - 0.84, 0.2, 0.9, 0.78, color); // opbouw
        part(-L / 2, L / 2, 0.42, 0.5, 0.792, white); // witte streep
        for (const s of [-1, 1]) part(-L / 2 + 0.1, L / 2 - 0.9, 0.9, 0.97, 0.05, grey, s * 0.2); // ladder
        for (let a = -L / 2 + 0.2; a < L / 2 - 0.95; a += 0.22) part(a, a + 0.04, 0.9, 0.95, 0.4, grey);
        wheels([L / 2 - 0.35, -L / 2 + 0.4], 0.66, 0.2);
        lights(L / 2, -L / 2, 0.22, 0.32, 0.27);
        this.lightBar(b, v, cx + f * (L / 2 - 0.45), 0.95, cz);
        break;
      }
      case 'ambulance': {
        const blue = rgb('#1f4fa0');
        part(-L / 2, L / 2, 0.1, 0.8, 0.7, color);
        part(L / 2 - 0.02, L / 2 + 0.012, 0.44, 0.72, 0.6, glass);
        part(L / 2 - 0.55, L / 2 - 0.12, 0.48, 0.72, 0.712, glass);
        // Blokjespatroon langs de zijkant
        for (let a = -L / 2 + 0.05, i = 0; a < L / 2 - 0.65; a += 0.18, i++) {
          if (i % 2 === 0) part(a, a + 0.18, 0.28, 0.42, 0.712, blue);
        }
        wheels([L / 2 - 0.35, -L / 2 + 0.35], 0.62);
        lights(L / 2, -L / 2, 0.24, 0.34, 0.24);
        this.lightBar(b, v, cx + f * (L / 2 - 0.35), 0.8, cz);
        break;
      }
      case 'police': {
        const blue = rgb('#1d4ed8');
        const orange = rgb('#f97316');
        part(-L / 2, L / 2, 0.1, 0.36, 0.62, color);
        part(-L / 2, L / 2, 0.2, 0.27, 0.632, blue);
        part(-L / 2, L / 2, 0.27, 0.3, 0.632, orange);
        part(-L / 2 + 0.3, L / 2 - 0.42, 0.36, 0.56, 0.54, glass);
        part(-L / 2 + 0.36, L / 2 - 0.5, 0.56, 0.6, 0.56, color);
        wheels([L / 2 - 0.32, -L / 2 + 0.32], 0.56);
        lights(L / 2, -L / 2, 0.2, 0.29, 0.21);
        this.lightBar(b, v, cx - f * 0.05, 0.6, cz);
        break;
      }
      case 'motor':
        wheels([0.27, -0.27], 0, 0.2);
        part(-0.36, 0.38, 0.14, 0.3, 0.16, rgb('#2a2d33'));
        part(-0.2, 0.08, 0.3, 0.62, 0.28, rgb('#30343b')); // berijder
        part(-0.1, 0.12, 0.6, 0.8, 0.2, color); // helm
        part(0.38, 0.41, 0.2, 0.28, 0.1, head);
        break;
      default:
        part(-L / 2, L / 2, 0.1, 0.36, 0.62, color);
        part(-L / 2 + 0.3, L / 2 - 0.42, 0.36, 0.56, 0.54, glass);
        part(-L / 2 + 0.36, L / 2 - 0.5, 0.56, 0.6, 0.56, color); // dak
        wheels([L / 2 - 0.32, -L / 2 + 0.32], 0.56);
        lights(L / 2, -L / 2, 0.2, 0.29, 0.21);
    }
  }

  /** Blauwe zwaailichten op het dak (om en om), met gloed. */
  lightBar(b, v, x, y, z) {
    const phase = Math.floor(this.time * 7 + v.x * 0.37) % 2;
    b.box(x, y, z, 0.16, 0.04, 0.5, rgb('#1b1d21'));
    for (const [side, on] of [
      [-1, phase === 0],
      [1, phase === 1],
    ]) {
      b.box(x, y + 0.04, z + side * 0.13, 0.14, 0.08, 0.2, rgb(on ? '#dbeafe' : '#1e3a8a'));
      if (on) this.glows.push([x, y + 0.12, z + side * 0.13]);
    }
  }

  updateParticles(dt, b) {
    if (!this.particles.length) return;
    for (const p of this.particles) {
      p.vy -= 9 * dt;
      p.vx *= 1 - 1.2 * dt;
      p.vz *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.02, p.y + p.vy * dt);
      p.z += p.vz * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      const s = Math.min(1, p.life * 2);
      b.box(p.x, p.y, p.z, 0.13 * s, 0.025, 0.07 * s, p.color, p.rot);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // --- Poppetjes ---------------------------------------------------------------------------

  /** Textuur van het poppetje (de 2D-tekening), gecachet per uiterlijk. */
  spriteTexture(p, hit) {
    const look = p.look || {};
    const face = p.face || null;
    const key = [look.base, look.shirt, look.pants, look.hat, look.hatColor, look.skin, look.hair, face ? face.length + face.slice(-24) : '', hit ? 1 : 0].join('|');
    let e = this.sprites.get(key);
    if (e && !e.dirty) return e.tex;
    if (!e) {
      e = { canvas: document.createElement('canvas'), tex: null, dirty: false };
      e.canvas.width = SPR_W;
      e.canvas.height = SPR_H;
      this.sprites.set(key, e);
      if (this.sprites.size > 16) {
        const [oldKey, old] = this.sprites.entries().next().value;
        if (old.tex) this.gl.deleteTexture(old.tex);
        this.sprites.delete(oldKey);
      }
    }
    e.dirty = false;
    const ctx = e.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SPR_W, SPR_H);
    ctx.setTransform(SPR_W, 0, 0, SPR_W, SPR_W / 2, SPR_TOP * SPR_W);
    drawCharacter(ctx, look, {
      shadow: false,
      hit,
      flat: 0,
      face,
      onFaceLoad: () => {
        e.dirty = true;
      },
    });
    e.tex = this.upload(e.canvas, e.tex);
    return e.tex;
  }

  hitInfo(game, p) {
    if (game.mode === 'duel') {
      if (!(p.hitTimer > 0)) return null;
      return { k: clamp01(1 - p.hitTimer / p.hitDuration), style: p.hitStyle, dir: p.hitDir };
    }
    if (game.state !== 'hit') return null;
    return { k: clamp01(1 - game.timer / (game.hitDuration || 1)), style: game.hitStyle, dir: game.hitDir };
  }

  drawPlayer(game, p, badge, overlays) {
    const t = easeOut(p.moveT);
    let x = lerp(p.fromCol, p.col, t) + 0.5;
    let z = lerp(p.fromRow, p.row, t) + 0.5;
    const hop = Math.sin(p.moveT * Math.PI) * 0.3;
    const hit = this.hitInfo(game, p);
    if (!hit && p.flash > 0 && Math.floor(p.flash * 12) % 2 === 1) return;

    const w = SPRITE_SCALE;
    const h = SPRITE_SCALE * SPR_HU;
    const below = SPRITE_SCALE * FEET_FROM_BOTTOM;
    const R = [1, 0, 0];
    let y = hop;
    const lean = this.pitch * LEAN_FACTOR;
    let angle = lean; // achterover leunen; π/2 = plat op de grond
    let rot = 0;
    let scale = 1;
    let widen = 1;

    if (hit && hit.style === 'spin' && !this.reducedMotion) {
      // Wegtollen in de rijrichting, met een boog omhoog
      const kk = Math.min(1, hit.k * 1.6);
      x += hit.dir * easeOut(kk) * 1.6;
      y = Math.sin(kk * Math.PI) * 1.0;
      rot = -hit.dir * kk * Math.PI * 3;
      scale = 1 - 0.3 * kk;
    } else if (hit) {
      // Plat als een pannenkoek, met een klein veertje na
      const k = hit.k;
      const fall = this.reducedMotion ? 1 : Math.min(1, k * 8);
      angle = lerp(lean, Math.PI / 2 - 0.02, fall);
      const bounce = this.reducedMotion ? 0 : 0.12 * Math.sin(k * 30) * (1 - k);
      widen = 1 + 0.35 * fall + bounce;
      y = 0.03;
      z += 0.6 * fall;
    }

    const U = [0, Math.cos(angle), -Math.sin(angle)];
    const sw = w * scale * widen;
    const sh = h * scale;
    // Middelpunt van het plaatje; de voeten staan op de grond
    const base = [x, y - below * Math.cos(angle) * scale, z + below * Math.sin(angle) * scale];
    const C = [base[0] + (U[0] * sh) / 2, base[1] + (U[1] * sh) / 2, base[2] + (U[2] * sh) / 2];
    const Rr = [R[0] * Math.cos(rot) + U[0] * Math.sin(rot), R[1] * Math.cos(rot) + U[1] * Math.sin(rot), R[2] * Math.cos(rot) + U[2] * Math.sin(rot)];
    const Ur = [-R[0] * Math.sin(rot) + U[0] * Math.cos(rot), -R[1] * Math.sin(rot) + U[1] * Math.cos(rot), -R[2] * Math.sin(rot) + U[2] * Math.cos(rot)];
    this.quads.add(C, Rr, Ur, sw, sh);
    this.drawQuads(this.tex, this.spriteTexture(p, !!hit), [1, 1, 1, 1]);

    // Boven het hoofd (naar de camera gericht)
    const headY = C[1] + (Ur[1] * sh) / 2;
    const headZ = C[2] + (Ur[2] * sh) / 2;
    const camU = [0, Math.cos(this.pitch), -Math.sin(this.pitch)];
    if (badge >= 0 && !hit) {
      overlays.push(() => {
        this.quads.add([C[0], headY + 0.2, headZ], R, camU, 0.36, 0.36);
        this.drawQuads(
          this.tex,
          this.canvasTex(`badge:${badge}`, 64, 64, (ctx) => {
            ctx.fillStyle = PLAYER_COLORS[badge];
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(32, 32, 27, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            this.text(ctx, String(badge + 1), 32, 34, 36, '#ffffff', 900);
          }),
          [1, 1, 1, 1],
        );
      });
    }
    if (hit) {
      const k = hit.k;
      const cx = hit.style === 'flat' ? x : C[0];
      const cy = hit.style === 'flat' ? 0.9 : C[1] + 0.5;
      const cz = hit.style === 'flat' ? z - 0.2 : C[2];
      overlays.push(() => {
        // Sterretjes die rondtollen
        for (let i = 0; i < 5; i++) {
          const a = game.time * 5 + (i * Math.PI * 2) / 5;
          this.quads.add([cx + Math.cos(a) * 0.5, cy + 0.1, cz + Math.sin(a) * 0.3], R, camU, 0.3, 0.3);
          this.drawQuads(
            this.tex,
            this.canvasTex(`star:${i % 2}`, 64, 64, (ctx) => this.text(ctx, '★', 32, 34, 54, i % 2 ? '#ffffff' : '#ffd400', 400)),
            [1, 1, 1, 1],
          );
        }
        // "AU!" springt in beeld en zweeft omhoog
        const pop = this.reducedMotion ? 1 : Math.min(1, k * 6);
        const size = 0.7 * (pop < 1 ? pop * 1.25 : 1 + 0.25 * Math.max(0, 1 - (k - 1 / 6) * 8));
        this.quads.add([cx, cy + 0.55 + k * 0.3, cz], R, camU, size * 2, size);
        this.drawQuads(
          this.tex,
          this.canvasTex('au', 160, 80, (ctx) => {
            this.text(ctx, 'AU!', 84, 44, 62, '#000000', 900);
            this.text(ctx, 'AU!', 80, 40, 62, '#ffd400', 900);
          }),
          [1, 1, 1, 1],
        );
      });
    }
  }
}
