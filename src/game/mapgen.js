// World generation: the Catan-style main island (19 hexes, radius 2) plus
// optional smaller islands scattered around it, all surrounded by sea.
//
//   generateWorld(seed, { islands = 1, size = 'medium' })
//     islands  total number of islands incl. the main one (1..6)
//     size     'small' (3 tiles), 'medium' (3–5), 'large' (3–6) for the extra islands
//   -> { cells, islands, radius, revealed }
//     cells[i]  = { q, r, type, number?, island? }   (island id: 0 = main)
//     islands[] = { id, name, cells: [cellIndex], x, z }
//     revealed  = cell indices visible at the start (main island + first water ring)
//
// Sea = a full hexagon 2 hexes beyond the outermost land (all islands connected by water).

import { mulberry32 } from '../core/noise.js';
import { hexagonalBoard, axialToWorld } from '../board/layout.js';

export const LAND = ['forest', 'pasture', 'field', 'hills', 'mountains'];
export const ISLAND_SIZES = { small: [3, 3], medium: [3, 5], large: [3, 6] };
import { t, lang } from '../i18n.js';
const ISLAND_NAMES_DE = [
  'Möweninsel', 'Moosatoll', 'Kieselkap', 'Robbenfels', 'Bernsteininsel', 'Farnwerder', 'Laterneninsel',
  'Tangriff', 'Papageitaucherspitze', 'Treibholzinsel', 'Korallenwerder', 'Nebelkap',
];
const ISLAND_NAMES = [
  'Gull Isle', 'Mossy Atoll', 'Pebble Key', 'Seal Rock', 'Amber Isle', 'Fern Holm', 'Lantern Isle',
  'Kelp Cay', 'Puffin Point', 'Driftwood Isle', 'Coral Holm', 'Misty Key',
];

const NB = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const key = (q, r) => `${q},${r}`;
export const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
const ring = (c) => hexDist(c, { q: 0, r: 0 });
export const pipCount = (n) => 6 - Math.abs(7 - n); // ways to roll n with 2 dice

// ---------------------------------------------------------------------------
// Main island: Catan land mix + token set incl. a 7 (no robber in this game)
// ---------------------------------------------------------------------------
export const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/** Assign numbers to `land` cells from `pool` so 6/7/8 and equal numbers never touch. */
function placeNumbers(land, pool, rand, { needGood = false, maxPips = 13 } = {}) {
  const byKey = new Map(land.map((c) => [key(c.q, c.r), c]));
  const neighbours = (c) => NB.map(([dq, dr]) => byKey.get(key(c.q + dq, c.r + dr))).filter(Boolean);
  const hot = (n) => n >= 6 && n <= 8;
  const adj = (a, b) => NB.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
  const pips = (c) => (c.number == null ? 0 : pipCount(c.number));
  for (let attempt = 0; attempt < 2000; attempt++) {
    const nums = shuffle([...pool], rand).slice(0, land.length);
    land.forEach((c, i) => { c.number = nums[i] ?? null; });
    if (needGood && !land.some((c) => c.number >= 5 && c.number <= 9)) continue;
    const ok = land.every((c) => neighbours(c).every((n) => n.number !== c.number && !(hot(c.number) && hot(n.number))));
    if (!ok) continue;
    if (land.every((c) => { const ns = neighbours(c); return ns.every((a) => ns.every((b) => a === b || !adj(a, b) || pips(c) + pips(a) + pips(b) <= maxPips)); })) return;
  }
}

