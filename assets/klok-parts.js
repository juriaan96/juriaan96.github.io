/* Haardklokken: bibliotheek met SVG-onderdelen. Alle coördinaten in een kamer van 1000 x 900. */
(function () {
'use strict';
const K = window.KLOK = window.KLOK || {};
K.themes = K.themes || {};
K.order = K.order || [];

/* ---------- hulpjes ---------- */
function ctx(prefix) {
  const defs = {};
  return {
    p: prefix,
    def(name, markup) {
      const id = prefix + name;
      if (!defs[id]) defs[id] = markup.split('@@').join(id);
      return 'url(#' + id + ')';
    },
    defsMarkup() { return Object.keys(defs).map(k => defs[k]).join(''); }
  };
}
function stops(list) {
  return list.map(s => `<stop offset="${s[0]}" stop-color="${s[1]}"${s.length > 2 ? ` stop-opacity="${s[2]}"` : ''}/>`).join('');
}
function lin(S, name, list, dir) {
  const d = dir === 'h' ? 'x2="1" y2="0"' : dir === 'd' ? 'x2="1" y2="1"' : 'x2="0" y2="1"';
  return S.def(name, `<linearGradient id="@@" x1="0" y1="0" ${d}>${stops(list)}</linearGradient>`);
}
function rad(S, name, list, attrs) {
  return S.def(name, `<radialGradient id="@@" ${attrs || ''}>${stops(list)}</radialGradient>`);
}
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f1 = n => (Math.round(n * 10) / 10).toString();
const gold = S => lin(S, 'gold', [[0, '#f7de94'], [0.5, '#d9a93f'], [1, '#8f6420']]);
const silver = S => lin(S, 'silver', [[0, '#ffffff'], [0.5, '#c9d2dc'], [1, '#7d8896']]);
const drop = S => S.def('drop', '<filter id="@@" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000" flood-opacity=".5"/></filter>');
const halo = S => rad(S, 'halo', [[0, '#ffd27a', 0.55], [0.4, '#ff9f3a', 0.18], [1, '#ff9f3a', 0]]);
function star(cx, cy, R, r, n) {
  n = n || 5;
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI * i / n - Math.PI / 2, rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + f1(cx + Math.cos(a) * rr) + ' ' + f1(cy + Math.sin(a) * rr);
  }
  return d + 'Z';
}
/* boog van de slinger */
const C0 = [-10, 26], C1 = [500, 126], C2 = [1010, 26];
function curve(t) {
  const u = 1 - t;
  return {
    x: u * u * C0[0] + 2 * u * t * C1[0] + t * t * C2[0],
    y: u * u * C0[1] + 2 * u * t * C1[1] + t * t * C2[1],
    a: Math.atan2(2 * u * (C1[1] - C0[1]) + 2 * t * (C2[1] - C1[1]), 2 * u * (C1[0] - C0[0]) + 2 * t * (C2[0] - C1[0])) * 180 / Math.PI
  };
}

/* ---------- wanden en vloer ---------- */
const MOTIF = {
  diamond: c => `<path d="M30 4 46 30 30 56 14 30Z" fill="none" stroke="${c}" stroke-width="2"/>`,
  flake: c => `<path d="M30 17V43M18.7 23.5 41.3 36.5M18.7 36.5 41.3 23.5M30 17l-4 4M30 17l4 4M30 43l-4-4M30 43l4-4" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
  leaf: c => `<path d="M30 15C41 22 41 36 30 45C19 36 19 22 30 15ZM30 18V45" fill="none" stroke="${c}" stroke-width="1.8"/>`,
  flower: c => `<g fill="none" stroke="${c}" stroke-width="1.8"><circle cx="30" cy="22" r="5"/><circle cx="38" cy="30" r="5"/><circle cx="30" cy="38" r="5"/><circle cx="22" cy="30" r="5"/></g>`,
  egg: c => `<ellipse cx="30" cy="30" rx="8" ry="11" fill="none" stroke="${c}" stroke-width="1.8"/><path d="M22.5 29q3.75-4 7.5 0t7.5 0" fill="none" stroke="${c}" stroke-width="1.5"/>`,
  star: c => `<path d="${star(30, 30, 11, 4.5)}" fill="none" stroke="${c}" stroke-width="1.6"/>`
};
function wallPaper(S, o) {
  const m = (MOTIF[o.motif] || MOTIF.diamond)(o.line);
  const dots = [[0, 0], [60, 0], [0, 60], [60, 60]].map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="2.5" fill="${o.dot}" opacity=".2"/>`).join('');
  const pat = S.def('paper', `<pattern id="@@" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="${o.base}"/>${m}<circle cx="30" cy="30" r="2.6" fill="${o.dot}" opacity=".3"/>${dots}</pattern>`);
  return `<rect width="1000" height="900" fill="${pat}"/>`;
}
function wallLogs(S, o) {
  const g = lin(S, 'logband', [[0, o.light], [0.45, o.mid], [1, o.dark]]);
  let s = `<rect width="1000" height="900" fill="${o.dark}"/>`;
  const r = rng(7);
  for (let y = 0; y < 840; y += 46) {
    s += `<rect x="-10" y="${y + 2}" width="1020" height="42" rx="21" fill="${g}"/>`;
    for (let k = 0; k < 3; k++) {
      const x = Math.round(40 + r() * 920);
      s += `<ellipse cx="${x}" cy="${y + 22}" rx="${f1(5 + r() * 5)}" ry="${f1(3 + r() * 2)}" fill="${o.dark}" opacity=".55"/>`;
    }
    s += `<path d="M0 ${y + 13}H1000" stroke="#000" stroke-opacity=".12" stroke-width="2"/>`;
  }
  return s;
}
function wainscot(S, o) {
  return `<rect y="610" width="1000" height="222" fill="${o.base}"/>
  <rect x="34" y="642" width="118" height="160" rx="4" fill="none" stroke="${o.panel}" stroke-width="3"/>
  <rect x="848" y="642" width="118" height="160" rx="4" fill="none" stroke="${o.panel}" stroke-width="3"/>
  <rect y="602" width="1000" height="10" fill="${o.rail}"/>
  <rect y="611" width="1000" height="2" fill="${o.line || '#d9a93f'}" opacity=".35"/>`;
}
function floor(S, o) {
  const g = lin(S, 'floor', [[0, o.c1], [1, o.c2]]);
  return `<rect y="830" width="1000" height="70" fill="${g}"/>
  <g stroke="#140a05" stroke-width="2" opacity=".6" fill="none"><path d="M0 853H1000M0 877H1000"/><path d="M120 830V853M410 853V877M690 830V853M860 877V900M250 877V900M560 877V900M930 830V853M330 830V853"/></g>
  <path d="M0 831H1000" stroke="#000" stroke-opacity=".5" stroke-width="3"/>`;
}
function vignette(S, c) {
  const g = rad(S, 'vig', [[0.55, c, 0], [1, c, 0.8]], 'cx=".5" cy=".5" r=".72"');
  return `<rect width="1000" height="900" fill="${g}"/>`;
}

/* ---------- slingers ---------- */
function bunting(S, colors) {
  let s = `<path d="M-10 26Q500 126 1010 26" fill="none" stroke="#e8d2a2" stroke-width="2"/>`;
  const n = 22;
  for (let i = 0; i < n; i++) {
    const p = curve((i + 0.5) / n);
    s += `<path d="M-19 0L19 0L0 44Z" fill="${colors[i % colors.length]}" stroke="#000" stroke-opacity=".2" transform="translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(p.a)})"/>`;
  }
  return s;
}
function garland(S, o) {
  let s = `<path d="M-10 26Q500 126 1010 26" fill="none" stroke="#1d4a2b" stroke-width="16" stroke-linecap="round"/>
  <path d="M-10 26Q500 126 1010 26" fill="none" stroke="#2f7040" stroke-width="12" stroke-dasharray="3 5" stroke-linecap="round"/>`;
  const cols = o.lights || ['#ff5a4f', '#ffd25a', '#6fd3ff', '#9cff8a'];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const p = curve((i + 0.5) / n);
    s += `<circle class="twk" cx="${f1(p.x)}" cy="${f1(p.y + 9)}" r="5" fill="${cols[i % cols.length]}" style="animation-delay:-${(i * 0.37) % 2}s"/>`;
  }
  return s;
}
function leafGarland(S) {
  let s = `<path d="M-10 26Q500 126 1010 26" fill="none" stroke="#7a5a32" stroke-width="2.5"/>`;
  const cols = ['#c8552d', '#e39b2d', '#a33a22', '#d8b23a'];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const p = curve((i + 0.5) / n);
    const rot = p.a + (i % 2 ? 140 : 40);
    s += `<path d="M0 0C10 -6 22 -2 26 8C16 14 4 10 0 0Z" fill="${cols[i % cols.length]}" transform="translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(rot)})"/>`;
  }
  return s;
}

