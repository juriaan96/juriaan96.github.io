/* Haardklokken: de thema's. Elke klok heeft een eigen kamer, aftelmoment en easter eggs. */
(function () {
'use strict';
const K = window.KLOK;
const H = K.H;

const WHITE = {
  base: '#d9d1c2', pillar: [[0, '#bfb5a4'], [0.5, '#efe9de'], [1, '#bfb5a4']], woodStops: [[0, '#f4efe6'], [1, '#d2c9b9']],
  shelf2: '#c9bfae', flute: 0.22, trim: '#9a8a76', trimFill: '#c9bfae'
};
const FLOOR = { c1: '#3f2416', c2: '#1f100a' };
const cand = (i, x, top, side) => H.candle(i, [x - 30, top - 40, 60, 470 - top], [x, top - 26, side]);
function addTheme(T) { K.themes[T.slug] = T; K.order.push(T.slug); }

/* ===================== HERFST ===================== */
addTheme({
  slug: 'herfst',
  walkers: [{ draw: P => P.fig.egel(), y: 886, scale: 1.5, dur: 20000, bob: 1.5, h: 80, msgs: ['Ik zoek een warm plekje voor mijn winterslaap.', 'Snuf snuf... ruik ik appels?', 'Even opwarmen bij de haard, dan ga ik weer.'] }],
 name: 'Herfstklok', period: '1 september t/m 31 oktober',
  tagline: 'Regen tegen het raam, het vuur knappert.',
  hint: 'Klik op dingen in de kamer: er is van alles verstopt.',
  colors: { bg: '#1a0f08', bg2: '#3d2412', ink: '#f6ead6', muted: '#d8bf9a', accent: '#ffbf5a', accent2: '#e3892d', line: 'rgba(255,191,90,.3)', btnInk: '#2a1406', foot: '#a8865c', bubble: '#f8ecd8', bubbleInk: '#3a2210' },
  back(S, P) {
    return P.wallPaper(S, { motif: 'leaf', base: '#6a3a1c', line: '#7d4a26', dot: '#ffbf5a' })
      + P.wainscot(S, { base: '#4a2810', panel: '#5e3418', rail: '#3a2010', line: '#ffbf5a' })
      + P.floor(S, FLOOR)
      + P.windowLeft(S, { view: 'rain', frame: '#3a2010', seed: 4 })
      + P.leafGarland(S)
      + P.fireplaceBrick(S, {})
      + P.pumpkin(S, 'pumpkinL', 240, 426, 74, true)
      + P.candle(S, 0, 335, 426, 62)
      + P.candle(S, 1, 628, 426, 50)
      + P.appleBowl(S, 704, 426)
      + P.pumpkin(S, 'pumpkinS', 795, 426, 44, false)
      + P.clockMantel(S, { topper: 'owl' })
      + P.umbrella(S)
      + P.vignette(S, '#1a0f08');
  },
  front(S, P) {
    return P.scatteredLeaves(S, 9, 40, 980, 840, 895, 26) + P.boots(S, 214, 812, '#2f6b3e') + P.pumpkin(S, 'pumpkinF', 640, 884, 88, false);
  },
  event(now, K) {
    const D = K.date;
    const dH = D.daysBetween(now, D.nextSeason(now, 2));
    if (dH <= 60) return K.ev.season(now, 2);
    const t = new Date(now.getFullYear(), 10, 11), dm = D.daysBetween(now, t);
    if (dm === 0) return { main: 'Vandaag is het Sint-Maarten!', sub: 'Lampionnen aan en zingen maar.' };
    if (dm > 0 && dm <= 80) return { main: K.ev.nights(dm, 'Sint-Maarten'), sub: `Lampion al klaar? Sint-Maarten valt op ${D.F.long.format(t)}.` };
    return K.ev.season(now, 3);
  },
  hits: [
    H.fire(),
    H.say([450, 50, 100, 104], 'Uil', 'uil', ['Oehoe! Oehoe!', 'De uil houdt de tijd goed in de gaten.', 'Oehoe... wie is daar zo laat nog wakker?'], [560, 120, 'l'], 3200, api => api.chime('hoot')),
    H.clock([414, 156, 172, 272], 'Hé, de klok waait mee met de herfststorm!', [590, 300, 'l']),
    H.say([196, 340, 88, 90], 'Pompoen', 'pompoen', ['Boe! De pompoen heeft een lampje gekregen.', 'Lampje weer uit. Het is nog geen Halloween.'], [240, 330, 'l'], 3200, (api, i) => api.show('pumpkinLFace', i === 0)),
    cand(0, 335, 364, 'l'), cand(1, 628, 376, 'r'),
    H.say([820, 410, 180, 480], 'Paraplu', 'paraplu', ['Paraplu open: zo kan hij lekker drogen.', 'En weer dicht. Klaar voor de volgende bui.'], [840, 560, 'r'], 3500, (api, i) => { api.show('umbOpen', i === 0); api.show('umbClosed', i !== 0); }),
    H.rain([30, 150, 125, 275], 'Raam', 'leaves', 'bladeren', 'Wat waait het buiten!', 'Het regent herfstbladeren!', [93, 300, 'l'])
  ]
});

/* ===================== SINTERKLAAS ===================== */
const sintGifts = ['een chocoladeletter', 'een handje pepernoten', 'een marsepeinen varkentje', 'een speculaaspop', 'een taaitaaipop', 'een suikerbeest', 'een zakje chocolademunten', 'een chocolademuis'];
const sintPoems = [
  'De klok tikt door, het vuur brandt fel,\nSint hoort het tikken en weet het wel:\nnog even geduld, nog even wachten,\ndan komt hij langs, in een van de nachten.',
  'De klomp stond klaar, de wortel erin,\nhet paard had er reuze zin in.\nHet hinnikt blij en zegt: wat fijn,\nkon het maar elke avond zo zijn.',
  'De chocoladeletter op de schouw\nwas eerst nog heel, maar nu? Nou nou!\nEr zit een hap uit. Wie was dat nou?\nSint kijkt eens rond... en kijkt naar jou!',
  'Sint zocht zijn staf, hij was hem kwijt,\nhij zocht en zocht een hele tijd.\nToen zag hij hem: bij de haard, zo fijn,\ndaar wilde de staf ook gezellig zijn.',
  'Deze klok loopt nooit te laat,\nook niet als Sint op reis gaat.\nHij tikt en tikt de hele nacht,\ntot pakjesavond: wat een pracht!'
];
const sintSeason = now => { const m = now.getMonth(), d = now.getDate(); return m === 10 || (m === 11 && d <= 5); };
let shoeFilled = false, lastGift = -1, biteN = 0, letterT = null, poemI = Math.floor(Math.random() * sintPoems.length);
const bites = [[288, 350], [214, 412], [291, 392]], biteMsgs = ['Hap! Mmm, puur chocolade.', 'Nog eentje dan...', 'Oei, er is niet veel meer van over.'];
addTheme({
  slug: 'sinterklaas',
  walkers: [{ draw: P => P.fig.piet(), y: 888, scale: 0.85, dur: 15000, bob: 4, h: 170, when: sintSeason, msgs: ['Hoi! Ik kom even kijken of de klomp al klaar staat.', 'Psst, niet verder vertellen: Sint komt misschien vanavond!', 'Pepernootje? Ik heb er nog genoeg in mijn zak.', 'Even opwarmen bij de haard, dan weer het dak op!'] }],
 name: 'Sinterklaasklok', period: '1 november t/m 5 december',
  tagline: 'Het vuur brandt, de klomp staat klaar.', coldTagline: 'Het vuur is uit, het feest is voorbij. Tot volgend jaar!',
  hint: 'Klik op de klomp of Sint al is geweest. En kijk goed rond: er is meer verstopt.',
  colors: { bg: '#1a0a0d', bg2: '#3d1117', ink: '#f6e7c8', muted: '#d4b994', accent: '#f3d27a', accent2: '#d9a93f', line: 'rgba(243,210,122,.3)', btnInk: '#2a1208', foot: '#a88c6c', bubble: '#f6e7c8', bubbleInk: '#3a170f' },
  fireOn: sintSeason,
  back(S, P) {
    return P.wallPaper(S, { motif: 'diamond', base: '#5a141a', line: '#6e1b22', dot: '#d9a93f' })
      + P.wainscot(S, { base: '#3b0e13', panel: '#56161c', rail: '#6b2a1c' })
      + P.floor(S, FLOOR)
      + P.bunting(S, ['#b3202a', '#d9a93f', '#f3e6c8'])
      + P.fireplaceBrick(S, {})
      + P.chocLetter(S, 250, 'J')
      + P.candle(S, 0, 345, 426, 70)
      + P.candle(S, 1, 655, 426, 58)
      + P.presents(S, 'gifts', 704, 330)
      + P.clockMantel(S, { topper: 'mitre' })
      + P.staff(S)
      + P.vignette(S, '#1a0a0d');
  },
  front(S, P) {
    return P.pepernoten(S, [[602, 858], [618, 868], [632, 851], [646, 874], [664, 860], [680, 880], [588, 880], [702, 866], [654, 844]]) + P.klomp();
  },
  event(now, K) {
    const D = K.date, y = now.getFullYear(), d = D.daysBetween(now, new Date(y, 11, 5)), wd = yy => D.F.wd.format(new Date(yy, 11, 5));
    if (d > 1) return { main: K.ev.nights(d, 'pakjesavond'), sub: `Pakjesavond valt dit jaar op ${wd(y)} 5 december.` };
    if (d === 1) return { main: 'Nog 1 nachtje slapen: morgen is het pakjesavond!', sub: `Morgen, ${wd(y)} 5 december, komt Sinterklaas langs.` };
    if (d === 0) return { main: 'Vanavond is het pakjesavond!', sub: 'Luister goed: zo wordt er op de deur gebonsd.' };
    if (d === -1) return { main: 'Vandaag is Sinterklaas jarig!', sub: 'Gefeliciteerd, Sint, en bedankt voor alle cadeautjes.' };
    const d2 = D.daysBetween(now, new Date(y + 1, 11, 5));
    return { main: `Sinterklaas is terug in Spanje. Nog ${d2} nachtjes tot pakjesavond`, sub: `Volgend jaar valt pakjesavond op ${wd(y + 1)} 5 december.` };
  },
  secret: {
    word: 'sint',
    act(api, L) {
      if (L !== null && L < 0.5 && !sintSeason(new Date())) { api.relight(60000); api.say('Sinterklaas komt nog heel even terug... het vuur brandt weer!', 300, 540, 5000, 'l'); }
      else api.say('Sinterklaas hoort je wel! Hij komt er zo aan.', 845, 640, 4000, 'r');
    }
  },
  hits: [
    H.fire(),
    { box: [200, 765, 180, 122], label: 'Kijk in de klomp', act(api) {
      shoeFilled = !shoeFilled;
      api.show('carrot', !shoeFilled); api.show('gift', shoeFilled);
      if (shoeFilled) { let i; do { i = Math.floor(Math.random() * sintGifts.length); } while (i === lastGift); lastGift = i; api.say(`Het paard heeft de wortel opgegeten, en Sinterklaas liet ${sintGifts[i]} achter!`, 262, 785, 5000, 'l'); }
      else api.say('Er zit weer een verse wortel in de klomp. Hij staat klaar voor vannacht.', 262, 785, 5000, 'l');
      return true;
    } },
    { box: [205, 338, 90, 94], label: 'Chocoladeletter', egg: 'letter', act(api) {
      const letter = api.$('letter');
      if (biteN >= bites.length) {
        if (letter.style.display === 'none') { api.say('Op is op. Misschien brengt Sint een nieuwe?', 250, 340, 3500, 'l'); return; }
        letter.style.display = 'none';
        api.say('Op! Niemand heeft het gezien, toch?', 250, 340, 4000, 'l');
        clearTimeout(letterT);
        letterT = setTimeout(() => { api.$('bites').innerHTML = ''; biteN = 0; letter.style.display = ''; }, 15000);
        return;
      }
      const b = bites[biteN];
      api.$('bites').innerHTML += [[0, 0, 11], [9, 7, 8], [-7, 9, 8], [7, -9, 7]].map(o => `<circle cx="${b[0] + o[0]}" cy="${b[1] + o[1]}" r="${o[2]}"/>`).join('');
      api.say(biteMsgs[biteN], 250, 340, 3000, 'l');
      biteN++;
    } },
    cand(0, 345, 356, 'l'), cand(1, 655, 368, 'r'),
    H.clock([414, 30, 172, 398], 'Hé, de klok van Sint loopt even op hol!', [590, 300, 'l']),
    { box: [700, 318, 100, 108], label: 'Cadeautjes', egg: 'pakjes', act(api) {
      const now = new Date(), mo = now.getMonth(), d = now.getDate();
      if (mo === 11 && ((d === 5 && now.getHours() >= 17) || d === 6)) { api.rain('confetti'); api.say('Hoera, het is pakjesavond! Maak ze maar open.', 750, 318, 4000, 'r'); }
      else { api.shake('gifts'); api.say('Afblijven! Pas openmaken op pakjesavond.', 750, 318, 3000, 'r'); }
    } },
    { box: [830, 256, 96, 630], label: 'Staf van Sinterklaas', egg: 'staf', act(api) { poemI = (poemI + 1) % sintPoems.length; api.say(sintPoems[poemI], 845, 640, 9000, 'r'); } },
    H.rain([575, 833, 140, 63], 'Pepernoten', 'pepernoten', 'pepernoten', 'Mmm, pepernoten. Niet allemaal tegelijk opeten!', 'Het regent pepernoten!', [640, 836, 'r'])
  ]
});

/* ===================== KERST ===================== */
const sockMsgs = ['In deze sok zit een mandarijn.', 'Een zuurstok! Precies wat ik wilde.', 'Leeg... nog wel.', 'Een paar warme wollen sokken in een sok. Handig!', 'Een briefje: nog even geduld.'];
addTheme({
  slug: 'kerst',
  walkers: [{ draw: P => P.fig.kat(), y: 886, scale: 1.1, dur: 12000, bob: 2, h: 110, msgs: ['Miauw! Mag ik met de kerstballen spelen?', 'Prrr... lekker warm bij de haard.', 'Ik zoek de cadeautjes. Eentje is vast voor mij!'] }],
 name: 'Kerstklok', period: '6 t/m 26 december',
  tagline: 'De boom staat, de lichtjes branden.',
  hint: 'Klik op dingen in de kamer: er is van alles verstopt.',
  colors: { bg: '#0b1a12', bg2: '#183a26', ink: '#f3eedf', muted: '#c9d6c2', accent: '#f3d27a', accent2: '#d9a93f', line: 'rgba(243,210,122,.3)', btnInk: '#1a1208', foot: '#9fb59a', bubble: '#f6f0e0', bubbleInk: '#1d2a20' },
  back(S, P) {
    return P.wallPaper(S, { motif: 'star', base: '#173a28', line: '#1f4a33', dot: '#d9a93f' })
      + P.wainscot(S, { base: '#0f2a1c', panel: '#1d4430', rail: '#5a2a1a' })
      + P.floor(S, FLOOR)
      + P.windowLeft(S, { view: 'xmas', frame: '#e9e4da', seed: 8 })
      + P.garland(S, {})
      + P.fireplaceBrick(S, WHITE)
      + `<g id="socks">${P.stocking(S, 312, '#b3202a', '#f6f0e0')}${P.stocking(S, 432, '#2f7a45', '#f6f0e0')}${P.stocking(S, 592, '#b3202a', '#f6f0e0')}${P.stocking(S, 712, '#f6f0e0', '#b3202a')}</g>`
      + P.pinecones(S, 214, 426) + '<g fill="#b3202a"><circle cx="262" cy="414" r="5"/><circle cx="270" cy="418" r="5"/><circle cx="258" cy="421" r="5"/></g>'
      + P.candle(S, 0, 335, 426, 64, 'red')
      + P.candle(S, 1, 660, 426, 54, 'red')
      + P.pinecones(S, 712, 426)
      + P.clockMantel(S, { topper: 'star' })
      + P.xmasTree(S)
      + P.vignette(S, '#0b1a12');
  },
  front(S) {
    const box = (x, y, w, h, c, r) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c}" stroke="#000" stroke-opacity=".25"/><rect x="${x + w / 2 - 4}" y="${y}" width="8" height="${h}" fill="${r}"/><rect x="${x}" y="${y + h / 2 - 4}" width="${w}" height="8" fill="${r}"/><path d="M${x + w / 2} ${y}c-10-12-22-6-14 2c5 5 10 2 14-2zM${x + w / 2} ${y}c10-12 22-6 14 2c-5 5-10 2-14-2z" fill="${r}"/>`;
    return `<g id="floorGifts">${box(800, 830, 70, 52, '#2f6fb3', '#f3d27a')}${box(876, 814, 62, 68, '#b3202a', '#f6f0e0')}${box(940, 840, 50, 42, '#f3d27a', '#2f7a45')}</g>`;
  },
  event(now, K) {
    const D = K.date, y = now.getFullYear();
    let t = new Date(y, 11, 24), d = D.daysBetween(now, t);
    if (d < -2) { t = new Date(y + 1, 11, 24); d = D.daysBetween(now, t); }
    if (d > 1) return { main: K.ev.nights(d, 'Kerstavond'), sub: `Kerstavond valt op ${D.F.long.format(t)}.` };
    if (d === 1) return { main: 'Morgen is het Kerstavond!', sub: 'Nog één nachtje slapen.' };
    if (d === 0) return { main: 'Vanavond is het Kerstavond!', sub: 'Lichtjes aan en genieten.' };
    if (d === -1) return { main: 'Vrolijk kerstfeest!', sub: 'Het is Eerste Kerstdag.' };
    return { main: 'Fijne Tweede Kerstdag!', sub: 'Nog even nagenieten van de kerstboom.' };
  },
  hits: [
    H.fire(),
    cand(0, 335, 362, 'l'), cand(1, 660, 372, 'r'),
    H.clock([414, 30, 172, 398], 'De klok tikt de dagen tot Kerst weg!', [590, 300, 'l']),
    H.say([250, 440, 500, 112], 'Kerstsokken', 'sok', sockMsgs, [430, 450, 'l'], 3500),
    H.say([810, 340, 190, 450], 'Kerstboom', 'boom', ['Lichtjes uit.', 'En weer aan. Veel gezelliger!'], [840, 500, 'r'], 2500, (api, i) => { const g = api.$('treeLights'); if (g) g.setAttribute('class', i === 0 ? 'lightsOff' : ''); }),
    { box: [790, 800, 210, 95], label: 'Cadeaus onder de boom', egg: 'cadeau', act(api) {
      const now = new Date(), mo = now.getMonth(), d = now.getDate();
      if (mo === 11 && ((d === 24 && now.getHours() >= 18) || d === 25 || d === 26)) { api.rain('confetti'); api.say('Vrolijk kerstfeest! Pak maar uit.', 880, 800, 4000, 'r'); }
      else { api.shake('floorGifts'); api.say('Nog even wachten tot Kerst!', 880, 800, 3000, 'r'); }
    } },
    H.rain([30, 150, 125, 275], 'Raam', 'snow', 'sneeuw', 'Brrr, wat een koud glas.', 'Het sneeuwt... binnen?!', [93, 300, 'l'])
  ]
});

/* ===================== WINTER ===================== */
addTheme({
  slug: 'winter',
  walkers: [{ draw: P => P.fig.pinguin(), y: 886, scale: 1.2, dur: 18000, waddle: 8, bob: 1, h: 120, msgs: ['Brrr! Ik kom even opwarmen bij de haard.', 'Waggel, waggel.', 'Heb jij mijn ijsschots gezien?'] }],
 name: 'Winterklok', period: '27 december t/m 31 januari',
  tagline: 'Buiten sneeuw, binnen warme chocolademelk.',
  hint: 'Klik op dingen in de kamer: er is van alles verstopt.',
  colors: { bg: '#0b1220', bg2: '#1d2b44', ink: '#eef3fa', muted: '#b8c7dc', accent: '#cfe3ff', accent2: '#9cc3f0', line: 'rgba(207,227,255,.3)', btnInk: '#0b1a2e', foot: '#8ea3bf', bubble: '#eef5ff', bubbleInk: '#13233a' },
  back(S, P) {
    let flakes = '<path d="M-10 26Q500 126 1010 26" fill="none" stroke="#dfe8f5" stroke-width="1.5"/>';
    for (let i = 0; i < 18; i++) {
      const p = P.curve((i + 0.5) / 18), len = 26 + (i % 3) * 14, cy = p.y + len + 12;
      flakes += `<path d="M${P.f1(p.x)} ${P.f1(p.y)}V${P.f1(cy - 12)}" stroke="#dfe8f5" stroke-width="1"/><g stroke="#f4f8ff" stroke-width="2.4" stroke-linecap="round" transform="translate(${P.f1(p.x)} ${P.f1(cy)})"><path d="M0 -12V12M-10.4 -6 10.4 6M-10.4 6 10.4 -6"/></g>`;
    }
    return P.wallPaper(S, { motif: 'flake', base: '#1d2b44', line: '#2a3c5c', dot: '#cfe3ff' })
      + P.wainscot(S, { base: '#152036', panel: '#22324e', rail: '#e9e4da', line: '#ffffff' })
      + P.floor(S, { c1: '#4a3a2e', c2: '#221a14' })
      + P.windowLeft(S, { view: 'snow', frame: '#e9e4da', seed: 6 })
      + flakes
      + P.fireplaceBrick(S, WHITE)
      + P.pinecones(S, 206, 426)
      + P.mug(S, 330, 426, '#b3202a')
      + P.candle(S, 0, 640, 426, 62)
      + P.candle(S, 1, 690, 426, 46)
      + P.clockMantel(S, { topper: 'snowflake', metal: 'silver', wood: [[0, '#eef2f7'], [1, '#a9b5c3']], hand: '#1d2b44' })
      + P.sled(S)
      + P.vignette(S, '#0b1220');
  },
  front(S, P) { return P.logBasket(S, 214, 830); },
  event(now, K) {
    const m = now.getMonth(), d = now.getDate(), y = now.getFullYear();
    if (m === 11 && d >= 27 && d <= 30) return { main: K.ev.nights(31 - d, 'Oud en Nieuw'), sub: `Oudejaarsavond valt op ${K.date.F.long.format(new Date(y, 11, 31))}.` };
    if (m === 11 && d === 31) return { main: 'Vanavond is het Oudejaarsavond!', sub: `Om middernacht begint ${y + 1}.` };
    if (m === 0 && d === 1) return { main: 'Gelukkig nieuwjaar!', sub: `Welkom in ${y}.` };
    return K.ev.season(now, 0);
  },
  hits: [
    H.fire(),
    cand(0, 640, 364, 'r'), cand(1, 690, 380, 'r'),
    H.clock([414, 40, 172, 388], 'Brrr, de klok draait door de kou!', [590, 300, 'l']),
    H.say([296, 350, 70, 76], 'Chocolademelk', 'mok', ['Warme chocolademelk. Pas op, heet!', 'Nog een toefje slagroom erop.', 'Slurp! Lekker warm.'], [330, 360, 'l'], 3000),
    H.say([830, 560, 140, 330], 'Slee', 'slee', ['Zodra er sneeuw ligt: de heuvel af!', 'Wie trekt er? Ik zit al!', 'Muts op, sjaal om, slee mee.'], [850, 600, 'r'], 3500),
    { box: [196, 790, 136, 100], label: 'Houtmand', egg: 'hout', act(api) { api.boost(4000); api.sparks(30); api.say('Nog een blokje erop!', 262, 790, 2800, 'l'); } },
    H.rain([30, 150, 125, 275], 'Raam', 'snow', 'sneeuw', 'Kijk eens hoe het sneeuwt.', 'Sneeuwbui!', [93, 300, 'l'])
  ]
});

/* ===================== BLOKHUT ===================== */
addTheme({
  slug: 'blokhut',
  walkers: [{ draw: P => P.fig.eekhoorn(), y: 419, scale: 1.3, dur: 7000, x0: 170, x1: 830, hop: 10, fade: true, h: 80, msgs: ['Ik zoek mijn verstopte eikels!', 'Heb jij een nootje voor me?', 'Zoef! Ik ben er zo weer vandoor.'] }],
 name: 'Blokhutklok', period: 'februari',
  tagline: 'Diep in het bos, warm bij de haard.',
  hint: 'Klik op dingen in de blokhut: er is van alles verstopt.',
  colors: { bg: '#140d08', bg2: '#3a2414', ink: '#f5ead8', muted: '#d2bc9c', accent: '#ffc56b', accent2: '#e39b3a', line: 'rgba(255,197,107,.3)', btnInk: '#2a1608', foot: '#a88a64', bubble: '#f6ecd8', bubbleInk: '#3a2210' },
  clock: { cx: 500, cy: 252, pend: [500, 324], cuckoo: true },
  back(S, P) {
    return P.wallLogs(S, { light: '#a8743f', mid: '#7a5230', dark: '#3e2614' })
      + P.floor(S, { c1: '#5a3a20', c2: '#24160a' })
      + P.windowLeft(S, { view: 'forest', frame: '#5a3820', seed: 12 })
      + P.fireplaceStone(S)
      + P.lantern(S, 250, 418)
      + P.mug(S, 680, 418, '#2f6b3e')
      + P.pinecones(S, 730, 418)
      + P.clockCuckoo(S)
      + P.snowshoes(S)
      + P.vignette(S, '#140d08');
  },
  front(S, P) {
    const rug = `<g opacity=".95"><ellipse cx="500" cy="868" rx="300" ry="26" fill="#8a2a22"/><ellipse cx="500" cy="868" rx="270" ry="20" fill="none" stroke="#e3b44a" stroke-width="3" stroke-dasharray="10 8"/></g>`;
    return rug + P.boots(S, 214, 812, '#a0703f');
  },
  event(now, K) { return K.ev.season(now, 0); },
  hits: [
    H.fire(),
    H.say([218, 318, 64, 104], 'Lantaarn', 'lantaarn', ['Lantaarn uit. Nu alleen het haardvuur nog.', 'Lantaarn weer aan.'], [250, 320, 'l'], 2800, (api, i) => { ['lanternGlow', 'lanternFlame'].forEach(id => api.show(id, i !== 0)); const g = api.$('lanternGlass'); if (g) g.setAttribute('opacity', i === 0 ? '.15' : '.55'); }),
    { box: [388, 40, 224, 380], label: 'Koekoeksklok', egg: 'koekoek', act(api) { api.flash('cuckoo', 'pop', 2000); api.chime('cuckoo'); api.say('Koekoek! Koekoek!', 600, 160, 2500, 'l'); } },
    H.say([646, 350, 70, 70], 'Chocolademelk', 'mok', ['Warme chocolademelk na een dag in de sneeuw.', 'Met een marshmallow erin!'], [680, 352, 'r'], 3000),
    H.say([828, 590, 150, 300], 'Sneeuwschoenen', 'schoenen', ['Met sneeuwschoenen zak je niet weg in de sneeuw.', 'Morgen een tocht door het bos?'], [850, 600, 'r'], 3500),
    H.say([205, 800, 120, 90], 'Laarzen', 'laarzen', ['Nog nat van de sneeuw.', 'Laarzen uit bij de deur, dat is de regel in de blokhut.'], [262, 795, 'l'], 3200),
    H.rain([30, 150, 125, 275], 'Raam', 'snow', 'sneeuw', 'Het bos is helemaal wit.', 'Sneeuwstorm!', [93, 300, 'l'])
  ]
});

/* ===================== VOORJAAR ===================== */
function easterEvent(now, K, allowSummer) {
  const D = K.date;
  let e = D.easter(now.getFullYear()), d = D.daysBetween(now, e);
  if (d < -1) { if (allowSummer) return K.ev.season(now, 1); e = D.easter(now.getFullYear() + 1); d = D.daysBetween(now, e); }
  if (allowSummer && d > 60) return K.ev.season(now, 1);
  if (d > 1) return { main: K.ev.nights(d, 'Pasen'), sub: `Eerste paasdag valt op ${D.F.long.format(e)}.` };
  if (d === 1) return { main: 'Morgen is het Pasen!', sub: 'De paashaas is al onderweg.' };
  if (d === 0) return { main: 'Vrolijk Pasen!', sub: 'Het is Eerste Paasdag.' };
  return { main: 'Fijne Tweede Paasdag!', sub: 'Nog eieren over?' };
}
addTheme({
  slug: 'voorjaar',
  walkers: [{ draw: P => P.fig.eendjes(), y: 887, scale: 1, dur: 16000, bob: 2, noFlip: true, x0: -60, x1: 1260, h: 80, msgs: ['Kwak! Op weg naar de sloot.', 'Piep piep piep!', 'Even tellen: een, twee, drie. Iedereen is er!'] }],
 name: 'Voorjaarsklok', period: 'maart t/m mei (behalve rond Pasen)',
  tagline: 'De bloesem bloeit, de avonden zijn nog fris.',
  hint: 'Klik op dingen in de kamer: er is van alles verstopt.',
  colors: { bg: '#13201a', bg2: '#2e4a36', ink: '#f4f1e6', muted: '#cfdcc4', accent: '#ffd6e2', accent2: '#f6a3c3', line: 'rgba(255,214,226,.3)', btnInk: '#3a1424', foot: '#9fb59a', bubble: '#fdf6ea', bubbleInk: '#2c3a24' },
  back(S, P) {
    return P.wallPaper(S, { motif: 'flower', base: '#3f6a4c', line: '#4f7d5b', dot: '#ffd6e2' })
      + P.wainscot(S, { base: '#2f5038', panel: '#3f6a4c', rail: '#f0ebe0', line: '#ffffff' })
      + P.floor(S, FLOOR)
      + P.windowLeft(S, { view: 'blossom', frame: '#f0ebe0', seed: 14 })
      + P.bunting(S, ['#f6a3c3', '#ffd94a', '#8fd0f0', '#b9e48a'])
      + P.fireplaceBrick(S, WHITE)
      + P.tulips(S, 250, 426, ['#e84a5f', '#ffd94a', '#f6a3c3'])
      + P.candle(S, 0, 345, 426, 60, 'pastel')
      + P.candle(S, 1, 630, 426, 50, 'pastel')
      + P.birdhouse(S, 712, 426)
      + P.clockMantel(S, { topper: 'bird' })
      + P.blossomVase(S, false)
      + P.vignette(S, '#13201a');
  },
  front(S, P) { return P.boots(S, 214, 812, '#e8c33a'); },
  event(now, K) { return easterEvent(now, K, true); },
  hits: [
    H.fire(),
    cand(0, 345, 366, 'l'), cand(1, 630, 376, 'r'),
    { box: [414, 80, 172, 348], label: 'Klok met vogel', egg: 'klok', act(api) { if (api.spin()) { api.chime('chirp'); api.say('Tjilp! Het vogeltje laat de klok rondjes draaien.', 590, 300, 3000, 'l'); } } },
    H.say([680, 330, 64, 96], 'Vogelhuisje', 'vogel', ['Kijk, er woont iemand!', 'Weer naar binnen gevlogen.'], [712, 340, 'r'], 2800, (api, i) => { api.show('peek', i === 0); if (i === 0) api.chime('chirp'); }),
    H.say([212, 318, 80, 108], 'Tulpen', 'tulp', ['Verse tulpen van de markt.', 'Rood, geel en roze: echt Hollands.', 'Niet vergeten: water geven!'], [250, 320, 'l'], 3000),
    H.say([205, 800, 120, 90], 'Laarzen', 'laarzen', ['Regenlaarzen: april doet wat hij wil.', 'Plassen springen kan altijd.'], [262, 795, 'l'], 3200),
    H.rain([30, 150, 125, 275], 'Raam', 'petals', 'bloesem', 'Wat een mooie bloesemboom.', 'Een bloesemregen!', [93, 300, 'l'])
  ]
});

/* ===================== PASEN ===================== */
const EGGS = [[120, 862, '#f6a3c3', -20], [392, 866, '#ffd94a', 15], [612, 858, '#8fd0f0', -10], [772, 874, '#b9e48a', 25], [176, 596, '#c9a3f6', 0], [800, 414, '#ffb07a', 10]];
const eggFound = {};
let haasN = 0;
addTheme({
  slug: 'pasen',
  walkers: [{ draw: P => P.fig.paashaas(), y: 884, scale: 1.3, dur: 10000, hop: 38, h: 130, msgs: ['Ik heb nog een paar eieren te verstoppen!', 'Niet verder vertellen waar ik ze leg!', 'Hop, hop, hop, ik heb haast!'] }],
 name: 'Paasklok', period: 'twee weken voor Pasen t/m Tweede Paasdag',
  tagline: 'De paashaas is geweest. Zoek jij de eieren?',
  hint: 'Er zijn zes paaseieren verstopt in de kamer. Vind jij ze allemaal?',
  colors: { bg: '#1c1426', bg2: '#3d2c52', ink: '#fbf5ea', muted: '#dcd0e6', accent: '#ffe27a', accent2: '#f6c84a', line: 'rgba(255,226,122,.3)', btnInk: '#2a1a08', foot: '#b3a3c4', bubble: '#fff8e8', bubbleInk: '#3a2a4a' },
  back(S, P) {
    return P.wallPaper(S, { motif: 'egg', base: '#5a4478', line: '#6a548a', dot: '#ffe27a' })
      + P.wainscot(S, { base: '#45345e', panel: '#5a4478', rail: '#f0ebe0', line: '#ffffff' })
      + P.floor(S, FLOOR)
      + P.windowLeft(S, { view: 'meadow', frame: '#f0ebe0', seed: 15 })
      + P.bunting(S, ['#f6a3c3', '#ffe27a', '#8fd0f0', '#b9e48a', '#c9a3f6'])
      + P.fireplaceBrick(S, WHITE)
      + P.eggBasket(S, 250, 426)
      + P.candle(S, 0, 350, 426, 58, 'pastel')
      + P.candle(S, 1, 625, 426, 48, 'pastel')
      + P.chocBunny(S, 700, 426)
      + P.clockMantel(S, { topper: 'bunny' })
      + P.blossomVase(S, true)
      + P.vignette(S, '#1c1426');
  },
  front(S, P) { return EGGS.map((e, i) => P.hiddenEgg('pe' + i, e[0], e[1], e[2], e[3])).join(''); },
  event(now, K) { return easterEvent(now, K, false); },
  hits: [
    H.fire(),
    cand(0, 350, 368, 'l'), cand(1, 625, 378, 'r'),
    H.clock([414, 40, 172, 388], 'Tik tak, de paashaas heeft haast!', [590, 300, 'l']),
    { box: [664, 290, 76, 136], label: 'Chocolade paashaas', egg: 'haas', act(api) {
      haasN++;
      if (haasN === 1) { api.show('bunnyEars', false); api.say('Hap! Eerst de oren, natuurlijk.', 700, 300, 3000, 'r'); }
      else if (haasN === 2) api.say('Nog meer chocola? Morgen weer.', 700, 300, 3000, 'r');
      else { haasN = 0; api.show('bunnyEars', true); api.say('Er is een nieuwe paashaas! Hoe kan dat nou?', 700, 300, 3000, 'r'); }
    } },
    H.say([196, 344, 108, 80], 'Mandje met eieren', 'mand', ['Een mandje vol gekleurde eieren.', 'Wie heeft dat blauwe ei geverfd?', 'Eitje tikken? Ik win!'], [250, 344, 'l'], 3000),
    H.rain([812, 450, 186, 410], 'Paastak', 'eggs', 'paastak', 'Wat een mooie paastak.', 'Het regent paaseieren!', [860, 520, 'r'])
  ].concat(EGGS.map((e, i) => ({ box: [e[0] - 24, e[1] - 24, 48, 48], label: 'Paasei', egg: 'zoeken', act(api) {
    if (eggFound[i]) return true;
    eggFound[i] = true;
    api.show('pe' + i, false);
    const left = EGGS.length - Object.keys(eggFound).length;
    if (left > 0) api.say(`Gevonden! Nog ${left} ${left === 1 ? 'ei' : 'eieren'} te gaan.`, e[0], e[1] - 20, 2500);
    else { api.egg('zoeken'); api.rain('eggs'); api.say('Alle paaseieren gevonden!', e[0], e[1] - 20, 4000); }
    return true;
  } })))
});

/* ===================== ZOMER ===================== */
const mallowSteps = [['#fbf6ee', 'Nog een verse marshmallow. Even boven het vuur houden...'], ['#e8b56a', 'Goudbruin! Precies goed.'], ['#3a2a1c', 'Oeps, aangebrand!']];
let mallowI = 0;
addTheme({
  slug: 'zomer',
  walkers: [
    { draw: P => P.fig.krab(), y: 862, scale: 1.3, dur: 15000, bob: 1, noFlip: true, h: 70, msgs: ['Zijwaarts is ook vooruit!', 'Knip knap! Ik zoek de zee.'] },
    { draw: P => P.fig.zeilboot(), y: 506, scale: 0.9, dur: 45000, bob: 1.5, x0: -80, x1: 1080, h: 90, msgs: ['Ahoy! Een zeilbootje op weg naar de haven.'] }
  ],
 name: 'Zomerklok', period: 'juni t/m augustus',
  tagline: 'Zomeravond aan zee, bij het kampvuur.',
  hint: 'Klik rond bij het kampvuur: er is van alles te ontdekken.',
  colors: { bg: '#0a0f26', bg2: '#1f2552', ink: '#f4efe2', muted: '#c9c3dc', accent: '#ffd27a', accent2: '#f0a24a', line: 'rgba(255,210,122,.3)', btnInk: '#2a1608', foot: '#9a96b8', bubble: '#fff6e0', bubbleInk: '#2a2240' },
  camp: true, soundName: 'Kampvuurgeluid', crickets: true, glow: 1.2,
  clock: { cx: 500, cy: 210, pend: null },
  back(S, P) { return P.campScene(S) + P.clockMoon(S); },
  front(S, P) { return P.campFront(S); },
  event(now, K) {
    const dZ = K.date.daysBetween(now, K.date.nextSeason(now, 1)), dH = K.date.daysBetween(now, K.date.nextSeason(now, 2));
    return dH < dZ ? K.ev.season(now, 2) : K.ev.season(now, 1);
  },
  hits: [
    H.fire(),
    { box: [408, 118, 184, 184], label: 'Maanklok', egg: 'klok', act(api) { if (api.spin()) { api.chime('bells'); api.say('De maan draait een rondje!', 600, 260, 3000, 'l'); } } },
    H.say([60, 560, 260, 220], 'Tent', 'tent', ['Zzz... hier slaapt iemand al.', 'Snurk. Morgen weer zwemmen.'], [190, 560, 'l'], 3000, api => { const z = api.$('zzz'); if (z) { z.setAttribute('class', ''); void z.getBoundingClientRect(); z.setAttribute('class', 'zzz'); } }),
    { box: [530, 606, 70, 66], label: 'Marshmallow', egg: 'marshmallow', act(api) { mallowI = (mallowI + 1) % mallowSteps.length; const m = api.$('mallow'); if (m) m.setAttribute('fill', mallowSteps[mallowI][0]); api.say(mallowSteps[mallowI][1], 560, 610, 3000, 'l'); } },
    { box: [725, 595, 110, 170], label: 'Gitaar', egg: 'gitaar', act(api) { api.chime('strum'); api.say('Iedereen zingt mee bij het kampvuur!', 780, 600, 3000, 'r'); } },
    H.say([620, 466, 370, 90], 'Zee', 'zee', ['Hoor je de golven ruisen?', 'Morgen weer de zee in!', 'Kijk, de maan schijnt op het water.'], [800, 470, 'r'], 3000),
    H.rain([20, 20, 360, 380], 'Sterrenhemel', 'stars', 'sterren', 'Zie je al die sterren?', 'Vallende sterren! Doe snel een wens.', [200, 380, 'l'])
  ]
});
})();
