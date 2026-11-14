// In-game HUD: resources (top left), build palette (top right), scoreboard,
// turn bar with dice / undo / end turn, turn-change splash and toasts.
// Everything is tinted with the current player's colour.

import { PLAYERS } from '../pieces/pieces.js';
import { RESOURCES, COSTS, WIN_POINTS, LONGEST_ROAD_MIN, BANK_RATE, ISLAND_POINTS, offerTotal } from './game.js';
import { roadIcon, townIcon, cityIcon, diceIcon, shipIcon, giftIcon, pirateIcon, RESOURCE_INFO } from './icons.js';
import { t as T } from '../i18n.js';

const costHtml = (cost, stock) => Object.entries(cost).map(([r, n]) =>
  `<i class="${!stock || stock[r] >= n ? '' : 'short'}">${n > 1 ? `<b>${n}</b>` : ''}${RESOURCE_INFO[r].svg}</i>`).join('');
const resList = (items) => Object.entries(items).filter(([, n]) => n > 0).map(([r, n]) => `<b>${n}</b>${RESOURCE_INFO[r].svg}`).join(' ');

const TOOLS = [
  { id: 'road', label: T('Road'), icon: roadIcon, key: 'R' },
  { id: 'town', label: T('Town'), icon: townIcon, key: 'T' },
  { id: 'city', label: T('City'), icon: cityIcon, key: 'C' },
];

