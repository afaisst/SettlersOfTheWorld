// Placing pieces on the board. The board state is plain data:
//   settlements: Map(vertexId -> { player, kind: 'town' | 'city' })
//   roads:       Map(edgeId   -> player)
// buildPieces() turns that into 3D: roads are trimmed at each corner so a
// player's roads run into their own town/castle gate or join through a small
// cobbled square; towns/castles turn their gate toward one of their roads.

import * as THREE from 'three';
import { createRoad, createTown, createCity, createJunction, JUNCTION_R, CITY_HALF } from './pieces.js';
import { axialToWorld } from '../board/layout.js';
import { mergeStatic } from './merge.js';

// game pieces are shown larger than terrain scale so they read clearly
export const PIECE_SCALE = { town: 1.3, city: 1.6 };
// distance from the corner at which a road stops, per situation
const STOP = {
  free: 0.14,                         // nothing at the corner
  junction: JUNCTION_R - 0.01,        // joins the cobbled square
  own: { town: 0.18 * 1.3 - 0.01, city: 0.15 * 1.6 + 0.01 },   // reaches the gate
  other: { town: 0.18 * 1.3 + 0.02, city: 0.15 * 1.6 + 0.07 }, // stays clear of it
};
const CLEAR_R = { town: 0.27, city: 0.37 };

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();

/** Hide trees, grass, rocks, huts... within radius r of board point (x, z). */
export function clearProps(tiles, x, z, r) {
  for (const t of tiles) {
    const g = t.group;
    if (Math.hypot(g.position.x - x, g.position.z - z) > 1.05 + r) continue;
    g.updateMatrixWorld(true);
    _v.set(x, g.parent ? g.parent.position.y : 0, z);
    g.worldToLocal(_v);
    for (const o of g.children) {
      if (o.isInstancedMesh) {
        let changed = false;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, _m);
          _p.setFromMatrixPosition(_m);
          if (Math.hypot(_p.x - _v.x, _p.z - _v.z) < r) { o.setMatrixAt(i, ZERO); changed = true; }
        }
        if (changed) o.instanceMatrix.needsUpdate = true;
      } else if (o.isMesh && (o.position.x !== 0 || o.position.z !== 0)) {
        // buildings (huts, barns, cabins) — hide if they would overlap
        if (Math.hypot(o.position.x - _v.x, o.position.z - _v.z) < r + 0.08) o.visible = false;
      }
    }
    t.avoid?.(_v.x, _v.z, r); // e.g. sheep keep out
  }
}