/* ---------- raam links met uitzicht ---------- */
function windowLeft(S, o) {
  const clip = S.def('winclip', '<clipPath id="@@"><path d="M34 420V209A59 59 0 0 1 152 209V420Z"/></clipPath>');
  const r = rng(o.seed || 3);
  let v = '';
  const V = o.view;
  if (V === 'snow' || V === 'xmas' || V === 'forest') {
    const sky = V === 'forest'
      ? lin(S, 'wsky', [[0, '#2b2350'], [0.6, '#7a4f6e'], [1, '#e39a6a']])
      : lin(S, 'wsky', [[0, '#0d1a33'], [1, '#2b4470']]);
    v += `<rect x="30" y="140" width="130" height="290" fill="${sky}"/>`;
    if (V !== 'forest') for (let i = 0; i < 12; i++) v += `<circle class="tw" cx="${f1(40 + r() * 105)}" cy="${f1(160 + r() * 110)}" r="${f1(0.8 + r() * 1.2)}" fill="#fff" style="animation-delay:-${f1(r() * 3)}s"/>`;
    if (V === 'xmas') v += `<circle cx="125" cy="190" r="13" fill="#f4efd8"/><circle cx="130" cy="186" r="12" fill="#2b4470" opacity=".9"/>`;
    const pine = (x, y, h, c) => `<path d="M${x} ${y - h}L${x - h * 0.32} ${y - h * 0.45}H${x - h * 0.16}L${x - h * 0.42} ${y}H${x + h * 0.42}L${x + h * 0.16} ${y - h * 0.45}H${x + h * 0.32}Z" fill="${c}"/>`;
    v += pine(58, 352, 70, '#16243a') + pine(98, 362, 95, '#1b2b44') + pine(140, 350, 64, '#16243a');
    if (V === 'forest') v += pine(78, 372, 50, '#223452') + pine(122, 374, 56, '#223452');
    v += `<path d="M30 360Q70 342 100 354T160 346V430H30Z" fill="#e8eef5"/>`;
    if (V === 'xmas') v += `<rect x="108" y="330" width="34" height="26" fill="#3a2a2a"/><path d="M104 332L125 314L146 332Z" fill="#e8eef5"/><rect x="116" y="338" width="8" height="8" fill="#ffd37a"/><rect x="128" y="338" width="8" height="8" fill="#ffd37a"/>`;
    for (let i = 0; i < 18; i++) v += `<circle class="fall" cx="${f1(36 + r() * 115)}" cy="150" r="${f1(1.4 + r() * 1.8)}" fill="#fff" style="animation-duration:${f1(5 + r() * 5)}s;animation-delay:-${f1(r() * 10)}s"/>`;
  } else if (V === 'blossom') {
    v += `<rect x="30" y="140" width="130" height="290" fill="${lin(S, 'wsky', [[0, '#7fa6d6'], [0.7, '#f2c9b8'], [1, '#f7dfb0']])}"/>`;
    v += `<path d="M30 370Q80 340 160 360V430H30Z" fill="#7fae5a"/><path d="M30 392Q90 372 160 386V430H30Z" fill="#5f9446"/>`;
    v += `<path d="M96 384C94 350 92 320 84 296M92 330C104 316 116 310 128 306M88 312C76 300 66 296 56 292" fill="none" stroke="#5a3b28" stroke-width="5" stroke-linecap="round"/>`;
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = r() * 42;
      v += `<circle cx="${f1(92 + Math.cos(a) * d * 1.2)}" cy="${f1(296 + Math.sin(a) * d * 0.75)}" r="${f1(3 + r() * 4)}" fill="${r() < 0.5 ? '#f6b8c8' : '#fbd7e1'}"/>`;
    }
    for (let i = 0; i < 12; i++) v += `<ellipse class="petal" cx="${f1(36 + r() * 115)}" cy="150" rx="2.6" ry="1.6" fill="#f6b8c8" style="animation-duration:${f1(7 + r() * 5)}s;animation-delay:-${f1(r() * 12)}s"/>`;
  } else if (V === 'rain') {
    v += `<rect x="30" y="140" width="130" height="290" fill="${lin(S, 'wsky', [[0, '#3c475e'], [1, '#8a7b80']])}"/>`;
    v += `<path d="M30 364Q74 340 160 356V430H30Z" fill="#4b5a3a"/><path d="M30 390Q94 374 160 384V430H30Z" fill="#3a4630"/>`;
    v += `<path d="M120 384V318M120 340L104 326M120 330L136 318" stroke="#2d2620" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < 26; i++) v += `<path class="rainl" d="M${f1(36 + r() * 120)} 150l-4 12" stroke="#c9d6e6" stroke-opacity=".7" stroke-width="1.4" style="animation-duration:${f1(0.6 + r() * 0.5)}s;animation-delay:-${f1(r() * 1.2)}s"/>`;
    const lc = ['#d2672e', '#e3a23a', '#b4442a'];
    for (let i = 0; i < 6; i++) v += `<path class="leaf" d="M${f1(40 + r() * 110)} 150c4-3 9-1 10 4c-4 3-8 2-10-4z" fill="${lc[i % 3]}" style="animation-duration:${f1(6 + r() * 4)}s;animation-delay:-${f1(r() * 10)}s"/>`;
  } else if (V === 'meadow') {
    v += `<rect x="30" y="140" width="130" height="290" fill="${lin(S, 'wsky', [[0, '#8fc3ec'], [1, '#fdf1c6']])}"/>`;
    v += `<circle cx="128" cy="196" r="16" fill="#ffe27a"/>`;
    v += `<path d="M30 352Q86 330 160 348V430H30Z" fill="#8cc265"/><path d="M30 380Q90 362 160 376V430H30Z" fill="#6eaa4c"/>`;
    const fc = ['#ffffff', '#ffd94a', '#f6a3c3', '#c9a3f6'];
    for (let i = 0; i < 22; i++) v += `<circle cx="${f1(36 + r() * 118)}" cy="${f1(362 + r() * 60)}" r="2.2" fill="${fc[i % 4]}"/>`;
    v += `<g transform="translate(70 360)"><ellipse rx="16" ry="11" fill="#fbf8f0"/><circle cx="-14" cy="-6" r="7" fill="#3a3330"/><path d="M-8 10v8M8 10v8" stroke="#3a3330" stroke-width="3"/></g>`;
  }
  return `<g clip-path="${clip}">${v}</g>
  <path d="M34 420V209A59 59 0 0 1 152 209V420Z" fill="none" stroke="${o.frame}" stroke-width="9"/>
  <path d="M93 150V420M34 300H152" stroke="${o.frame}" stroke-width="5"/>
  <rect x="24" y="416" width="138" height="12" rx="2" fill="${o.frame}"/>
  <path d="M34 420V209A59 59 0 0 1 152 209" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2" transform="translate(4 4)"/>`;
}

