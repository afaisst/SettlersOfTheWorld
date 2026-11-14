// Ties everything together: start menu -> island -> hot-seat turns.
// Each player has a "seat" around the table; at the start of their turn the
// camera swings round to it. Building is free for now (no dice/resources).

import * as THREE from 'three';
import { buildBoardGraph } from '../board/graph.js';
import { axialToWorld } from '../board/layout.js';
import { buildPieces } from '../pieces/placement.js';
import { PLAYERS, HARBOUR } from '../pieces/pieces.js';
import { generateWorld } from './mapgen.js';
import { createFog } from './fog.js';
import { ShipsView } from './shipsView.js';
import { Dolphins } from './dolphins.js';
import { TornadoView } from './tornado.js';
import { Minimap } from './minimap.js';
import { TurnRings } from './highlights.js';
import { Fireworks } from './fireworks.js';
import { t as T, lang } from '../i18n.js';
import { createTokens } from './tokens.js';
import { createWeatherFX } from './weather.js';
import { Game, COSTS } from './game.js';
import { Placer } from './interaction.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { RESOURCE_INFO, cityIcon as castleIcon } from './icons.js';

const SHADOW_EXTENT = 7;
const SAVE_KEY = 'sotw-save';
// TEMPORARY test switches — set both to false for normal play
// "Debug game" (start menu): the whole world revealed and this many of each resource for everyone
const DEBUG_RESOURCES = 100;
const resText = (items) => Object.entries(items).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${lang === 'de' ? RESOURCE_INFO[r].label : RESOURCE_INFO[r].label.toLowerCase()}`).join(', ');

export class GameController {
  constructor(engine, { onWorkshop }) {
    this.engine = engine;
    this.game = null;
    this.tool = null;
    this.piecesRoot = null;
    this.weatherFX = new Map(); // cellIndex -> active effect
    this.shipsView = new ShipsView(engine.board);
    this.dolphins = new Dolphins(engine.board, { pickCell: () => this.dolphinSpot() });
    this.tornadoViews = new Map(); // tornado id -> TornadoView
    this.turnRings = new TurnRings(engine.board);
    this.fireworks = new Fireworks(engine.board);
    // hovering a town, city or ship names its empire
    engine.canvas.addEventListener('pointermove', (e) => this.hoverPiece(e));
    engine.canvas.addEventListener('pointerleave', () => this.hud.pieceTag(null));
    engine.canvas.addEventListener('pointerdown', () => this.hud.pieceTag(null));
    this.minimap = new Minimap(engine, { onPan: (x, z) => { engine.rig._tween = null; engine.rig.lookAt(x, z); } });
    this.selectedShip = null;
    this._focusT = 0;
    engine.onUpdate((t, dt) => {
      this.tokens?.update(t);
      this.fog?.update(t, { still: engine.quality === 'fast' });
      this.shipsView.update(t, dt);
      this.turnRings.update(dt);
      this.fireworks.update(dt);
      if (this.cells) this.dolphins.update(t, dt);
      for (const v of this.tornadoViews.values()) v.update(t, dt);
      if (this.game) this.minimap.update(dt, this.game, this.cells, this.world.radius);
      for (const fx of this.weatherFX.values()) fx.update(t, dt);
      if (this.game) { this.placeOverlays(); if ((this._focusT += dt) > 0.3) { this._focusT = 0; this.trackFocus(); } }
    });
    this.placer = new Placer(engine, { onPlace: (tool, id) => (tool === 'sail' ? this.sail(id) : this.place(tool, id)) });
    this.placer.onCancel = () => this.setTool(null);
    this.placer.onHover = (tool, id, pos) => this.showPrice(tool, id, pos);
    this.placer.onBoardClick = (pt) => {
      const id = this.shipsView.pick(pt);
      if (this.robbingShip != null) { if (id != null && this.game.robTargets(this.robbingShip).includes(id)) this.rob(id); return; }
      if (id != null && this.game?.ships.get(id)?.player === this.game.player.id) this.selectShip(id);
    };
    this.hud = new Hud({
      onTool: (t) => this.setTool(t),
      onRoll: () => this.roll(),
      onUndo: () => this.undo(),
      onTrade: (from, to, island) => this.trade(from, to, island),
      onOffer: (pid, res, island) => this.offer(pid, res, island),
      onLoad: (ship, res, island) => this.load(ship, res, 1),
      onUnload: (ship, res) => this.load(ship, res, -1),
      onSelectShip: (id) => this.selectShip(id),
      onBuildShip: (vi) => this.buildShip(vi),
      onRob: (id) => this.startRob(id),
      onRobTarget: (tid) => this.rob(tid),
      onEndTurn: () => this.endTurn(),
      onMenu: () => this.openGameMenu(),
    });
    this.menu = new Menu({
      quality: engine.quality,
      onShuffle: () => this.newIsland(),
      onWorld: () => this.newIsland(this.seed),
      onContinue: () => this.loadGame(),
      onPlay: (players, opts = {}) => this.start(players, null, opts),
      onWorkshop: () => { this.menu.hide(); onWorkshop(); },
      onQuality: (q) => engine.applyQuality(q),
    });
  }

  // ---------- world ----------
  newIsland(seed = Math.floor(Math.random() * 99999) + 1, worldOpts = this.menu?.world ?? {}) {
    this.seed = seed;
    this.worldOpts = { ...worldOpts };
    HARBOUR.boats = false; // real ships sail in the game
    this.world = generateWorld(seed, worldOpts);
    this.cells = this.world.cells;
    this.shipsView.clear();
    this.dolphins.clear();
    this.turnRings.clear();
    this.fireworks.stop();
    for (const v of this.tornadoViews.values()) v.hide();
    const tiles = this.engine.buildMap(this.cells, { seed });
    this.tokens?.dispose();
    this.fog?.dispose();
    for (const fx of this.weatherFX?.values() ?? []) fx.dispose();
    this.weatherFX?.clear();
    this.tokens = createTokens(this.engine.scene, this.cells, tiles, { zoom: () => this.engine.rig.zoom });
    const revealed = new Set(this.world.revealed);
    this.fog = createFog(this.engine.board, this.cells, revealed, { extra: 2, seed });
    this.showRevealed(revealed);
    this.discovered = new Set([0]);
    this.graph = buildBoardGraph(this.cells);
    this.piecesRoot = null;
    this.engine.fitShadowCamera(SHADOW_EXTENT);
    // bigger worlds: allow zooming further out and panning across all islands
    const extent = (this.world.radius + 1) * 1.75;
    const far = Math.max(26, extent * 2.4);
    this.engine.rig.setRange(2, far, Math.max(4, extent - 3)); // min distance 2 = close-ups of towns & ships
    this.engine.setDepthFog(far * 0.85, far * 1.75);
    this.menu.setSeed(seed);
  }

  /** Show tiles & tokens of revealed cells, hide the rest (fog covers them). */
  showRevealed(revealed) {
    this.engine.tiles.forEach((t, ci) => { t.group.visible = revealed.has(ci); });
    this.tokens.setRevealed(revealed);
  }

  /** Newly discovered cells: lift the fog, celebrate new islands. */
  applyReveal(cis) {
    if (!cis?.length) return;
    const g = this.game;
    this.fog.reveal(cis);
    for (const ci of cis) this.engine.tiles[ci].group.visible = true;
    this.tokens.setRevealed(g.revealed);
    this.syncTornados();
    const isl = [...new Set(cis.map((ci) => this.cells[ci].island).filter((i) => i != null && !this.discovered.has(i)))];
    for (const i of isl) this.discovered.add(i);
    if (isl.length) this.hud.toast(T('Land ho! {name} discovered {islands}!', { name: g.player.name, islands: isl.map((i) => g.islandName(i)).join(T(' and ')) }));
  }

  /** Tornado views follow the game; only those over explored hexes are shown (and animated). */
  syncTornados({ instant = false } = {}) {
    const g = this.game;
    for (const [id, v] of this.tornadoViews) if (!g?.tornados.some((t) => t.id === id)) v.hide();
    for (const t of g?.tornados ?? []) {
      let v = this.tornadoViews.get(t.id);
      if (!v) { v = new TornadoView(this.engine.board); this.tornadoViews.set(t.id, v); }
      const visible = g.revealed.has(t.ci);
      if (instant || v.ci == null) v.setCell(this.cells, t.ci, { instant: true, visible });
      else if (v.ci !== t.ci) v.setCell(this.cells, t.ci, { visible, wasVisible: g.revealed.has(v.ci) && v.group.visible });
      else if (visible && !v.group.visible) v.setCell(this.cells, t.ci, { instant: true, visible });
      v.ci = t.ci;
    }
  }

  /** Fireworks over every town & city of the winner; the camera backs off a little to watch. */
  celebrate(pid) {
    const g = this.game;
    const sites = [...g.settlements].filter(([, s]) => s.player === pid).map(([vi]) => this.graph.vertices[vi]);
    this.fireworks.start(sites.map((v) => ({ x: v.x, z: v.z })), PLAYERS[pid].color);
    const rig = this.engine.rig;
    rig.turnTo(rig.targetAzimuth, 2.2, Math.max(rig.targetZoom, 0.5), { x: rig.goal.x, z: rig.goal.z });
  }

  /** Name tag of the empire owning the town / city / ship under the mouse. */
  hoverPiece(e) {
    const g = this.game;
    if (!g || e.buttons) { this.hud.pieceTag(null); return; }
    const pt = this.placer._boardPoint(e);
    if (!pt) { this.hud.pieceTag(null); return; }
    let best = null, bd = 0.3;
    for (const [vi, s] of g.settlements) {
      const v = this.graph.vertices[vi];
      const d = Math.hypot(v.x - pt.x, v.z - pt.z);
      if (d < bd) { bd = d; best = { pid: s.player, what: s.kind === 'city' ? 'city' : 'town' }; }
    }
    if (!best) {
      const sid = this.shipsView.pick(pt, 0.25);
      const ship = sid != null && g.ships.get(sid);
      if (ship) best = { pid: ship.player, what: 'ship' };
    }
    if (!best) { this.hud.pieceTag(null); return; }
    this.hud.pieceTag({ x: e.clientX, y: e.clientY }, g.playerById(best.pid).name, PLAYERS[best.pid].color, best.what);
  }

  /** A random open-sea hex the player can see (for the dolphins). */
  dolphinSpot() {
    const revealed = this.game?.revealed ?? new Set(this.world.revealed);
    const shipCells = new Set([...(this.game?.ships.values() ?? [])].map((s) => s.ci));
    const byKey = this._cellKey ??= new Map();
    if (byKey.cells !== this.cells) { byKey.clear(); byKey.cells = this.cells; this.cells.forEach((c, i) => byKey.set(`${c.q},${c.r}`, i)); }
    const open = (ci) => { const c = this.cells[ci]; return [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].every(([a, b]) => { const n = byKey.get(`${c.q + a},${c.r + b}`); return n === undefined || this.cells[n].type === 'water'; }); };
    let spots = [...revealed].filter((ci) => this.cells[ci].type === 'water' && !shipCells.has(ci));
    spots = spots.filter(open); // only out at sea: at least one hex away from any shore
    if (!spots.length) return null;
    const c = this.cells[spots[Math.floor(Math.random() * spots.length)]];
    return axialToWorld(c.q, c.r);
  }

  /** Price tag next to the build spot under the mouse. */
  showPrice(tool, id, pos) {
    const g = this.game;
    if (!g || id < 0 || !pos || tool === 'sail') { this.hud.priceTag(null); return; }
    const p = new THREE.Vector3(pos.x, 0.42, pos.z).project(this.engine.camera);
    const at = { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
    if (g.phase === 'setup') { this.hud.priceTag(at, null, T('Free')); return; }
    const src = g.paySource(tool, id);
    const cost = src?.kind === 'cargo' ? COSTS.town : g.costAt(tool, id);
    const isl = src?.island ?? 0;
    let note = g.islands.length > 1 ? T('from {src}', { src: src?.kind === 'cargo' ? T('ship cargo') : g.islandName(isl) }) : '';
    this.hud.priceTag(at, cost, note);
  }

  // ---------- in-game menu, save & load ----------
  snapshot() { return JSON.stringify({ seed: this.seed, world: this.worldOpts, game: this.game.serialize() }); }
  isSaved() { return !!this.game && this.lastSaved === this.snapshot(); }

  saveGame() {
    const data = this.snapshot();
    try {
      localStorage.setItem(SAVE_KEY, data);
      localStorage.setItem(`${SAVE_KEY}-info`, JSON.stringify({ at: Date.now(), turn: this.game.turn, round: this.game.round, players: this.game.players.map((p) => p.name) }));
    } catch (e) { this.hud.toast(T('Could not save — browser storage is unavailable.')); return false; }
    this.lastSaved = data;
    this.hud.toast(T('Game saved (turn {n}).', { n: this.game.turn }));
    this.menu.refreshSave();
    return true;
  }

  loadGame() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { data = null; }
    if (!data) { this.hud.toast(T('No saved game found.')); return; }
    this.newIsland(data.seed, data.world);
    const g = Game.restore(data.game, this.world, this.graph, this.seed);
    this.fog.reveal([...g.revealed], { instant: true }); // lift the fog already explored (no animation)
    this.showRevealed(g.revealed);
    for (const ci of g.revealed) { const i = this.cells[ci].island; if (i != null) this.discovered.add(i); }
    this.start(null, g);
    this.restoreWeather();
    this.hud.toast(T('Welcome back! Turn {t}, round {r}.', { t: g.turn, r: g.round }));
  }

  /** Recreate weather effects of a loaded game (no banner, no losses). */
  restoreWeather() {
    for (const [ci, w] of this.game.weather) {
      const { x, z } = axialToWorld(this.cells[ci].q, this.cells[ci].r);
      const fx = createWeatherFX(w.kind, { x, z }, this.sampler(ci), { target: this.engine.tiles[ci].group });
      this.engine.scene.add(fx.group);
      this.weatherFX.set(ci, fx);
      this.engine.tiles[ci].setWeather?.(w.kind);
    }
    this.tokens.setWeather(this.game.weather, this.game.players.length);
  }

  async openGameMenu() {
    const g = this.game;
    if (!g) return;
    if (g.winner) { this.showMenu(); return; }
    const info = localStorage.getItem(`${SAVE_KEY}-info`);
    const savedInfo = T(this.isSaved() ? 'All progress is saved.'
      : this.lastSaved ? 'You have unsaved progress since your last save.' : 'This game has not been saved yet.');
    const choice = await this.hud.gameMenu({
      quality: this.engine.quality,
      onQuality: (q) => { this.engine.applyQuality(q); document.getElementById('menuQuality').value = q; },
      savedInfo: savedInfo + (info && !this.lastSaved ? ' ' + T('Saving replaces the previously saved game.') : ''),
    });
    if (choice === 'save') this.saveGame();
    if (choice === 'help') window.open('./help.html', '_blank'); // own tab: the game keeps running here
    if (choice === 'exit') this.exitGame();
  }

  async exitGame() {
    if (!this.isSaved()) {
      const c = await this.hud.choose({
        icon: castleIcon(PLAYERS[this.game.player.id].color),
        title: T('Leave the realm?'),
        text: T(this.lastSaved ? 'You have unsaved progress. Save before leaving?' : "This game hasn't been saved yet. Save it before leaving?"),
        buttons: [
          { id: 'cancel', label: T('Keep playing'), cls: 'btn-ghost' },
          { id: 'save', label: T('Save & exit'), cls: 'btn-mint' },
          { id: 'exit', label: T('Exit without saving'), cls: 'btn-play' },
        ],
      });
      if (c === 'cancel') return;
      if (c === 'save' && !this.saveGame()) return;
    }
    this.showMenu();
  }

  showMenu() {
    document.getElementById('splash').innerHTML = '';
    this.game = null;
    this.deselectShip();
    this.turnRings.clear();
    this.fireworks.stop();
    this.hud.pieceTag(null);
    for (const v of this.tornadoViews.values()) v.hide();
    this.hud.focusIsland = 0;
    this.setTool(null);
    this.placer.setGame(null);
    this.hud.hide();
    if (!this.cells || this.piecesRoot || this.debug) this.newIsland(); // fresh world (pieces leave clearings; debug lifted the fog)
    this.debug = false;
    this.menu.refreshSave();
    this.menu.show();
    const rig = this.engine.rig;
    rig.autoRotate = false;
    rig._tween = null;
    this.engine.paused = true; // the menu has its own static backdrop: no 3D rendering meanwhile
  }

  // ---------- game flow ----------
  start(players, restored = null, { debug = false, winPoints, weatherLevel } = {}) {
    if (debug && !restored) { // debug game: no fog of war
      const all = this.cells.map((c, i) => i);
      this.world.revealed = all;
      this.fog.reveal(all, { instant: true });
      this.showRevealed(new Set(all));
      for (const i of this.world.islands) this.discovered.add(i.id);
    }
    this.game = restored ?? new Game(players, this.world, this.graph, this.seed, { winPoints, weatherLevel });
    this.lastSaved = restored ? this.snapshot() : null;
    this.camMemory = {}; // pid -> camera view at the end of their last turn
    if (debug && !restored) for (const p of this.game.players) for (const r of Object.keys(p.resources)) p.resources[r] = DEBUG_RESOURCES;
    this.debug = debug && !restored;
    window.sotw.game = this.game;
    this.engine.paused = false;
    this.baseAz = this.engine.rig.targetAzimuth;
    this.menu.hide();
    this.hud.show();
    this.engine.rig.autoRotate = false;
    this.placer.setGame(this.game);
    this.syncTornados({ instant: true });
    this.rebuildPieces();
    this.startTurn();
  }

  seatAzimuth(i) { return this.baseAz + (i / this.game.players.length) * Math.PI * 2; }

  startTurn() {
    // the camera returns to where this player left it last turn (first turn: their seat)
    const m = this.camMemory?.[this.game.player.id];
    if (m) this.engine.rig.turnTo(m.az, 1.6, m.zoom, { x: m.x, z: m.z });
    else this.engine.rig.turnTo(this.seatAzimuth(this.game.current), 1.8, 0.42);
    // point out this player's towns & cities once the turn card has popped up
    const g0 = this.game, pid0 = g0.player.id;
    this.turnRings.clear();
    clearTimeout(this._ringTimer);
    this._ringTimer = setTimeout(() => { if (this.game === g0 && g0.player.id === pid0) this.turnRings.show(g0, pid0); }, 900);
    this.hud.splash(this.game);
    this.setTool(this.game.phase === 'setup' ? 'town' : null); // setup starts with the town tool ready
    this.answerOffers();
  }

  /** Trade offers waiting for the current player: accept / reject, one by one. */
  async answerOffers() {
    const g = this.game, pid = g.player.id;
    const offers = g.pendingOffersFor(pid);
    if (!offers.length) return;
    await new Promise((r) => setTimeout(r, 1500)); // let the turn splash play first
    for (const o of offers) {
      if (this.game !== g || g.player.id !== pid) return;
      const ok = await this.hud.askOffer(g, o);
      g.resolveOffer(o, ok);
      const giver = g.playerById(o.from).name;
      this.hud.toast(T(ok ? 'Thank you, {name}! The goods arrive on your main island.' : 'Gift returned to {name}.', { name: giver }));
      this.setTool(this.tool);
    }
  }

  setTool(tool) {
    if (!this.game) { this.tool = null; return; }
    const g = this.game;
    if (tool !== 'sail') this.deselectShip();
    this.stopRob();
    if (tool === 'sail') tool = this.selectedShip != null && g.shipMoves(this.selectedShip).length ? 'sail' : null;
    else if (tool && g.validSpots(tool).length === 0) {
      let msg = 'No free spot for that right now.';
      if (g.phase === 'setup') msg = g.placedThisTurn('town') ? 'Place your two roads next to your town.' : 'Place your town first.';
      else if (!g.rolled) msg = 'Roll the dice first!';
      else if (g.validSpots(tool, g.player.id, { ignoreCost: true }).length) msg = 'Not enough resources on that island yet.';
      else if (tool === 'city') msg = 'Build a town first, then upgrade it to a city.';
      this.hud.toast(T(msg));
      tool = null;
    }
    this.tool = tool;
    this.placer.setTool(tool, tool === 'sail' ? { spots: g.shipMoves(this.selectedShip) } : {});
    this.hud.selectedShip = this.selectedShip;
    this.hud.update(this.game, tool);
  }

  /** Refresh HUD, markers and ship models after any change to the state. */
  refresh() {
    this.shipsView.sync(this.game);
    this.setTool(this.tool && this.tool !== 'sail' && this.game.validSpots(this.tool).length ? this.tool : null);
  }

  // ---------- ships ----------
  selectShip(id) {
    const g = this.game;
    if (!g || this._rolling) return;
    if (this.selectedShip === id) { this.setTool(null); return; }
    const s = g.ships.get(id);
    if (!s || s.player !== g.player.id) return;
    if (!g.shipMoves(id).length) {
      this.hud.toast(T(g.phase !== 'main' ? 'Ships sail once the game has begun.' : !g.rolled ? 'Roll the dice first, then set sail!' : 'This ship has already sailed this turn.'));
      return;
    }
    this.selectedShip = id;
    this.shipsView.select(id);
    this.setTool('sail');
  }

  deselectShip() { this.selectedShip = null; this.shipsView.select(null); }

  // ---------- piracy ----------
  startRob(id) {
    const g = this.game;
    if (!g || this._rolling) return;
    if (this.robbingShip === id) { this.setTool(null); return; }
    const targets = g.robTargets(id);
    if (!targets.length) return;
    this.setTool(null);
    this.robbingShip = id;
    this.hud.robbingShip = id;
    this.shipsView.setTargets(targets);
    this.hud.update(g, null);
    this.hud.toast(T(targets.length > 1 ? 'Pick the ship to rob!' : 'Click the enemy ship to rob it!'));
  }

  stopRob() {
    if (this.robbingShip == null) return;
    this.robbingShip = null;
    this.hud.robbingShip = null;
    this.shipsView.setTargets([]);
  }

  rob(targetId) {
    const g = this.game, id = this.robbingShip;
    if (id == null) return;
    const victimShip = g.ships.get(targetId);
    const r = g.rob(id, targetId);
    if (!r) return;
    this.shipsView.burn(targetId);
    const victim = g.playerById(r.victim).name;
    const loot = resText(r.loot);
    this.hud.toast(T(loot ? "Arr! {a} plundered {b}'s ship: {loot}. It burns and sinks!" : "{a} sank {b}'s ship — but its hold was empty!", { a: g.player.name, b: victim, loot }));
    const pos = this.shipsView.screenPos(id, this.engine.camera, 0.5);
    if (pos) Object.entries(r.loot).forEach(([res, n], k) => this.hud.popup(pos.x + (k - (Object.keys(r.loot).length - 1) / 2) * 60, pos.y, `+${n}${RESOURCE_INFO[res].svg}`, PLAYERS[g.player.id].color, 0.3 + k * 0.15));
    void victimShip;
    this.setTool(null);
    this.shipsView.sync(g);
  }

  sail(ci) {
    const g = this.game, id = this.selectedShip;
    const r = g.moveShip(id, ci);
    if (!r) return;
    if (r.sunk) { // sailed into the tornado: glide in, then spin down
      this.shipsView.moveThenSink(id, this.cells[ci]);
      this.shipsView.sync(g);
      const what = resText(r.lost);
      this.hud.toast(what ? T('Into a tornado! The ship sinks with {what}.', { what }) : T('Into a tornado! The ship sinks.'));
    } else this.shipsView.sync(g);
    this.applyReveal(r.revealed);
    this.setTool(null);
  }

  buildShip(vi) {
    const g = this.game;
    if (this._rolling) return;
    const ship = g.buildShip(vi);
    if (!ship) {
      this.hud.toast(T(g.player.supply.ship <= 0 ? 'You have no ships left.' : 'A ship costs 2 lumber and 1 wool from this island.'));
      return;
    }
    this.hud.toast(T('A new ship is launched! Load it at your harbour, then set sail.'));
    this.refresh();
  }

  load(id, res, n) {
    const g = this.game;
    if (this._rolling || !g?.load(id, res, n)) return;
    this.refresh();
  }

  offer(pid, res, island) {
    const g = this.game;
    if (this._rolling || !g?.offer(pid, res, island)) return;
    const o = g.offerFrom(g.player.id, pid);
    const tot = {}; for (const it of Object.values(o.items)) for (const [r, n] of Object.entries(it)) tot[r] = (tot[r] || 0) + n;
    this.hud.toast(T('Offer for {name}: {what} — they decide on their turn.', { name: g.playerById(pid).name, what: resText(tot) }));
    this.refresh();
  }

  /** Overlay buttons follow their ship / harbour on screen. */
  placeOverlays() {
    const g = this.game, cam = this.engine.camera, v3 = this._v3 ??= new THREE.Vector3();
    this.hud.placeOverlays((key) => {
      const [kind, id] = key.split(':');
      if (kind === 'ship') return this.shipsView.screenPos(+id, cam);
      const v = this.graph.vertices[+id];
      let sx = 0, sz = 0;
      for (const ci of g.waterAt(+id)) { const c = axialToWorld(this.cells[ci].q, this.cells[ci].r); sx += c.x - v.x; sz += c.z - v.z; }
      const d = Math.hypot(sx, sz) || 1;
      v3.set(v.x + (sx / d) * 0.3, 0.02, v.z + (sz / d) * 0.3).project(cam); // just below the harbour (ships float above theirs)
      if (v3.z > 1) return null;
      return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight };
    });
  }

  /** Which island is the camera looking at? Its resources show under the main ones. */
  trackFocus() {
    const f = this.engine.rig._focus;
    if (!f || !this.game) return;
    let best = 0, bd = 3.2;
    for (const isl of this.game.islands) {
      if (isl.id === 0 || !this.discovered.has(isl.id)) continue;
      const d = Math.hypot(isl.x - f.x, isl.z - f.z);
      if (d < bd) { bd = d; best = isl.id; }
    }
    if (best !== this.hud.focusIsland) { this.hud.focusIsland = best; this.hud.update(this.game, this.tool); }
  }

  place(tool, id) {
    const g = this.game;
    const entry = g.place(tool, id);
    if (!entry) return;
    this.rebuildPieces();
    this.applyReveal(entry.revealed);
    const v0 = tool === 'road' ? null : this.graph.vertices[id];
    if (entry.src?.kind === 'cargo') {
      this.hud.toast(T('{name} settles on {island}!', { name: g.player.name, island: g.islandName(entry.island) }) + (Object.keys(entry.unloaded).length ? ' ' + T('The rest of the cargo is unloaded.') : ''));
      Object.entries(entry.unloaded).forEach(([res, n], k) => this.popupAt(v0.x, v0.z, res, n, g.player.id, 0.3 + k * 0.2, k));
    }
    // starting town pays out: show the resources popping up from the town
    const gained = Object.entries(entry.gained);
    if (gained.length) {
      const v = this.graph.vertices[id];
      gained.forEach(([res, n], k) => this.popupAt(v.x, v.z, res, n, g.player.id, k * 0.25, k));
    }
    if (g.winner) {
      this.setTool(null);
      this.hud.winner(g.winner, () => this.showMenu(), g.winPoints);
      this.celebrate(g.winner.id);
      return;
    }
    // setup: town -> roads automatically; otherwise keep the tool while it still works
    let next = null;
    if (g.phase === 'setup') next = g.toolAllowed('road') && g.validSpots('road').length ? 'road' : null;
    else if (tool !== 'city' && g.validSpots(tool).length) next = tool;
    this.setTool(next);
  }

  /** Floating "+n resource" bubble above a board point. */
  popupAt(x, z, res, n, pid, delay = 0, stack = 0) {
    const p = new THREE.Vector3(x, 0.45, z).project(this.engine.camera);
    const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight - stack * 30;
    this.hud.popup(sx, sy, `+${n}${RESOURCE_INFO[res].svg}`, PLAYERS[pid].color, delay);
  }

  trade(from, to, island = 0) {
    if (this._rolling || !this.game?.trade(from, to, island)) return;
    this.hud.toast(T('Traded {a} for {b}', { a: resText({ [from]: 4 }), b: resText({ [to]: 1 }) }));
    this.refresh(); // refresh HUD & build options
  }

  undo() {
    if (this._rolling || !this.game?.undo()) return;
    this.rebuildPieces();
    this.deselectShip();
    const g = this.game;
    this.setTool(g.phase === 'setup' ? (g.toolAllowed('town') ? 'town' : 'road') : null);
  }

  endTurn() {
    const g = this.game;
    const blocker = g.endTurnBlocker();
    if (blocker) { this.hud.toast(blocker); return; }
    const wasSetup = g.phase === 'setup';
    const round = g.setupRound;
    const rig = this.engine.rig;
    this.camMemory[g.player.id] = { az: rig.targetAzimuth, zoom: rig.targetZoom, x: rig.goal.x, z: rig.goal.z };
    g.endTurn();
    if (wasSetup && g.phase === 'setup' && round === 1 && g.setupRound === 2) this.hud.toast(T('Second setup round — now in reverse order!'));
    this.syncWeather();
    document.getElementById('dice').innerHTML = '';
    this.hud.update(g, null);
    this.startTurn();
    if (wasSetup && g.phase === 'main') this.hud.toast(T('Setup complete — let the rolling begin!'));
    const te = g.tornadoEvent;
    if (te) {
      this.syncTornados();
      if (te.hits.length) {
        for (const h of te.hits) this.shipsView.doom(h.ship);
        setTimeout(() => {
          for (const h of te.hits) this.shipsView.burn(h.ship, { fire: false });
          this.hud.toast(T('A tornado struck!') + ' ' + te.hits.map((h) => (Object.keys(h.lost).length ? T("{name}'s ship sank with {what}", { name: g.playerById(h.player).name, what: resText(h.lost) }) : T("{name}'s ship sank", { name: g.playerById(h.player).name }))).join('; ') + '.');
        }, 2000);
      }
    }
  }

  roll() {
    const g = this.game;
    if (!g?.canRoll() || this._rolling) return;
    this._rolling = true;
    document.getElementById('rollBtn').disabled = true;
    // tumble for a moment, then reveal and pay out
    let ticks = 0;
    const spin = setInterval(() => {
      this.hud.dice(1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6), true);
      if (++ticks >= 9) {
        clearInterval(spin);
        const r = g.roll();
        this._rolling = false;
        this.hud.dice(r.a, r.b, false); // just the two dice; the weather check stays hidden
        this.tokens?.flash(r.sum);
        if (r.weather && r.weather.ci >= 0) this.strikeWeather(r.weather);
        else if (!r.events.length) this.hud.toast(T('{n} — nobody gets anything this time.', { n: r.sum }));
        // resources fly from each producing settlement (one at a time) to its owner's name tag
        const bySettlement = new Map();
        r.events.forEach((e) => bySettlement.set(e.vi, [...(bySettlement.get(e.vi) || []), e]));
        const flights = [];
        let k = 0;
        for (const [vi, evs] of bySettlement) {
          const v = this.graph.vertices[vi];
          const p = new THREE.Vector3(v.x, 0.4, v.z).project(this.engine.camera);
          const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
          evs.forEach((e, j) => flights.push(this.hud.fly(sx + j * 22 - (evs.length - 1) * 11, sy, e.pid, e.res, e.n, 0.5 + k * 0.55 + j * 0.12)));
          k++;
        }
        this._rolling = true; // keep buttons locked until everything has landed
        Promise.all(flights).then(() => { this._rolling = false; this.setTool(null); });
        if (!flights.length) { this._rolling = false; this.setTool(null); } // otherwise the HUD updates once everything has landed
      }
    }, 70);
  }

  // ---------- weather ----------
  /** Height (world y) of the terrain of tile `ci` under world point (x, z). */
  sampler(ci) {
    const tile = this.engine.tiles[ci];
    tile.group.updateMatrixWorld(true);
    const meshes = [];
    tile.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); });
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
    return (x, z) => {
      ray.set(o.set(x, 5, z), down);
      const hit = ray.intersectObjects(meshes, false)[0];
      return hit ? hit.point.y : 0.16;
    };
  }

  strikeWeather(w) {
    const { x, z } = axialToWorld(this.cells[w.ci].q, this.cells[w.ci].r);
    this.weatherFX.get(w.ci)?.dispose();
    const fx = createWeatherFX(w.kind, { x, z }, this.sampler(w.ci), { target: this.engine.tiles[w.ci].group });
    this.engine.scene.add(fx.group);
    this.weatherFX.set(w.ci, fx);
    this.engine.tiles[w.ci].setWeather?.(w.kind);
    this.tokens?.setWeather(this.game.weather, this.game.players.length);
    this.hud.weatherBanner(w, (pid) => this.game.playerById(pid).name);
    // losses: red "-n" bubbles over the struck tile
    const p = new THREE.Vector3(x, 0.6, z).project(this.engine.camera);
    const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
    w.losses.forEach((l, i) => { if (l.n) this.hud.popup(sx + (i - (w.losses.length - 1) / 2) * 70, sy, `−${l.n}${RESOURCE_INFO[l.res].svg}`, PLAYERS[l.pid].color, 0.4 + i * 0.2); });
  }

  /** Remove effects whose weather has worn off; refresh badges. */
  syncWeather() {
    for (const [ci, fx] of this.weatherFX) {
      if (this.game?.weather.has(ci)) continue;
      fx.dispose();
      this.weatherFX.delete(ci);
      this.engine.tiles[ci]?.setWeather?.(null);
    }
    if (this.game) this.tokens?.setWeather(this.game.weather, this.game.players.length);
  }

  /** Re-render all pieces from the game state (gates/junctions adapt to new roads). */
  rebuildPieces() {
    const board = this.engine.board;
    if (this.piecesRoot) {
      board.remove(this.piecesRoot);
      this.piecesRoot.traverse((o) => { if ((o.isMesh || o.isLineSegments) && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
    this.piecesRoot = new THREE.Group();
    this.piecesRoot.name = 'pieces';
    board.add(this.piecesRoot);
    buildPieces(this.piecesRoot, this.engine.tiles, this.graph, this.game, this.cells, { cleared: this.game.cleared });
    this.shipsView.sync(this.game);
  }
}

export { PLAYERS };
