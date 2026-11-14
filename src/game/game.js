// Game state & rules (hot seat).
//
// SETUP  — two rounds in "snake" order: 1 → n, then n → 1 (so the last
//          player places twice in a row). Each setup turn: 1 town (anywhere,
//          distance rule) and then 2 roads connected to it. Only the SECOND
//          town pays out 1 resource for every producing tile it touches.
//          No dice, building is free.
// MAIN   — a turn = roll the dice (mandatory, once) → build (costs resources)
//          → end turn. A roll produces for every tile with that number:
//          town +1, city +2 of the tile's resource. There is NO robber; 7 is a
//          normal number. First to 10 points wins.
// WEATHER (our own rule) — with every roll there is a chance (easy 3 %,
//          medium 10 %, hard 20 %; chosen in the start menu) that bad weather strikes one tile showing the
//          rolled number: every player with a settlement there loses half
//          (rounded down) of that tile's resource, and the tile produces
//          nothing for 3 full rounds.
//
//   TOWN  land corner, never next to another settlement; in MAIN it must touch
//         one of the player's own roads.
//   ROAD  land edge connected to the player's own town/castle or road (an
//         opponent's settlement blocks the connection).
//   CITY  upgrades one of the player's own towns (the town returns to supply).
// ISLANDS & SHIPS — the world may hold several islands (cells[i].island, 0 =
//         main). Every island keeps its own resource stock per player
//         (player.stock[islandId]; player.resources is the main-island stock).
//         Production, building costs and bank trades use the stock of the island
//         the piece is on. Unexplored cells are hidden in fog (revealed set):
//         ships reveal their hex + its neighbours, roads/towns reveal the cells
//         around their corners. Ships sail 1 hex per turn, carry cargo loaded at
//         an own harbour, and a town next to a ship may be paid from its cargo
//         (the rest unloads onto that island). Towns always cost the same; ships
//         are built separately at a harbour.
// TRADE  — players may offer resources to each other; offers are reserved at
//         once and answered (accept / reject) at the start of the receiver's turn.
// The state maps match what buildPieces() renders.

import { t } from '../i18n.js';

