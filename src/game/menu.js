// Start menu: island preview (rendered live behind the card), player list with
// settlement names and colours, Play button.

import { PLAYERS } from '../pieces/pieces.js';
import { townIcon, diceIcon } from './icons.js';
import { applyMenuBackground } from './menuBackground.js';
import { WIN_POINTS, WIN_RANGE, WEATHER_LEVELS, WEATHER_DEFAULT } from './game.js';
import { t, tr, lang, LANGS, setLang } from '../i18n.js';

const NAME_POOL_DE = [
  'Eichenhain', 'Hellbach', 'Steinbrück', 'Distelfeld', 'Ringelblumtal', 'Farnwinkel', 'Honigbach',
  'Weidensee', 'Kieselgrund', 'Fingerhut', 'Moosmulde', 'Brombeertor', 'Kleeberg', 'Entenfurt',
  'Apfelkreuz', 'Lerchensporn', 'Hagebuttenbucht', 'Ahornheim', 'Pfützendorf', 'Sonnental',
];
const NAME_POOL = [
  'Oakhaven', 'Brightwater', 'Stonebridge', 'Thistledown', 'Marigold Vale', 'Fernwick', 'Honeybrook',
  'Willowmere', 'Pebblecombe', 'Foxglove', 'Mossy Hollow', 'Bramblegate', 'Clover Hill', 'Duckford',
  'Applecross', 'Larkspur', 'Rosehip Bay', 'Mapleton', 'Puddleby', 'Sunnydale',
];
const COLORS = Object.keys(PLAYERS); // red, blue, white, purple

export class Menu {
  constructor({ onShuffle, onPlay, onWorkshop, onQuality, onWorld, onContinue, quality }) {
    this.el = document.getElementById('menu');
    applyMenuBackground(this.el); // static illustration instead of the live 3D view
    this.list = document.getElementById('playerList');
    this.players = [];
    const pool = [...(lang === 'de' ? NAME_POOL_DE : NAME_POOL)].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i++) this.players.push({ id: COLORS[i], name: pool[i] });
    this._pool = pool;

    // bouncy title letters
    const title = document.getElementById('title');
    title.innerHTML = [...title.textContent].map((ch, i) => (ch === ' ' ? ' ' : `<span style="animation-delay:${i * 0.08}s">${ch}</span>`)).join('');
    document.getElementById('shuffleIcon').innerHTML = diceIcon();
    // language switch (reloads the page in the chosen language)
    const flags = {
      en: '<svg class="flag" viewBox="0 0 60 40"><rect width="60" height="40" fill="#24477e"/><path d="M0 0L60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L60 40M60 0L0 40" stroke="#c8202f" stroke-width="3"/><path d="M30 0V40M0 20H60" stroke="#fff" stroke-width="12"/><path d="M30 0V40M0 20H60" stroke="#c8202f" stroke-width="7"/></svg>',
      de: '<svg class="flag" viewBox="0 0 60 40"><rect width="60" height="13.4" fill="#1b1b1b"/><rect y="13.3" width="60" height="13.4" fill="#d22c2c"/><rect y="26.6" width="60" height="13.4" fill="#f2c230"/></svg>',
    };
    const ls = document.getElementById('langSwitch');
    ls.innerHTML = Object.entries(LANGS).map(([k, name]) => `<button type="button" data-lang="${k}" class="${k === lang ? 'on' : ''}">${flags[k]}${name}</button>`).join('');
    ls.querySelectorAll('button').forEach((b) => { b.onclick = () => setLang(b.dataset.lang); });

