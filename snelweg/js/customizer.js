// Karaktereditor: profielen (naam + poppetje + gezicht), kleuren en hoofddeksel, met live voorbeeld.
//
// Wijzigingen worden direct opgeslagen (net als instellingen), zodat er bij het wisselen van
// profiel niets verloren gaat. Het gekozen profiel is het profiel waarmee je speelt.
//
// Keuzes zijn radiogroepen (role="radio") met een "roving tabindex": alleen de gekozen
// optie is met Tab/pijl omhoog-omlaag bereikbaar, pijl links/rechts wisselt binnen de groep
// (afgehandeld in main.js). Zo is de editor volledig met het toetsenbord te bedienen.

import {
  BASES,
  HATS,
  SHIRT_COLORS,
  PANTS_COLORS,
  HAT_COLORS,
  randomLook,
  paintAvatar,
  paintFull,
} from './character.js';
import {
  loadProfiles,
  saveProfile,
  deleteProfile,
  newProfile,
  StorageError,
  MAX_PROFILES,
  NAME_MAX_LENGTH,
} from './storage.js';

const DELETE_CONFIRM_MS = 4000;

function makeCanvas(cssSize) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = canvas.height = Math.round(cssSize * dpr);
  canvas.style.width = canvas.style.height = `${cssSize}px`;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function radio(label, value) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-checked', 'false');
  btn.tabIndex = -1;
  btn.dataset.value = value;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  return btn;
}

export const displayName = (profile) => profile?.name?.trim() || 'Speler';

export class Customizer {
  /**
   * @param {HTMLElement} root  het scherm (#screen-customize)
   * @param {object} handlers  { onChange(profile), onPickPhoto(file) }
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.profiles = loadProfiles();
    this.status = root.querySelector('#cz-status');
    this.nameInput = root.querySelector('#cz-name');
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.deleteBtn = root.querySelector('[data-cz="delete"]');
    this.newBtn = root.querySelector('[data-cz="new"]');
    this.groups = {};
    this.baseCanvases = [];

    // Voorbeeld: resolutie voor 180 css-px; de weergavegrootte komt uit de CSS.
    this.preview = makeCanvas(180);
    this.preview.removeAttribute('style');
    this.preview.removeAttribute('aria-hidden');
    this.preview.setAttribute('role', 'img');
    root.querySelector('.cz-preview').prepend(this.preview);

    // Basispoppetjes met mini-voorbeeld
    const baseGroup = root.querySelector('[data-group="base"]');
    for (const [id, base] of Object.entries(BASES)) {
      const btn = radio(base.name, id);
      btn.className = 'cz-base';
      const canvas = makeCanvas(48);
      this.baseCanvases.push({ id, canvas });
      const name = document.createElement('span');
      name.textContent = base.name;
      name.setAttribute('aria-hidden', 'true');
      btn.append(canvas, name);
      baseGroup.append(btn);
    }

    this.fillSwatches('shirt', SHIRT_COLORS);
    this.fillSwatches('pants', PANTS_COLORS);
    this.fillSwatches('hatColor', HAT_COLORS);

    const hatGroup = root.querySelector('[data-group="hat"]');
    for (const hat of HATS) {
      const btn = radio(hat.name, hat.id);
      btn.className = 'cz-seg';
      btn.textContent = hat.name;
      btn.removeAttribute('title');
      hatGroup.append(btn);
    }

    for (const group of root.querySelectorAll('[data-group]')) {
      this.groups[group.dataset.group] = group;
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('[role="radio"]');
        if (btn) this.setLook(group.dataset.group, btn.dataset.value);
      });
    }

    // Profielkeuze
    this.profileGroup = root.querySelector('[data-group-profiles]');
    this.profileGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('[role="radio"]');
      if (btn) this.selectProfile(btn.dataset.value);
    });
    this.newBtn.addEventListener('click', () => this.addProfile());
    this.deleteBtn.addEventListener('click', () => this.onDeleteClick());
    this.nameInput.addEventListener('input', () => {
      this.profile.name = this.nameInput.value.slice(0, NAME_MAX_LENGTH);
      this.save();
      this.renderProfiles();
    });

    // Gezicht
    const fileInput = root.querySelector('#cz-file');
    const cameraInput = root.querySelector('#cz-camera');
    root.querySelector('[data-cz="photo"]').addEventListener('click', () => fileInput.click());
    const cameraBtn = root.querySelector('[data-cz="camera"]');
    cameraBtn.addEventListener('click', () => cameraInput.click());
    // De camera-knop heeft alleen zin op apparaten met een touchscreen (telefoon/tablet).
    cameraBtn.hidden = !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    for (const input of [fileInput, cameraInput]) {
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = ''; // zelfde bestand later opnieuw kunnen kiezen
        if (file) this.handlers.onPickPhoto(file);
      });
    }
    root.querySelector('[data-cz="face-remove"]').addEventListener('click', () => {
      delete this.profile.face;
      delete this.profile.faceSmall;
      this.save();
      this.update();
      this.root.querySelector('[data-cz="photo"]').focus();
    });

    root.querySelector('[data-cz="random"]').addEventListener('click', () => {
      this.profile.look = randomLook();
      this.save();
      this.update();
    });
  }

  fillSwatches(key, colors) {
    const group = this.root.querySelector(`[data-group="${key}"]`);
    for (const [color, name] of colors) {
      const btn = radio(name, color);
      btn.className = 'swatch';
      btn.style.setProperty('--c', color);
      group.append(btn);
    }
  }

  get profile() {
    return this.profiles.list.find((p) => p.id === this.profiles.activeId);
  }

  open() {
    this.profiles = loadProfiles();
    this.resetDelete();
    this.setStatus('');
    this.update();
  }

  setStatus(text, kind = '') {
    this.status.textContent = text;
    this.status.className = `status ${kind}`.trim();
  }

  /** Huidige profiel opslaan (en actief maken). Geeft false terug als het mislukt. */
  save() {
    const profile = this.profile;
    // Losse huid/haar-kleuren (oude data) vervallen: het basispoppetje bepaalt die.
    delete profile.look.skin;
    delete profile.look.hair;
    try {
      this.profiles = saveProfile(profile);
      this.setStatus('');
      this.handlers.onChange(this.profile);
      return true;
    } catch (err) {
      this.setStatus(err instanceof StorageError ? err.message : 'Opslaan is niet gelukt.', 'error');
      return false;
    }
  }