/* ---------- schoorstenen ---------- */
function fireplaceBrick(S, o) {
  o = o || {};
  const wood = lin(S, 'wood', o.woodStops || [[0, '#6a3a24'], [1, '#341a10']]);
  const woodS = lin(S, 'woodS', o.pillar || [[0, '#2e170f'], [0.5, '#5a301e'], [1, '#2e170f']], 'h');
  const brick = S.def('brick', `<pattern id="@@" width="64" height="32" patternUnits="userSpaceOnUse"><rect width="64" height="32" fill="${o.mortar || '#3a1912'}"/><rect x="1" y="1" width="62" height="14" rx="1.5" fill="${o.brick || '#8b3f2c'}"/><rect x="-31" y="17" width="62" height="14" rx="1.5" fill="${o.brick2 || '#7a3425'}"/><rect x="33" y="17" width="62" height="14" rx="1.5" fill="${o.brick2 || '#7a3425'}"/></pattern>`);
  const stone = lin(S, 'stone', o.stone || [[0, '#a39484'], [1, '#5c5047']]);
  const soot = rad(S, 'soot', [[0, '#2a120a'], [1, '#0b0504']], 'cx=".5" cy=".85" r=".8"');
  const sootUp = rad(S, 'sootUp', [[0, '#000', 0.6], [1, '#000', 0]]);
  const base = o.base || '#3a1e14', shelf2 = o.shelf2 || '#4a2618';
  return `<g filter="${drop(S)}">
    <rect x="190" y="450" width="620" height="350" fill="${base}"/>
    <rect x="190" y="450" width="64" height="350" fill="${woodS}"/>
    <rect x="746" y="450" width="64" height="350" fill="${woodS}"/>
    <path d="M206 476V790M222 476V790M238 476V790M762 476V790M778 476V790M794 476V790" stroke="#1d0d07" stroke-opacity="${o.flute || 0.55}" stroke-width="2"/>
    <rect x="254" y="456" width="492" height="46" fill="${wood}"/>
    <rect x="276" y="466" width="448" height="26" rx="4" fill="none" stroke="${o.trim || '#d9a93f'}" stroke-opacity=".45" stroke-width="1.5"/>
    <ellipse cx="500" cy="479" rx="22" ry="8" fill="${o.trimFill || gold(S)}"/>
    <rect x="254" y="502" width="492" height="298" fill="${brick}"/>
    <ellipse cx="500" cy="575" rx="230" ry="90" fill="${sootUp}"/>
    <path d="M322 800V638A178 86 0 0 1 678 638V800" fill="none" stroke="${stone}" stroke-width="16"/>
    <path d="M486 541h28l-4 26h-20z" fill="#a89888" stroke="#5c5047" stroke-width="1.5"/>
    <path d="M330 800V638A170 78 0 0 1 670 638V800Z" fill="${soot}"/>
    <path d="M362 800V662A138 58 0 0 1 638 662V800Z" fill="${brick}" opacity=".2"/>
    <path d="M196 454h32v10c0 14-10 24-22 30h-10z" fill="${shelf2}"/>
    <path d="M804 454h-32v10c0 14 10 24 22 30h10z" fill="${shelf2}"/>
    <rect x="176" y="440" width="648" height="16" fill="${shelf2}"/>
    <rect x="160" y="426" width="680" height="16" rx="3" fill="${o.shelf ? lin(S, 'shelf', o.shelf) : wood}"/>
    <path d="M162 427.5H838" stroke="#fff3d6" stroke-opacity=".35" stroke-width="1.5"/>
    <rect x="206" y="800" width="588" height="30" fill="${stone}"/>
    <path d="M206 801H794" stroke="#e4d6c4" stroke-opacity=".6" stroke-width="1.5"/>
  </g>`;
}
function fireplaceStone(S) {
  const pat = S.def('stones', `<pattern id="@@" width="96" height="64" patternUnits="userSpaceOnUse"><rect width="96" height="64" fill="#3a2f26"/><rect x="3" y="3" width="42" height="27" rx="12" fill="#9a8a76"/><rect x="49" y="5" width="44" height="23" rx="11" fill="#8a7a66"/><rect x="-22" y="35" width="44" height="26" rx="12" fill="#7d6d5c"/><rect x="26" y="33" width="40" height="28" rx="13" fill="#a39280"/><rect x="74" y="35" width="44" height="26" rx="12" fill="#7d6d5c"/><circle cx="18" cy="12" r="3" fill="#fff" opacity=".08"/><circle cx="62" cy="44" r="4" fill="#fff" opacity=".07"/></pattern>`);
  const beam = lin(S, 'beam', [[0, '#7b5232'], [0.5, '#5a3820'], [1, '#2f1c10']]);
  const soot = rad(S, 'soot', [[0, '#2a120a'], [1, '#0b0504']], 'cx=".5" cy=".85" r=".8"');
  const sootUp = rad(S, 'sootUp', [[0, '#000', 0.55], [1, '#000', 0]]);
  const shade = lin(S, 'chimShade', [[0, '#000', 0.35], [0.12, '#000', 0], [0.88, '#000', 0], [1, '#000', 0.35]], 'h');
  const stone = lin(S, 'stone', [[0, '#b0a291'], [1, '#62564b']]);
  return `<g filter="${drop(S)}">
    <rect x="200" y="0" width="600" height="800" fill="${pat}"/>
    <rect x="200" y="0" width="600" height="800" fill="${shade}"/>
    <ellipse cx="500" cy="590" rx="230" ry="90" fill="${sootUp}"/>
    <path d="M318 800V636A182 88 0 0 1 682 636V800" fill="none" stroke="${stone}" stroke-width="20"/>
    <path d="M330 800V638A170 78 0 0 1 670 638V800Z" fill="${soot}"/>
    <path d="M362 800V662A138 58 0 0 1 638 662V800Z" fill="${pat}" opacity=".18"/>
    <rect x="160" y="418" width="680" height="40" rx="8" fill="${beam}"/>
    <path d="M170 428C300 424 420 432 560 427S760 430 830 426M176 446C320 450 460 442 600 448S780 444 826 448" fill="none" stroke="#2a180c" stroke-opacity=".55" stroke-width="2"/>
    <ellipse cx="166" cy="438" rx="8" ry="19" fill="#a57c52"/><ellipse cx="166" cy="438" rx="4" ry="10" fill="none" stroke="#6b4a2e"/>
    <ellipse cx="834" cy="438" rx="8" ry="19" fill="#a57c52"/><ellipse cx="834" cy="438" rx="4" ry="10" fill="none" stroke="#6b4a2e"/>
    <rect x="196" y="800" width="608" height="30" fill="${stone}"/>
    <path d="M196 801H804" stroke="#e4d6c4" stroke-opacity=".5" stroke-width="1.5"/>
  </g>`;
}

