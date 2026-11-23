// Geluid met de Web Audio API: alles wordt in code gegenereerd (geen audiobestanden).
//
// - Effecten (stap, middenberm, overkant, aanrijding, …) als korte synth-geluidjes.
// - Elk voertuig een eigen motorgeluid (oscillator + gefilterde ruis) met
//   * stereo-panning op basis van de horizontale positie t.o.v. de speler,
//   * volume en helderheid (filter) afhankelijk van de afstand,
//   * toonhoogte die stijgt als het voertuig nadert (overdreven doppler),
//   * eigen klank per type: vrachtwagen laag en zwaar, motor hoog en ratelend.
// In de normale modus klinkt het verkeer zacht op de achtergrond; noncha mode zet het vol open.

const ENGINES = {
  car: { freq: 78, wave: 'sawtooth', lp: 700, noise: 900, noiseGain: 0.35, gain: 0.5 },
  van: { freq: 62, wave: 'sawtooth', lp: 560, noise: 700, noiseGain: 0.4, gain: 0.55 },
  truck: { freq: 36, wave: 'sawtooth', lp: 320, noise: 220, noiseGain: 0.7, gain: 0.85, sub: true },
  motor: { freq: 150, wave: 'sawtooth', lp: 2000, noise: 2400, noiseGain: 0.25, gain: 0.45, tremolo: 24 },
  sport: { freq: 105, wave: 'sawtooth', lp: 1500, noise: 1700, noiseGain: 0.3, gain: 0.6 }, // fel en hoog
  tractor: { freq: 28, wave: 'square', lp: 260, noise: 200, noiseGain: 0.5, gain: 0.75, sub: true, tremolo: 7 }, // puf-puf
  scooter: { freq: 190, wave: 'sawtooth', lp: 2600, noise: 3000, noiseGain: 0.25, gain: 0.32, tremolo: 32 }, // snorfiets
  // Fietsen: zacht zoemen van de banden, en een belletje als ze vlak bij je zijn
  bike: { freq: 140, wave: 'triangle', lp: 300, noise: 2600, noiseGain: 0.6, gain: 0.16, bell: true },
  bakfiets: { freq: 120, wave: 'triangle', lp: 300, noise: 2200, noiseGain: 0.7, gain: 0.2, bell: true },
  // DSI-colonne: zwarte auto's zonder sirene; de politiemotoren voorop en achteraan met een snelle sirene
  dsi: { freq: 70, wave: 'sawtooth', lp: 650, noise: 850, noiseGain: 0.35, gain: 0.42 },
  policemotor: { freq: 160, wave: 'sawtooth', lp: 2200, noise: 2600, noiseGain: 0.25, gain: 0.45, tremolo: 26, siren: { lo: 740, hi: 1180, rate: 2.5 } },
  // Hulpdiensten: motor + tweetoonsirene (lo/hi in Hz, rate = wisselingen per seconde / 2)
  fire: { freq: 42, wave: 'sawtooth', lp: 380, noise: 260, noiseGain: 0.6, gain: 0.8, sub: true, siren: { lo: 440, hi: 587, rate: 0.75 } },
  ambulance: { freq: 64, wave: 'sawtooth', lp: 560, noise: 700, noiseGain: 0.4, gain: 0.55, siren: { lo: 554, hi: 740, rate: 0.9 } },
  police: { freq: 80, wave: 'sawtooth', lp: 750, noise: 950, noiseGain: 0.35, gain: 0.5, siren: { lo: 660, hi: 880, rate: 1.3 } },
};

const SIREN_RANGE = 60; // een sirene hoor je van ver (vakjes)