// ---------------------------------------------------------------------------
export function generateWorld(seed, { islands = 1, size = 'medium' } = {}) {
  const rand = mulberry32(seed);
  const land = new Map(); // key -> cell
  // main island
  const mainTypes = shuffle([
    ...Array(4).fill('forest'), ...Array(4).fill('pasture'), ...Array(4).fill('field'),
    ...Array(3).fill('hills'), ...Array(3).fill('mountains'), LAND[Math.floor(rand() * LAND.length)],
  ], rand);
  const main = hexagonalBoard(2).map((c, i) => ({ ...c, type: mainTypes[i], island: 0 }));
  main.forEach((c) => land.set(key(c.q, c.r), c));
  placeNumbers(main, NUMBERS, mulberry32(seed * 31 + 17));
  const isl = [{ id: 0, name: t('Main island'), cells: main }];

  // extra islands, spread around the main island in sectors
  const extra = Math.max(0, Math.min(5, islands - 1));
  const [minS, maxS] = ISLAND_SIZES[size] ?? ISLAND_SIZES.medium;
  const names = shuffle([...(lang === 'de' ? ISLAND_NAMES_DE : ISLAND_NAMES)], rand);
  const offset = rand() * Math.PI * 2;
  // island land starts at ring 5: two sea hexes between it and the main island (ring 2)
  const candidates = hexagonalBoard(7).filter((c) => ring(c) >= 5 && ring(c) <= 6);
  for (let k = 0; k < extra; k++) {
    const want = minS + Math.floor(rand() * (maxS - minS + 1));
    const target = offset + (k / extra) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const farFromOthers = (c) => [...land.values()].every((o) => o.island === 0 || hexDist(o, c) >= 3);
    const okTile = (c) => ring(c) >= 5 && ring(c) <= 7 && !land.has(key(c.q, c.r)) && farFromOthers(c);
    // seed: the candidate hex whose direction is closest to the sector's angle
    const angDist = (c) => { const p = axialToWorld(c.q, c.r); const a = Math.atan2(p.z, p.x); return Math.abs(Math.atan2(Math.sin(a - target), Math.cos(a - target))); };
    const seeds = candidates.filter(okTile).sort((a, b) => angDist(a) - angDist(b)).slice(0, 4);
    let best = null;
    for (const s of seeds) {
      const blob = [s];
      const inBlob = new Set([key(s.q, s.r)]);
      for (let guard = 0; guard < 60 && blob.length < want; guard++) {
        const from = blob[Math.floor(rand() * blob.length)];
        const [dq, dr] = NB[Math.floor(rand() * 6)];
        const c = { q: from.q + dq, r: from.r + dr };
        if (inBlob.has(key(c.q, c.r)) || !okTile(c)) continue;
        blob.push(c); inBlob.add(key(c.q, c.r));
      }
      if (!best || blob.length > best.length) best = blob;
      if (best.length >= want) break;
    }
    if (!best || best.length < 2) continue;
    const id = isl.length;
    const types = shuffle([...LAND, ...LAND], rand);
    const cells = best.map((c, i) => ({ q: c.q, r: c.r, type: types[i % types.length], island: id }));
    cells.forEach((c) => land.set(key(c.q, c.r), c));
    placeNumbers(cells, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], rand, { needGood: true, maxPips: 99 });
    isl.push({ id, name: names[k % names.length], cells });
  }

  // sea: a full hexagon reaching 2 hexes past the outermost land, so the fog's
  // outline gives nothing away (every fogged hex inside it can be explored)
  const maxRing = Math.max(...[...land.values()].map(ring)) + 2;
  const sea = new Map();
  for (const h of hexagonalBoard(maxRing)) {
    const k = key(h.q, h.r);
    if (!land.has(k)) sea.set(k, { q: h.q, r: h.r, type: 'water' });
  }
  const cells = [...land.values(), ...sea.values()];
  const index = new Map(cells.map((c, i) => [c, i]));
  const islandsOut = isl.map((I) => {
    const idx = I.cells.map((c) => index.get(c));
    let x = 0, z = 0;
    for (const c of I.cells) { const p = axialToWorld(c.q, c.r); x += p.x; z += p.z; }
    return { id: I.id, name: I.name, cells: idx, x: x / I.cells.length, z: z / I.cells.length };
  });
  const radius = Math.max(...cells.map(ring));
  const revealed = cells.map((c, i) => i).filter((i) => cells[i].island === 0 || (cells[i].type === 'water' && ring(cells[i]) <= 3));
  return { cells, islands: islandsOut, radius, revealed };
}

// Backwards-compatible helpers (tile workshop)
export function randomIsland(seed) { return generateWorld(seed).cells; }
export function assignNumbers(cells) { return cells; }
