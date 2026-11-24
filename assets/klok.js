/* Haardklokken: de motor. Bouwt de pagina, laat klok en vuur lopen, telt af en regelt de easter eggs. */
(function () {
'use strict';
const K = window.KLOK = window.KLOK || {};
const R = Math.random;
const DAY = 864e5;
const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const pad = n => ('0' + n).slice(-2);
const $ = id => document.getElementById(id);
function report(e) { if (window.__skErr && window.__skErr.length < 8) window.__skErr.push('JS: ' + (e && e.message ? e.message : e)); }

/* ---------- datums ---------- */
const fmt = o => new Intl.DateTimeFormat('nl-NL', o);
const F = {
  date: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  long: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  wd: fmt({ weekday: 'long' }),
  dm: fmt({ day: 'numeric', month: 'long' })
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const heard = K.heard = (msg, name) => name ? msg + '\nHoor je dat? Dat is ' + name + '!' : msg;
const ymd = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function daysBetween(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY); }
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
/* begin van de seizoenen (Meeus, hoofdstuk 27) */
const SEAS_TERMS = [[485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226], [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074]];
function seasonStart(year, k) {
  const Y = (year - 2000) / 1000;
  const J0 = [
    2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y * Y * Y - 0.00057 * Y * Y * Y * Y,
    2451716.56767 + 365241.62603 * Y + 0.00325 * Y * Y + 0.00888 * Y * Y * Y - 0.00030 * Y * Y * Y * Y,
    2451810.21715 + 365242.01767 * Y - 0.11575 * Y * Y + 0.00337 * Y * Y * Y + 0.00078 * Y * Y * Y * Y,
    2451900.05952 + 365242.74049 * Y - 0.06223 * Y * Y - 0.00823 * Y * Y * Y + 0.00032 * Y * Y * Y * Y
  ][k];
  const T = (J0 - 2451545) / 36525, rd = Math.PI / 180;
  const W = (35999.373 * T - 2.47) * rd;
  const dl = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
  let S = 0;
  SEAS_TERMS.forEach(t => { S += t[0] * Math.cos((t[1] + t[2] * T) * rd); });
  const jde = J0 + 0.00001 * S / dl;
  return new Date((jde - 2440587.5) * DAY - 69000);
}
const SEASON_NAMES = ['lente', 'zomer', 'herfst', 'winter'];
function nextSeason(now, k) {
  let d = dayStart(seasonStart(now.getFullYear(), k));
  if (daysBetween(now, d) < 0) d = dayStart(seasonStart(now.getFullYear() + 1, k));
  return d;
}
K.date = { easter, seasonStart, nextSeason, daysBetween, addDays, dayStart, F, cap };

/* ---------- schoolvakanties regio Noord (Rijksoverheid) ---------- */
const VAK = [
  ['herfstvakantie', '2026-10-10', '2026-10-18'], ['kerstvakantie', '2026-12-19', '2027-01-03'], ['voorjaarsvakantie', '2027-02-20', '2027-02-28'], ['meivakantie', '2027-04-24', '2027-05-02'], ['zomervakantie', '2027-07-10', '2027-08-22'],
  ['herfstvakantie', '2027-10-16', '2027-10-24'], ['kerstvakantie', '2027-12-25', '2028-01-09'], ['voorjaarsvakantie', '2028-02-19', '2028-02-27'], ['meivakantie', '2028-04-29', '2028-05-07'], ['zomervakantie', '2028-07-15', '2028-08-27'],
  ['herfstvakantie', '2028-10-14', '2028-10-22'], ['kerstvakantie', '2028-12-23', '2029-01-07'], ['voorjaarsvakantie', '2029-02-17', '2029-02-25'], ['meivakantie', '2029-04-28', '2029-05-06'], ['zomervakantie', '2029-07-21', '2029-09-02'],
  ['herfstvakantie', '2029-10-20', '2029-10-28'], ['kerstvakantie', '2029-12-22', '2030-01-06'], ['voorjaarsvakantie', '2030-02-16', '2030-02-24'], ['meivakantie', '2030-04-27', '2030-05-05'], ['zomervakantie', '2030-07-20', '2030-09-01']
].map(v => ({ name: v[0], start: ymd(v[1]), end: ymd(v[2]) }));
function vacationState(now) {
  for (const v of VAK) {
    if (now >= v.start && now < addDays(v.end, 1)) return { cur: v };
    if (now < v.start) return { next: v };
  }
  return {};
}
K.vacationState = vacationState;

/* ---------- welke klok hoort bij vandaag ---------- */
K.pick = function (now) {
  const m = now.getMonth(), d = now.getDate(), day = dayStart(now), e = easter(now.getFullYear());
  if (m === 8 || m === 9) return 'herfst';
  if (m === 10 || (m === 11 && d <= 5)) return 'sinterklaas';
  if (m === 11 && d <= 26) return 'kerst';
  if (m === 11 || m === 0) return 'winter';
  if (m === 1) return 'blokhut';
  if (day >= addDays(e, -14) && day <= addDays(e, 1)) return 'pasen';
  if (m >= 2 && m <= 4) return 'voorjaar';
  return 'zomer';
};

/* ---------- veelgebruikte aftelteksten ---------- */
K.ev = {
  season(now, k, verb) {
    const d = nextSeason(now, k), n = daysBetween(now, d), name = SEASON_NAMES[k];
    if (n === 0) return { main: `Vandaag begint de ${name}!`, sub: k === 1 ? 'De langste dag van het jaar.' : k === 3 ? 'De kortste dag: vanaf nu worden de dagen weer langer.' : 'Dag en nacht zijn nu ongeveer even lang.' };
    return { main: `Nog ${n} ${n === 1 ? 'dag' : 'dagen'} tot de ${name}`, sub: `De ${name} begint op ${F.long.format(d)}.` + (verb ? ' ' + verb : '') };
  },
  nights(n, what) { return n === 1 ? `Nog 1 nachtje slapen tot ${what}` : `Nog ${n} nachtjes slapen tot ${what}`; }
};

/* ---------- hit-fabrieken voor de thema's ---------- */
K.H = {
  candle(i, box, anchor) {
    return { box, label: 'Kaars', egg: 'kaars', act(api) { const on = api.toggleCandle(i); api.say(on ? 'Weer aan. Gezellig!' : 'Pfoe! Uitgeblazen.', anchor[0], anchor[1], 2500, anchor[2]); } };
  },
  fire(box) {
    let pokes = [];
    return {
      box: box || [330, 560, 340, 205], label: 'Vuur', egg: 'vuur', act(api) {
        const ms = Date.now();
        pokes = pokes.filter(t => ms - t < 1800); pokes.push(ms);
        api.sparks(api.level() > 0.05 ? 14 : 3);
        if (pokes.length >= 3) {
          pokes = []; api.egg('vuur');
          if (api.level() > 0.05) { api.boost(4500); api.sparks(40); api.say('Pook, pook! Het vuur laait flink op.', 300, 540, 3500, 'l'); }
          else { api.relight(12000); api.say('Pook, pook... er gloeide nog één sintel! Heel even vuur.', 300, 540, 4000, 'l'); }
        } else if (pokes.length === 1 && api.level() <= 0.05) api.say('Het vuur is uit.', 300, 540, 2500, 'l');
        return true;
      }
    };
  },
  clock(box, msg, anchor) {
    return { box, label: 'Klok', egg: 'klok', act(api) { if (api.spin()) { api.say(heard(msg || 'Hé, de klok loopt even op hol!', api.chime('famous')), anchor[0], anchor[1], 4500, anchor[2]); } } };
  },
  rain(box, label, kind, egg, firstMsg, rainMsg, anchor) {
    let taps = [];
    return {
      box, label, egg, rainKind: kind, rainMsg, anchor, act(api) {
        const ms = Date.now();
        taps = taps.filter(t => ms - t < 3000); taps.push(ms);
        if (taps.length >= 5) { taps = []; api.egg(egg); api.rain(kind); api.say(rainMsg, anchor[0], anchor[1], 3000, anchor[2]); }
        else if (taps.length === 1) api.say(firstMsg, anchor[0], anchor[1], 2500, anchor[2]);
        return true;
      }
    };
  },
  say(box, label, egg, msgs, anchor, ms, fn) {
    let i = -1;
    return { box, label, egg, act(api) { i = (i + 1) % msgs.length; if (fn) fn(api, i); api.say(msgs[i], anchor[0], anchor[1], ms || 4000, anchor[2]); } };
  }
};

/* ---------- radiozenders (openbare livestreams) ---------- */
const STW = 'https://playerservices.streamtheworld.com/api/livestream-redirect/';
K.stations = [
  ['NPO Radio 2', 'https://icecast.omroep.nl/radio2-bb-mp3'],
  ['NPO 3FM', 'https://icecast.omroep.nl/3fm-bb-mp3'],
  ['NPO Radio 5', 'https://icecast.omroep.nl/radio5-bb-mp3'],
  ['Qmusic', 'https://stream.qmusic.nl/qmusic/mp3'],
  ['JOE', 'https://stream.joe.nl/joe/mp3'],
  ['Radio 538', STW + 'RADIO538.mp3'],
  ['Sky Radio', STW + 'SKYRADIO.mp3'],
  ['Radio 10', STW + 'RADIO10.mp3'],
  ['Radio Veronica', STW + 'VERONICA.mp3'],
  ['100% NL', 'https://stream.100p.nl/100pctnl.mp3'],
  ['SLAM!', 'https://stream.slam.nl/slam_mp3'],
  ['Metal Express Radio', 'https://s39.myradiostream.com/11590/listen.mp3']
];

/* ---------- pagina bouwen ---------- */
function buildPage(T, auto, base) {
  const P = K.parts, S = P.ctx('k-');
  const back = T.back(S, P), front = T.front ? T.front(S, P) : '';
  const vb = 'viewBox="0 0 1000 900" aria-hidden="true" focusable="false"';
  const root = document.documentElement;
  Object.keys(T.colors).forEach(k => root.style.setProperty('--' + k, T.colors[k]));
  const hits = T.hits.map((h, i) => `<button class="hit" type="button" data-hit="${i}" aria-label="${h.label}" style="left:${h.box[0] / 10}%;top:${h.box[1] / 9}%;width:${h.box[2] / 10}%;height:${h.box[3] / 9}%"></button>`).join('');
  const app = document.createElement('main');
  app.className = 'app'; app.id = 'app';
  app.innerHTML = `
<header class="top"><h1>${T.name}</h1><p id="tagline">${T.tagline}</p></header>
<div class="stage" id="stage">
  <svg ${vb}><defs>${S.defsMarkup()}</defs>${back}</svg>
  <canvas id="fire" class="${T.camp ? 'open' : ''}" aria-hidden="true"></canvas>
  <svg ${vb}>${front}${(T.walkers || []).map((w, i) => `<g id="walker${i}" class="walker" style="display:none">${w.draw(P)}</g>`).join('')}</svg>
  <div class="glow" aria-hidden="true"></div><div class="night" aria-hidden="true"></div>
  ${hits}
  <p class="bubble" id="bubble" role="status" aria-live="polite"></p>
</div>
<div class="side">
  <section class="panel" aria-label="Tijd">
    <div><time class="time" id="dtime">00:00:00</time><div class="date" id="ddate"></div></div>
    <div><p class="count" id="count"></p><p class="sub" id="count2"></p></div>
    <div class="ctl">
      <button class="sound" id="sound" type="button">${T.soundName || 'Haardgeluid'}: uit</button>
      <div class="radio"><label class="vh" for="station">Radiozender</label><select class="station" id="station">${K.stations.map((st, i) => `<option value="${i}">${st[0]}</option>`).join('')}</select><button class="sound" id="radio" type="button">Radio: uit</button></div>
    </div>
  </section>
  <section class="xmas" aria-label="Aftellen tot de vakantie">
    <div><h2 id="xmTitle">Aftellen tot de vakantie</h2><p class="sub" id="xmSub"></p><p class="sub" id="xmSchool"></p></div>
    <div class="xm-row" id="xmRow">
      <div><span class="xm-n" id="xmD">0</span><span class="xm-l">dagen</span></div>
      <div><span class="xm-n" id="xmH">00</span><span class="xm-l">uur</span></div>
      <div><span class="xm-n" id="xmM">00</span><span class="xm-l">minuten</span></div>
      <div><span class="xm-n" id="xmS">00</span><span class="xm-l">seconden</span></div>
    </div>
  </section>
  <p class="hint">${T.hint}</p>
  <footer><span id="eggs" class="eggs" hidden></span>${auto ? '<span class="autonote">Automatische klok: wisselt vanzelf mee met het seizoen.</span>' : ''}</footer>
</div>`;
  document.body.insertBefore(app, document.body.firstChild);
  const backBtn = document.createElement('a');
  backBtn.className = 'back'; backBtn.href = base || './';
  backBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Alle klokken';
  document.body.insertBefore(backBtn, document.body.firstChild);
  fullscreenButton();
  const rain = document.createElement('canvas');
  rain.id = 'rain'; rain.setAttribute('aria-hidden', 'true');
  document.body.appendChild(rain);
}

/* ---------- volledig scherm ---------- */
function fullscreenButton() {
  const de = document.documentElement;
  if (!(de.requestFullscreen || de.webkitRequestFullscreen)) return; /* bv. iPhone: geen Fullscreen-API */
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const quiet = p => { if (p && p.catch) p.catch(() => {}); };
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'back fs';
  function upd() {
    const on = isFs();
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="' +
      (on ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5') +
      '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      (on ? 'Scherm verkleinen' : 'Volledig scherm');
    btn.setAttribute('aria-label', on ? 'Volledig scherm verlaten' : 'Volledig scherm');
  }
  btn.addEventListener('click', e => {
    try {
      if (isFs()) quiet(document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
      else quiet(de.requestFullscreen ? de.requestFullscreen() : de.webkitRequestFullscreen());
    } catch (err) { /* niet toegestaan: niets doen */ }
    if (e.detail > 0) btn.blur();
  });
  document.addEventListener('fullscreenchange', upd);
  document.addEventListener('webkitfullscreenchange', upd);
  upd();
  document.body.insertBefore(btn, document.body.firstChild);
}

/* ---------- de klok laten lopen ---------- */
function run(T, auto, base) {
  buildPage(T, auto, base);
  const app = $('app'), root = document.documentElement, stage = $('stage');

  /* schalen op liggende schermen */
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const fitMode = w / h >= 1.2 && w >= 700 && h >= 500;
    root.classList.toggle('fit', fitMode);
    const sc = Math.min(w / 1600, h / 1000);
    const tr = fitMode ? 'scale(' + sc.toFixed(4) + ')' : '';
    app.style.webkitTransform = tr; app.style.transform = tr;
    /* titel onder de knoppen bovenin houden (knoppen: 14px + 44px hoog, plus 12px lucht) */
    if (fitMode) root.style.setProperty('--topPad', Math.max(26, Math.ceil((70 - (h - 1000 * sc) / 2) / sc - 24)) + 'px');
  }
  layout();

  /* tekstballon */
  const bubble = $('bubble');
  let bubT = null;
  function say(msg, x, y, ms, side) {
    const right = side ? side === 'r' : x > 550;
    bubble.textContent = msg;
    bubble.classList.toggle('r', right);
    if (right) { bubble.style.left = 'auto'; bubble.style.right = (100 - x / 10) + '%'; }
    else { bubble.style.right = 'auto'; bubble.style.left = (x / 10) + '%'; }
    bubble.style.bottom = (100 - y / 9) + '%';
    bubble.style.maxWidth = `min(${Math.max(30, right ? x / 10 - 3 : 97 - x / 10).toFixed(1)}%, 380px)`;
    bubble.classList.add('show');
    clearTimeout(bubT);
    bubT = setTimeout(() => bubble.classList.remove('show'), ms || 4500);
  }

  /* easter eggs */
  const EGGS = [];
  T.hits.forEach(h => { if (h.egg && EGGS.indexOf(h.egg) < 0) EGGS.push(h.egg); });
  const key = 'klok-eggs-' + T.slug, found = new Set(), eggEl = $('eggs');
  try { JSON.parse(localStorage.getItem(key) || '[]').forEach(e => { if (EGGS.indexOf(e) >= 0) found.add(e); }); } catch (e) {}
  if (T.slug === 'sinterklaas') { try { JSON.parse(localStorage.getItem('sk-eggs') || '[]').forEach(e => { if (EGGS.indexOf(e) >= 0) found.add(e); }); } catch (e) {} }
  function renderEggs() {
    if (!found.size) { eggEl.hidden = true; return; }
    eggEl.hidden = false;
    eggEl.textContent = found.size === EGGS.length ? `Alle ${EGGS.length} Easter eggs gevonden!` : `Easter eggs: ${found.size} van ${EGGS.length}`;
  }
  function egg(id) {
    if (!id || found.has(id) || EGGS.indexOf(id) < 0) return;
    found.add(id);
    try { localStorage.setItem(key, JSON.stringify(Array.from(found))); } catch (e) {}
    renderEggs();
    if (found.size === EGGS.length) setTimeout(() => { startRain('confetti'); say(`Alle ${EGGS.length} Easter eggs gevonden! Knap gedaan.`, 300, 540, 6000, 'l'); }, 4700);
  }
  renderEggs();

  /* geluid */
  let ac = null, master = null, fx = null, rumble = null, wbuf = null, soundOn = false, crackT = null, L = null;
  function initAudio() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    fx = ac.createGain(); fx.gain.value = 0.7; fx.connect(ac.destination);
    const len = Math.floor(ac.sampleRate * 3), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = R() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    rumble = ac.createGain(); rumble.gain.value = 0.35 * (L === null ? 1 : L);
    src.connect(lp); lp.connect(rumble); rumble.connect(master); src.start();
    wbuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
    const wd = wbuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = R() * 2 - 1;
  }
  function burst(freq, q, vol, dur, delay, out) {
    const n = ac.currentTime + delay, src = ac.createBufferSource(); src.buffer = wbuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    src.connect(bp); bp.connect(g); g.connect(out || master); src.start(n, R() * 0.1, dur + 0.02);
  }
  function tone(delay, f, vol, dur, out, f2, type) {
    const n = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, n);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + dur * 0.8);
    g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(vol, n + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    o.connect(g); g.connect(out); o.start(n); o.stop(n + dur + 0.05);
  }
  function bell(delay, f, vol, out) { [1, 2.76, 5.4].forEach((m, i) => tone(delay, f * m, (vol || 0.22) / (i + 1.5), 2.2 / (i + 1), out)); }
  /* zware klok met lange nagalm (Big Ben, kerktoren) */
  function bigBell(delay, f, vol, out, len) {
    len = len || 4;
    [[0.5, 0.5], [1, 1], [1.19, 0.35], [1.5, 0.3], [2, 0.45], [2.74, 0.2], [4.1, 0.1]].forEach(p => tone(delay, f * p[0], vol * p[1], len / Math.sqrt(p[0]), out));
  }
  /* bekende klokgeluiden; elk uur kiest de klok er willekeurig een */
  const NOTE = { E3: 164.81, B3: 246.94, E4: 329.63, Fs4: 369.99, Gs4: 415.3, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5 };
  const WEST = [['Gs4', 'Fs4', 'E4', 'B3'], ['E4', 'Gs4', 'Fs4', 'B3'], ['E4', 'Fs4', 'Gs4', 'E4'], ['Gs4', 'E4', 'Fs4', 'B3'], ['B3', 'Fs4', 'Gs4', 'E4']];
  function melody(changes, oct, step, vol, out, start) {
    let t = start || 0;
    changes.forEach(ch => { WEST[ch].forEach((nm, i) => (oct > 1 ? bell : bigBell)(t + i * step, NOTE[nm] * oct, vol, out, 3)); t += 4 * step + step * 1.2; });
    return t;
  }
  const CHIMES = [
    { name: 'Big Ben', play(n, out, short) { const t = melody(short ? [3, 4] : [1, 2, 3, 4], 1, 0.75, 0.32, out); for (let i = 0; i < n; i++) bigBell(t + 1.2 + i * 2.6, NOTE.E3, 0.42, out, 6); } },
    { name: 'de kerkklok', play(n, out) { for (let i = 0; i < n; i++) bigBell(i * 2.2, 196, 0.38, out, 5); } },
    { name: 'de koekoeksklok', play(n, out) { for (let i = 0; i < n; i++) { tone(i * 1.1, 740, 0.3, 0.35, out); tone(i * 1.1 + 0.38, 587, 0.3, 0.5, out); } } },
    { name: 'de staande klok', play(n, out, short) { const t = melody(short ? [1] : [1, 2], 2, 0.5, 0.2, out); for (let i = 0; i < n; i++) bell(t + 0.8 + i * 1.5, 330, 0.3, out); } },
    { name: 'de beiaard', play(n, out) {
      const tune = ['C5', 'E5', 'G5', 'C6', 'A5', 'G5', 'E5', 'D5', 'E5', 'G5', 'C5'];
      tune.forEach((nm, i) => bell(i * 0.28 + (i === tune.length - 1 ? 0.3 : 0), NOTE[nm], 0.16, out));
      for (let i = 0; i < n; i++) bell(3.8 + i * 1.6, 262, 0.3, out);
    } },
    { name: 'de scheepsbel', play(n, out) { for (let i = 0; i < n; i++) bell(Math.floor(i / 2) * 1.4 + (i % 2) * 0.35, 1180, 0.22, out); } },
    { name: 'de wekker', onlyClick: true, play(n, out) { for (let i = 0; i < 24; i++) tone(i * 0.09, i % 2 ? 2350 : 2650, 0.12, 0.08, out, null, 'square'); } }
  ];
  /* pauzemomenten: dan gaat een van de bekende klokken af */
  const BELL_TIMES = [[9, 0], [10, 30], [12, 15], [14, 30], [16, 15]];
  const testBell = /[?&]bel\b/.test(location.search);
  function isBellTime(now) {
    const d = now.getDay(), h = now.getHours(), m = now.getMinutes();
    if (testBell) return true;
    if (d === 0 || d === 6 || vacationState(now).cur) return false;
    return BELL_TIMES.some(t => t[0] === h && t[1] === m);
  }
  let lastChime = -1, clickG = null;
  const testChime = /[?&]uurslag/.test(location.search);
  function famousChime(n, out, short) {
    let i = Math.floor(R() * CHIMES.length);
    while (i === lastChime || (!short && CHIMES[i].onlyClick)) i = (i + 1) % CHIMES.length;
    lastChime = i;
    CHIMES[i].play(n, out, short);
    return CHIMES[i].name;
  }
  /* bekende deuntjes, allemaal vrij van auteursrecht (klassiek of traditioneel), als speeldoos.
     notatie: noot/duur in tellen (standaard 1), R = rust; oct schuift octaven op */
  const TUNES = [
    { name: 'Für Elise van Beethoven', bpm: 110, n: 'E5/.5 D#5/.5 E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/.5 A4 R/.5 C4/.5 E4/.5 A4/.5 B4 R/.5 E4/.5 G#4/.5 B4/.5 C5 R/.5 E4/.5 E5/.5 D#5/.5 E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/.5 A4/2' },
    { name: 'Ode an die Freude van Beethoven', bpm: 150, oct: 1, n: 'F#4 F#4 G4 A4 A4 G4 F#4 E4 D4 D4 E4 F#4 F#4/1.5 E4/.5 E4/2 F#4 F#4 G4 A4 A4 G4 F#4 E4 D4 D4 E4 F#4 E4/1.5 D4/.5 D4/2' },
    { name: 'Eine kleine Nachtmusik van Mozart', bpm: 130, oct: 1, n: 'G4 R/.5 D4/.5 G4 R/.5 D4/.5 G4/.5 D4/.5 G4/.5 B4/.5 D5/2 C5 R/.5 A4/.5 C5 R/.5 A4/.5 C5/.5 A4/.5 F#4/.5 A4/.5 D4/2' },
    { name: 'de Turkse mars van Mozart', bpm: 100, n: 'B4/.25 A4/.25 G#4/.25 A4/.25 C5 D5/.25 C5/.25 B4/.25 C5/.25 E5 F5/.25 E5/.25 D#5/.25 E5/.25 B5/.25 A5/.25 G#5/.25 A5/.25 B5/.25 A5/.25 G#5/.25 A5/.25 C6/2' },
    { name: 'In de hal van de bergkoning van Grieg', bpm: 140, oct: 1, n: 'B3/.5 C#4/.5 D4/.5 E4/.5 F#4/.5 D4/.5 F#4 F4/.5 C#4/.5 F4 E4/.5 C4/.5 E4 B3/.5 C#4/.5 D4/.5 E4/.5 F#4/.5 D4/.5 F#4/.5 B4/.5 A4/.5 F#4/.5 D4/.5 F#4/.5 A4/2' },
    { name: 'de Wilhelm Tell-ouverture van Rossini', bpm: 150, n: 'G4/.33 G4/.33 G4/.34 G4/.33 G4/.33 G4/.34 G4/.33 G4/.33 C5/.34 D5 E5 R/.5 G4/.33 G4/.33 G4/.34 G4/.33 G4/.33 G4/.34 G4/.33 G4/.33 C5/.34 D5 C5/2' },
    { name: 'Vader Jacob', bpm: 140, oct: 1, n: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4/2 E4 F4 G4/2 G4/.5 A4/.5 G4/.5 F4/.5 E4 C4 G4/.5 A4/.5 G4/.5 F4/.5 E4 C4 C4 G3 C4/2' },
    { name: 'Altijd is Kortjakje ziek', bpm: 130, oct: 1, n: 'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2' }
  ];
  const THEME_TUNES = {
    herfst: [
      { name: 'In de maneschijn', bpm: 110, oct: 1, n: 'C4 C4 C4 D4 E4/2 D4/2 C4 E4 D4 D4 C4/2' },
      { name: 'Altijd is Kortjakje ziek', bpm: 130, oct: 1, n: 'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2' }
    ],
    sinterklaas: [
      { name: 'de Toreador uit Carmen, helemaal uit Spanje', bpm: 110, n: 'C5/.75 D5/.25 C5/.5 A4/.5 A4/.5 A4/.5 G4/.25 A4/.25 A#4/.5 A4/2' }
    ],
    kerst: [
      { name: 'Jingle Bells', bpm: 170, n: 'E5 E5 E5/2 E5 E5 E5/2 E5 G5 C5/1.5 D5/.5 E5/4' },
      { name: 'Stille nacht', bpm: 140, oct: 1, n: 'G4/1.5 A4/.5 G4 E4/3 G4/1.5 A4/.5 G4 E4/3 D5/2 D5 B4/3 C5/2 C5 G4/3' },
      { name: 'Deck the halls', bpm: 160, oct: 1, n: 'G4/1.5 F4/.5 E4 D4 C4 D4 E4 C4 D4/.5 E4/.5 F4/.5 D4/.5 E4/1.5 D4/.5 C4 B3 C4/2' }
    ],
    winter: [
      { name: 'Jingle Bells', bpm: 170, n: 'E5 E5 E5/2 E5 E5 E5/2 E5 G5 C5/1.5 D5/.5 E5/4' },
      { name: 'het wiegenlied van Brahms', bpm: 110, oct: 1, n: 'E4/.5 E4/.5 G4/2 E4/.5 E4/.5 G4/2 E4/.5 G4/.5 C5 B4/1.5 A4/.5 A4 G4/2' }
    ],
    blokhut: [
      { name: 'Morgenstemming van Grieg', bpm: 90, n: 'G5/.5 E5/.5 D5/.5 C5/.5 D5/.5 E5/.5 G5/.5 E5/.5 D5/.5 C5/.5 D5/.25 E5/.25 D5/.25 E5/.25 G5/.5 E5/.5 G5/.5 A5/.5 E5/.5 A5/.5 G5/.5 E5/.5 D5/.5 C5/2' },
      { name: 'het wiegenlied van Brahms', bpm: 110, oct: 1, n: 'E4/.5 E4/.5 G4/2 E4/.5 E4/.5 G4/2 E4/.5 G4/.5 C5 B4/1.5 A4/.5 A4 G4/2' }
    ],
    voorjaar: [
      { name: 'Alle eendjes zwemmen in het water', bpm: 130, oct: 1, n: 'C4/.5 D4/.5 E4/.5 F4/.5 G4 G4 A4/.5 A4/.5 A4/.5 A4/.5 G4/2 A4/.5 A4/.5 A4/.5 A4/.5 G4/2 F4/.5 F4/.5 F4/.5 F4/.5 E4 E4 D4/.5 D4/.5 D4/.5 D4/.5 C4/2' },
      { name: 'De lente van Vivaldi', bpm: 130, n: 'E5 G#5 G#5 G#5 F#5/.5 E5/.5 B5/2 B5/.5 A5/.5 G#5 G#5 G#5 F#5/.5 E5/.5 B5/2' },
      { name: 'Morgenstemming van Grieg', bpm: 90, n: 'G5/.5 E5/.5 D5/.5 C5/.5 D5/.5 E5/.5 G5/.5 E5/.5 D5/.5 C5/.5 D5/.25 E5/.25 D5/.25 E5/.25 G5/.5 E5/.5 G5/.5 A5/.5 E5/.5 A5/.5 G5/.5 E5/.5 D5/.5 C5/2' }
    ],
    pasen: [
      { name: 'De lente van Vivaldi', bpm: 130, n: 'E5 G#5 G#5 G#5 F#5/.5 E5/.5 B5/2 B5/.5 A5/.5 G#5 G#5 G#5 F#5/.5 E5/.5 B5/2' },
      { name: 'Alle eendjes zwemmen in het water', bpm: 130, oct: 1, n: 'C4/.5 D4/.5 E4/.5 F4/.5 G4 G4 A4/.5 A4/.5 A4/.5 A4/.5 G4/2 A4/.5 A4/.5 A4/.5 A4/.5 G4/2 F4/.5 F4/.5 F4/.5 F4/.5 E4 E4 D4/.5 D4/.5 D4/.5 D4/.5 C4/2' }
    ],
    zomer: [
      { name: 'Kumbaya, een kampvuurlied', bpm: 120, oct: 1, n: 'C4/.5 E4/.5 G4 G4 G4/2 A4/.5 A4/.5 G4/2 C4/.5 E4/.5 G4 G4 G4/2 F4/.5 E4/.5 D4/2 C4/.5 E4/.5 G4 G4 G4/2 A4/.5 A4/.5 G4/2 F4 E4 D4 D4 C4/2' },
      { name: 'Oh my darling Clementine', bpm: 130, oct: 1, n: 'F4/.75 F4/.25 F4 C4 A4/.75 A4/.25 A4 F4 F4/.75 A4/.25 C5/1.5 C5/.5 A#4/.5 A4/.5 G4/2' }
    ]
  };
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteFreq(s) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(s);
    if (!m) return 0;
    const midi = 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  /* speeldoos: helder getokkeld toontje met korte nagalm */
  function boxNote(delay, f, vol, out) {
    tone(delay, f, vol, 1.3, out);
    tone(delay, f * 2, vol * 0.28, 0.7, out);
    tone(delay, f * 4.2, vol * 0.08, 0.25, out);
  }
  function playTune(tu, out) {
    const beat = 60 / tu.bpm, mul = Math.pow(2, tu.oct || 0);
    let t = 0;
    tu.n.split(' ').forEach(tok => {
      const p = tok.split('/'), d = p[1] ? parseFloat(p[1]) : 1;
      if (p[0] !== 'R') boxNote(t, noteFreq(p[0]) * mul, 0.2, out);
      t += d * beat;
    });
  }
  /* klik op de klok: een eigen seizoensdeuntje, een bekend klassiek deuntje of een bekende klok */
  let lastClick = '';
  function clickSound(out) {
    const own = THEME_TUNES[T.slug] || [];
    for (let tries = 0; tries < 6; tries++) {
      const r = R();
      if (own.length && r < 0.4) { const tu = own[Math.floor(R() * own.length)]; if (tu.name === lastClick) continue; playTune(tu, out); return (lastClick = tu.name); }
      if (r < 0.7) { const tu = TUNES[Math.floor(R() * TUNES.length)]; if (tu.name === lastClick) continue; playTune(tu, out); return (lastClick = tu.name); }
      return (lastClick = famousChime(2, out, true));
    }
    return (lastClick = famousChime(2, out, true));
  }
  function chime(kind) {
    try {
      initAudio();
      const p = ac.resume(); if (p && p.catch) p.catch(() => {});
      if (kind === 'famous') {
        if (clickG) clickG.gain.setTargetAtTime(0, ac.currentTime, 0.05);
        clickG = ac.createGain(); clickG.connect(fx);
        return clickSound(clickG);
      }
      if (kind === 'bells') { bell(0, 784, 0.22, fx); bell(0.4, 659, 0.22, fx); bell(0.8, 523, 0.22, fx); bell(1.2, 392, 0.22, fx); }
      else if (kind === 'cuckoo') { for (let i = 0; i < 2; i++) { tone(i * 0.9, 740, 0.3, 0.35, fx); tone(i * 0.9 + 0.38, 587, 0.3, 0.5, fx); } }
      else if (kind === 'chirp') { tone(0, 3200, 0.12, 0.09, fx, 4600); tone(0.14, 3400, 0.12, 0.09, fx, 4800); tone(0.28, 3000, 0.1, 0.12, fx, 4200); }
      else if (kind === 'hoot') { tone(0, 380, 0.3, 0.5, fx, 340); tone(0.7, 400, 0.3, 0.9, fx, 330); }
      else if (kind === 'pop') { tone(0, 600, 0.2, 0.12, fx, 1200, 'triangle'); }
      else if (kind === 'strum') { [196, 247, 294, 392, 494, 659].forEach((f, i) => tone(i * 0.045, f, 0.12, 1.4, fx, null, 'triangle')); }
    } catch (e) { report(e); }
  }
  function crackleLoop() {
    if (!soundOn) return;
    const lvl = L === null ? 1 : L;
    if (lvl > 0.03) {
      const count = R() < 0.15 ? 3 + Math.floor(R() * 4) : 1;
      for (let i = 0; i < count; i++) burst(1200 + R() * 4000, 1 + R() * 3, (0.05 + R() * 0.35) * lvl, 0.02 + R() * 0.06, i * 0.015 + R() * 0.02);
    }
    if (T.crickets && R() < 0.12) { const d = R() * 0.1; for (let i = 0; i < 3; i++) tone(d + i * 0.06, 4300, 0.03, 0.04, master); }
    crackT = setTimeout(crackleLoop, 40 + R() * 260);
  }
  const btn = $('sound'), sName = T.soundName || 'Haardgeluid';
  btn.addEventListener('click', () => {
    try {
      initAudio();
      soundOn = !soundOn;
      btn.textContent = sName + (soundOn ? ': aan' : ': uit');
      btn.classList.toggle('on', soundOn);
      clearTimeout(crackT);
      master.gain.cancelScheduledValues(ac.currentTime);
      if (soundOn) { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); master.gain.setTargetAtTime(0.8, ac.currentTime, 0.15); crackleLoop(); }
      else master.gain.setTargetAtTime(0, ac.currentTime, 0.08);
    } catch (e) { soundOn = false; btn.disabled = true; btn.classList.remove('on'); btn.textContent = 'Geluid niet beschikbaar'; }
  });

  /* radio */
  const rBtn = $('radio'), rSel = $('station'), radio = new Audio();
  radio.preload = 'none';
  let radioOn = false;
  /* opgeslagen zender op naam terugzoeken (oude opslag gebruikte het volgnummer: dat negeren) */
  try { const i = K.stations.findIndex(st => st[0] === localStorage.getItem('klok-zendernaam')); if (i >= 0) rSel.value = String(i); } catch (e) { /* geen opslag */ }
  function rLabel(txt, on) { rBtn.textContent = txt; rBtn.classList.toggle('on', !!on); }
  function radioPlay() {
    const st = K.stations[+rSel.value] || K.stations[0];
    radioOn = true;
    rLabel('Radio: laden...', true);
    radio.src = st[1];
    const p = radio.play();
    if (p && p.catch) p.catch(() => { if (radioOn) { radioOn = false; rLabel('Radio lukt niet, probeer opnieuw'); } });
  }
  function radioStop() {
    radioOn = false;
    radio.pause(); radio.removeAttribute('src');
    try { radio.load(); } catch (e) { /* stream stoppen */ }
    rLabel('Radio: uit');
  }
  radio.addEventListener('playing', () => { if (radioOn) rLabel('Radio: aan', true); });
  radio.addEventListener('waiting', () => { if (radioOn) rLabel('Radio: laden...', true); });
  radio.addEventListener('error', () => { if (radioOn) { radioOn = false; rLabel('Zender niet bereikbaar'); } });
  rBtn.addEventListener('click', e => { if (radioOn) radioStop(); else radioPlay(); if (e.detail > 0) rBtn.blur(); });
  rSel.addEventListener('change', () => {
    try { localStorage.setItem('klok-zendernaam', K.stations[+rSel.value][0]); } catch (e) { /* geen opslag */ }
    if (radioOn) radioPlay();
  });

  /* kaarsen */
  const candles = [];
  for (let i = 0; i < 6; i++) if ($('cf' + i)) candles.push(i);
  const candleOn = {};
  function setCandle(i, on, puff) {
    candleOn[i] = on;
    const a = $('cf' + i), b = $('cf' + i + 'b');
    if (a) a.style.display = on ? '' : 'none';
    if (b) b.style.display = on ? '' : 'none';
    if (!on && puff && !reduce && b) {
      const bb = b.getBBox ? b.getBBox() : null;
      if (bb) {
        const svg = b.ownerSVGElement;
        for (let k = 0; k < 3; k++) {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', bb.x + bb.width / 2 + (k - 1) * 3); c.setAttribute('cy', bb.y + bb.height * 0.5 - k * 6); c.setAttribute('r', 4);
          c.setAttribute('fill', '#cfc6bd'); c.setAttribute('class', 'puff'); c.style.animationDelay = (k * 0.15) + 's';
          svg.appendChild(c); setTimeout(() => c.remove(), 2400);
        }
      }
    }
  }
  candles.forEach(i => { candleOn[i] = true; });

  /* klok */
  const hh = $('hh'), mh = $('mh'), sh = $('sh'), pend = $('pend');
  const C = T.clock || { cx: 500, cy: 236, pend: [500, 314] };
  const tEl = $('dtime'), dEl = $('ddate'), cEl = $('count'), c2El = $('count2');
  let lastSec = -1, lastDay = '', spinStart = -1;
  function easeTick(p) {
    if (reduce || p >= 0.18) return 1;
    const q = p / 0.18, c1 = 1.2, c3 = c1 + 1;
    return 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2);
  }
  function updDay(now) {
    dEl.textContent = cap(F.date.format(now));
    const e = T.event(now, K) || { main: '', sub: '' };
    cEl.textContent = e.main; c2El.textContent = e.sub;
  }
  function updClock(now) {
    const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
    let spin = 0, spinning = false;
    if (spinStart >= 0) {
      const p = (performance.now() - spinStart) / 2600;
      if (p >= 1) spinStart = -1; else { spinning = true; spin = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    }
    const sf = s - 1 + easeTick(ms / 1000);
    const tr = `translate(${C.cx} ${C.cy}) rotate(`;
    sh.setAttribute('transform', tr + (sf * 6 + spin * 1440).toFixed(2) + ')');
    mh.setAttribute('transform', tr + ((m + s / 60) * 6 + spin * 720).toFixed(2) + ')');
    hh.setAttribute('transform', tr + ((h % 12 + m / 60) * 30 + spin * 360).toFixed(2) + ')');
    if (pend && C.pend) {
      let pa = 0;
      if (spinning) pa = 12 * Math.sin(now.getTime() / 70);
      else if (!reduce) pa = 7 * Math.sin(Math.PI * (now.getTime() % 2000) / 1000);
      pend.setAttribute('transform', `rotate(${pa.toFixed(2)} ${C.pend[0]} ${C.pend[1]})`);
    }
    if (s !== lastSec) {
      lastSec = s;
      tEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
      tEl.setAttribute('datetime', `${pad(h)}:${pad(m)}:${pad(s)}`);
      if (soundOn) {
        burst(s % 2 ? 2600 : 3400, 6, T.camp ? 0.15 : 0.5, 0.035, 0);
        if (s === 0 && isBellTime(now)) {
          const who = famousChime(3, master, true);
          say(`${cap(who)} gaat af: het is ${h}:${pad(m)}!`, C.cx + 90, C.cy, 6000, 'l');
        } else if ((s === 0 && m === 0) || (testChime && s === 0)) {
          const n = h % 12 || 12;
          const who = famousChime(n, master);
          say(`${cap(who)} slaat ${n} uur!`, C.cx + 90, C.cy, 5000, 'l');
        } else if (s === 0 && m === 30) bell(0, 440, 0.3, master);
        if (rumble && L !== null) rumble.gain.setTargetAtTime(0.35 * L, ac.currentTime, 0.5);
      }
      const dk = now.toDateString();
      if (dk !== lastDay) {
        if (lastDay && auto && K.pick(now) !== T.slug) { location.reload(); return; }
        lastDay = dk; updDay(now);
      }
      updVac(now);
    }
  }

  /* vakantie aftellen */
  const xmTitle = $('xmTitle'), xmSub = $('xmSub'), xmSchool = $('xmSchool'), xmRow = $('xmRow');
  const xmD = $('xmD'), xmH = $('xmH'), xmM = $('xmM'), xmS = $('xmS');
  function updVac(now) {
    const st = vacationState(now);
    if (st.cur) {
      const left = daysBetween(now, st.cur.end) + 1;
      xmTitle.textContent = `Het is ${st.cur.name}!`;
      xmSub.textContent = `Nog ${left} ${left === 1 ? 'dag' : 'dagen'} vrij, tot en met ${F.date.format(st.cur.end)}.`;
      xmSchool.textContent = 'Geniet ervan!';
      xmRow.hidden = true;
      return;
    }
    if (!st.next) {
      xmTitle.textContent = 'Aftellen tot de vakantie';
      xmSub.textContent = 'De vakantiedata voor dit schooljaar zijn nog niet bekend.';
      xmSchool.textContent = ''; xmRow.hidden = true;
      return;
    }
    const v = st.next;
    xmRow.hidden = false;
    xmTitle.textContent = `Aftellen tot de ${v.name}`;
    xmSub.textContent = `Van ${F.long.format(v.start)} tot en met ${F.date.format(v.end)}.`;
    let diff = Math.max(0, Math.floor((v.start - now) / 1000));
    const dd = Math.floor(diff / 86400); diff -= dd * 86400;
    const hrs = Math.floor(diff / 3600); diff -= hrs * 3600;
    const mins = Math.floor(diff / 60), secs = diff - mins * 60;
    xmD.textContent = dd; xmH.textContent = pad(hrs); xmM.textContent = pad(mins); xmS.textContent = pad(secs);
    if (dd > 45) { xmSchool.textContent = `Nog ${Math.ceil(dd / 7)} weken te gaan.`; return; }
    let n = 0, d = addDays(dayStart(now), now.getHours() >= 17 ? 1 : 0);
    while (d < v.start) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) n++; d = addDays(d, 1); }
    xmSchool.textContent = n === 0 ? 'Geen schooldagen meer: de vakantie staat voor de deur!' : `Nog ${n} ${n === 1 ? 'schooldag' : 'schooldagen'} te gaan.`;
  }

  /* vuur */
  const cv = $('fire'), cx = cv.getContext('2d');
  const FW = 340, FH = 240, camp = !!T.camp;
  function fit() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cx.setTransform(w / FW, 0, 0, h / FH, 0, 0);
  }
  if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(cv); } else setInterval(fit, 1000);
  window.addEventListener('resize', () => { layout(); fit(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { layout(); fit(); }, 300));
  fit();
  const stopsF = [[0, [255, 247, 214]], [0.25, [255, 206, 96]], [0.55, [245, 124, 36]], [0.8, [170, 52, 22]], [1, [90, 24, 14]]];
  function col(t) {
    for (let i = 1; i < stopsF.length; i++) if (t <= stopsF[i][0]) { const t0 = stopsF[i - 1][0], a = stopsF[i - 1][1], t1 = stopsF[i][0], b = stopsF[i][1], f = (t - t0) / (t1 - t0); return a.map((v, j) => Math.round(v + (b[j] - v) * f)); }
    return stopsF[stopsF.length - 1][1];
  }
  function sprite(rgb, mid) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, `rgba(${rgb},1)`); rg.addColorStop(0.35, `rgba(${rgb},${mid})`); rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return c;
  }
  const sprites = [];
  for (let i = 0; i < 24; i++) sprites.push(sprite(col(i / 23).join(','), 0.55));
  const smokeSprite = sprite('150,140,135', 0.4);
  const parts = [], sparks = [], smoke = [];
  let acc = 0, smokeAcc = 0, noise = 0, boostUntil = 0, relightUntil = 0, smokeUntil = 0, lastCold = null;
  function spawn(big) {
    const k = big ? 1.35 : 1;
    parts.push({ x: 170 + (R() + R() + R() - 1.5) * (camp ? 52 : 64), y: 202 + R() * 12, vx: (R() - 0.5) * 14, vy: -(55 + R() * 65) * k, life: 0, max: 0.9 + R() * 1.0, size: (26 + R() * 26) * k, seed: R() * 6.28 });
  }
  function sparkBurst(n) { for (let i = 0; i < n; i++) sparks.push({ x: 140 + R() * 60, y: 200, vx: (R() - 0.5) * 60, vy: -(80 + R() * 140), life: 0, max: 0.8 + R() * 1.2 }); }
  function drawLog(x1, y1, x2, y2, r, glow) {
    const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
    cx.save(); cx.translate(x1, y1); cx.rotate(a);
    const g = cx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#6a3e24'); g.addColorStop(0.5, '#3e2213'); g.addColorStop(1, '#1e0f07');
    cx.fillStyle = g;
    cx.beginPath(); cx.ellipse(0, 0, r * 0.45, r, 0, 0, Math.PI * 2); cx.fill();
    cx.fillRect(0, -r, len, 2 * r);
    cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(8, -r * 0.3); cx.lineTo(len * 0.55, -r * 0.35); cx.moveTo(len * 0.3, r * 0.25); cx.lineTo(len - 10, r * 0.2); cx.stroke();
    cx.fillStyle = '#b07a4a'; cx.beginPath(); cx.ellipse(len, 0, r * 0.45, r, 0, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = '#6e4426'; cx.lineWidth = 1; cx.beginPath(); cx.ellipse(len, 0, r * 0.25, r * 0.55, 0, 0, Math.PI * 2); cx.stroke();
    if (glow > 0.01) {
      cx.globalCompositeOperation = 'lighter';
      cx.strokeStyle = `rgba(255,${110 + Math.round(40 * Math.min(1, glow))},40,${Math.min(0.9, 0.35 + 0.3 * glow).toFixed(3)})`;
      cx.globalAlpha = Math.min(1, glow); cx.lineWidth = 2.2;
      cx.beginPath(); cx.moveTo(6, -r * 0.55); cx.lineTo(len - 4, -r * 0.62); cx.stroke();
    }
    cx.restore();
  }
  function drawGrate() {
    cx.fillStyle = '#2a1810'; cx.beginPath(); cx.ellipse(170, 236, 122, 7, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#17100c'; cx.fillRect(56, 226, 228, 7);
    for (const x of [70, 270]) { cx.fillRect(x - 4, 198, 8, 42); cx.beginPath(); cx.arc(x, 196, 7, 0, Math.PI * 2); cx.fill(); }
    cx.fillStyle = 'rgba(255,170,90,.25)'; cx.fillRect(56, 226, 228, 1.2);
  }
  const tagline = $('tagline');
  function applyCold(cold) {
    tagline.textContent = cold && T.coldTagline ? T.coldTagline : T.tagline;
    candles.forEach(i => setCandle(i, !cold, false));
  }
  function fire(dt, time, now) {
    const ms = now.getTime();
    const target = ((T.fireOn ? T.fireOn(now) : true) || ms < relightUntil) ? 1 : 0;
    if (L === null) L = target;
    else if (L < target) L = Math.min(target, L + dt * 0.35);
    else if (L > target) L = Math.max(target, L - dt * 0.07);
    const cold = target === 0;
    if (cold !== lastCold) { if (lastCold !== null || cold) applyCold(cold); lastCold = cold; }
    if (cold && L > 0.01) smokeUntil = ms + 20000;
    noise += (R() - 0.5) * dt * 3; noise *= 0.97; noise = Math.max(-0.15, Math.min(0.15, noise));
    const boost = ms < boostUntil ? 1.6 : 1;
    const I = (reduce ? 0.9 : 0.86 + 0.07 * Math.sin(time * 1.9) + 0.05 * Math.sin(time * 5.3 + 1.3) + noise) * boost;
    stage.style.setProperty('--glow', ((0.3 + 0.32 * I) * L * (T.glow || 1)).toFixed(3));
    stage.style.setProperty('--night', ((1 - L) * 0.42).toFixed(3));
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1; cx.clearRect(0, 0, FW, FH);
    let g = cx.createRadialGradient(170, 200, 10, 170, 190, camp ? 150 : 200);
    g.addColorStop(0, `rgba(255,130,50,${Math.min(1, 0.34 * I * L).toFixed(3)})`); g.addColorStop(1, 'rgba(255,90,30,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, FW, FH);
    drawLog(60, 200, 280, 190, 13, 0);
    acc += dt * (reduce ? 90 : 190) * I * L;
    while (acc >= 1) { acc -= 1; spawn(boost > 1); }
    cx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { parts.splice(i, 1); continue; }
      p.vy -= 34 * dt;
      p.x += (p.vx + Math.sin(time * 3.1 + p.seed) * 16 * t + (170 - p.x) * 0.9 * t) * dt;
      p.y += p.vy * dt;
      const s = p.size * (1 - 0.7 * t) * (0.55 + 0.45 * L);
      cx.globalAlpha = (t < 0.12 ? t / 0.12 : 1) * (1 - t) * 0.85;
      cx.drawImage(sprites[Math.min(23, Math.floor(t * 24))], p.x - s / 2, p.y - s / 2, s, s);
    }
    cx.globalAlpha = 1;
    if (!reduce && R() < dt * 5 * I * L * boost) sparkBurst(1);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life >= p.max || p.y < 0) { sparks.splice(i, 1); continue; }
      p.vx += (R() - 0.5) * 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      cx.fillStyle = `rgba(255,${180 + Math.round(60 * a)},120,${a.toFixed(3)})`;
      cx.fillRect(p.x, p.y, 1.8, 1.8);
    }
    g = cx.createRadialGradient(170, 232, 4, 170, 232, camp ? 100 : 120);
    g.addColorStop(0, `rgba(255,150,60,${Math.min(1, 0.55 * I * L).toFixed(3)})`); g.addColorStop(1, 'rgba(255,80,20,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, FW, FH);
    cx.globalCompositeOperation = 'source-over';
    if (camp) { drawLog(92, 228, 230, 198, 11, I * L); drawLog(110, 196, 250, 228, 11, I * L); }
    else { drawLog(78, 224, 232, 207, 13, I * L); drawLog(118, 206, 272, 225, 12, I * L); drawGrate(); }
    if (ms < smokeUntil && !reduce) {
      smokeAcc += dt * 7 * (L > 0.01 ? 1 : (smokeUntil - ms) / 20000);
      while (smokeAcc >= 1) { smokeAcc -= 1; smoke.push({ x: 150 + R() * 40, y: 200, vx: (R() - 0.5) * 8, vy: -(18 + R() * 16), life: 0, max: 3 + R() * 2.5, size: 14 + R() * 12, seed: R() * 6.28 }); }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i]; p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { smoke.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(time * 1.3 + p.seed) * 6) * dt; p.y += p.vy * dt;
      const s = p.size * (1 + 2.2 * t);
      cx.globalAlpha = (t < 0.15 ? t / 0.15 : 1) * (1 - t) * 0.22;
      cx.drawImage(smokeSprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    cx.globalAlpha = 1;
  }

  /* regen van dingen */
  const rain = $('rain'), rc = rain.getContext('2d');
  let drops = [], raining = false, RW = 0, RH = 0;
  const KINDS = {
    pepernoten: { n: 140, vy: [260, 500], c: ['#8e4f25'] },
    confetti: { n: 170, vy: [110, 350], c: ['#b3202a', '#d9a93f', '#f3e6c8', '#f3d27a', '#ffffff', '#6fd3ff'] },
    snow: { n: 160, vy: [60, 160], c: ['#ffffff', '#e8f1ff'] },
    petals: { n: 120, vy: [60, 150], c: ['#f6b8c8', '#fbd7e1', '#ffffff'] },
    leaves: { n: 90, vy: [80, 190], c: ['#c8552d', '#e39b2d', '#a33a22', '#d8b23a'] },
    eggs: { n: 90, vy: [220, 420], c: ['#f6a3c3', '#ffd94a', '#8fd0f0', '#b9e48a', '#c9a3f6'] },
    stars: { n: 40, vy: [500, 800], c: ['#fff6d0', '#ffffff'] }
  };
  function startRain(kind) {
    const k = KINDS[kind] || KINDS.confetti;
    RW = window.innerWidth; RH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    rain.width = Math.round(RW * dpr); rain.height = Math.round(RH * dpr);
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = reduce ? Math.round(k.n / 3) : k.n;
    for (let i = 0; i < n; i++) {
      const st = kind === 'stars';
      drops.push({ kind, x: st ? R() * RW * 1.2 : R() * RW, y: -20 - R() * RH * (st ? 1.5 : 1.2), vy: k.vy[0] + R() * (k.vy[1] - k.vy[0]), vx: st ? -(200 + R() * 200) : (R() - 0.5) * 60, r: 4 + R() * 5, a: R() * 6.28, va: (R() - 0.5) * 6, c: k.c[Math.floor(R() * k.c.length)], seed: R() * 6.28 });
    }
    if (raining) return;
    raining = true;
    let lt = performance.now();
    const step = t => {
      const dt = Math.min(0.05, Math.max(0, (t - lt) / 1000)); lt = t;
      rc.clearRect(0, 0, RW, RH);
      drops = drops.filter(d => d.y < RH + 30 && d.x > -60);
      for (const d of drops) {
        const sway = (d.kind === 'confetti' || d.kind === 'petals' || d.kind === 'leaves' || d.kind === 'snow') ? Math.sin(t / 400 + d.seed) * 40 : 0;
        d.y += d.vy * dt; d.x += (d.vx + sway) * dt; d.a += d.va * dt;
        rc.save(); rc.translate(d.x, d.y); rc.rotate(d.a); rc.fillStyle = d.c;
        if (d.kind === 'confetti') rc.fillRect(-d.r, -d.r * 0.45, d.r * 2, d.r * 0.9);
        else if (d.kind === 'pepernoten') { rc.beginPath(); rc.arc(0, 0, d.r + 1, 0, 6.29); rc.fill(); rc.fillStyle = 'rgba(201,138,82,.75)'; rc.beginPath(); rc.arc(-d.r * 0.3, -d.r * 0.35, d.r * 0.42, 0, 6.29); rc.fill(); }
        else if (d.kind === 'snow') { rc.globalAlpha = 0.9; rc.beginPath(); rc.arc(0, 0, d.r * 0.6, 0, 6.29); rc.fill(); }
        else if (d.kind === 'petals') { rc.beginPath(); rc.ellipse(0, 0, d.r, d.r * 0.55, 0, 0, 6.29); rc.fill(); }
        else if (d.kind === 'leaves') { rc.beginPath(); rc.moveTo(0, 0); rc.bezierCurveTo(d.r * 1.4, -d.r, d.r * 3, -d.r * 0.3, d.r * 3.2, d.r); rc.bezierCurveTo(d.r * 2, d.r * 1.8, d.r * 0.6, d.r * 1.2, 0, 0); rc.fill(); }
        else if (d.kind === 'eggs') { rc.beginPath(); rc.ellipse(0, 0, d.r + 2, d.r * 1.35 + 2, 0, 0, 6.29); rc.fill(); rc.strokeStyle = 'rgba(255,255,255,.85)'; rc.lineWidth = 2; rc.beginPath(); rc.moveTo(-d.r - 2, 0); rc.quadraticCurveTo(-d.r / 2, -4, 0, 0); rc.quadraticCurveTo(d.r / 2, 4, d.r + 2, 0); rc.stroke(); }
        else if (d.kind === 'stars') { rc.rotate(-d.a + Math.atan2(d.vy, d.vx)); const gr = rc.createLinearGradient(-60, 0, 0, 0); gr.addColorStop(0, 'rgba(255,246,208,0)'); gr.addColorStop(1, 'rgba(255,246,208,.95)'); rc.fillStyle = gr; rc.fillRect(-60, -1.2, 60, 2.4); rc.fillStyle = '#fff'; rc.beginPath(); rc.arc(0, 0, 2.4, 0, 6.29); rc.fill(); }
        rc.restore();
      }
      if (drops.length) requestAnimationFrame(step); else { raining = false; rc.clearRect(0, 0, RW, RH); }
    };
    requestAnimationFrame(step);
  }

  /* api voor de thema's */
  const api = {
    say, egg, rain: startRain, sparks: sparkBurst, chime, $,
    level: () => (L === null ? 1 : L),
    boost(ms) { boostUntil = Date.now() + ms; },
    relight(ms) { relightUntil = Date.now() + ms; },
    spin() { if (spinStart >= 0) return false; spinStart = performance.now(); return true; },
    toggleCandle(i) { const on = !candleOn[i]; setCandle(i, on, !on); return on; },
    show(id, on) { const el = $(id); if (el) el.style.display = on ? '' : 'none'; },
    shake(id) { const el = $(id); if (!el) return; el.classList.remove('shake'); void el.getBoundingClientRect(); el.classList.add('shake'); },
    flash(id, cls, ms) { const el = $(id); if (!el) return; el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms || 2000); }
  };
  if (T.init) try { T.init(api); } catch (e) { report(e); }

  /* figuren die af en toe voorbijkomen: één keer per uur op een willekeurig moment */
  const walkers = (T.walkers || []).map((w, i) => ({ w, el: $('walker' + i) }));
  const testWalk = /[?&]figuur/.test(location.search);
  let walk = null;
  function planWalk(ms, nextHour) {
    if (testWalk) return ms + (nextHour ? 12000 : 2500);
    const h0 = new Date(ms); h0.setMinutes(0, 0, 0);
    const base = h0.getTime() + (nextHour ? 3600000 : 0);
    let t = base + (3 + R() * 54) * 60000;
    if (t <= ms + 5000) t = base + 3600000 + (3 + R() * 54) * 60000;
    return t;
  }
  let nextWalk = planWalk(Date.now(), false);
  function startWalk(now) {
    const list = walkers.filter(o => o.el && (!o.w.when || o.w.when(now)));
    if (!list.length) return;
    const o = list[Math.floor(R() * list.length)];
    walk = { o, dir: o.w.noFlip ? 1 : (R() < 0.5 ? 1 : -1), t0: performance.now(), dur: (o.w.dur || 15000) * (reduce ? 1.4 : 1), x: 500, y: o.w.y };
    o.el.style.opacity = '';
    o.el.style.display = '';
  }
  function stepWalk(t) {
    if (!walk) return;
    const w = walk.o.w, p = (t - walk.t0) / walk.dur;
    if (p >= 1) { walk.o.el.style.display = 'none'; walk = null; return; }
    const x0 = w.x0 != null ? w.x0 : -170, x1 = w.x1 != null ? w.x1 : 1170;
    const x = walk.dir > 0 ? x0 + (x1 - x0) * p : x1 - (x1 - x0) * p, ph = (t - walk.t0) / 1000;
    let y = w.y, r = 0;
    if (w.hop) y -= Math.abs(Math.sin(ph * Math.PI * 1.6)) * w.hop;
    if (w.bob) y -= Math.abs(Math.sin(ph * Math.PI * 2)) * w.bob;
    if (w.waddle && !reduce) r = Math.sin(ph * Math.PI * 2) * w.waddle;
    const sc = w.scale || 1;
    walk.x = x; walk.y = y;
    walk.o.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(1)}) scale(${(sc * walk.dir).toFixed(3)} ${sc})`);
    if (w.fade) walk.o.el.style.opacity = Math.min(1, Math.min(p, 1 - p) / 0.08).toFixed(2);
  }
  walkers.forEach(o => {
    if (!o.el) return;
    o.el.addEventListener('click', () => {
      if (!walk || walk.o !== o) return;
      const m = o.w.msgs;
      say(m[Math.floor(R() * m.length)], Math.max(140, Math.min(860, walk.x)), walk.y - (o.w.h || 120), 3500);
      chime('pop');
    });
  });
  document.querySelectorAll('.hit').forEach(b => {
    b.addEventListener('click', e => {
      const h = T.hits[+b.getAttribute('data-hit')];
      try { const silent = h.act(api, e); if (!silent && h.egg) egg(h.egg); } catch (err) { report(err); }
      if (e.detail > 0) b.blur();
    });
  });

  /* toetsenbord: Konami-code en geheim woord */
  const konami = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let keyBuf = [], typed = '';
  document.addEventListener('keydown', e => {
    if (!e.key || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    keyBuf.push(k); if (keyBuf.length > konami.length) keyBuf.shift();
    if (keyBuf.join(',') === konami.join(',')) {
      keyBuf = [];
      const rh = T.hits.filter(h => h.rainKind)[0];
      if (rh) { egg(rh.egg); startRain(rh.rainKind); say(rh.rainMsg, rh.anchor[0], rh.anchor[1], 3000, rh.anchor[2]); }
      else startRain('confetti');
    }
    if (k.length === 1 && T.secret) {
      typed = (typed + k).slice(-T.secret.word.length);
      if (typed === T.secret.word) { typed = ''; T.secret.act(api, L); }
    }
  });

  /* lus */
  let lastT = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
    const now = new Date();
    try { updClock(now); } catch (e) { report(e); }
    try { fire(dt, t / 1000, now); window.__skFrames = (window.__skFrames || 0) + 1; } catch (e) { report(e); }
    try {
      if (!walk && walkers.length && Date.now() >= nextWalk) { startWalk(now); nextWalk = planWalk(Date.now(), true); }
      stepWalk(t);
    } catch (e) { report(e); }
  }
  try { updClock(new Date()); } catch (e) { report(e); }
  try { fire(0, performance.now() / 1000, new Date()); } catch (e) { report(e); }
  requestAnimationFrame(frame);
}

/* ---------- overzichtspagina ---------- */
function overview(base) {
  const P = K.parts, now = new Date(), cur = K.pick(now);
  const flame = camp => {
    const x = 500, y = camp ? 790 : 795;
    return `<ellipse cx="${x}" cy="${y - 10}" rx="120" ry="40" fill="#ff9a3a" opacity=".35"/>
      <path d="M${x - 60} ${y}C${x - 70} ${y - 60} ${x - 30} ${y - 90} ${x - 20} ${y - 150}C${x} ${y - 110} ${x + 10} ${y - 100} ${x + 20} ${y - 170}C${x + 50} ${y - 110} ${x + 80} ${y - 70} ${x + 60} ${y}Z" fill="#f0812a"/>
      <path d="M${x - 34} ${y}C${x - 40} ${y - 40} ${x - 14} ${y - 60} ${x - 4} ${y - 100}C${x + 14} ${y - 70} ${x + 40} ${y - 50} ${x + 34} ${y}Z" fill="#ffd25a"/>
      <rect x="${x - 110}" y="${y - 22}" width="220" height="20" rx="10" fill="#3e2213"/>`;
  };
  const cards = K.order.map(slug => {
    const T = K.themes[slug], S = P.ctx(slug + '-');
    const back = T.back(S, P), front = T.front ? T.front(S, P) : '';
    const svg = `<svg viewBox="0 0 1000 900" aria-hidden="true" focusable="false"><defs>${S.defsMarkup()}</defs>${back}${flame(T.camp)}${front}</svg>`;
    return `<a class="card${slug === cur ? ' now' : ''}" href="${base}${slug}/"><div class="thumb">${svg}</div><div class="meta"><h2>${T.name}</h2><p>${T.period}</p>${slug === cur ? '<span class="badge">Nu in het seizoen</span>' : ''}</div></a>`;
  }).join('');
  const el = document.createElement('main');
  el.className = 'overview';
  el.innerHTML = `<header><h1>Haardklokken</h1><p>Een klok bij het haardvuur voor elk seizoen. Elke klok telt af naar de eerstvolgende schoolvakantie.</p>
    <p><a class="auto" href="${base}auto/">Open de automatische klok</a> <span class="sub">die kiest zelf de klok die bij vandaag hoort, handig voor een smartboard.</span></p></header>
    <div class="grid">${cards}</div>
    <section class="extra" aria-labelledby="extra-title"><h2 id="extra-title">Ook op deze site</h2>
      <p><a class="auto" href="${base}snelweg/">Speel Snelweg Oversteken</a> <span class="sub">een spelletje: steek een drukke Nederlandse snelweg over. Durf je het ook blind, alleen op gehoor?</span></p></section>
    <footer>Vakantiedata: Rijksoverheid, regio Noord (basis- en voortgezet onderwijs). Herfst- en voorjaarsvakantie zijn adviesdata; je eigen school kan afwijken.</footer>`;
  document.body.insertBefore(el, document.body.firstChild);
}

/* ---------- start ---------- */
K.boot = function () {
  const b = document.body, page = b.getAttribute('data-klok') || 'auto', base = b.getAttribute('data-base') || '';
  try {
    if (page === 'overzicht') { overview(base); return; }
    let slug = page, auto = false;
    if (page === 'auto') { auto = true; slug = K.pick(new Date()); }
    if (!K.themes[slug]) { slug = K.pick(new Date()); auto = true; }
    const T = K.themes[slug];
    if (auto) document.title = T.name;
    run(T, auto, base);
  } catch (e) { report(e); throw e; }
};
})();