export function buildPieces(parent, tiles, graph, { settlements, roads }, cells = null, { cleared = null } = {}) {
  // `cleared` (optional Set) remembers which spots already had their props removed,
  // so rebuilding after every placement doesn't re-scan the terrain each time.
  const clearOnce = (key, fn) => { if (cleared?.has(key)) return; cleared?.add(key); fn(); };
  // all roads & junctions live in one container that is merged at the end (few draw calls)
  const network = new THREE.Group();
  network.name = 'roads';
  const realParent = parent;
  parent = network;
  const dirFrom = (vi, ei) => { // world direction from corner vi along edge ei
    const v = graph.vertices[vi], e = graph.edges[ei];
    return Math.atan2(e.z - v.z, e.x - v.x);
  };
  const ownRoadsAt = (vi, player) => graph.vertices[vi].edges.filter((e) => roads.get(e) === player);

  // --- roads ---
  for (const [ei, player] of roads) {
    const e = graph.edges[ei];
    const stopAt = (vi) => {
      const s = settlements.get(vi);
      if (s && s.player === player && s.kind === 'city') {
        // run right up to the gate in the square castle wall: the castle's front
        // faces the owner's first road; this road arrives at local angle a
        const own = ownRoadsAt(vi, player);
        const a = dirFrom(vi, ei) - dirFrom(vi, own[0]) + Math.PI / 2;
        const k = CITY_HALF / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
        return (k + 0.045) * PIECE_SCALE.city; // ends on the cobbled apron, just short of the gate
      }
      if (s) return s.player === player ? STOP.own[s.kind] : STOP.other[s.kind];
      return ownRoadsAt(vi, player).length >= 2 ? STOP.junction : STOP.free;
    };
    const road = createRoad(player, { from: -0.5 + stopAt(e.a), to: 0.5 - stopAt(e.b), seed: ei * 7 + 1 }); // stable look per edge
    road.position.set(e.x, 0, e.z);
    road.rotation.y = -e.angle; // local +X runs from corner a to corner b
    parent.add(road);
    clearOnce(`e${ei}`, () => {
      for (let t = -0.4; t <= 0.4; t += 0.1) clearProps(tiles, e.x + Math.cos(e.angle) * t, e.z + Math.sin(e.angle) * t, 0.085);
    });
  }

  // --- junctions where a player's roads meet at an empty corner ---
  graph.vertices.forEach((v, vi) => {
    if (settlements.has(vi)) return;
    const byPlayer = new Map();
    for (const e of v.edges) {
      const p = roads.get(e);
      if (p) byPlayer.set(p, [...(byPlayer.get(p) || []), e]);
    }
    for (const [player, es] of byPlayer) {
      if (es.length < 2) continue;
      const j = createJunction(player, es.map((e) => dirFrom(vi, e)), { seed: vi * 5 + 3 });
      j.position.set(v.x, 0, v.z);
      parent.add(j);
    }
  });

  mergeStatic(network);
  realParent.add(network);
  parent = realParent;

  // --- towns & castles, gate facing one of their own roads ---
  for (const [vi, s] of settlements) {
    const v = graph.vertices[vi];
    const own = ownRoadsAt(vi, s.player);
    let rotY;
    if (own.length) {
      const d = dirFrom(vi, own[0]);
      rotY = Math.atan2(Math.cos(d), Math.sin(d)); // local +Z -> road direction
    } else rotY = (vi % 6) * Math.PI / 3;
    // coastal corner? -> harbour toward the sea, settlement nudged inland
    let seaAng = null, px = v.x, pz = v.z;
    const sea = cells ? v.cells.filter((ci) => cells[ci].type === 'water') : [];
    if (sea.length && sea.length < v.cells.length) {
      let sx = 0, sz = 0;
      for (const ci of sea) { const c = axialToWorld(cells[ci].q, cells[ci].r); sx += c.x - v.x; sz += c.z - v.z; }
      const seaWorld = Math.atan2(sz, sx);
      seaAng = seaWorld + rotY;                 // into the piece's local frame
      px -= Math.cos(seaWorld) * 0.1; pz -= Math.sin(seaWorld) * 0.1;
    }
    // a gate toward every one of the owner's roads (local angles; own[0] is the main gate on +Z)
    const roadAngs = own.map((e) => dirFrom(vi, e) + rotY);
    const pseed = vi * 11 + 5; // stable look per corner
    const piece = s.kind === 'city'
      ? createCity(s.player, { seed: pseed, seaAng, gateAngs: roadAngs.slice(1) })
      : createTown(s.player, { seed: pseed, gateAngs: roadAngs.length ? roadAngs : [Math.PI / 2], seaAng });
    piece.position.set(px, 0, pz);
    piece.rotation.y = rotY;
    piece.scale.setScalar(PIECE_SCALE[s.kind]);
    mergeStatic(piece); // dozens of small meshes -> one per material
    parent.add(piece);
    clearOnce(`v${vi}${s.kind}`, () => clearProps(tiles, px, pz, CLEAR_R[s.kind]));
  }
}

/**
 * Demo: each player gets settlements + connected roads on land, obeying
 * Catan's distance rule (no two settlements on adjacent corners).
 */
export function demoBoardState(graph, cells, players, { citiesPer = 1, townsPer = 2, rand = Math.random } = {}) {
  const settlements = new Map();
  const roads = new Map();
  const isLand = (ci) => cells[ci].type !== 'water';
  const landE = (ei) => graph.edges[ei].cells.some(isLand);
  const free = (vi) => graph.vertices[vi].cells.some(isLand) && !settlements.has(vi)
    && graph.vertices[vi].neighbors.every((n) => !settlements.has(n));
  const candidates = graph.vertices.map((_, i) => i).filter((i) => graph.vertices[i].cells.filter(isLand).length >= 2);
  const pick = () => {
    for (let t = 0; t < 300; t++) {
      const vi = candidates[Math.floor(rand() * candidates.length)];
      if (free(vi)) return vi;
    }
    return -1;
  };
  // a road network: a winding path out of the settlement, sometimes branching
  const growRoads = (start, player, n) => {
    let cur = start;
    for (let k = 0; k < n; k++) {
      const opts = graph.vertices[cur].edges.filter((e) => !roads.has(e) && landE(e));
      if (!opts.length) break;
      const e = opts[Math.floor(rand() * opts.length)];
      roads.set(e, player);
      const ed = graph.edges[e];
      const next = ed.a === cur ? ed.b : ed.a;
      if (settlements.has(next) && settlements.get(next).player !== player) break; // blocked
      cur = next;
    }
  };
  for (const player of players) {
    const kinds = [...Array(citiesPer).fill('city'), ...Array(townsPer).fill('town')];
    for (const kind of kinds) {
      const vi = pick();
      if (vi < 0) continue;
      settlements.set(vi, { player, kind });
      growRoads(vi, player, 2 + Math.floor(rand() * 3));
      if (rand() < 0.5) growRoads(vi, player, 1 + Math.floor(rand() * 2)); // a branch
    }
  }
  return { settlements, roads };
}