  setLook(key, value) {
    this.profile.look = { ...this.profile.look, [key]: value };
    this.save();
    this.update();
  }

  /** Nieuw gezicht vanuit de gezichteditor. */
  setFace({ face, faceSmall }) {
    const before = { face: this.profile.face, faceSmall: this.profile.faceSmall };
    this.profile.face = face;
    this.profile.faceSmall = faceSmall;
    if (!this.save()) {
      // Niet bewaard (bijv. opslag vol): oude situatie terugzetten.
      Object.assign(this.profile, before);
      if (!before.face) {
        delete this.profile.face;
        delete this.profile.faceSmall;
      }
    }
    this.update();
  }

  selectProfile(id) {
    if (id === this.profiles.activeId) return;
    this.profiles.activeId = id;
    this.resetDelete();
    this.save();
    this.update();
  }

  addProfile() {
    if (this.profiles.list.length >= MAX_PROFILES) {
      this.setStatus(`Je kunt maximaal ${MAX_PROFILES} profielen bewaren. Verwijder er eerst een.`, 'error');
      return;
    }
    const profile = newProfile(`Speler ${this.profiles.list.length + 1}`);
    const previous = this.profiles;
    this.profiles = { activeId: profile.id, list: [...this.profiles.list, profile] };
    if (!this.save()) {
      this.profiles = previous;
      return;
    }
    this.resetDelete();
    this.update();
    this.nameInput.focus();
    this.nameInput.select();
  }

  /** Verwijderen in twee stappen: eerste klik vraagt om bevestiging. */
  onDeleteClick() {
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      this.deleteBtn.textContent = 'Zeker weten?';
      this.deleteBtn.classList.add('armed');
      this.setStatus(`Klik nog een keer om "${displayName(this.profile)}" te verwijderen.`);
      this.deleteTimer = setTimeout(() => {
        this.resetDelete();
        this.setStatus('');
      }, DELETE_CONFIRM_MS);
      return;
    }
    const name = displayName(this.profile);
    this.resetDelete();
    try {
      this.profiles = deleteProfile(this.profile.id);
      this.setStatus(`Profiel "${name}" is verwijderd.`, 'ok');
      this.handlers.onChange(this.profile);
    } catch (err) {
      this.setStatus(err instanceof StorageError ? err.message : 'Verwijderen is niet gelukt.', 'error');
    }
    this.update();
    this.profileGroup.querySelector('[aria-checked="true"]')?.focus();
  }

  resetDelete() {
    clearTimeout(this.deleteTimer);
    this.deleteArmed = false;
    this.deleteBtn.textContent = 'Verwijderen';
    this.deleteBtn.classList.remove('armed');
  }

  // --- Weergave -------------------------------------------------------------------

  renderProfiles() {
    const group = this.profileGroup;
    group.replaceChildren();
    for (const p of this.profiles.list) {
      const btn = radio(displayName(p), p.id);
      btn.className = 'cz-profile';
      const checked = p.id === this.profiles.activeId;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
      const canvas = makeCanvas(40);
      paintAvatar(canvas, p.look, p.faceSmall ?? p.face);
      const name = document.createElement('span');
      name.textContent = displayName(p);
      name.setAttribute('aria-hidden', 'true');
      btn.append(canvas, name);
      group.append(btn);
    }
    this.newBtn.disabled = this.profiles.list.length >= MAX_PROFILES;
  }

  update() {
    const profile = this.profile;
    const look = profile.look;
    const hadFocus = this.profileGroup.contains(document.activeElement);
    this.renderProfiles();
    if (hadFocus) this.profileGroup.querySelector('[aria-checked="true"]')?.focus();

    if (document.activeElement !== this.nameInput) this.nameInput.value = profile.name;
    for (const [key, group] of Object.entries(this.groups)) {
      for (const btn of group.querySelectorAll('[role="radio"]')) {
        const checked = btn.dataset.value === look[key];
        btn.setAttribute('aria-checked', String(checked));
        btn.tabIndex = checked ? 0 : -1;
      }
    }
    this.groups.hatColor.closest('.cz-field').hidden = look.hat === 'none';
    this.root.querySelector('[data-cz="face-remove"]').hidden = !profile.face;
    this.root.querySelector('[data-cz="photo"]').textContent = profile.face ? 'Andere foto' : 'Foto kiezen';

    paintFull(this.preview, look, profile.face);
    for (const { id, canvas } of this.baseCanvases) {
      paintAvatar(canvas, { ...look, base: id });
    }
    this.preview.setAttribute(
      'aria-label',
      `Voorbeeld: ${displayName(profile)} als ${BASES[look.base].name}${profile.face ? ', met eigen gezicht' : ''}`,
    );
  }
}