/* ---------- klokken ---------- */
const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
function dial(cx, cy, r, o) {
  o = o || {};
  const k = r / 69, col = o.tick || '#3a1a10';
  let s = '';
  if (o.ticks !== false) {
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, major = i % 5 === 0, r1 = (major ? 56 : 61) * k, r2 = 65 * k, sn = Math.sin(a), cs = Math.cos(a);
      s += `<line x1="${f1(cx + sn * r1)}" y1="${f1(cy - cs * r1)}" x2="${f1(cx + sn * r2)}" y2="${f1(cy - cs * r2)}" stroke="${col}" stroke-width="${f1((major ? 2.2 : 1) * Math.max(0.8, k))}" stroke-linecap="round"/>`;
    }
  }
  if (o.dots) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, rr = 58 * k;
      s += `<circle cx="${f1(cx + Math.sin(a) * rr)}" cy="${f1(cy - Math.cos(a) * rr)}" r="${f1((i % 3 ? 2.2 : 4) * k)}" fill="${col}" opacity="${o.dotOpacity || 1}"/>`;
    }
  }
  if (o.numerals !== false && !o.dots) {
    for (let i = 0; i < 12; i++) {
      s += `<text x="${cx}" y="${f1(cy - 48 * k)}" transform="rotate(${i * 30} ${cx} ${cy})" text-anchor="middle" dominant-baseline="central" font-family="Cinzel, Georgia, serif" font-weight="600" font-size="${f1(10.5 * k)}" fill="${col}">${ROMAN[i]}</text>`;
    }
  }
  return s;
}
function hands(cx, cy, k, col, sec) {
  return `<g id="hh" transform="translate(${cx} ${cy})"><g transform="scale(${f1(k * 100) / 100})"><path d="M-3.5 8L-3 -20C-9 -23 -9 -32 0 -38C9 -32 9 -23 3 -20L3.5 8Z" fill="${col}"/></g></g>
  <g id="mh" transform="translate(${cx} ${cy})"><g transform="scale(${f1(k * 100) / 100})"><path d="M-2.4 10L-1.8 -44L0 -57L1.8 -44L2.4 10Z" fill="${col}"/></g></g>
  <g id="sh" transform="translate(${cx} ${cy})"><g transform="scale(${f1(k * 100) / 100})"><path d="M0 16V-60" stroke="${sec}" stroke-width="1.3"/><circle r="3.2" fill="${sec}"/><circle cy="-46" r="2.6" fill="none" stroke="${sec}" stroke-width="1.3"/></g></g>`;
}
function topper(S, kind, o) {
  const g = o.metal === 'silver' ? silver(S) : gold(S);
  if (kind === 'mitre') {
    const mitre = lin(S, 'mitre', [[0, '#d4343e'], [1, '#861520']], 'd');
    return `<circle cx="500" cy="34" r="6" fill="${g}"/>
      <path d="M432 152C428 104 462 66 500 36C538 66 572 104 568 152Z" fill="${mitre}"/>
      <path d="M432 152C428 104 462 66 500 36C538 66 572 104 568 152" fill="none" stroke="${g}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M494 70h12v16h16v12h-16v30h-12V98h-16V86h16z" fill="#f3d27a"/>`;
  }
  if (kind === 'star') {
    return `<circle cx="500" cy="92" r="62" fill="${halo(S)}"/><path d="${star(500, 92, 52, 22)}" fill="${g}" stroke="#8f6420" stroke-width="2" stroke-linejoin="round"/><path d="M486 140h28v14h-28z" fill="${g}"/>`;
  }
  if (kind === 'snowflake') {
    let arms = '';
    for (let i = 0; i < 6; i++) {
      const a = i * 60;
      arms += `<g transform="rotate(${a} 500 94)"><path d="M500 94V46M500 62l-12-10M500 62l12-10M500 78l-9-8M500 78l9-8"/></g>`;
    }
    return `<g stroke="${g}" stroke-width="6" stroke-linecap="round" fill="none">${arms}</g><circle cx="500" cy="94" r="8" fill="#ffffff"/><path d="M488 140h24v14h-24z" fill="${g}"/>`;
  }
  if (kind === 'bunny') {
    return `<g><ellipse cx="468" cy="100" rx="17" ry="56" transform="rotate(-12 468 100)" fill="#f7f2ea" stroke="#d8cfc2" stroke-width="2"/><ellipse cx="468" cy="104" rx="8" ry="42" transform="rotate(-12 468 104)" fill="#f4b6c6"/>
      <ellipse cx="532" cy="100" rx="17" ry="56" transform="rotate(12 532 100)" fill="#f7f2ea" stroke="#d8cfc2" stroke-width="2"/><ellipse cx="532" cy="104" rx="8" ry="42" transform="rotate(12 532 104)" fill="#f4b6c6"/>
      <path d="M476 150q24-16 48 0" fill="#f7f2ea"/></g>`;
  }
  if (kind === 'owl') {
    return `<g id="owl"><path d="M488 154l-4 6M512 154l4 6" stroke="#d9a93f" stroke-width="3" stroke-linecap="round"/>
      <path d="M460 70l10 24M540 70l-10 24" stroke="#5b3b22" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="500" cy="112" rx="44" ry="46" fill="#7a5233"/><ellipse cx="500" cy="124" rx="28" ry="30" fill="#c9a272"/>
      <path d="M484 118q4 4 8 0M500 126q4 4 8 0M490 136q4 4 8 0M508 138q4 4 8 0" fill="none" stroke="#8a6440" stroke-width="2"/>
      <path d="M456 112c-10 16-8 34 6 42M544 112c10 16 8 34-6 42" fill="none" stroke="#5b3b22" stroke-width="7" stroke-linecap="round"/>
      <circle cx="482" cy="96" r="15" fill="#f6ecd2"/><circle cx="518" cy="96" r="15" fill="#f6ecd2"/>
      <g class="blink"><circle cx="482" cy="96" r="7" fill="#1d1208"/><circle cx="518" cy="96" r="7" fill="#1d1208"/><circle cx="484" cy="93" r="2" fill="#fff"/><circle cx="520" cy="93" r="2" fill="#fff"/></g>
      <path d="M500 104l-6 6 6 8 6-8z" fill="#e3a23a"/></g>`;
  }
  if (kind === 'bird') {
    return `<g id="birdTop"><path d="M470 152c6-8 54-8 60 0" fill="#7a5233"/>
      <path d="M520 128l26-10-8 16z" fill="#3a5f8f"/><ellipse cx="502" cy="130" rx="28" ry="19" fill="#4a78b0"/><ellipse cx="496" cy="136" rx="16" ry="11" fill="#e7744a"/>
      <circle cx="482" cy="114" r="14" fill="#4a78b0"/><circle cx="477" cy="111" r="3" fill="#111"/><path d="M468 114l-12 3 12 4z" fill="#e3a23a"/>
      <path d="M504 120c10 -6 18 -2 22 4" fill="none" stroke="#2f4f7c" stroke-width="3"/><path d="M496 148v6M506 148v6" stroke="#e3a23a" stroke-width="2.5"/></g>`;
  }
  return '';
}
function clockMantel(S, o) {
  o = o || {};
  const g = o.metal === 'silver' ? silver(S) : gold(S);
  const body = lin(S, 'clockwood', o.wood || [[0, '#6a3a24'], [1, '#341a10']]);
  const face = rad(S, 'face', o.face || [[0, '#fff9ea'], [1, '#e6d0a1']], 'cx=".45" cy=".4" r=".7"');
  const glass = lin(S, 'glass', [[0, '#fff', 0.16], [0.5, '#fff', 0]], 'd');
  const bob = rad(S, 'bob', o.metal === 'silver' ? [[0, '#ffffff'], [0.5, '#c9d2dc'], [1, '#5d6876']] : [[0, '#fff1b8'], [0.5, '#d9a93f'], [1, '#7d5518']], 'cx=".35" cy=".35" r=".7"');
  const clip = S.def('win', '<clipPath id="@@"><rect x="466" y="322" width="68" height="86" rx="10"/></clipPath>');
  return `<g filter="${drop(S)}">
    ${topper(S, o.topper, o)}
    <rect x="426" y="140" width="148" height="16" rx="3" fill="${g}"/>
    <rect x="414" y="154" width="172" height="266" rx="16" fill="${body}" stroke="#1f0f09" stroke-width="2"/>
    <rect x="424" y="164" width="152" height="246" rx="10" fill="none" stroke="${o.metal === 'silver' ? '#dfe6ee' : '#d9a93f'}" stroke-opacity=".55" stroke-width="1.5"/>
    <circle cx="500" cy="236" r="76" fill="${g}"/>
    <circle cx="500" cy="236" r="71" fill="${o.metal === 'silver' ? '#6f7a88' : '#8f6420'}"/>
    <circle cx="500" cy="236" r="69" fill="${face}"/>
    <circle cx="500" cy="236" r="38" fill="none" stroke="#b08a52" stroke-opacity=".45"/>
    ${dial(500, 236, 69, { tick: o.tick })}
    ${hands(500, 236, 1, o.hand || '#2a140c', '#b3202a')}
    <circle cx="500" cy="236" r="4.5" fill="${g}" stroke="#5a3a12" stroke-width="1"/>
    <path d="M446 204A60 60 0 0 1 532 182" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="5" stroke-linecap="round"/>
    <rect x="466" y="322" width="68" height="86" rx="10" fill="#140904"/>
    <g clip-path="${clip}"><g id="pend"><path d="M500 314V390" stroke="${o.metal === 'silver' ? '#c9d2dc' : '#d9a93f'}" stroke-width="2.5"/><circle cx="500" cy="390" r="13" fill="${bob}"/></g></g>
    <rect x="466" y="322" width="68" height="86" rx="10" fill="${glass}" stroke="${g}" stroke-width="3"/>
    <ellipse cx="436" cy="423" rx="13" ry="4" fill="${g}"/>
    <ellipse cx="564" cy="423" rx="13" ry="4" fill="${g}"/>
  </g>`;
}
function clockCuckoo(S) {
  const wood = lin(S, 'cwood', [[0, '#7a4a2a'], [1, '#3a2010']]);
  const roof = lin(S, 'croof', [[0, '#4a2c18'], [1, '#26160b']]);
  const face = rad(S, 'face', [[0, '#fbf3df'], [1, '#e2cfa6']], 'cx=".45" cy=".4" r=".7"');
  const cone = lin(S, 'cone', [[0, '#8a5a2e'], [1, '#4a2c14']]);
  let shingles = '';
  for (let i = 0; i < 6; i++) shingles += `<path d="M${410 + i * 32} 150q16 10 32 0" fill="none" stroke="#1a0e06" stroke-opacity=".5" stroke-width="2"/>`;
  const coneShape = (x, y) => `<g><path d="M${x} ${y - 22}C${x + 12} ${y - 14} ${x + 12} ${y + 10} ${x} ${y + 22}C${x - 12} ${y + 10} ${x - 12} ${y - 14} ${x} ${y - 22}Z" fill="${cone}"/><path d="M${x - 8} ${y - 8}l8 5 8-5M${x - 9} ${y + 2}l9 5 9-5M${x - 7} ${y + 12}l7 4 7-4" fill="none" stroke="#2a180a" stroke-width="1.5"/></g>`;
  return `<g filter="${drop(S)}">
    <path d="M458 330V372M542 330V362" stroke="#c9a14a" stroke-width="2" stroke-dasharray="3 2"/>
    ${coneShape(458, 392)}${coneShape(542, 382)}
    <g id="pend"><path d="M500 324V384" stroke="#6b4426" stroke-width="3"/><path d="M500 372c14 4 18 18 0 32c-18-14-14-28 0-32z" fill="#5f9446" stroke="#3a6a2c" stroke-width="1.5"/></g>
    <rect x="420" y="138" width="160" height="192" rx="6" fill="${wood}" stroke="#1f0f09" stroke-width="2"/>
    <path d="M420 316h160v14h-160z" fill="#2e1a0c"/>
    <path d="M388 156L500 64L612 156Z" fill="${roof}" stroke="#1a0e06" stroke-width="2"/>${shingles}
    <path d="M500 46c-12 6-14 18-6 26c-14-2-22 8-18 18c10-4 16-8 24-18c8 10 14 14 24 18c4-10-4-20-18-18c8-8 6-20-6-26z" fill="#4f7a3a"/>
    <circle cx="500" cy="54" r="5" fill="#b3202a"/>
    <rect x="484" y="160" width="32" height="30" rx="14" fill="#1a0e06"/>
    <g id="cuckoo" class="cuckoo"><path d="M520 170l18-6-6 12z" fill="#5a3a22"/><ellipse cx="502" cy="172" rx="18" ry="11" fill="#8a5a32"/><circle cx="490" cy="166" r="9" fill="#8a5a32"/><circle cx="487" cy="164" r="2" fill="#111"/><path d="M481 166l-10 3 10 3z" fill="#e3a23a"/></g>
    <path d="M484 190a16 14 0 0 1 32 0" fill="none" stroke="#c9a14a" stroke-width="2"/>
    <circle cx="500" cy="252" r="56" fill="#c9a14a"/><circle cx="500" cy="252" r="52" fill="${face}"/>
    ${dial(500, 252, 52, { tick: '#3a2010' })}
    ${hands(500, 252, 0.75, '#2a140c', '#2a140c')}
    <circle cx="500" cy="252" r="3.5" fill="#c9a14a"/>
    <path d="M430 300c10-10 20-10 30 0M540 300c10-10 20-10 30 0" fill="none" stroke="#2a180a" stroke-width="3"/>
    <path d="M428 198c8 0 12 12 4 16M572 198c-8 0-12 12-4 16" fill="none" stroke="#5f9446" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}
function clockMoon(S) {
  const face = rad(S, 'moonface', [[0, '#fffdf0'], [0.7, '#f1e7c4'], [1, '#d8c99a']], 'cx=".42" cy=".38" r=".7"');
  const glow = rad(S, 'moonglow', [[0, '#fff6d0', 0.45], [0.5, '#fff6d0', 0.12], [1, '#fff6d0', 0]]);
  return `<circle cx="500" cy="210" r="190" fill="${glow}"/>
    <circle cx="500" cy="210" r="92" fill="${face}"/>
    <g fill="#c9b98a" opacity=".45"><circle cx="462" cy="180" r="14"/><circle cx="536" cy="250" r="18"/><circle cx="472" cy="252" r="9"/><circle cx="542" cy="172" r="8"/><circle cx="506" cy="140" r="6"/></g>
    ${dial(500, 210, 85, { tick: '#5a5070', ticks: false, dots: true, dotOpacity: 0.7 })}
    ${hands(500, 210, 1.22, '#2a2f55', '#c8553d')}
    <circle cx="500" cy="210" r="5" fill="#2a2f55"/>`;
}

/* ---------- kleine voorwerpen ---------- */
function candle(S, i, x, base, h, col) {
  const wax = lin(S, 'wax' + (col || ''), col === 'red' ? [[0, '#8e1520'], [0.45, '#d4343e'], [1, '#7d1219']] : col === 'pastel' ? [[0, '#e9c9d8'], [0.45, '#fbe5ef'], [1, '#cfa9bb']] : [[0, '#e9d8b4'], [0.45, '#fbf1dc'], [1, '#cdb98f']]);
  const fl = lin(S, 'flameG', [[0, '#ff8a1e'], [0.45, '#ffd25a'], [1, '#fff6d8']]);
  const top = base - h;
  return `<g id="cf${i}"><circle class="halo" cx="${x}" cy="${top - 18}" r="64" fill="${halo(S)}"/></g>
  <rect x="${x - 10}" y="${top}" width="20" height="${h - 4}" rx="3" fill="${wax}"/>
  <path d="M${x - 4} ${top}c0 6 2 10 0 16c3-2 4-8 4-16z" fill="#fff" opacity=".35"/>
  <path d="M${x} ${top - 4}V${top + 2}" stroke="#2a1a10" stroke-width="1.6"/>
  <g id="cf${i}b"><path class="flame${i % 2 ? ' b' : ''}" d="M${x} ${top + 1}C${x - 8} ${top - 5} ${x - 7} ${top - 15} ${x} ${top - 27}C${x + 7} ${top - 15} ${x + 8} ${top - 5} ${x} ${top + 1}Z" fill="${fl}"/><ellipse cx="${x}" cy="${top - 4}" rx="2" ry="3.5" fill="#fff" opacity=".8"/></g>
  <ellipse cx="${x}" cy="${base - 3}" rx="20" ry="5" fill="${gold(S)}"/>`;
}
function chocLetter(S, x, letter) {
  const choc = lin(S, 'choc', [[0, '#83502e'], [1, '#3b1d0e']], 'd');
  const mask = S.def('biteMask', '<mask id="@@" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="900"><rect width="1000" height="900" fill="#fff"/><g id="bites" fill="#000"></g></mask>');
  return `<g id="letter" mask="${mask}">
    <text x="${x + 5}" y="429" text-anchor="middle" font-family="'Archivo Black','Arial Black',Impact,sans-serif" font-size="112" fill="#241006">${letter}</text>
    <text x="${x}" y="425" text-anchor="middle" font-family="'Archivo Black','Arial Black',Impact,sans-serif" font-size="112" fill="${choc}" stroke="#a46a40" stroke-opacity=".5" stroke-width="1">${letter}</text></g>`;
}
function presents(S, id, x, y, c1, c2) {
  c1 = c1 || '#b3202a'; c2 = c2 || '#f3e6c8';
  return `<g id="${id}"><g filter="${drop(S)}">
    <rect x="${x}" y="${y + 42}" width="92" height="54" rx="3" fill="${c1}"/>
    <g fill="#f3d27a" opacity=".45"><circle cx="${x + 12}" cy="${y + 54}" r="3"/><circle cx="${x + 28}" cy="${y + 84}" r="3"/><circle cx="${x + 70}" cy="${y + 52}" r="3"/><circle cx="${x + 82}" cy="${y + 84}" r="3"/></g>
    <rect x="${x + 40}" y="${y + 42}" width="12" height="54" fill="${gold(S)}"/>
    <rect x="${x}" y="${y + 63}" width="92" height="10" fill="${gold(S)}"/>
    <rect x="${x + 18}" y="${y}" width="58" height="42" rx="3" fill="${c2}"/>
    <rect x="${x + 42}" y="${y}" width="10" height="42" fill="${c1}"/>
    <rect x="${x + 18}" y="${y + 16}" width="58" height="8" fill="${c1}"/>
    <path d="M${x + 47} ${y + 1}c-14-14-28-8-20 2c6 6 13 2 20-2zM${x + 47} ${y + 1}c14-14 28-8 20 2c-6 6-13 2-20-2z" fill="${c1}" stroke="#000" stroke-opacity=".25" stroke-width="1"/>
  </g></g>`;
}
function staff(S) {
  return `<g fill="none" stroke-linecap="round">
    <path d="M880 886L850 360" stroke="#000" stroke-opacity=".25" stroke-width="10"/>
    <path d="M872 884L842 356" stroke="#6b4a14" stroke-width="12"/>
    <path d="M872 884L842 356" stroke="#d9a93f" stroke-width="8"/>
    <path d="M868 878L840 362" stroke="#f7de94" stroke-width="2" stroke-opacity=".7"/>
    <path d="M842 356C836 286 902 262 916 316C924 346 894 358 880 338C872 326 884 312 896 320" stroke="#6b4a14" stroke-width="12"/>
    <path d="M842 356C836 286 902 262 916 316C924 346 894 358 880 338C872 326 884 312 896 320" stroke="#d9a93f" stroke-width="8"/>
  </g><ellipse cx="843" cy="374" rx="10" ry="7" fill="${gold(S)}"/>`;
}
function stocking(S, x, col, cuff) {
  return `<g><path d="M${x} 440v8" stroke="${gold(S)}" stroke-width="3"/>
    <path d="M${x - 14} 462H${x + 14}V522Q${x + 14} 548 ${x - 12} 548H${x - 30}Q${x - 44} 548 ${x - 44} 536Q${x - 44} 524 ${x - 28} 522Q${x - 14} 520 ${x - 14} 508Z" fill="${col}" stroke="#000" stroke-opacity=".2"/>
    <path d="M${x - 44} 536Q${x - 44} 548 ${x - 30} 548H${x - 22}V522H${x - 28}Q${x - 44} 524 ${x - 44} 536Z" fill="${cuff}" opacity=".9"/>
    <rect x="${x - 17}" y="446" width="34" height="18" rx="4" fill="${cuff}"/></g>`;
}
function xmasTree(S) {
  const g1 = lin(S, 'tree', [[0, '#2f7a45'], [1, '#164a2a']]);
  const tier = (top, bot, w) => `<path d="M900 ${top}L${900 - w} ${bot}Q900 ${bot + 18} ${900 + w} ${bot}Z" fill="${g1}"/>`;
  const r = rng(11);
  let balls = '';
  const bc = ['#d4343e', '#e3b44a', '#dfe6ee', '#3a78c8'];
  const pts = [[870, 470], [930, 500], [852, 560], [905, 580], [950, 600], [840, 660], [890, 690], [945, 700], [870, 760], [925, 770], [822, 752], [975, 770]];
  pts.forEach((p, i) => { balls += `<circle cx="${p[0]}" cy="${p[1]}" r="${8 + (i % 3) * 2}" fill="${bc[i % 4]}" stroke="#000" stroke-opacity=".2"/><circle cx="${p[0] - 3}" cy="${p[1] - 3}" r="2.5" fill="#fff" opacity=".6"/>`; });
  let lights = '';
  for (let i = 0; i < 26; i++) {
    const t = i / 25, y = 420 + t * 360, w = 20 + t * 80, x = 900 + Math.sin(t * 18) * w * 0.85;
    lights += `<circle class="twk tl" cx="${f1(x)}" cy="${f1(y)}" r="3.6" fill="${['#fff2a8', '#ffd25a', '#ffb07a'][i % 3]}" style="animation-delay:-${f1(r() * 2)}s"/>`;
  }
  return `<g filter="${drop(S)}">
    <rect x="890" y="790" width="20" height="30" fill="#5a3820"/>
    <path d="M866 818h68l-8 50h-52z" fill="#a8212a"/><path d="M862 812h76v10h-76z" fill="#c9a14a"/>
    ${tier(560, 790, 98)}${tier(470, 670, 78)}${tier(390, 560, 56)}
    <g id="treeLights">${lights}</g>${balls}
    <circle cx="900" cy="372" r="34" fill="${halo(S)}"/><path d="${star(900, 372, 24, 10)}" fill="${gold(S)}" stroke="#8f6420" stroke-width="1.5"/>
  </g>`;
}
function mug(S, x, base, col) {
  return `<g><path class="steam" d="M${x - 6} ${base - 52}c-8-10 6-16-2-28M${x + 6} ${base - 50}c-8-10 6-16-2-28" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
    <path d="M${x + 18} ${base - 34}c14 0 14 22 0 22" fill="none" stroke="${col}" stroke-width="5"/>
    <path d="M${x - 20} ${base - 44}h40l-4 42h-32z" fill="${col}"/>
    <ellipse cx="${x}" cy="${base - 44}" rx="20" ry="5" fill="#5a3218"/><ellipse cx="${x - 4}" cy="${base - 45}" rx="9" ry="2.5" fill="#fff" opacity=".85"/>
    <path d="M${x - 14} ${base - 30}h28" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-dasharray="4 4"/></g>`;
}
function pinecones(S, x, base) {
  const c = lin(S, 'cone', [[0, '#8a5a2e'], [1, '#4a2c14']]);
  const one = (cx, cy, rot) => `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="11" ry="18" fill="${c}"/><path d="M${cx - 8} ${cy - 8}l8 5 8-5M${cx - 9} ${cy + 2}l9 5 9-5M${cx - 7} ${cy + 11}l7 4 7-4" fill="none" stroke="#2a180a" stroke-width="1.5"/></g>`;
  return one(x, base - 12, 80) + one(x + 30, base - 14, -70) + one(x + 14, base - 26, 10);
}
function sled(S) {
  return `<g filter="${drop(S)}" transform="rotate(-8 900 720)">
    <path d="M858 880V600C858 570 836 562 828 578" fill="none" stroke="#b3202a" stroke-width="9" stroke-linecap="round"/>
    <path d="M942 880V600C942 570 920 562 912 578" fill="none" stroke="#b3202a" stroke-width="9" stroke-linecap="round"/>
    ${[630, 680, 730, 780, 830].map(y => `<rect x="850" y="${y}" width="100" height="22" rx="4" fill="#a8743f" stroke="#6b4426"/>`).join('')}
    <path d="M870 650c20 20 40 20 60 0" fill="none" stroke="#f3e6c8" stroke-width="3"/>
  </g>`;
}
function logBasket(S, x, y) {
  return `<g filter="${drop(S)}">
    <ellipse cx="${x + 18}" cy="${y + 4}" rx="16" ry="14" fill="#a57c52"/><ellipse cx="${x + 18}" cy="${y + 4}" rx="9" ry="8" fill="none" stroke="#6b4a2e" stroke-width="2"/>
    <ellipse cx="${x + 52}" cy="${y - 2}" rx="16" ry="14" fill="#b88a5a"/><ellipse cx="${x + 52}" cy="${y - 2}" rx="9" ry="8" fill="none" stroke="#6b4a2e" stroke-width="2"/>
    <ellipse cx="${x + 86}" cy="${y + 6}" rx="16" ry="14" fill="#9a6e45"/><ellipse cx="${x + 86}" cy="${y + 6}" rx="9" ry="8" fill="none" stroke="#6b4a2e" stroke-width="2"/>
    <path d="M${x - 6} ${y + 8}h116l-10 50h-96z" fill="#8a5a2e"/>
    <path d="M${x - 2} ${y + 22}h108M${x + 1} ${y + 36}h102M${x + 4} ${y + 50}h96" stroke="#5a3a1c" stroke-width="3"/>
  </g>`;
}
function lantern(S, x, base) {
  return `<g id="lantern"><circle id="lanternGlow" cx="${x}" cy="${base - 40}" r="70" fill="${halo(S)}"/>
    <path d="M${x} ${base - 92}a10 10 0 1 1 0.1 0" fill="none" stroke="#1f1a16" stroke-width="3"/>
    <path d="M${x - 18} ${base - 74}h36l-6 -10h-24z" fill="#2a2420"/>
    <rect x="${x - 16}" y="${base - 74}" width="32" height="56" rx="3" fill="#ffd27a" opacity=".55" id="lanternGlass"/>
    <path id="lanternFlame" class="flame" d="M${x} ${base - 30}C${x - 6} ${base - 34} ${x - 5} ${base - 42} ${x} ${base - 52}C${x + 5} ${base - 42} ${x + 6} ${base - 34} ${x} ${base - 30}Z" fill="#ffb347"/>
    <path d="M${x - 16} ${base - 74}V${base - 18}M${x + 16} ${base - 74}V${base - 18}M${x} ${base - 74}V${base - 18}" stroke="#2a2420" stroke-width="2.5"/>
    <rect x="${x - 20}" y="${base - 18}" width="40" height="14" rx="3" fill="#2a2420"/></g>`;
}
function snowshoes(S) {
  const one = (cx, cy, rot) => `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="30" ry="84" fill="none" stroke="#8a5a2e" stroke-width="7"/>
    <g stroke="#d8c9a8" stroke-width="1.5" opacity=".8">${[-60, -40, -20, 0, 20, 40, 60].map(d => `<path d="M${cx - 28} ${cy + d}H${cx + 28}"/>`).join('')}${[-16, 0, 16].map(d => `<path d="M${cx + d} ${cy - 78}V${cy + 78}"/>`).join('')}</g>
    <path d="M${cx} ${cy + 84}v40" stroke="#8a5a2e" stroke-width="7" stroke-linecap="round"/><rect x="${cx - 14}" y="${cy - 10}" width="28" height="16" rx="4" fill="#5a3a22"/></g>`;
  return `<g filter="${drop(S)}">${one(872, 680, -10)}${one(936, 690, 8)}</g>`;
}
function boots(S, x, y, col) {
  const one = dx => `<path d="M${x + dx} ${y}h30v52c0 6 4 8 10 10c10 3 14 8 14 14v4h-56z" fill="${col}" stroke="#000" stroke-opacity=".25"/><rect x="${x + dx - 2}" y="${y}" width="34" height="10" rx="3" fill="#000" opacity=".18"/>`;
  return `<g filter="${drop(S)}">${one(0)}${one(52)}</g>`;
}
function tulips(S, x, base, cols) {
  const vase = lin(S, 'vase', [[0, '#a9d4e8', 0.75], [1, '#5f9fbf', 0.85]], 'h');
  let st = '';
  const heads = [[-20, -88], [-4, -104], [14, -92], [28, -76], [-30, -70]];
  heads.forEach((h, i) => {
    st += `<path d="M${x} ${base - 40}Q${x + h[0] * 0.4} ${base - 70} ${x + h[0]} ${base + h[1] + 10}" fill="none" stroke="#4f8a3a" stroke-width="3"/>`;
    st += `<path d="M${x + h[0] - 9} ${base + h[1]}q0 18 9 20q9-2 9-20l-4 6-5-8-5 8z" fill="${cols[i % cols.length]}"/>`;
  });
  st += `<path d="M${x - 6} ${base - 40}q-20-24-26-40q14 10 26 34" fill="#5f9a46"/>`;
  return `<g id="tulips">${st}<path d="M${x - 18} ${base - 48}h36c4 14 6 30 2 44h-40c-4-14-2-30 2-44z" fill="${vase}" stroke="#fff" stroke-opacity=".35"/></g>`;
}
function birdhouse(S, x, base) {
  return `<g id="birdhouse"><path d="M${x - 2} ${base}V${base - 10}" stroke="#5a3a22" stroke-width="4"/>
    <rect x="${x - 24}" y="${base - 62}" width="48" height="52" fill="#d8b47a" stroke="#6b4426"/>
    <path d="M${x - 32} ${base - 60}L${x} ${base - 88}L${x + 32} ${base - 60}Z" fill="#b3202a"/>
    <circle cx="${x}" cy="${base - 40}" r="9" fill="#2a1a0e"/>
    <g id="peek" style="display:none"><circle cx="${x}" cy="${base - 41}" r="8" fill="#e7744a"/><circle cx="${x - 3}" cy="${base - 43}" r="1.6" fill="#111"/><path d="M${x - 8} ${base - 41}l-5 2 5 2z" fill="#e3a23a"/></g>
    <path d="M${x} ${base - 26}v8" stroke="#6b4426" stroke-width="3"/></g>`;
}
function blossomVase(S, eggs) {
  const r = rng(eggs ? 21 : 19);
  let br = `<path d="M906 760C900 680 880 600 852 520M904 700C930 640 950 600 972 560M890 640C866 610 846 600 822 600M884 600C900 560 912 520 930 470" fill="none" stroke="#5a3b28" stroke-width="5" stroke-linecap="round"/>`;
  const tips = [[852, 520], [972, 560], [822, 600], [930, 470], [880, 580], [940, 610], [866, 548], [915, 520]];
  if (eggs) {
    const ec = ['#f6a3c3', '#ffd94a', '#8fd0f0', '#b9e48a', '#c9a3f6', '#ffb07a'];
    tips.forEach((p, i) => { br += `<path d="M${p[0]} ${p[1]}v12" stroke="#c9a14a" stroke-width="1.2"/><ellipse cx="${p[0]}" cy="${p[1] + 24}" rx="9" ry="12" fill="${ec[i % 6]}" stroke="#000" stroke-opacity=".2"/><path d="M${p[0] - 9} ${p[1] + 22}q4.5-5 9 0t9 0" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>`; });
    for (let i = 0; i < 26; i++) { const p = tips[i % tips.length]; br += `<ellipse cx="${f1(p[0] + (r() - 0.5) * 40)}" cy="${f1(p[1] + 30 + (r() - 0.5) * 70)}" rx="5" ry="3" fill="#7fb85a" transform="rotate(${f1(r() * 180)} ${p[0]} ${p[1]})"/>`; }
  } else {
    for (let i = 0; i < 60; i++) { const p = tips[i % tips.length]; br += `<circle cx="${f1(p[0] + (r() - 0.5) * 44)}" cy="${f1(p[1] + 10 + (r() - 0.5) * 60)}" r="${f1(4 + r() * 4)}" fill="${r() < 0.5 ? '#f6b8c8' : '#fbe1e8'}"/>`; }
  }
  return `<g filter="${drop(S)}" id="branch">${br}<path d="M876 760h60c8 30 8 70-4 100h-52c-12-30-12-70-4-100z" fill="${eggs ? '#e9d8f4' : '#f3efe6'}" stroke="#000" stroke-opacity=".2"/><path d="M880 790h52" stroke="#f6a3c3" stroke-width="5"/></g>`;
}
function eggBasket(S, x, base) {
  const ec = ['#f6a3c3', '#ffd94a', '#8fd0f0', '#b9e48a', '#c9a3f6'];
  let eggs = '';
  [[-26, -46], [-8, -52], [12, -48], [30, -42], [0, -40]].forEach((p, i) => { eggs += `<ellipse cx="${x + p[0]}" cy="${base + p[1]}" rx="11" ry="14" fill="${ec[i]}" stroke="#000" stroke-opacity=".2"/>`; });
  return `<g id="basket"><path d="M${x - 44} ${base - 40}a44 44 0 0 1 88 0" fill="none" stroke="#a5743a" stroke-width="6"/>${eggs}
    <path d="M${x - 48} ${base - 40}h96l-10 36h-76z" fill="#b8843f"/><path d="M${x - 44} ${base - 28}h88M${x - 40} ${base - 16}h80" stroke="#7a5228" stroke-width="3"/>
    <path d="M${x - 48} ${base - 40}h96" stroke="#7fb85a" stroke-width="5" stroke-dasharray="3 3"/></g>`;
}
function chocBunny(S, x, base) {
  const choc = lin(S, 'chocB', [[0, '#8a5530'], [1, '#4a2614']], 'd');
  return `<g id="bunny"><g id="bunnyEars"><ellipse cx="${x - 10}" cy="${base - 104}" rx="8" ry="24" fill="${choc}" transform="rotate(-10 ${x - 10} ${base - 104})"/><ellipse cx="${x + 10}" cy="${base - 104}" rx="8" ry="24" fill="${choc}" transform="rotate(10 ${x + 10} ${base - 104})"/></g>
    <ellipse cx="${x}" cy="${base - 40}" rx="30" ry="36" fill="${choc}"/><circle cx="${x}" cy="${base - 80}" r="20" fill="${choc}"/>
    <circle cx="${x - 7}" cy="${base - 84}" r="2.5" fill="#2a1408"/><circle cx="${x + 7}" cy="${base - 84}" r="2.5" fill="#2a1408"/>
    <path d="M${x - 30} ${base - 22}h60v18h-60z" fill="${gold(S)}"/><path d="M${x} ${base - 22}v18" stroke="#b3202a" stroke-width="4"/>
    <path d="M${x - 14} ${base - 64}q14 10 28 0" fill="none" stroke="#b3202a" stroke-width="4"/></g>`;
}
function pumpkin(S, id, x, base, w, face) {
  const p = lin(S, 'pump', [[0, '#f0a03c'], [1, '#c4621c']]);
  const h = w * 0.72;
  return `<g id="${id}"><path d="M${x} ${base - h}c-2-12 2-18 8-22" fill="none" stroke="#5a7a2a" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="${x - w * 0.28}" cy="${base - h / 2}" rx="${w * 0.32}" ry="${h / 2}" fill="${p}"/>
    <ellipse cx="${x + w * 0.28}" cy="${base - h / 2}" rx="${w * 0.32}" ry="${h / 2}" fill="${p}"/>
    <ellipse cx="${x}" cy="${base - h / 2}" rx="${w * 0.3}" ry="${h / 2}" fill="${p}" stroke="#a8501a" stroke-opacity=".5"/>
    ${face ? `<g id="${id}Face" style="display:none"><path d="M${x - w * 0.22} ${base - h * 0.62}l${w * 0.1} -${h * 0.14} ${w * 0.1} ${h * 0.14}zM${x + w * 0.02} ${base - h * 0.62}l${w * 0.1} -${h * 0.14} ${w * 0.1} ${h * 0.14}zM${x - w * 0.24} ${base - h * 0.36}q${w * 0.24} ${h * 0.24} ${w * 0.48} 0l-${w * 0.08} ${h * 0.06}-${w * 0.08}-${h * 0.06}-${w * 0.08} ${h * 0.06}-${w * 0.08}-${h * 0.06}-${w * 0.08} ${h * 0.06}z" fill="#ffd25a"/></g>` : ''}</g>`;
}
function umbrella(S) {
  return `<g id="umbClosed" filter="${drop(S)}"><path d="M880 880L852 420" stroke="#2a2420" stroke-width="5"/>
      <path d="M852 420C838 520 846 640 870 760L884 760C890 640 876 520 852 420Z" fill="#2c4f7c"/><path d="M856 470L872 750" stroke="#1d3656" stroke-width="2"/>
      <path d="M880 880c0 14 -16 14 -16 2" fill="none" stroke="#7a5a32" stroke-width="7" stroke-linecap="round"/></g>
    <g id="umbOpen" style="display:none" filter="${drop(S)}"><path d="M900 880L900 640" stroke="#2a2420" stroke-width="5"/>
      <path d="M790 660Q900 520 1010 660Q992 646 973 660Q955 646 937 660Q918 646 900 660Q882 646 863 660Q845 646 827 660Q808 646 790 660Z" fill="#2c4f7c"/>
      <path d="M900 552V660M863 660Q880 590 900 552M937 660Q920 590 900 552M827 660Q852 600 900 552M973 660Q948 600 900 552" fill="none" stroke="#1d3656" stroke-width="2"/>
      <path d="M900 880c0 14-16 14-16 2" fill="none" stroke="#7a5a32" stroke-width="7" stroke-linecap="round"/>
      ${[0, 1, 2, 3, 4].map(i => `<circle class="drip" cx="${808 + i * 46}" cy="666" r="2.5" fill="#bcd4ee" style="animation-delay:-${i * 0.4}s"/>`).join('')}</g>`;
}
function appleBowl(S, x, base) {
  return `<g><circle cx="${x - 18}" cy="${base - 30}" r="14" fill="#b8302a"/><circle cx="${x + 4}" cy="${base - 34}" r="14" fill="#d84a2a"/><circle cx="${x + 24}" cy="${base - 28}" r="13" fill="#9ab43a"/>
    <path d="M${x + 4} ${base - 48}v-6" stroke="#4a2c14" stroke-width="2.5"/><path d="M${x - 40} ${base - 26}h80q-6 24-40 24t-40-24z" fill="#7a5232"/></g>`;
}
function scatteredLeaves(S, seed, x0, x1, y0, y1, n) {
  const r = rng(seed), cols = ['#c8552d', '#e39b2d', '#a33a22', '#d8b23a'];
  let s = '';
  for (let i = 0; i < n; i++) s += `<path d="M0 0C8 -5 18 -2 21 7C13 11 3 8 0 0Z" fill="${cols[i % 4]}" transform="translate(${f1(x0 + r() * (x1 - x0))} ${f1(y0 + r() * (y1 - y0))}) rotate(${f1(r() * 360)})"/>`;
  return s;
}
function pepernoten(S, pts) {
  const one = `<g><ellipse cy="5" rx="7" ry="2.2" fill="#000" opacity=".3"/><circle r="7" fill="#8e4f25"/><circle cx="-2" cy="-2.5" r="3" fill="#c98a52" opacity=".7"/></g>`;
  return pts.map(p => `<g transform="translate(${p[0]} ${p[1]})">${one}</g>`).join('');
}
function klomp() {
  return `<g transform="translate(222 834) scale(.9)">
    <ellipse cx="84" cy="60" rx="82" ry="7" fill="#000" opacity=".45"/>
    <path d="M8 22C6 42 14 58 32 60L132 60C152 60 162 50 160 40C158 30 142 25 122 23L74 18C66 10 46 6 26 8C14 10 9 14 8 22Z" fill="#e0b04a" stroke="#8a5a18" stroke-width="1.5"/>
    <path d="M30 28C60 25 100 29 142 33" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>
    <path d="M62 50C92 46 122 41 152 39" fill="none" stroke="#b3202a" stroke-width="3" stroke-linecap="round"/>
    <g fill="#b3202a"><circle cx="104" cy="35" r="3"/><circle cx="110" cy="33" r="3"/><circle cx="107" cy="39" r="3"/></g>
    <ellipse cx="40" cy="14" rx="24" ry="5.5" fill="#3b200c"/>
    <g id="carrot"><path d="M34 16L64 -38Q70 -45 77 -36L43 18Z" fill="#ef8424"/><path d="M48 -6l6 3M56 -20l6 3M42 6l5 3" stroke="#c35f12" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M68 -40C62 -56 58 -62 52 -64M70 -41C70 -58 72 -64 76 -68M73 -40C80 -54 86 -58 92 -58" fill="none" stroke="#4f8a3a" stroke-width="3" stroke-linecap="round"/></g>
    <g id="gift" style="display:none"><rect x="24" y="-14" width="30" height="26" rx="2" fill="#b3202a"/><rect x="36" y="-14" width="6" height="26" fill="#f3d27a"/><rect x="24" y="-4" width="30" height="5" fill="#f3d27a"/>
      <ellipse cx="34" cy="-17" rx="6" ry="3.5" fill="#f3d27a"/><ellipse cx="44" cy="-17" rx="6" ry="3.5" fill="#f3d27a"/><circle cx="58" cy="6" r="7" fill="#d9a93f" stroke="#8f6420"/></g>
    <path d="M16 15A24 5.5 0 0 0 64 15" fill="none" stroke="#e5bd62" stroke-width="3"/></g>`;
}
function hiddenEgg(id, x, y, col, rot) {
  return `<g id="${id}" transform="translate(${x} ${y}) rotate(${rot || 0})"><ellipse rx="9" ry="12" fill="${col}" stroke="#000" stroke-opacity=".25"/><path d="M-9 -1q4.5-5 9 0t9 0" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2"/><circle cx="-3" cy="-5" r="2" fill="#fff" opacity=".6"/></g>`;
}