export class Hud {
  constructor({ onTool, onRoll, onUndo, onEndTurn, onMenu, onTrade, onOffer, onLoad, onUnload, onSelectShip, onBuildShip, onRob, onRobTarget }) {
    Object.assign(this, { onTrade, onOffer, onLoad, onUnload, onSelectShip, onBuildShip, onRob, onRobTarget });
    this.focusIsland = 0;
    this.overlays = document.getElementById('overlays');
    document.getElementById('allResBtn').onclick = () => this._game && this.showAll(this._game);
    this.el = document.getElementById('hud');
    this.onTool = onTool;
    document.getElementById('rollIcon').innerHTML = diceIcon();
    document.getElementById('rollBtn').onclick = () => onRoll();
    document.getElementById('undoBtn').onclick = () => onUndo();
    document.getElementById('endTurnBtn').onclick = () => onEndTurn();
    document.getElementById('menuBtn').onclick = () => onMenu();
    window.addEventListener('keydown', (e) => {
      if (this.el.hidden || e.target.tagName === 'INPUT') return;
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t) onTool(this.tool === t.id ? null : t.id);
      if (e.key === 'Escape') onTool(null);
    });
    this.tool = null;
  }

  show() { this.el.hidden = false; }
  hide() { this.priceTag(null); this.pieceTag(null); this.el.hidden = true; document.getElementById('dice').innerHTML = ''; }

  update(game, tool) {
    this.tool = tool;
    const p = game.player;
    const col = PLAYERS[p.id].color;
    document.documentElement.style.setProperty('--pc', col);

    this._game = game;
    // resources: main island card + the card of the island the camera looks at
    this._resPanel(document.getElementById('resourceList'), game, 0);
    const fi = this.focusIsland;
    const showIsland = fi > 0 && this.islandRelevant(game, fi);
    const isl = document.getElementById('islandRes');
    isl.hidden = !showIsland;
    document.querySelector('#resources .card-title span').textContent = game.islands.length > 1 ? T('Main island') : T('Resources');
    document.getElementById('allResBtn').hidden = game.islands.length <= 1;
    if (showIsland) {
      isl.querySelector('.card-title').textContent = game.islandName(fi);
      this._resPanel(isl.querySelector('.res-list'), game, fi);
    }
    const note = document.querySelector('#resources .card-note');
    note.textContent = game.phase === 'setup' ? (game.setupRound === 1 ? T('Your second town will pay out 1 of each resource it touches') : T('This town pays out 1 of each resource it touches'))
      : !game.rolled ? T('Roll the dice to collect resources')
      : RESOURCES.some((r) => game.canTrade(r)) ? T('Drag {n} of a kind onto another to trade · onto a name to give', { n: BANK_RATE })
      : T('Rolled {n} · drag a resource onto a name to offer it', { n: game.rolled.sum });
    this._syncOverlays(game);

    // build palette in the player's colour
    const list = document.getElementById('buildList');
    list.innerHTML = '';
    for (const t of TOOLS) {
      const left = p.supply[t.id];
      const spots = game.validSpots(t.id, p.id).length;
      const b = document.createElement('button');
      b.className = `build-btn ${tool === t.id ? 'on' : ''}`;
      b.title = `${t.label} (${t.key})`;
      b.disabled = left <= 0 || spots === 0;
      const st = p.stock[this.focusIsland] ?? p.resources;
      const cost = game.phase === 'setup' ? `<span class="cost free">${T('free')}</span>`
        : `<span class="cost">${costHtml(COSTS[t.id], st)}</span>`;
      b.innerHTML = `<div class="pic">${t.icon(col)}</div>${t.label}<span class="left">${T('{n} left', { n: left })}</span>${cost}`;
      b.onclick = () => this.onTool(tool === t.id ? null : t.id);
      list.appendChild(b);
    }
    // ships: built at a harbour (ship button), so this card only shows the count
    if (game.islands.length > 1 || game.ships.size) {
      const sailing = [...game.ships.values()].filter((s) => s.player === p.id).length;
      const b = document.createElement('button');
      b.className = 'build-btn ship-info';
      const st = p.stock[this.focusIsland] ?? p.resources;
      // lit only when a ship can be built right now (a harbour, a ship left, and the goods on that island)
      const yards = game.shipYards().filter((vi) => game.canBuildShip(vi));
      b.disabled = yards.length === 0;
      b.title = T(yards.length ? 'Build it with the ship button at one of your harbours'
        : p.supply.ship <= 0 ? 'No ships left to build'
        : game.phase !== 'main' || !game.rolled ? 'Roll the dice first'
        : !game.shipYards().length ? 'You need a town or city on the coast'
        : 'Not enough lumber & wool on an island with your harbour');
      b.innerHTML = `<div class="pic">${shipIcon(col)}</div>${T('Ships')}<span class="left">${T('{a} at sea · {b} left', { a: sailing, b: p.supply.ship })}</span><span class="cost">${costHtml(COSTS.ship, st)}</span>`;
      b.onclick = () => this.toast(T('Click the little ship button at one of your harbours to launch it.'));
      list.appendChild(b);
    }
    const hint = document.getElementById('buildHint');
    const setupRoads = 2 - game.placedThisTurn('road');
    if (game.phase === 'setup') {
      hint.textContent = game.placedThisTurn('town') === 0 ? T(game.setupRound === 1 ? 'Setup: place your first town' : 'Setup: place your second town')
        : setupRoads > 0 ? T(setupRoads > 1 ? 'Setup: place {n} roads from your town' : 'Setup: place 1 road from your town', { n: setupRoads }) : T('Setup done — end your turn');
    } else if (!game.rolled) hint.textContent = T('Roll the dice first, then build');
    else if (!tool) hint.textContent = T('Pick a piece, then click a glowing spot');
    else if (tool === 'city') hint.textContent = T('Click one of your towns to upgrade it');
    else if (tool === 'sail') hint.textContent = T('Click a glowing sea hex to sail there (1 per turn)');
    else hint.textContent = T('Click a glowing spot to build · Esc to cancel');

    // current player & scoreboard
    document.getElementById('who').innerHTML = `<div class="crest">${townIcon(col)}</div>
      <div>${escapeHtml(p.name)}<small>${game.phase === 'setup' ? T('Setup {n}/2', { n: game.setupRound }) : T('Round {n}', { n: game.round })} · ${T('{a} / {b} points', { a: game.points(p.id), b: game.winPoints })}</small></div>
      <div class="turn-no" title="${T("Turn number (every player's turn counts)")}"><small>${T('Turn')}</small>${game.turn}</div>`;
    document.getElementById('scoreboard').innerHTML = game.players.map((q, i) => {
      const st = game.stats(q.id);
      const c = PLAYERS[q.id].color;
      const off = game.offerFrom(p.id, q.id);
      const gift = off ? `<span class="gift" title="${T('Your offer to {name}', { name: escapeHtml(q.name) })}">${giftIcon()}<b>${offerTotal(off)}</b></span>` : '';
      const row = (label, value, pts) => `<tr><td>${label}</td><td>${value}</td><td class="pts">${pts ? `+${pts}` : '–'}</td></tr>`;
      return `
      <div class="score ${i === game.current ? 'now' : ''}" style="--sc:${c}" data-pid="${q.id}" tabindex="0">
        <span class="dot" style="background:${c}"></span>${escapeHtml(q.name)} · ${st.points}${st.longestBonus ? ` <span class="badge" title="${T('Longest Road')}">${roadIcon(c)}</span>` : ''}${gift}
        <div class="score-tip">
          <div class="tip-head"><span class="dot" style="background:${c}"></span>${escapeHtml(q.name)}</div>
          <table>
            ${row(`${townIcon(c)} ${T('Towns')}`, st.towns, st.towns)}
            ${row(`${cityIcon(c)} ${T('Cities')}`, st.cities, st.cities * 2)}
            ${row(`${roadIcon(c)} ${T('Roads')}`, st.roads, 0)}
            ${row(T('Longest road'), `${st.longest}${st.longestBonus ? ' ★' : ''}`, st.longestBonus)}
            ${game.islands.length > 1 ? row(`${shipIcon(c)} ${T('Ships')}`, st.ships, 0) : ''}
            ${row(T('New islands'), st.islands || '—', st.islandBonus)}
          </table>${this._giftRows(game, q.id)}
          <div class="tip-total">${T('{a} / {b} points', { a: st.points, b: game.winPoints })}</div>
          <div class="tip-note">${T('Longest Road: +2 for the longest unbroken road of {n}+ pieces (loops count once).', { n: LONGEST_ROAD_MIN })}${game.islands.length > 1 ? ' ' + T('Every new island settled: +{n}.', { n: ISLAND_POINTS }) : ''}</div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('undoBtn').disabled = game.history.length === 0;
    const roll = document.getElementById('rollBtn');
    roll.disabled = !game.canRoll();
    roll.classList.toggle('nudge', game.canRoll());
    const end = document.getElementById('endTurnBtn');
    const blocker = game.endTurnBlocker();
    end.disabled = !!blocker;
    end.title = blocker || T('Pass to the next player');
    end.classList.toggle('nudge', !blocker && game.phase === 'setup');
  }

  /** Big weather banner card (auto-hides). */
  weatherBanner(w, playerName) {
    const el = document.getElementById('splash');
    const lines = w.losses.length
      ? w.losses.map((l) => `<li><span class="dot" style="background:${PLAYERS[l.pid].color}"></span>${T('{name} loses', { name: escapeHtml(playerName(l.pid)) })} <b>${l.n}</b> ${RESOURCE_INFO[l.res].svg}</li>`).join('')
      : `<li>${T('Luckily nobody lives there yet.')}</li>`;
    el.innerHTML = `<div class="splash-card weather ${w.kind}"><div class="weather-title">${escapeHtml(T(w.name))}!</div>
      <p>${T('This tile produces nothing for 3 rounds.')}</p><ul>${lines}</ul></div>`;
  }

  /** Little "+1 🌲" bubble at a screen position. */
  popup(x, y, html, color, delay = 0) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--pc', color);
    el.style.animationDelay = `${delay}s`;
    el.innerHTML = html;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600 + delay * 1000);
  }

  /**
   * A resource icon flies in an arc from a screen point to the player's name
   * tag in the scoreboard, which bounces and shows "+n". Resolves on landing.
   */
  fly(x, y, pid, res, n, delay = 0) {
    return new Promise((resolve) => {
      const chip = document.querySelector(`.score[data-pid="${pid}"]`);
      if (!chip) { resolve(); return; }
      const r = chip.getBoundingClientRect();
      const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
      const el = document.createElement('div');
      el.className = 'flyer';
      el.style.setProperty('--pc', PLAYERS[pid].color);
      el.innerHTML = `${n > 1 ? `<b>${n}</b>` : ''}${RESOURCE_INFO[res].svg}`;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      document.body.appendChild(el);
      const dx = tx - x, dy = ty - y;
      const lift = -Math.min(160, 60 + Math.abs(dx) * 0.25); // arc height
      const anim = el.animate([
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.12 },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 + lift}px)) scale(1.05)`, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, opacity: 1 },
      ], { duration: 950, delay: delay * 1000, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'both' });
      anim.onfinish = () => {
        el.remove();
        // the scoreboard may have been re-rendered meanwhile -> find the tag again
        const chip = document.querySelector(`.score[data-pid="${pid}"]`);
        if (!chip) { resolve(); return; }
        chip.classList.remove('got'); void chip.offsetWidth; chip.classList.add('got');
        const tag = document.createElement('div');
        tag.className = 'got-tag';
        tag.innerHTML = `+${n}${RESOURCE_INFO[res].svg}`;
        chip.appendChild(tag);
        setTimeout(() => tag.remove(), 1400);
        resolve();
      };
    });
  }

  /** Little name tag next to the mouse: whose town / city / ship is this? (at = null hides it) */
  pieceTag(at, name = '', color = '#fff', what = '') {
    let el = document.getElementById('pieceTag');
    if (!el) { el = document.createElement('div'); el.id = 'pieceTag'; document.body.appendChild(el); }
    if (!at) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = `${at.x}px`; el.style.top = `${at.y}px`;
    el.style.setProperty('--tc', color);
    const icon = what === 'city' ? cityIcon(color) : what === 'ship' ? shipIcon(color) : townIcon(color);
    el.innerHTML = `<span class="pt-icon">${icon}</span><b>${escapeHtml(name)}</b><small>${T(what)}</small>`;
  }

  /** Floating price next to the hovered build spot (at = null hides it). */
  priceTag(at, cost, note = '') {
    let el = document.getElementById('priceTag');
    if (!el) { el = document.createElement('div'); el.id = 'priceTag'; document.body.appendChild(el); }
    if (!at) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = `${at.x}px`; el.style.top = `${at.y}px`;
    el.innerHTML = `${cost ? `<span class="cost">${costHtml(cost)}</span>` : `<b>${T('Free')}</b>`}${note && cost ? `<small>${escapeHtml(note)}</small>` : ''}`;
  }

  /** Pending gifts the player gives or receives (shown in their hover card). */
  _giftRows(game, pid) {
    const sum = (o) => { const t = {}; for (const it of Object.values(o.items)) for (const [r, n] of Object.entries(it)) t[r] = (t[r] || 0) + n; return t; };
    const line = (o, out) => {
      const other = game.playerById(out ? o.to : o.from);
      return `<div class="tip-gift">${giftIcon()}<span>${out ? T('Gives to') : T('Gets from')} <span class="dot" style="background:${PLAYERS[other.id].color}"></span><b>${escapeHtml(other.name)}</b></span><span class="items">${resList(sum(o))}</span></div>`;
    };
    const rows = [...game.offers.filter((o) => o.from === pid).map((o) => line(o, true)), ...game.offers.filter((o) => o.to === pid).map((o) => line(o, false))];
    return rows.length ? `<div class="tip-gifts"><div class="tip-sub">${T('Trade gifts (waiting)')}</div>${rows.join('')}</div>` : '';
  }

  /** Does the player have anything on island `id` (settlement, stock or a ship docked there)? */
  islandRelevant(game, id) {
    const pid = game.player.id;
    if (Object.values(game.player.stock[id] ?? {}).some((n) => n > 0)) return true;
    for (const [vi, s] of game.settlements) if (s.player === pid && game.vertexIsland(vi) === id) return true;
    return [...game.ships.values()].some((s) => s.player === pid && game.dockIsland(s.id) === id);
  }

  /** Resource cards of one island's stock (draggable: bank trade, offers, loading ships). */
  _resPanel(list, game, island) {
    const p = game.player;
    const stock = game.stockOf(p.id, island);
    const key = `${p.id}:${island}`;
    this._shown ??= {};
    const prev = this._shown[key];
    const live = game.phase === 'main' && !!game.rolled && !game.winner;
    list.dataset.island = island;
    list.innerHTML = RESOURCES.map((r) => {
      const d = prev ? stock[r] - prev[r] : 0;
      const tradable = game.canTrade(r, p.id, island);
      const drag = live && stock[r] > 0;
      return `<div class="res ${d > 0 ? 'up' : d < 0 ? 'down' : ''} ${tradable ? 'tradable' : ''} ${drag ? 'draggable' : ''}" data-res="${r}"
        title="${RESOURCE_INFO[r].label}${drag ? ' — ' + T("drag onto a player's name to offer it") + (tradable ? ', ' + T('onto another resource to trade {n}:1', { n: BANK_RATE }) : '') : ''}"><div class="pic">${RESOURCE_INFO[r].svg}</div>
      <div class="n">${stock[r]}</div><div class="lbl">${RESOURCE_INFO[r].label}</div>${tradable ? `<span class="rate">${BANK_RATE}:1</span>` : ''}</div>`;
    }).join('');
    this._shown[key] = { ...stock };
    this._bindDrag(list, game, island);
  }

  /**
   * Drag a resource card onto
   *   another card of the same island  -> 4:1 bank trade
   *   another player's name tag         -> +1 to a trade offer
   *   one of your ships docked here     -> load 1 onto the ship
   */
  _bindDrag(list, game, island) {
    list.querySelectorAll('.res.draggable').forEach((card) => {
      card.onpointerdown = (ev) => {
        ev.preventDefault();
        const from = card.dataset.res;
        const bank = card.classList.contains('tradable');
        const ghost = card.cloneNode(true);
        ghost.classList.add('drag-ghost');
        const label = ghost.querySelector('.n');
        label.textContent = '−1';
        document.body.appendChild(ghost);
        const targets = [
          ...(bank ? [...list.querySelectorAll('.res')].filter((c) => c.dataset.res !== from) : []),
          ...[...document.querySelectorAll('#scoreboard .score')].filter((c) => game.canOffer(c.dataset.pid, from, island)),
          ...[...document.querySelectorAll('.ship-chip')].filter((c) => +c.dataset.island === island),
        ];
        targets.forEach((c) => c.classList.add('drop-ok'));
        card.classList.add('dragging');
        let over = null;
        const hover = (e) => {
          const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.res, .score, .ship-chip');
          over = el && targets.includes(el) ? el : null;
          targets.forEach((c) => c.classList.toggle('drop-over', c === over));
          label.textContent = over?.classList.contains('res') ? `−${BANK_RATE}` : '−1';
        };
        const move = (e) => { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; hover(e); };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          ghost.remove();
          targets.forEach((c) => c.classList.remove('drop-ok', 'drop-over'));
          card.classList.remove('dragging');
          if (!over) return;
          if (over.classList.contains('res')) this.onTrade(from, over.dataset.res, island);
          else if (over.classList.contains('score')) this.onOffer(over.dataset.pid, from, island);
          else this.onLoad(+over.dataset.ship, from, island);
        };
        move(ev);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
    });
  }

  // ---------- floating buttons over the board (ships & shipyards) ----------
  _syncOverlays(game) {
    const p = game.player, col = PLAYERS[p.id].color;
    const items = [];
    if (game.islands.length > 1 || game.ships.size) {
      for (const vi of p.supply.ship > 0 ? game.shipYards() : []) {
        const ok = game.canBuildShip(vi);
        const st = game.stockOf(p.id, game.vertexIsland(vi));
        items.push({ key: `yard:${vi}`, html: `<button class="yard-btn" ${ok ? '' : 'disabled'} title="${p.supply.ship > 0 ? T('Build a ship here') : T('No ships left')}">
          ${shipIcon(col)}<span class="plus">+</span><span class="cost">${costHtml(COSTS.ship, st)}</span></button>`, vi });
      }
      for (const s of game.ships.values()) {
        if (s.player !== p.id) continue;
        const dock = game.dockIsland(s.id);
        const canSail = game.shipMoves(s.id).length > 0;
        const cargo = RESOURCES.filter((r) => s.cargo[r] > 0).map((r) =>
          `<button class="cargo" data-res="${r}" ${dock >= 0 && game.canLoad(s.id) ? '' : 'disabled'} title="${dock >= 0 ? T('Click to unload one') : T('Sail to one of your harbours to unload')}">${RESOURCE_INFO[r].svg}<b>${s.cargo[r]}</b></button>`).join('');
        const canRob = game.robTargets(s.id).length > 0;
        const robBtn = canRob ? `<button class="rob ${this.robbingShip === s.id ? 'on' : ''}" title="${T('Rob the enemy ship on this hex!')}">${pirateIcon()}</button>` : '';
        items.push({ key: `ship:${s.id}`, ship: s.id, html: `<div class="ship-chip ${this.selectedShip === s.id ? 'on' : ''} ${canSail ? 'can-sail' : ''}" data-ship="${s.id}" data-island="${dock}">
          ${robBtn}<button class="helm" title="${T(canSail ? 'Select to sail' : s.fresh ? 'Just built — it can sail next turn' : s.moved ? 'Already sailed this turn' : 'Roll first, then sail')}">${shipIcon(col)}</button>${cargo}</div>` });
      }
      // while robbing: a target button above every enemy ship in reach
      for (const tid of this.robbingShip != null ? game.robTargets(this.robbingShip) : []) {
        const t = game.ships.get(tid), loot = RESOURCES.filter((r) => t.cargo[r] > 0).map((r) => `${RESOURCE_INFO[r].svg}<b>${t.cargo[r]}</b>`).join('');
        items.push({ key: `target:${tid}`, target: tid, html: `<button class="rob-target" style="--tc:${PLAYERS[t.player].color}" title="${T("Rob {name}'s ship", { name: escapeHtml(game.playerById(t.player).name) })}">
          ${pirateIcon()}<span>${T('Rob!')}</span>${loot ? `<span class="loot">${loot}</span>` : `<span class="loot empty">${T('empty hold')}</span>`}</button>` });
      }
    }
    const keep = new Set(items.map((i) => i.key));
    for (const el of [...this.overlays.children]) if (!keep.has(el.dataset.key)) el.remove();
    for (const it of items) {
      let el = this.overlays.querySelector(`[data-key="${it.key}"]`);
      if (!el) { el = document.createElement('div'); el.className = 'overlay'; el.dataset.key = it.key; el.hidden = true; this.overlays.appendChild(el); }
      el.innerHTML = it.html;
      if (it.vi != null) el.querySelector('.yard-btn').onclick = () => this.onBuildShip(it.vi);
      if (it.ship != null) {
        el.querySelector('.helm').onclick = () => this.onSelectShip(it.ship);
        el.querySelectorAll('.cargo').forEach((b) => { b.onclick = () => this.onUnload(it.ship, b.dataset.res); });
        el.querySelector('.rob')?.addEventListener('click', () => this.onRob(it.ship));
      }
      if (it.target != null) el.querySelector('.rob-target').onclick = () => this.onRobTarget(it.target);
    }
  }

  /** Position overlays each frame: pos(key) -> {x, y} | null. */
  placeOverlays(pos) {
    for (const el of this.overlays.children) {
      const p = pos(el.dataset.key);
      el.hidden = !p;
      if (p) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, ${el.dataset.key.startsWith('yard') ? '15%' : '-100%'})`;
    }
  }

  /** Table of the current player's resources on every island, ship cargo and pending offers. */
  showAll(game) {
    const p = game.player, col = PLAYERS[p.id].color;
    const ids = game.islands.map((i) => i.id).filter((id) => id === 0 || this.islandRelevant(game, id));
    const cells = (st) => RESOURCES.map((r) => `<td class="${st[r] ? '' : 'zero'}">${st[r] || 0}</td>`).join('');
    const rows = ids.map((id) => `<tr class="${id === this.focusIsland ? 'focus' : ''}"><th>${escapeHtml(game.islandName(id))}</th>${cells(game.stockOf(p.id, id))}</tr>`);
    const ships = [...game.ships.values()].filter((s) => s.player === p.id).map((s, k) => {
      const d = game.dockIsland(s.id);
      return `<tr class="ship-row"><th><span class="mini">${shipIcon(col)}</span>${T('Ship {n}', { n: k + 1 })}<small>${d >= 0 ? T('at {place}', { place: escapeHtml(game.islandName(d)) }) : T('at sea')}</small></th>${cells(s.cargo)}</tr>`;
    });
    const offers = game.offers.filter((o) => o.from === p.id).map((o) => {
      const tot = {}; for (const it of Object.values(o.items)) for (const [r, n] of Object.entries(it)) tot[r] = (tot[r] || 0) + n;
      return `<tr class="ship-row"><th><span class="mini">${giftIcon()}</span>${T('Offer')}<small>${T('to {name}', { name: escapeHtml(game.playerById(o.to).name) })}</small></th>${cells(tot)}</tr>`;
    });
    const total = Object.fromEntries(RESOURCES.map((r) => [r, ids.reduce((t, id) => t + game.stockOf(p.id, id)[r], 0)]));
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal-card wide" style="--pc:${col}"><h3>${T("{name}'s goods", { name: escapeHtml(p.name) })}</h3>
      <table class="all-res"><thead><tr><th></th>${RESOURCES.map((r) => `<th title="${RESOURCE_INFO[r].label}">${RESOURCE_INFO[r].svg}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}<tr class="total"><th>${T('All islands')}</th>${cells(total)}</tr>${ships.join('')}${offers.join('')}</tbody></table>
      <p class="small">${T('Each island keeps its own stock — carry goods between islands by ship.')}</p>
      <div class="modal-btns"><button class="btn btn-play" data-a="yes">${T('Close')}</button></div></div>`;
    const done = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); window.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') done(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('button')) done(); });
    window.addEventListener('keydown', key);
    document.body.appendChild(wrap);
  }

  /** "A wants to give you …" — resolves true (accept) / false (reject). */
  askOffer(game, o) {
    const giver = game.playerById(o.from), me = game.playerById(o.to);
    const tot = {}; for (const it of Object.values(o.items)) for (const [r, n] of Object.entries(it)) tot[r] = (tot[r] || 0) + n;
    return this.ask({
      icon: giftIcon(),
      title: T('A gift arrives!'),
      text: `<span class="dot" style="background:${PLAYERS[giver.id].color}"></span>${T('<b>{a}</b> wants to give <b>{b}</b>:', { a: escapeHtml(giver.name), b: escapeHtml(me.name) })}<br><span class="offer-items">${resList(tot)}</span><br>${T('Accepted goods go to your main island.')}`,
      yes: T('Accept'), no: T('Reject'),
    });
  }

  /** Friendly modal dialog. Resolves true (confirm) / false (cancel). */
  ask({ title, text, yes = T('Yes'), no = T('Cancel'), icon = '' }) {
    return this.choose({ title, text, icon, buttons: [{ id: false, label: no, cls: 'btn-ghost' }, { id: true, label: yes, cls: 'btn-play' }] });
  }

  /**
   * Modal with any number of buttons; resolves with the clicked button's id
   * (Escape / clicking outside = the first button, Enter = the last one).
   */
  choose({ title, text = '', icon = '', buttons, body = '', cls = '' }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `<div class="modal-card ${cls}">${icon ? `<div class="modal-icon">${icon}</div>` : ''}
        <h3>${escapeHtml(title)}</h3>${text ? `<p>${text}</p>` : ''}${body}
        <div class="modal-btns ${buttons.length > 2 ? 'stack' : ''}">${buttons.map((b, i) => `<button class="btn ${b.cls || 'btn-ghost'}" data-i="${i}">${escapeHtml(b.label)}</button>`).join('')}</div></div>`;
      const done = (b) => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); window.removeEventListener('keydown', key); resolve(b.id); };
      const key = (e) => { if (e.key === 'Escape') done(buttons[0]); if (e.key === 'Enter' && e.target.tagName !== 'SELECT') done(buttons[buttons.length - 1]); };
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap) done(buttons[0]);
        const i = e.target.closest('button[data-i]')?.dataset.i;
        if (i != null) done(buttons[+i]);
      });
      window.addEventListener('keydown', key);
      document.body.appendChild(wrap);
      this.onModal?.(wrap);
      wrap.querySelector('button[data-i="0"]').focus();
    });
  }

  /** In-game menu: graphics, save, exit. Resolves 'resume' | 'save' | 'exit'. */
  gameMenu({ quality, onQuality, savedInfo }) {
    this.onModal = (wrap) => {
      this.onModal = null;
      const sel = wrap.querySelector('#gmQuality');
      sel.value = quality;
      sel.onchange = () => onQuality(sel.value);
    };
    return this.choose({
      title: T('Menu'), icon: diceIcon(), cls: 'game-menu',
      body: `<label class="gm-row">${T('Graphics')}
          <select id="gmQuality"><option value="high">${T('High')}</option><option value="balanced">${T('Balanced')}</option><option value="fast">${T('Fast')}</option></select></label>
        <p class="small">${savedInfo}</p>`,
      buttons: [
        { id: 'resume', label: T('Back to the game'), cls: 'btn-ghost' },
        { id: 'save', label: T('Save game'), cls: 'btn-mint' },
        { id: 'help', label: T('How to play'), cls: 'btn-sun' },
        { id: 'exit', label: T('Exit to start menu'), cls: 'btn-play' },
      ],
    });
  }

  winner(p, onMenu, points = WIN_POINTS) {
    const col = PLAYERS[p.id].color;
    const el = document.getElementById('splash');
    el.innerHTML = `<div class="splash-card win" style="--pc:${col}"><div class="crest">${cityIcon(col)}</div>
      <h2>${T('{name} wins!', { name: escapeHtml(p.name) })}</h2><p>${T('{n} points — long live the realm!', { n: points })}</p>
      <button class="btn btn-play" id="winMenu">${T('Back to menu')}</button></div>`;
    document.getElementById('winMenu').onclick = onMenu;
  }

  splash(game) {
    const p = game.player;
    const col = PLAYERS[p.id].color;
    const el = document.getElementById('splash');
    el.innerHTML = `<div class="splash-card" style="--pc:${col}"><div class="crest">${townIcon(col)}</div>
      <div class="splash-turn">${T('Turn {n}', { n: game.turn })}${game.phase === 'setup' ? '' : ' · ' + T('Round {n}', { n: game.round })}</div>
      <h2>${escapeHtml(p.name)}</h2><p>${T(game.phase !== 'setup' ? "It's your turn — roll the dice!"
        : game.setupRound === 1 ? 'Place your first town and two roads'
        : 'Place your second town and two roads — it pays out resources!')}</p></div>`;
  }

  toast(msg) {
    const el = document.getElementById('toast');
    el.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
  }

  dice(a, b, rolling = false) {
    const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const die = (n) => `<div class="die">${Array.from({ length: 9 }, (_, i) => `<i class="${pips[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
    const box = document.getElementById('dice');
    box.innerHTML = die(a) + die(b);
    box.classList.toggle('rolling', rolling);
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