    document.getElementById('shuffleMap').onclick = () => onShuffle();
    document.getElementById('continueBtn').onclick = () => onContinue?.();
    this.refreshSave();
    // world options: number of islands (1 = just the main island) and their size
    this.world = { islands: 1, size: 'medium' };
    try { Object.assign(this.world, JSON.parse(localStorage.getItem('sotw-world') || '{}')); } catch { /* ignore */ }
    const setWorld = (patch) => {
      Object.assign(this.world, patch);
      this.world.islands = Math.max(1, Math.min(6, this.world.islands));
      try { localStorage.setItem('sotw-world', JSON.stringify(this.world)); } catch { /* ignore */ }
      this.renderWorld();
      onWorld?.({ ...this.world });
    };
    document.getElementById('islandsDown').onclick = () => setWorld({ islands: this.world.islands - 1 });
    document.getElementById('islandsUp').onclick = () => setWorld({ islands: this.world.islands + 1 });
    document.querySelectorAll('#islandSize button').forEach((b) => { b.onclick = () => setWorld({ size: b.dataset.size }); });
    this.renderWorld();
    document.getElementById('addPlayer').onclick = () => this.addPlayer();
    const players = () => this.players.map((p) => ({ ...p, name: p.name.trim() || t(PLAYERS[p.id].name) }));
    const opts = () => ({ winPoints: this.winPoints, weatherLevel: this.weatherLevel });
    document.getElementById('playBtn').onclick = () => onPlay(players(), opts());
    document.getElementById('debugBtn').onclick = (e) => { e.preventDefault(); onPlay(players(), { ...opts(), debug: true }); };
    // bad-weather slider: easy / medium / hard (remembered in this browser)
    const levels = Object.keys(WEATHER_LEVELS);
    this.weatherLevel = WEATHER_DEFAULT;
    try { const l = localStorage.getItem('sotw-weather'); if (levels.includes(l)) this.weatherLevel = l; } catch { /* ignore */ }
    const slider = document.getElementById('weatherSlider');
    const showWeather = () => {
      document.querySelectorAll('#weatherLabels span').forEach((s) => s.classList.toggle('on', s.dataset.level === this.weatherLevel));
      document.getElementById('weatherPct').textContent = t('{n}% per roll', { n: Math.round(WEATHER_LEVELS[this.weatherLevel] * 100) });
      slider.style.setProperty('--fill', `${(levels.indexOf(this.weatherLevel) / (levels.length - 1)) * 100}%`);
    };
    slider.max = levels.length - 1;
    slider.value = levels.indexOf(this.weatherLevel);
    slider.oninput = () => {
      this.weatherLevel = levels[+slider.value];
      try { localStorage.setItem('sotw-weather', this.weatherLevel); } catch { /* ignore */ }
      showWeather();
    };
    document.querySelectorAll('#weatherLabels span').forEach((s) => { s.onclick = () => { slider.value = levels.indexOf(s.dataset.level); slider.oninput(); }; });
    showWeather();
    // points needed to win (remembered in this browser)
    this.winPoints = WIN_POINTS;
    try { const w = +localStorage.getItem('sotw-win'); if (w >= WIN_RANGE[0] && w <= WIN_RANGE[1]) this.winPoints = w; } catch { /* ignore */ }
    const setWin = (v) => {
      this.winPoints = Math.max(WIN_RANGE[0], Math.min(WIN_RANGE[1], v));
      try { localStorage.setItem('sotw-win', String(this.winPoints)); } catch { /* ignore */ }
      document.getElementById('winVal').textContent = this.winPoints;
      document.getElementById('winDown').disabled = this.winPoints <= WIN_RANGE[0];
      document.getElementById('winUp').disabled = this.winPoints >= WIN_RANGE[1];
    };
    document.getElementById('winDown').onclick = () => setWin(this.winPoints - 1);
    document.getElementById('winUp').onclick = () => setWin(this.winPoints + 1);
    setWin(this.winPoints);
    document.getElementById('openWorkshop').onclick = (e) => { e.preventDefault(); onWorkshop(); };
    const q = document.getElementById('menuQuality');
    q.value = quality;
    q.onchange = () => onQuality(q.value);
    this.render();
  }

  setSeed(seed) { document.getElementById('mapSeed').textContent = t('World no. {n}', { n: seed }); }
  /** Show "Continue" when a saved game exists. */
  refreshSave() {
    const btn = document.getElementById('continueBtn');
    let info = null;
    try { if (localStorage.getItem('sotw-save')) info = JSON.parse(localStorage.getItem('sotw-save-info') || '{}'); } catch { info = null; }
    btn.hidden = !info;
    if (info) {
      const when = info.at ? new Date(info.at).toLocaleString(lang === 'de' ? 'de-DE' : [], { dateStyle: 'medium', timeStyle: 'short' }) : '';
      btn.innerHTML = `${t('Continue saved game')}<small>${(info.players || []).join(', ')} · ${t('turn {n}', { n: info.turn ?? '?' })} · ${when}</small>`;
    }
  }

  renderWorld() {
    const w = this.world;
    document.getElementById('islandsVal').textContent = w.islands;
    document.getElementById('islandsDown').disabled = w.islands <= 1;
    document.getElementById('islandsUp').disabled = w.islands >= 6;
    const seg = document.getElementById('islandSize');
    seg.classList.toggle('off', w.islands <= 1);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.size === w.size));
  }
  show() { this.el.hidden = false; }
  hide() { this.el.hidden = true; }

  freshName() {
    const used = new Set(this.players.map((p) => p.name));
    return this._pool.find((n) => !used.has(n)) ?? t('Settlement {n}', { n: this.players.length + 1 });
  }

  addPlayer() {
    if (this.players.length >= 4) return;
    const free = COLORS.find((c) => !this.players.some((p) => p.id === c));
    this.players.push({ id: free, name: this.freshName() });
    this.render();
  }

  render() {
    this.list.innerHTML = '';
    this.players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.style.setProperty('--pc', PLAYERS[p.id].color);
      row.innerHTML = `
        <div class="crest">${townIcon(PLAYERS[p.id].color)}</div>
        <input maxlength="18" value="${p.name.replace(/"/g, '&quot;')}" aria-label="${t('Settlement name')}" />
        <div class="swatches">${COLORS.map((c) => `<button class="swatch ${c === p.id ? 'on' : ''}" data-c="${c}" title="${t(PLAYERS[c].name)}" style="background:${PLAYERS[c].color}"></button>`).join('')}</div>
        <button class="icon-btn reroll" title="${t('Random name')}">${diceIcon()}</button>
        ${this.players.length > 2 ? `<button class="icon-btn remove" title="${t('Remove')}">×</button>` : ''}`;
      row.querySelector('input').oninput = (e) => { p.name = e.target.value; };
      row.querySelectorAll('.swatch').forEach((b) => {
        b.onclick = () => {
          const c = b.dataset.c;
          const other = this.players.find((o) => o.id === c);
          if (other) other.id = p.id; // swap colours with whoever had it
          p.id = c;
          this.render();
        };
      });
      row.querySelector('.reroll').onclick = () => {
        const used = new Set(this.players.map((o) => o.name));
        const options = this._pool.filter((n) => !used.has(n));
        p.name = options[Math.floor(Math.random() * options.length)] ?? p.name;
        this.render();
      };
      row.querySelector('.remove')?.addEventListener('click', () => { this.players.splice(i, 1); this.render(); });
      this.list.appendChild(row);
    });
    document.getElementById('addPlayer').hidden = this.players.length >= 4;
  }
}