/* ---------- kampvuur (zomer) ---------- */
function campScene(S) {
  const sky = lin(S, 'csky', [[0, '#0b1030'], [0.45, '#22285a'], [0.75, '#6a3f6e'], [1, '#d07a4e']]);
  const sea = lin(S, 'csea', [[0, '#3a3f6e'], [1, '#141a3a']]);
  const sand = lin(S, 'csand', [[0, '#8a6a4a'], [1, '#3a2a1c']]);
  const r = rng(5);
  let stars = '';
  for (let i = 0; i < 70; i++) {
    const x = r() * 1000, y = r() * 420;
    if (Math.hypot(x - 500, y - 210) < 130) continue;
    stars += `<circle class="tw" cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.7 + r() * 1.6)}" fill="#fff" style="animation-delay:-${f1(r() * 3)}s"/>`;
  }
  let grass = '';
  for (let i = 0; i < 40; i++) { const x = r() * 1000, y = 560 + r() * 30; grass += `<path d="M${f1(x)} ${f1(y)}q${f1(-6 + r() * 12)} -24 ${f1(-10 + r() * 20)} -34" fill="none" stroke="#1d2a24" stroke-width="2"/>`; }
  let ff = '';
  for (let i = 0; i < 14; i++) ff += `<circle class="ff" cx="${f1(r() * 1000)}" cy="${f1(500 + r() * 150)}" r="2.2" fill="#e8ff8a" style="animation-delay:-${f1(r() * 4)}s;animation-duration:${f1(3 + r() * 3)}s"/>`;
  return `<rect width="1000" height="560" fill="${sky}"/>${stars}
    <path d="M0 470H1000V560H0Z" fill="${sea}"/>
    <g fill="#fff6d0" opacity=".5">${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${470 + (i % 2) * 14 - i * 3}" y="${478 + i * 13}" width="${46 - i * 5}" height="3" rx="1.5"/>`).join('')}</g>
    <path d="M0 540Q160 500 330 530T680 520T1000 532V610H0Z" fill="#2a2a3a"/>
    ${grass}
    <rect y="580" width="1000" height="320" fill="${sand}"/>
    <path d="M0 586Q250 572 500 584T1000 580" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="3"/>
    <g id="tent" filter="${drop(S)}"><path d="M70 780L190 560L310 780Z" fill="#c8553d"/><path d="M190 560L240 780H310Z" fill="#9a3a2a"/>
      <path d="M170 780L190 640L214 780Z" fill="#2a1410"/><path id="tentGlow" d="M176 780L190 680L206 780Z" fill="#ffcf7a" opacity=".35"/>
      <path d="M190 560L150 520M190 560L232 522M70 780L40 800M310 780L340 800" stroke="#d8c9a8" stroke-width="2"/>
      <text id="zzz" x="230" y="620" font-family="Fraunces, Georgia, serif" font-size="26" fill="#fff" opacity="0">z z z</text></g>
    ${ff}`;
}
function campFront(S) {
  const stone = (x, y, w, h) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="#6b625a" stroke="#2e2924" stroke-width="2"/><ellipse cx="${x - w * 0.25}" cy="${y - h * 0.35}" rx="${w * 0.4}" ry="${h * 0.3}" fill="#8a8178" opacity=".7"/>`;
  let ring = '';
  [[372, 800, 24, 15], [410, 812, 26, 15], [452, 818, 26, 14], [496, 820, 26, 14], [540, 818, 26, 14], [584, 812, 26, 15], [624, 800, 24, 15]].forEach(s => { ring += stone(s[0], s[1], s[2], s[3]); });
  const log = lin(S, 'seat', [[0, '#7a5232'], [1, '#3a2414']]);
  return `<g filter="${drop(S)}">${ring}</g>
    <g filter="${drop(S)}"><rect x="700" y="770" width="230" height="44" rx="22" fill="${log}"/><ellipse cx="930" cy="792" rx="12" ry="22" fill="#b88a5a"/><ellipse cx="930" cy="792" rx="6" ry="12" fill="none" stroke="#6b4a2e" stroke-width="2"/></g>
    <g id="mallowStick"><path d="M770 760L560 640" stroke="#7a5a32" stroke-width="4" stroke-linecap="round"/><rect id="mallow" x="548" y="626" width="22" height="18" rx="6" fill="#fbf6ee" transform="rotate(30 559 635)"/></g>
    <g filter="${drop(S)}"><path d="M730 760c-6-30 10-60 40-70c30 10 40 40 34 70z" fill="#b8843f"/><circle cx="768" cy="726" r="11" fill="#2a1a0e"/><path d="M770 690L812 600" stroke="#5a3a22" stroke-width="7"/><path d="M806 600l14-12 8 8-14 12z" fill="#2a1a0e"/></g>`;
}

K.parts = { ctx, lin, rad, rng, f1, gold, silver, drop, halo, star, curve, wallPaper, wallLogs, wainscot, floor, vignette, bunting, garland, leafGarland, windowLeft, fireplaceBrick, fireplaceStone, dial, hands, clockMantel, clockCuckoo, clockMoon, candle, chocLetter, presents, staff, stocking, xmasTree, mug, pinecones, sled, logBasket, lantern, snowshoes, boots, tulips, birdhouse, blossomVase, eggBasket, chocBunny, pumpkin, umbrella, appleBowl, scatteredLeaves, pepernoten, klomp, hiddenEgg, campScene, campFront };
})();