const SMOOTH = 0.05; // tijdconstante (s) voor vloeiende parameterwijzigingen
const HEAR_RANGE = 9; // voertuigen verder dan dit (in vakjes, horizontaal) krijgen geen stem
const SOUND_SPEED = 18; // "geluidssnelheid" in vakjes/s: overdreven doppler, goed hoorbaar

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.engineLevel = 0;
    this.voices = new Map(); // voertuig -> stem
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Moet vanuit een gebruikersactie (toets/tik) worden aangeroepen i.v.m. autoplay-regels. */
  unlock() {
    // Niet elke toets telt als gebruikersactie (bijv. Esc); dan nog geen AudioContext maken.
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    comp.connect(this.analyser);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.engines = ctx.createGain();
    this.engines.gain.value = 0;
    this.engines.connect(this.master);
    // Sirenes apart: ook in de normale modus (waar motoren zacht zijn) goed te horen
    this.sirens = ctx.createGain();
    this.sirens.gain.value = 0;
    this.sirens.connect(this.master);

    // Gedeelde witte ruis (2 s, loopt rond)
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(enabled, volume) {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? volume : 0, this.ctx.currentTime, 0.02);
  }

  // --- Effecten ---------------------------------------------------------------------

  tone(freq, start, dur, { type = 'sine', gain = 0.3, endFreq = null, attack = 0.005, pan = 0 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    this.toOutput(osc.connect(g), pan);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** Verbindt met de effectenbus, eventueel links/rechts geplaatst. */
  toOutput(node, pan = 0) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.sfx);
  }

  noiseBurst(start, dur, { freq = 1000, endFreq = null, q = 1, gain = 0.3, type = 'bandpass', pan = 0 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    this.toOutput(src.connect(f).connect(g), pan);
    src.start(start, Math.random() * 1.5);
    src.stop(start + dur + 0.05);
  }

  /**
   * @param {string} name
   * @param {object} [opts] { pan: -1..1 (links/rechts), row: 0..8 (voor 'where') }
   */
  play(name, { pan = 0, row = 0, start = 8 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'step':
        this.noiseBurst(t, 0.035, { freq: 3200, q: 2, gain: 0.25, pan });
        this.tone(520, t, 0.05, { endFreq: 380, gain: 0.12, pan });
        break;
      case 'blocked': // tegen de rand van het speelveld
        this.tone(110, t, 0.12, { type: 'square', endFreq: 80, gain: 0.12, pan });
        break;
      case 'median': // middenberm: tweetonig belletje
        this.tone(660, t, 0.18, { type: 'triangle', gain: 0.28, pan });
        this.tone(990, t + 0.1, 0.25, { type: 'triangle', gain: 0.25, pan });
        break;
      case 'start': // terug op de startberm
        this.tone(440, t, 0.15, { type: 'triangle', gain: 0.18, pan });
        break;
      case 'sensor': // noncha: er komt iets aan in de strook vóór je (hoog, kort)
        this.tone(1320, t, 0.06, { type: 'sine', gain: 0.22, pan });
        break;
      case 'danger': // noncha: er komt iets aan in jóuw strook (laag, dringend)
        this.tone(440, t, 0.08, { type: 'square', gain: 0.16, pan });
        break;
      case 'where': {
        // Waar sta ik? Toonhoogte = rij (hoger = verder), links/rechts = kolom.
        // 0 = startberm … 8 = overkant (bij minder rijen naar verhouding)
        const steps = ((start - row) / Math.max(1, start)) * 8;
        const f = 330 * 2 ** (steps / 8);
        this.tone(f, t, 0.12, { type: 'sine', gain: 0.3, pan });
        this.tone(f, t + 0.16, 0.12, { type: 'sine', gain: 0.3, pan });
        break;
      }
      case 'finish': // overkant: vrolijk loopje
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, { type: 'square', gain: 0.12 }));
        this.tone(1568, t + 0.32, 0.4, { type: 'triangle', gain: 0.18 });
        break;
      case 'levelstart':
        this.tone(392, t, 0.12, { type: 'triangle', gain: 0.18 });
        this.tone(587, t + 0.1, 0.18, { type: 'triangle', gain: 0.18 });
        break;
      case 'hit': // krak + bonk + "boing"
        this.noiseBurst(t, 0.35, { freq: 3500, endFreq: 300, q: 0.7, gain: 0.6, type: 'lowpass' });
        this.tone(140, t, 0.3, { endFreq: 40, gain: 0.6 });
        this.tone(750, t + 0.12, 0.5, { type: 'triangle', endFreq: 160, gain: 0.25 });
        break;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, t + i * 0.22, 0.3, { type: 'square', gain: 0.1 }));
        break;
      case 'skid': // piepende banden (remmen voor een aanrijding)
        this.noiseBurst(t, 0.6, { freq: 2600, endFreq: 1700, q: 8, gain: 0.35, pan });
        this.tone(1900, t, 0.55, { type: 'sawtooth', endFreq: 1500, gain: 0.05, pan });
        break;
      case 'crash': // klap, blik en glas
        this.noiseBurst(t, 0.7, { freq: 1800, endFreq: 200, q: 0.6, gain: 0.8, type: 'lowpass', pan });
        this.tone(90, t, 0.4, { endFreq: 35, gain: 0.7, pan });
        this.tone(160, t + 0.08, 0.3, { type: 'square', endFreq: 60, gain: 0.25, pan });
        for (let i = 0; i < 6; i++) {
          this.tone(3200 + Math.random() * 2400, t + 0.12 + i * 0.05, 0.08, { type: 'sine', gain: 0.06, pan });
        }
        break;
      case 'bell': // fietsbel: tring-tring
        for (const d of [0, 0.16]) {
          this.tone(2350, t + d, 0.14, { type: 'sine', gain: 0.16, pan });
          this.tone(3120, t + d, 0.1, { type: 'sine', gain: 0.07, pan });
        }
        break;
      case 'ui':
        this.tone(880, t, 0.05, { type: 'triangle', gain: 0.08 });
        break;
      default:
        break;
    }
  }

  /** Geluidstest: een auto die in ±2,5 s van links naar rechts langsrijdt. */
  playPassBy() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const v = { type: 'car', x: 0, length: 1.5, speed: 4 };
    const voice = this.createVoice(v, this.sfx);
    const dur = 2.6;
    voice.gain.gain.setValueAtTime(0.0001, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.9, now + dur / 2);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    if (voice.pan) {
      voice.pan.pan.setValueAtTime(-1, now);
      voice.pan.pan.linearRampToValueAtTime(1, now + dur);
    }
    const f = voice.osc.frequency.value;
    voice.osc.frequency.setValueAtTime(f * 1.25, now);
    voice.osc.frequency.linearRampToValueAtTime(f * 0.8, now + dur);
    for (const s of voice.sources) s.stop(now + dur + 0.1);
  }

  // --- Motorgeluiden ----------------------------------------------------------------

  /**
   * Per frame: stemmen aanmaken/bijwerken/opruimen.
   * @param {object} traffic  Traffic-object met lanes
   * @param {{x: number, row: number}|null} listener  positie van de speler (vakjes; x = midden)
   * @param {number} level  0 = stil, 0.35 = normale modus, 1 = noncha
   */
  updateTraffic(traffic, listener, level) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (level !== this.engineLevel) {
      this.engineLevel = level;
      this.engines.gain.setTargetAtTime(level, now, 0.15);
      this.sirens.gain.setTargetAtTime(level > 0 ? 0.9 : 0, now, 0.15);
    }
    if (level === 0 || !listener || !this.ready) {
      if (this.voices.size && level === 0) this.stopAll();
      return;
    }

    const alive = new Set();
    for (const lane of traffic.lanes) {
      for (const v of lane.vehicles) {
        const dx = v.x + v.length / 2 - listener.x;
        if (Math.abs(dx) > (v.emergency ? SIREN_RANGE : HEAR_RANGE) + v.length / 2) continue;
        alive.add(v);
        let voice = this.voices.get(v);
        if (!voice) {
          voice = this.createVoice(v);
          this.voices.set(v, voice);
        }
        this.steer(voice, v, lane, dx, listener, now);
      }
    }
    for (const [v, voice] of this.voices) {
      if (!alive.has(v)) {
        this.release(voice, now);
        this.voices.delete(v);
      }
    }
  }

  createVoice(v, bus = this.engines) {
    const ctx = this.ctx;
    const spec = ENGINES[v.type] || ENGINES.car;
    const now = ctx.currentTime;
    // Kleine variatie per voertuig zodat ze niet allemaal gelijk klinken
    const detune = 0.9 + Math.random() * 0.2;

    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.value = spec.freq * detune;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = spec.lp;
    lp.Q.value = 1.5;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = spec.noise;
    bp.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = spec.noiseGain;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    const sources = [osc, noise];
    let tone = osc.connect(lp);
    if (spec.tremolo) {
      // Ratelende motor: amplitude-modulatie
      const trem = ctx.createGain();
      trem.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = spec.tremolo * detune;
      const depth = ctx.createGain();
      depth.gain.value = 0.4;
      lfo.connect(depth).connect(trem.gain);
      tone = tone.connect(trem);
      sources.push(lfo);
    }
    tone.connect(gain);
    noise.connect(bp).connect(noiseGain).connect(gain);
    if (spec.sub) {
      // Vrachtwagen: extra lage brom
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = (spec.freq / 2) * detune;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      sub.connect(subGain).connect(lp);
      sources.push(sub);
    }
    if (out) gain.connect(out).connect(bus);
    else gain.connect(bus);

    // Tweetoonsirene: een blokgolf-LFO laat de toon wisselen tussen lo en hi
    let siren = null;
    if (spec.siren && this.sirens) {
      const { lo, hi, rate } = spec.siren;
      const sOsc = ctx.createOscillator();
      sOsc.type = 'square';
      sOsc.frequency.value = (lo + hi) / 2;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = (hi - lo) / 2;
      lfo.connect(depth).connect(sOsc.frequency);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      const sGain = ctx.createGain();
      sGain.gain.value = 0.0001;
      const sPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      sOsc.connect(tone).connect(sGain);
      if (sPan) sGain.connect(sPan).connect(this.sirens);
      else sGain.connect(this.sirens);
      sources.push(sOsc, lfo);
      siren = { osc: sOsc, gain: sGain, pan: sPan };
    }

    for (const s of sources) {
      if (s === noise) s.start(now, Math.random() * 1.8);
      else s.start(now);
    }
    return { spec, detune, sources, osc, lp, gain, pan: out, bp, siren };
  }

  steer(voice, v, lane, dx, listener, now) {
    const { spec } = voice;
    const rows = Math.abs(lane.row - listener.row);
    const dist = Math.hypot(dx, rows * 1.3);
    // Hard dichtbij, snel zachter met afstand
    const vol = spec.gain / (1 + (dist / 2.2) ** 2);
    // Verdere rijstroken klinken doffer, zodat "deze strook" en "de volgende" te onderscheiden zijn
    const muffle = 1 / (1 + rows * 0.6);
    // Doppler: naderend = hoger, wegrijdend = lager
    const approach = dist > 0.01 ? (-dx / dist) * lane.dir * v.speed : 0;
    const doppler = Math.min(1.5, Math.max(0.7, 1 / (1 - approach / SOUND_SPEED)));
    const rev = 0.85 + v.speed * 0.05; // sneller = hoger toerental

    voice.gain.gain.setTargetAtTime(Math.max(0.0001, vol), now, SMOOTH);
    voice.osc.frequency.setTargetAtTime(spec.freq * voice.detune * rev * doppler, now, SMOOTH);
    voice.lp.frequency.setTargetAtTime(spec.lp * muffle * doppler, now, SMOOTH);
    voice.bp.frequency.setTargetAtTime(spec.noise * muffle * doppler, now, SMOOTH);
    if (voice.pan) voice.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / 5)), now, SMOOTH);
    if (spec.bell && !voice.rang && dist < 2.2 && approach > 0) {
      // Fietser vlak bij je: tring-tring
      voice.rang = true;
      this.play('bell', { pan: Math.max(-1, Math.min(1, dx / 4)) });
    }
    if (voice.siren) {
      // Van ver al hoorbaar, dichtbij hard; hoger als hij nadert (doppler)
      const s = voice.siren;
      s.gain.gain.setTargetAtTime(Math.max(0.0001, 0.45 / (1 + (dist / 8) ** 2)), now, SMOOTH);
      s.osc.detune.setTargetAtTime(1200 * Math.log2(doppler), now, SMOOTH);
      if (s.pan) s.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / 6)), now, SMOOTH);
    }
  }

  release(voice, now) {
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    for (const s of voice.sources) {
      try {
        s.stop(now + 0.4);
      } catch (e) {
        // al gestopt
      }
    }
  }

  stopAll() {
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) this.release(voice, now);
    this.voices.clear();
  }

  /** Huidig geluidsniveau (RMS), voor tests. */
  level() {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += x * x;
    return Math.sqrt(sum / buf.length);
  }
}
