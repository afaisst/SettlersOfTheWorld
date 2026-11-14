// FIELD tile (resource: grain).
// Flat farmland split by dirt tracks into parcels. Most parcels are ripe,
// golden wheat in rows that ripple in the wind; others may be less ripe or
// already harvested (stubble + round bales). Optional farmstead with barn and
// silo(s), poppy/cornflower margins, and a few hedgerow trees.

import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, lerp, clamp, smoothstep } from '../core/noise.js';
import { createHexTerrainGeometry, createTileBody, edgeFalloff, hexNorm } from './hexGeometry.js';
import { getMaterials, buildInstanced, createScatter } from './materials.js';
import {
  wheatClumpGeometry, grassTuftGeometry, flowerGeometry, siloGeometry, roundBaleGeometry,
  hutGeometry, deciduousGeometry, bushGeometry,
} from './props.js';

const CROPS = {
  ripe: { ground: '#9a7a3e', tint: [1.0, 0.95, 0.85], geo: 0 },
  pale: { ground: '#a08a4a', tint: [1.08, 1.05, 0.85], geo: 1 },
  green: { ground: '#6e7038', tint: [0.9, 1.0, 0.8], geo: 2 },
  stubble: { ground: '#a68f58', tint: [1, 1, 1], geo: -1 },
};