export const SUPPLY = { road: 15, town: 6, city: 6, ship: 4 };
export const RESOURCES = ['wood', 'brick', 'wool', 'grain', 'ore'];
export const TILE_RESOURCE = { forest: 'wood', hills: 'brick', pasture: 'wool', field: 'grain', mountains: 'ore' };
export const COSTS = {
  road: { wood: 1, brick: 1 },
  town: { wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  ship: { wood: 2, wool: 1 },
};
export const ISLAND_POINTS = 2;     // for every island (besides the main one) with a settlement
export const WIN_POINTS = 10;       // default; players choose it in the start menu (game.winPoints)
export const WIN_RANGE = [3, 20];
export const BANK_RATE = 4; // 4 of one resource -> 1 of another
export const WEATHER = {
  mountains: { kind: 'storm', name: 'Blizzard & rockslide', res: 'ore' },
  field: { kind: 'rain', name: 'Heavy rain', res: 'grain' },
  forest: { kind: 'fire', name: 'Forest fire', res: 'wood' },
  pasture: { kind: 'disease', name: 'Sheep disease', res: 'wool' },
  hills: { kind: 'quake', name: 'Earthquake', res: 'brick' },
};
// chance of a weather event per dice roll; players pick the level in the start menu
export const WEATHER_LEVELS = { easy: 0.03, medium: 0.10, hard: 0.20 };
export const WEATHER_DEFAULT = 'medium';
export const WEATHER_ROUNDS = 3;
export const LONGEST_ROAD_MIN = 5;
export const LONGEST_ROAD_POINTS = 2;
const SETUP_ROADS = 2;

export class Game {
  /**
   * @param players [{ id: colour key ('red'…), name }]
   * @param cells   map cells [{q, r, type, number}]
   * @param graph   board graph from buildBoardGraph(cells)
   */
  constructor(players, world, graph, seed, { winPoints = WIN_POINTS, weatherLevel = WEATHER_DEFAULT } = {}) {
    if (Array.isArray(world)) world = { cells: world };
    const cells = world.cells;
    this.players = players.map((p) => {
      const q = { ...p, supply: { ...SUPPLY }, stock: { 0: emptyRes() } };
      Object.defineProperty(q, 'resources', { get() { return this.stock[0]; }, enumerable: false });
      return q;
    });
    this.islands = world.islands ?? [{ id: 0, name: t('Main island'), cells: cells.map((c, i) => i).filter((i) => cells[i].type !== 'water') }];
    this.revealed = new Set(world.revealed ?? cells.map((c, i) => i));
    this.ships = new Map();        // id -> { id, player, ci, cargo, moved }
    this.nextShip = 1;
    this.offers = [];              // pending trade offers { from, to, items: { island: { res: n } } }
    this.cells = cells;
    this.winPoints = winPoints;
    this.weatherLevel = WEATHER_LEVELS[weatherLevel] != null ? weatherLevel : WEATHER_DEFAULT;
    // storms: one tornado per island roams the sea. They start spread out along the
    // far edge of the map and move 1 hex in a random direction every turn.
    const ringOf = (c) => (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r)) / 2;
    const maxRing = Math.max(...cells.map(ringOf));
    const far = cells.map((c, i) => i).filter((i) => cells[i].type === 'water' && ringOf(cells[i]) >= maxRing - 1);
    const n = Math.max(1, this.islands.length);
    const off = Math.random() * Math.PI * 2;
    const angOf = (ci) => { const c = cells[ci]; return Math.atan2(1.5 * c.r, Math.sqrt(3) * (c.q + c.r / 2)); };
    this.tornados = [];
    for (let k = 0; k < n && far.length; k++) {
      const target = off + (k / n) * Math.PI * 2;
      const d = (ci) => Math.abs(Math.atan2(Math.sin(angOf(ci) - target), Math.cos(angOf(ci) - target)));
      const ci = far.filter((x) => !this.tornados.some((t) => t.ci === x)).sort((a, b) => d(a) - d(b))[Math.floor(Math.random() * 3)] ?? far[0];
      this.tornados.push({ id: k + 1, ci });
    }
    this.tornadoEvent = null;
    this.graph = graph;
    this.seed = seed;
    this.phase = 'setup';
    this.setupOrder = [...players.keys(), ...[...players.keys()].reverse()];
    this.setupStep = 0;
    this.current = 0;
    this.round = 1;
    this.turn = 1;                 // turns since the game began (setup turns included)
    this.rolled = null;            // { a, b, sum } once rolled this turn
    this.winner = null;
    this.longestRoad = null;
    this.weather = new Map();      // cellIndex -> { kind, name, res, turnsLeft }       // player id holding the Longest Road bonus
    this.settlements = new Map();  // vertexId -> { player, kind }
    this.roads = new Map();        // edgeId -> player
    this.history = [];             // this turn's placements (for undo)
    this.cleared = new Set();      // props already removed under pieces (render cache)
  }

  get player() { return this.players[this.current]; }

  // ---------- save / load ----------
  /** Plain JSON snapshot of everything needed to continue the game (not the undo history). */
  serialize() {
    return {
      players: this.players.map((p) => ({ id: p.id, name: p.name, supply: { ...p.supply }, stock: JSON.parse(JSON.stringify(p.stock)) })),
      phase: this.phase, setupOrder: this.setupOrder, setupStep: this.setupStep, current: this.current,
      round: this.round, turn: this.turn, rolled: this.rolled, longestRoad: this.longestRoad,
      weather: [...this.weather], settlements: [...this.settlements], roads: [...this.roads],
      ships: [...this.ships.values()], nextShip: this.nextShip, offers: this.offers, revealed: [...this.revealed],
      tornados: this.tornados, winPoints: this.winPoints, weatherLevel: this.weatherLevel,
    };
  }

  /** Rebuild a game from serialize() data on the same world (same seed & options). */
  static restore(data, world, graph, seed) {
    // older saves: the 4th colour used to be orange
    data = JSON.parse(JSON.stringify(data).replace(/"orange"/g, '"purple"'));
    const g = new Game(data.players.map((p) => ({ id: p.id, name: p.name })), world, graph, seed);
    data.players.forEach((d, i) => { const p = g.players[i]; p.supply = { ...SUPPLY, ...d.supply }; p.stock = d.stock; });
    Object.assign(g, {
      phase: data.phase, setupOrder: data.setupOrder, setupStep: data.setupStep, current: data.current,
      round: data.round, turn: data.turn ?? 1, rolled: data.rolled, longestRoad: data.longestRoad,
      weather: new Map(data.weather), settlements: new Map(data.settlements), roads: new Map(data.roads),
      ships: new Map(data.ships.map((s) => [s.id, s])), nextShip: data.nextShip, offers: data.offers, revealed: new Set(data.revealed),
    });
    if (data.winPoints) g.winPoints = data.winPoints;
    if (WEATHER_LEVELS[data.weatherLevel] != null) g.weatherLevel = data.weatherLevel;
    if (data.tornados) g.tornados = data.tornados;
    else if (data.tornado) g.tornados = [{ id: 1, ci: data.tornado.ci }]; // older saves
    return g;
  }
  stockOf(pid, island = 0) { const p = this.playerById(pid); return (p.stock[island] ??= emptyRes()); }
  islandName(id) { return this.islands.find((i) => i.id === id)?.name ?? t('Island'); }
  /** Island id of a land corner (-1 if all-water). Islands never share a corner. */
  vertexIsland(vi) {
    for (const ci of this.graph.vertices[vi].cells) if (this.cells[ci].type !== 'water') return this.cells[ci].island ?? 0;
    return -1;
  }
  edgeIsland(ei) { const e = this.graph.edges[ei]; return Math.max(this.vertexIsland(e.a), this.vertexIsland(e.b)); }
  isCoastal(vi) { const cs = this.graph.vertices[vi].cells; return cs.length < 3 || cs.some((ci) => this.cells[ci].type === 'water'); }
  waterAt(vi) { return this.graph.vertices[vi].cells.filter((ci) => this.cells[ci].type === 'water'); }
  /** Hex neighbours of cell ci that exist on the map. */
  cellNeighbours(ci) {
    this._byKey ??= new Map(this.cells.map((c, i) => [`${c.q},${c.r}`, i]));
    const c = this.cells[ci];
    return [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].map(([dq, dr]) => this._byKey.get(`${c.q + dq},${c.r + dr}`)).filter((i) => i !== undefined);
  }
  /** 1 or 2 during setup (which setup round we are in), else 0. */
  get setupRound() { return this.phase === 'setup' ? (this.setupStep < this.players.length ? 1 : 2) : 0; }
  playerById(pid) { return this.players.find((x) => x.id === pid); }

  // ---------- queries ----------
  isLandVertex(vi) { return this.graph.vertices[vi].cells.some((ci) => this.cells[ci].type !== 'water' && this.revealed.has(ci)); }
  isLandEdge(ei) { return this.graph.edges[ei].cells.some((ci) => this.cells[ci].type !== 'water' && this.revealed.has(ci)); }
  ownRoadAt(vi, pid, exceptEdge = -1) {
    return this.graph.vertices[vi].edges.some((e) => e !== exceptEdge && this.roads.get(e) === pid);
  }
  placedThisTurn(tool) { return this.history.filter((h) => h.tool === tool).length; }

  canAfford(tool, pid = this.player.id, island = null) {
    if (this.phase === 'setup') return true;
    const p = this.playerById(pid);
    const islands = island == null ? Object.keys(p.stock) : [island];
    return islands.some((i) => has(p.stock[i] ?? {}, COSTS[tool]))
      || (tool === 'town' && [...this.ships.values()].some((s) => s.player === pid && has(s.cargo, COSTS.town)));
  }

  /** Price of `tool` at spot `id` (the same everywhere; ships are built separately). */
  costAt(tool) { return COSTS[tool]; }
  /**
   * Where the price for `tool` at `id` would come from: { kind: 'stock', island }
   * or { kind: 'cargo', ship }, or null if the player can't pay (setup: free).
   */
  paySource(tool, id, pid = this.player.id) {
    const island = tool === 'road' ? this.edgeIsland(id) : this.vertexIsland(id);
    if (this.phase === 'setup') return { kind: 'free', island };
    const cost = this.costAt(tool, id, pid);
    const viaLand = tool !== 'town' || this.ownRoadAt(id, pid);
    if (viaLand && has(this.stockOf(pid, island), cost)) return { kind: 'stock', island };
    if (tool === 'town') {
      const ship = this.shipsAtVertex(id, pid).find((s) => has(s.cargo, COSTS.town));
      if (ship) return { kind: 'cargo', ship: ship.id, island };
    }
    return null;
  }
  shipsAtVertex(vi, pid) { const cs = this.graph.vertices[vi].cells; return [...this.ships.values()].filter((s) => s.player === pid && cs.includes(s.ci)); }

  /** May the current player use this tool at all right now (phase / roll / money)? */
  toolAllowed(tool) {
    if (this.winner) return false;
    if (this.phase === 'setup') {
      if (tool === 'town') return this.placedThisTurn('town') === 0;
      if (tool === 'road') return this.placedThisTurn('town') === 1 && this.placedThisTurn('road') < SETUP_ROADS;
      return false;
    }
    return !!this.rolled;
  }

  canTown(vi, pid) {
    const p = this.playerById(pid);
    if (!p || p.supply.town <= 0) return false;
    if (!this.isLandVertex(vi) || this.settlements.has(vi)) return false;
    if (this.graph.vertices[vi].neighbors.some((n) => this.settlements.has(n))) return false; // distance rule
    if (this.phase === 'setup') return this.vertexIsland(vi) === 0;
    return this.ownRoadAt(vi, pid) || this.shipsAtVertex(vi, pid).length > 0;
  }

  canCity(vi, pid) {
    const p = this.playerById(pid);
    const s = this.settlements.get(vi);
    return !!p && p.supply.city > 0 && !!s && s.player === pid && s.kind === 'town';
  }

  canRoad(ei, pid) {
    const p = this.playerById(pid);
    if (!p || p.supply.road <= 0 || this.roads.has(ei) || !this.isLandEdge(ei)) return false;
    const e = this.graph.edges[ei];
    for (const vi of [e.a, e.b]) {
      const s = this.settlements.get(vi);
      if (s && s.player === pid) return true;
      if (s && s.player !== pid) continue;           // opponent's settlement blocks this end
      if (this.ownRoadAt(vi, pid, ei)) return true;
    }
    return false;
  }

  /** Board positions (vertex or edge ids) where `tool` may be placed now. */
  validSpots(tool, pid = this.player.id, { ignoreCost = false } = {}) {
    if (pid === this.player.id && !this.toolAllowed(tool)) return [];
    if (!ignoreCost && this.phase === 'main') return this.validSpots(tool, pid, { ignoreCost: true }).filter((id) => this.paySource(tool, id, pid));
    if (tool === 'road') {
      let spots = this.graph.edges.map((_, i) => i).filter((ei) => this.canRoad(ei, pid));
      if (this.phase === 'setup') { // setup roads grow from this turn's town
        const town = this.history.find((h) => h.tool === 'town')?.id;
        const net = new Set([town]);
        for (const h of this.history) if (h.tool === 'road') { const e = this.graph.edges[h.id]; net.add(e.a); net.add(e.b); }
        spots = spots.filter((ei) => net.has(this.graph.edges[ei].a) || net.has(this.graph.edges[ei].b));
      }
      return spots;
    }
    if (tool === 'town') return this.graph.vertices.map((_, i) => i).filter((vi) => this.canTown(vi, pid));
    if (tool === 'city') return this.graph.vertices.map((_, i) => i).filter((vi) => this.canCity(vi, pid));
    return [];
  }

  /** Resources a corner touches: [{ cellIndex, resource }] */
  cornerYield(vi) {
    return this.graph.vertices[vi].cells
      .map((ci) => ({ ci, res: TILE_RESOURCE[this.cells[ci].type] }))
      .filter((x) => x.res && this.cells[x.ci].number != null);
  }

  // ---------- actions ----------
  place(tool, id) {
    const p = this.player;
    if (!this.toolAllowed(tool) || !this.validSpots(tool).includes(id)) return false;
    const src = this.paySource(tool, id);
    const island = src.island;
    const entry = { tool, id, player: this.current, paid: {}, gained: {}, island, src };
    const extra = [];  // undo steps for ships / cargo
    if (src.kind === 'stock') {
      const st = this.stockOf(p.id, island);
      const cost = { ...this.costAt(tool, id) };
      for (const [r, n] of Object.entries(cost)) st[r] -= n;
      extra.push(() => { for (const [r, n] of Object.entries(cost)) st[r] += n; });
      entry.cost = cost; // (entry.paid stays empty: the step above refunds the right island)
    } else if (src.kind === 'cargo') {
      // the ship's cargo pays for the town, everything else is unloaded onto the island
      const ship = this.ships.get(src.ship);
      const before = { ...ship.cargo };
      const st = this.stockOf(p.id, island);
      const stBefore = { ...st };
      for (const [r, n] of Object.entries(COSTS.town)) ship.cargo[r] -= n;
      entry.unloaded = {};
      for (const r of RESOURCES) if (ship.cargo[r] > 0) { st[r] += ship.cargo[r]; entry.unloaded[r] = ship.cargo[r]; ship.cargo[r] = 0; }
      extra.push(() => { Object.assign(ship.cargo, before); Object.assign(st, stBefore); });
    }
    if (tool === 'road') { this.roads.set(id, p.id); p.supply.road--; }
    if (tool === 'town') {
      this.settlements.set(id, { player: p.id, kind: 'town' });
      p.supply.town--;
      if (this.phase === 'setup' && this.setupRound === 2) { // second town: starting resources
        for (const { res } of this.cornerYield(id)) { p.resources[res]++; entry.gained[res] = (entry.gained[res] || 0) + 1; }
      }
    }
    if (tool === 'city') {
      this.settlements.set(id, { player: p.id, kind: 'city' });
      p.supply.city--;
      p.supply.town++;
    }
    entry.prevLongest = this.longestRoad;
    entry.extra = extra;
    this.history.push(entry);
    this.updateLongestRoad();
    // discovering land: a road reveals the cells around both its ends, a town those of its corner
    const corners = tool === 'road' ? [this.graph.edges[id].a, this.graph.edges[id].b] : [id];
    entry.revealed = this.reveal(corners.flatMap((vi) => this.graph.vertices[vi].cells));
    if (this.points(p.id) >= this.winPoints) this.winner = p;
    return entry;
  }

  // ---------- fog of war ----------
  /** Reveal cells; returns the newly revealed ones. Discoveries can't be undone. */
  reveal(cis) {
    const fresh = [...new Set(cis)].filter((ci) => !this.revealed.has(ci));
    for (const ci of fresh) this.revealed.add(ci);
    if (fresh.length && this.phase === 'main') this.history = [];
    return fresh;
  }

  // ---------- ships ----------
  /** Put a new ship of player pid into a revealed sea hex next to corner vi. */
  spawnShip(pid, vi) {
    const p = this.playerById(pid);
    const water = this.waterAt(vi).filter((ci) => this.revealed.has(ci));
    if (!water.length || p.supply.ship <= 0) return null;
    const busy = (ci) => [...this.ships.values()].filter((s) => s.ci === ci).length;
    water.sort((a, b) => busy(a) - busy(b));
    // a ship built during the game first sails next turn (setup ships are ready right away)
    const fresh = this.phase === 'main';
    const ship = { id: this.nextShip++, player: pid, ci: water[0], cargo: emptyRes(), moved: fresh, fresh, home: vi };
    this.ships.set(ship.id, ship);
    p.supply.ship--;
    return ship;
  }

  /** Own coastal settlements where the current player may build a ship now. */
  shipYards(pid = this.player.id) {
    if (this.phase !== 'main' || !this.rolled || this.winner) return [];
    return [...this.settlements].filter(([vi, s]) => s.player === pid && this.isCoastal(vi) && this.waterAt(vi).some((ci) => this.revealed.has(ci)))
      .map(([vi]) => vi);
  }
  canBuildShip(vi, pid = this.player.id) {
    return this.shipYards(pid).includes(vi) && this.playerById(pid).supply.ship > 0 && has(this.stockOf(pid, this.vertexIsland(vi)), COSTS.ship);
  }
  buildShip(vi) {
    if (!this.canBuildShip(vi)) return null;
    const p = this.player, st = this.stockOf(p.id, this.vertexIsland(vi));
    for (const [r, n] of Object.entries(COSTS.ship)) st[r] -= n;
    const ship = this.spawnShip(p.id, vi);
    this.history.push({ tool: 'ship', player: this.current, undo: () => {
      this.ships.delete(ship.id); p.supply.ship++;
      for (const [r, n] of Object.entries(COSTS.ship)) st[r] += n;
    } });
    return ship;
  }

  /** Sea hexes a ship may sail to this turn (1 hex per turn, after rolling). */
  shipMoves(id) {
    const s = this.ships.get(id);
    if (!s || s.player !== this.player.id || s.moved || this.phase !== 'main' || !this.rolled || this.winner) return [];
    return this.cellNeighbours(s.ci).filter((ci) => this.cells[ci].type === 'water');
  }
  moveShip(id, ci) {
    if (!this.shipMoves(id).includes(ci)) return null;
    const s = this.ships.get(id), from = s.ci;
    s.ci = ci; s.moved = true;
    let lost = null;
    if (this.tornadoAt(ci)) { // sailing into a tornado: the ship sinks with its cargo (no undo)
      lost = this.sinkShip(id).lost;
      this.history = [];
      return { from, to: ci, revealed: this.reveal([ci, ...this.cellNeighbours(ci)]), lost, sunk: true };
    } else this.history.push({ tool: 'sail', player: this.current, undo: () => { s.ci = from; s.moved = false; } });
    const revealed = this.reveal([ci, ...this.cellNeighbours(ci)]);
    return { from, to: ci, revealed, lost };
  }

  /** Island where ship `id` lies at one of its owner's harbours (or -1). */
  dockIsland(id) {
    const s = this.ships.get(id);
    if (!s) return -1;
    for (const [vi, st] of this.settlements) if (st.player === s.player && this.graph.vertices[vi].cells.includes(s.ci)) return this.vertexIsland(vi);
    return -1;
  }
  // ---------- tornado ----------
  tornadoAt(ci) { return this.tornados.some((t) => t.ci === ci); }
  /** Move every tornado 1 sea hex in a random direction; ships they hit sink with their cargo. */
  moveTornados(rand = Math.random) {
    const moves = [], hits = [];
    for (const t of this.tornados) {
      const opts = this.cellNeighbours(t.ci).filter((ci) => this.cells[ci].type === 'water');
      if (!opts.length) continue;
      const from = t.ci, to = opts[Math.floor(rand() * opts.length)];
      t.ci = to;
      moves.push({ id: t.id, from, to });
      for (const s of [...this.ships.values()]) if (s.ci === to) hits.push(this.sinkShip(s.id));
    }
    return { moves, hits };
  }

  /** The tornado sinks a ship with all its cargo; it returns to its owner's supply. */
  sinkShip(id) {
    const s = this.ships.get(id);
    const lost = {};
    for (const r of RESOURCES) if (s.cargo[r] > 0) lost[r] = s.cargo[r];
    this.ships.delete(id);
    this.playerById(s.player).supply.ship++;
    return { ship: id, player: s.player, lost };
  }

  // ---------- piracy ----------
  /** Opponent ships sharing a hex with the current player's ship `id` (each ship may rob once per turn). */
  robTargets(id) {
    const s = this.ships.get(id);
    if (!s || s.player !== this.player.id || s.robbed || this.phase !== 'main' || !this.rolled || this.winner) return [];
    return [...this.ships.values()].filter((o) => o.ci === s.ci && o.player !== s.player).map((o) => o.id);
  }
  /** Rob ship `targetId`: all its cargo goes onto ship `id`, the robbed ship burns & sinks (back to its owner's supply). */
  rob(id, targetId) {
    if (!this.robTargets(id).includes(targetId)) return null;
    const s = this.ships.get(id), t = this.ships.get(targetId);
    const loot = {};
    for (const r of RESOURCES) if (t.cargo[r] > 0) { loot[r] = t.cargo[r]; s.cargo[r] += t.cargo[r]; }
    this.ships.delete(targetId);
    this.playerById(t.player).supply.ship++;
    s.robbed = true;
    this.history = []; // a sunk ship can't be raised again
    return { loot, victim: t.player };
  }

  canLoad(id, pid = this.player.id) {
    const s = this.ships.get(id);
    return !!s && s.player === pid && this.phase === 'main' && !!this.rolled && !this.winner && this.dockIsland(id) >= 0;
  }
  /** Move n of `res` from the island's stock into the ship (n < 0 unloads). */
  load(id, res, n = 1, island = this.dockIsland(id)) {
    if (!this.canLoad(id) || island < 0) return false;
    const s = this.ships.get(id), st = this.stockOf(s.player, island);
    if (n > 0 ? st[res] < n : s.cargo[res] < -n) return false;
    st[res] -= n; s.cargo[res] += n;
    this.history.push({ tool: n > 0 ? 'load' : 'unload', player: this.current, undo: () => { st[res] += n; s.cargo[res] -= n; } });
    return true;
  }

  // ---------- trade offers between players ----------
  canOffer(to, res, island = 0) {
    const p = this.player;
    return this.phase === 'main' && !!this.rolled && !this.winner && to !== p.id && !!this.playerById(to) && this.stockOf(p.id, island)[res] > 0;
  }
  /** Reserve 1 `res` from the current player's island stock for player `to`. */
  offer(to, res, island = 0) {
    if (!this.canOffer(to, res, island)) return false;
    const p = this.player, st = this.stockOf(p.id, island);
    let o = this.offers.find((x) => x.from === p.id && x.to === to);
    if (!o) { o = { from: p.id, to, items: {} }; this.offers.push(o); }
    const it = (o.items[island] ??= {});
    st[res]--; it[res] = (it[res] || 0) + 1;
    this.history.push({ tool: 'offer', player: this.current, undo: () => {
      st[res]++; if (--it[res] <= 0) delete it[res];
      if (!offerTotal(o)) this.offers.splice(this.offers.indexOf(o), 1);
    } });
    return true;
  }
  pendingOffersFor(pid) { return this.offers.filter((o) => o.to === pid); }
  offerFrom(from, to) { return this.offers.find((o) => o.from === from && o.to === to); }
  /** Answer an offer: accepted goods land in the receiver's main-island stock. */
  resolveOffer(o, accept) {
    const i = this.offers.indexOf(o);
    if (i < 0) return;
    this.offers.splice(i, 1);
    for (const [island, items] of Object.entries(o.items)) {
      const st = accept ? this.stockOf(o.to, 0) : this.stockOf(o.from, +island);
      for (const [r, n] of Object.entries(items)) st[r] += n;
    }
  }

  undo() {
    const h = this.history.pop();
    if (!h) return false;
    if (h.undo) { h.undo(); this.winner = null; return true; }
    const p = this.players[h.player];
    if (h.tool === 'road') { this.roads.delete(h.id); p.supply.road++; }
    if (h.tool === 'town') { this.settlements.delete(h.id); p.supply.town++; }
    if (h.tool === 'city') { this.settlements.set(h.id, { player: p.id, kind: 'town' }); p.supply.city++; p.supply.town--; }
    for (const [r, n] of Object.entries(h.paid)) p.resources[r] += n;
    for (const [r, n] of Object.entries(h.gained)) p.resources[r] -= n;
    for (const fn of (h.extra ?? []).reverse()) fn();
    this.longestRoad = h.prevLongest ?? null;
    this.winner = null;
    return true;
  }

  // ---------- bank trade (4:1) ----------
  canTrade(from, pid = this.player.id, island = 0) {
    return this.phase === 'main' && !!this.rolled && !this.winner && this.stockOf(pid, island)[from] >= BANK_RATE;
  }

  trade(from, to, island = 0) {
    if (from === to || !RESOURCES.includes(to) || !this.canTrade(from, this.player.id, island)) return false;
    const st = this.stockOf(this.player.id, island);
    st[from] -= BANK_RATE;
    st[to] += 1;
    this.history.push({ tool: 'trade', player: this.current, undo: () => { st[from] += BANK_RATE; st[to] -= 1; } });
    return true;
  }

  canRoll() { return this.phase === 'main' && !this.rolled && !this.winner; }

  /** Roll 2d6 and hand out resources. Returns { a, b, sum, events: [{ vi, ci, pid, res, n }] }. */
  roll(rand = Math.random) {
    if (!this.canRoll()) return null;
    const a = 1 + Math.floor(rand() * 6), b = 1 + Math.floor(rand() * 6), sum = a + b;
    const storm = rand() < WEATHER_LEVELS[this.weatherLevel]; // hidden weather check
    this.rolled = { a, b, sum };
    const events = [];
    // --- weather event (before production: the struck tile yields nothing) ---
    let weather = null;
    if (storm) {
      const targets = this.cells.map((c, ci) => ci)
        .filter((ci) => this.cells[ci].number === sum && WEATHER[this.cells[ci].type] && !this.weather.has(ci) && this.revealed.has(ci));
      if (targets.length) {
        const ci = targets[Math.floor(rand() * targets.length)];
        const w = WEATHER[this.cells[ci].type];
        const losers = new Map();
        for (const [vi, s] of this.settlements) if (this.graph.vertices[vi].cells.includes(ci)) losers.set(s.player, true);
        const isl = this.cells[ci].island ?? 0;
        const losses = [...losers.keys()].map((pid) => {
          const st = this.stockOf(pid, isl);
          const n = Math.floor(st[w.res] / 2);
          st[w.res] -= n;
          return { pid, res: w.res, n, island: isl };
        });
        this.weather.set(ci, { ...w, turnsLeft: WEATHER_ROUNDS * this.players.length });
        weather = { ci, ...w, losses };
      } else weather = { ci: -1 }; // event rolled, but no tile with weather shows that number
    }
    this.rolled.weather = weather;
    {
      for (const [vi, s] of this.settlements) {
        for (const { ci, res } of this.cornerYield(vi)) {
          if (this.cells[ci].number !== sum || this.weather.has(ci)) continue;
          const n = s.kind === 'city' ? 2 : 1;
          const island = this.cells[ci].island ?? 0;
          this.stockOf(s.player, island)[res] += n;
          events.push({ vi, ci, pid: s.player, res, n, island });
        }
      }
    }
    return { a, b, sum, weather, events };
  }

  /** What still has to happen before the turn can end (null = may end). */
  endTurnBlocker() {
    if (this.winner) return t('The game is over');
    if (this.phase === 'setup') {
      if (this.placedThisTurn('town') === 0) return t('Place your starting town first');
      if (this.placedThisTurn('road') < SETUP_ROADS && this.validSpots('road').length) return t('Place {n} more road(s)', { n: SETUP_ROADS - this.placedThisTurn('road') });
      return null;
    }
    return this.rolled ? null : t('Roll the dice first');
  }

  endTurn() {
    if (this.endTurnBlocker()) return false;
    this.history = [];
    this.rolled = null;
    for (const s of this.ships.values()) { s.moved = false; s.fresh = false; s.robbed = false; }
    this.turn++;
    if (this.phase === 'setup') {
      this.setupStep++;
      if (this.setupStep < this.setupOrder.length) this.current = this.setupOrder[this.setupStep];
      else { this.phase = 'main'; this.current = 0; }
      return true;
    }
    this.current = (this.current + 1) % this.players.length;
    if (this.current === 0) this.round++;
    this.tornadoEvent = this.moveTornados();
    // weather wears off after 3 full rounds
    for (const [ci, w] of this.weather) if (--w.turnsLeft <= 0) this.weather.delete(ci);
    return true;
  }

  // ---------- longest road ----------
  /**
   * Longest continuous road of a player: the longest trail through their road
   * edges using each edge at most once (so loops count only once). A corner
   * occupied by an opponent's town/castle breaks the road there.
   */
  longestRoadLength(pid) {
    const mine = [...this.roads].filter(([, p]) => p === pid).map(([e]) => e);
    if (!mine.length) return 0;
    const blocked = (vi) => { const s = this.settlements.get(vi); return !!s && s.player !== pid; };
    const used = new Set();
    let best = 0;
    const walk = (vi, len) => {
      best = Math.max(best, len);
      if (len > 0 && blocked(vi)) return; // can't pass through an opponent's settlement
      for (const e of this.graph.vertices[vi].edges) {
        if (used.has(e) || this.roads.get(e) !== pid) continue;
        used.add(e);
        const ed = this.graph.edges[e];
        walk(ed.a === vi ? ed.b : ed.a, len + 1);
        used.delete(e);
      }
    };
    const starts = new Set(mine.flatMap((e) => [this.graph.edges[e].a, this.graph.edges[e].b]));
    for (const vi of starts) walk(vi, 0);
    return best;
  }

  /** Award / move the Longest Road bonus (holder keeps it on a tie). */
  updateLongestRoad() {
    const lens = new Map(this.players.map((p) => [p.id, this.longestRoadLength(p.id)]));
    const top = Math.max(...lens.values());
    const holder = this.longestRoad;
    if (holder && lens.get(holder) >= LONGEST_ROAD_MIN && lens.get(holder) === top) return;
    const leaders = [...lens].filter(([, l]) => l === top && l >= LONGEST_ROAD_MIN);
    this.longestRoad = leaders.length === 1 ? leaders[0][0] : (holder && lens.get(holder) >= LONGEST_ROAD_MIN && leaders.some(([id]) => id === holder) ? holder : null);
  }

  /** Points breakdown for the scoreboard tooltip. */
  stats(pid) {
    let towns = 0, cities = 0;
    for (const s of this.settlements.values()) if (s.player === pid) { if (s.kind === 'city') cities++; else towns++; }
    const roads = [...this.roads.values()].filter((p) => p === pid).length;
    const longest = this.longestRoadLength(pid);
    const longestBonus = this.longestRoad === pid ? LONGEST_ROAD_POINTS : 0;
    const settled = new Set();
    for (const [vi, s] of this.settlements) if (s.player === pid) settled.add(this.vertexIsland(vi));
    settled.delete(0);
    const islandBonus = settled.size * ISLAND_POINTS;
    const ships = [...this.ships.values()].filter((s) => s.player === pid).length;
    return { towns, cities, roads, longest, longestBonus, islands: settled.size, islandBonus, ships, points: towns + cities * 2 + longestBonus + islandBonus };
  }

  // victory points: town 1, city 2, Longest Road 2, every new island settled 2
  points(pid) { return this.stats(pid).points; }
}

export const emptyRes = () => Object.fromEntries(RESOURCES.map((r) => [r, 0]));
export const has = (stock, cost) => Object.entries(cost).every(([r, n]) => (stock[r] ?? 0) >= n);
export const addRes = (a, b) => { const o = { ...a }; for (const [r, n] of Object.entries(b)) o[r] = (o[r] || 0) + n; return o; };
export const offerTotal = (o) => Object.values(o.items).reduce((t, it) => t + Object.values(it).reduce((a, b) => a + b, 0), 0);