export function createFieldTile({ seed = 1, radius = 0.97 } = {}) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'field';
  const disposables = [];

  // ---------- Parcels & tracks ------------------------------------------------
  const nTracks = 1 + (rand() < 0.6 ? 1 : 0);
  const tracks = [];
  for (let i = 0; i < nTracks; i++) {
    const ang = rand() * Math.PI + i * 1.2;
    const n = { x: Math.cos(ang), z: Math.sin(ang) };
    tracks.push({ n, off: (rand() - 0.5) * 0.7, wobble: rand() * 10 });
  }
  const trackDist = (x, z) => Math.min(...tracks.map((t) => Math.abs(x * t.n.x + z * t.n.z - t.off + Math.sin((x * t.n.z - z * t.n.x) * 3 + t.wobble) * 0.03)));
  const parcelId = (x, z) => tracks.reduce((id, t, i) => id | ((x * t.n.x + z * t.n.z - t.off > 0 ? 1 : 0) << i), 0);
  const nParcels = 1 << nTracks;
  const parcels = [];
  for (let i = 0; i < nParcels; i++) {
    const r = rand();
    const crop = i === 0 ? 'ripe' : r < 0.55 ? 'ripe' : r < 0.72 ? 'pale' : r < 0.85 ? 'stubble' : 'green';
    parcels.push({ crop, rowAng: rand() * Math.PI, ...CROPS[crop] });
  }
  // Unripe green crops cover at most ~10% of a field: only one small plot may be green.
  {
    const area = new Array(nParcels).fill(0);
    let total = 0;
    for (let x = -radius; x <= radius; x += 0.05) for (let z = -radius; z <= radius; z += 0.05) {
      if (hexNorm(x, z, radius) > 1) continue;
      area[parcelId(x, z)]++; total++;
    }
    let greenUsed = false;
    parcels.forEach((p, i) => {
      if (p.crop !== 'green') return;
      if (greenUsed || area[i] / total > 0.12) Object.assign(p, { crop: 'ripe', ...CROPS.ripe });
      else greenUsed = true;
    });
  }

  // ---------- Farmstead ---------------------------------------------------------
  let farm = null;
  if (rand() < 0.7) {
    const a = rand() * Math.PI * 2;
    const d = 0.55 + rand() * 0.06;
    farm = { x: Math.cos(a) * d, z: Math.sin(a) * d, a, r: 0.16 };
  }
  const farmDist = (x, z) => (farm ? Math.hypot(x - farm.x, z - farm.z) : 9);

  // ---------- Terrain -------------------------------------------------------------
  const undul = 0.008 + rand() * 0.018;
  const heightFn = (x, z) => (fbm(noise, x * 1.2 + 2, z * 1.2, 3) * 0.5 + 0.5) * undul * edgeFalloff(x, z, radius);
  const dirt = new THREE.Color('#6d5536');
  const yard = new THREE.Color('#6a6a3a');
  const edge = new THREE.Color('#5d6a2e');
  const parcelColors = parcels.map((p) => new THREE.Color(p.ground));
  const c = new THREE.Color();
  const colorFn = (x, z) => {
    c.copy(parcelColors[parcelId(x, z)]).multiplyScalar(0.9 + noise(x * 10, z * 10) * 0.15);
    c.lerp(dirt, 1 - smoothstep(0.012, 0.03, trackDist(x, z)));
    if (farm) c.lerp(yard, 1 - smoothstep(farm.r * 0.75, farm.r, farmDist(x, z)));
    c.lerp(edge, smoothstep(0.93, 1.0, hexNorm(x, z, radius)) * 0.7);
    return [c.r, c.g, c.b];
  };
  const terrainGeo = createHexTerrainGeometry({ radius, rings: 30, heightFn, colorFn });
  disposables.push(terrainGeo);
  const terrain = new THREE.Mesh(terrainGeo, m.ground);
  terrain.receiveShadow = true;
  group.add(terrain);
  group.add(createTileBody({ radius, strata: { top: '#5d6a2e' } }));

  const scatter = createScatter(rand, heightFn);
  const add = scatter.add;

  // ---------- Farm buildings -----------------------------------------------------
  if (farm) {
    const face = Math.atan2(-farm.x, -farm.z);
    const barn = new THREE.Mesh(hutGeometry(1 + Math.floor(rand() * 9)), m.solid);
    const bx = farm.x + Math.sin(face + 1.2) * 0.04, bz = farm.z + Math.cos(face + 1.2) * 0.04;
    barn.position.set(bx, heightFn(bx, bz) - 0.003, bz);
    barn.rotation.y = face + (rand() - 0.5) * 0.5;
    barn.scale.set(0.15, 0.15, 0.17);
    barn.castShadow = barn.receiveShadow = true;
    group.add(barn);
    const nSilo = 1; // one granary per farmstead
    for (let i = 0; i < nSilo; i++) {
      const sa = face - 1.4 - i * 0.55;
      const sx = farm.x + Math.sin(sa) * 0.095, sz = farm.z + Math.cos(sa) * 0.095;
      add(`silo${i}`, siloGeometry(1 + ((seed + i) % 6)), m.solid, null, sx, sz, 0.12 + rand() * 0.03, { tilt: 0, yOffset: -0.02 });
    }
  }

  // ---------- Crops -----------------------------------------------------------------
  const wheat = [
    wheatClumpGeometry(1),
    wheatClumpGeometry(2, { stem: ['#7b7a3a', '#cdb460'], ear: ['#d8c06a', '#efe0a0'] }),
    wheatClumpGeometry(3, { stem: ['#4c6a28', '#7f9a40'], ear: ['#8aa448', '#b8c46a'] }),
  ];
  const stubble = grassTuftGeometry(21, { blades: 6, base: '#8a7440', tip: '#d2b874' });
  const tint = new THREE.Color();
  const rowSpacing = 0.024, step = 0.013;
  for (let pi = 0; pi < nParcels; pi++) {
    const P = parcels[pi];
    const ca = Math.cos(P.rowAng), sa = Math.sin(P.rowAng);
    for (let u = -radius; u <= radius; u += rowSpacing) {        // across rows
      for (let v = -radius; v <= radius; v += step) {            // along a row
        const jitter = (rand() - 0.5) * 0.006;
        const x = u * ca - v * sa + jitter, z = u * sa + v * ca + (rand() - 0.5) * 0.006;
        if (parcelId(x, z) !== pi) continue;
        if (hexNorm(x, z, radius) > 0.975) continue;
        const td = trackDist(x, z);
        if (td < 0.03 || farmDist(x, z) < farm?.r) continue;
        if (P.geo < 0) {
          if (rand() < 0.55) add('stubble', stubble, m.grass, null, x, z, 0.006 + rand() * 0.003, { tilt: 0.2, castShadow: false, sx: 2, sz: 2, yOffset: 0 });
          continue;
        }
        const lodge = noise(x * 6 + 50, z * 6) > 0.55 ? 0.6 : 1; // flattened patches
        const h = (0.022 + rand() * 0.006) * lodge * (td < 0.05 ? 0.85 : 1);
        tint.setRGB(P.tint[0], P.tint[1], P.tint[2]).multiplyScalar(0.88 + rand() * 0.22 + noise(x * 3, z * 3) * 0.1);
        add(`wheat${P.geo}`, wheat[P.geo], m.wheat, null, x, z, h, {
          tilt: 0.15, castShadow: false, color: tint.clone(), yOffset: -0.02, sx: 1.4, sz: 1.4,
        });
      }
    }
    // harvested parcels: round bales
    if (P.geo < 0) {
      for (let i = 0, tries = 0; i < 6 && tries < 60; tries++) {
        const x = (rand() * 2 - 1) * radius * 0.8, z = (rand() * 2 - 1) * radius * 0.8;
        if (parcelId(x, z) !== pi || hexNorm(x, z, radius) > 0.85 || trackDist(x, z) < 0.05 || farmDist(x, z) < 0.25) continue;
        add('bale', roundBaleGeometry(), m.solid, null, x, z, 0.013, { tilt: 0, yOffset: -0.1 });
        i++;
      }
    }
  }

  // ---------- Margins: poppies & cornflowers along tracks -----------------------
  const poppy = new THREE.Color(0.95, 0.15, 0.1), cornflower = new THREE.Color(0.3, 0.45, 1.0);
  for (let i = 0; i < 260; i++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    const td = trackDist(x, z);
    if (hexNorm(x, z, radius) > 0.95 || td < 0.022 || td > 0.06 || farmDist(x, z) < farm?.r) continue;
    add('flower', flowerGeometry(), m.flower, null, x, z, 0.016 + rand() * 0.006, { tilt: 0.3, castShadow: false, color: rand() < 0.7 ? poppy : cornflower });
  }

  // ---------- Hedgerow trees along a track end ------------------------------------
  if (rand() < 0.5) {
    const t = tracks[0];
    for (let i = 0; i < 3; i++) {
      const along = (rand() - 0.5) * 1.4;
      const x = t.n.x * (t.off + 0.05) - t.n.z * along, z = t.n.z * (t.off + 0.05) + t.n.x * along;
      if (hexNorm(x, z, radius) > 0.85 || farmDist(x, z) < 0.25 || Math.hypot(x, z) < 0.25) continue;
      add(`tree${i}`, deciduousGeometry(1 + i), m.tree, m.treeDepth, x, z, (0.22 + rand() * 0.08) * 0.65, { color: new THREE.Color().setScalar(0.9 + rand() * 0.2) });
      add(`bush${i}`, bushGeometry(i + 6), m.bush, m.bushDepth, x + 0.03, z + 0.02, 0.025, { tilt: 0.2, sx: 1.5, sz: 1.5 });
    }
  }

  buildInstanced(scatter.buckets, group);

  return {
    group,
    type: 'field',
    update() {},
    dispose() { disposables.forEach((g) => g.dispose()); },
  };
}
