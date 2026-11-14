// Fog of war: soft cotton-wool clouds over every unexplored hex. Hidden cells
// keep their tiles & tokens invisible; a white "cloud floor" hex plus a few
// puffy balls cover each one. Cells beyond the map edge are fogged forever so
// the world fades into a sea of clouds. Revealing a cell lets its clouds swell,
// lift and dissolve.
//
//   const fog = createFog(board, cells, revealed, { extra: 2 })
//   fog.reveal([cellIndex…])   fog.update(t, dt)   fog.dispose()

import * as THREE from 'three';
import { axialToWorld, hexagonalBoard } from '../board/layout.js';
import { mulberry32 } from '../core/noise.js';

const PUFFS = 6;
const FADE = 1.6; // seconds

export function createFog(parent, cells, revealed, { extra = 2, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'fog';
  const ring = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  const radius = Math.max(...cells.map((c) => ring(c.q, c.r)));
  const known = new Set(cells.map((c) => `${c.q},${c.r}`));
  // fog slots: hidden map cells (can lift) + decorative cells around the map (never lift)
  const slots = [];
  cells.forEach((c, ci) => { if (!revealed.has(ci)) slots.push({ q: c.q, r: c.r, ci }); });
  for (const h of hexagonalBoard(radius + extra)) if (!known.has(`${h.q},${h.r}`)) slots.push({ q: h.q, r: h.r, ci: -1 });

  const mat = new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 1, metalness: 0, flatShading: false });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#e9e6e1', roughness: 1 });
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const floorGeo = new THREE.CylinderGeometry(1.02, 1.02, 0.12, 6);
  const puffs = new THREE.InstancedMesh(puffGeo, mat, slots.length * PUFFS);
  const floor = new THREE.InstancedMesh(floorGeo, floorMat, slots.length);
  puffs.castShadow = floor.castShadow = false;
  puffs.receiveShadow = floor.receiveShadow = true;
  const col = new THREE.Color();
  const data = []; // per puff: { slot, x, y, z, s, ph }
  slots.forEach((sl, k) => {
    const { x, z } = axialToWorld(sl.q, sl.r);
    sl.x = x; sl.z = z; sl.fade = -1;
    for (let i = 0; i < PUFFS; i++) {
      const a = (i / PUFFS) * Math.PI * 2 + rand() * 0.8;
      const d = i === 0 ? 0 : 0.42 + rand() * 0.12;
      const s = (i === 0 ? 0.58 : 0.36 + rand() * 0.1); // stays (mostly) inside its own hex
      data.push({ slot: k, x: x + Math.cos(a) * d, y: 0.08 + rand() * 0.14, z: z + Math.sin(a) * d, s, ph: rand() * Math.PI * 2 });
      col.setScalar(0.9 + rand() * 0.1);
      puffs.setColorAt(k * PUFFS + i, col);
    }
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const index = new Map(slots.map((s, k) => [s.ci, k]));
  slots.forEach((sl, k) => { floor.setMatrixAt(k, m.makeTranslation(sl.x, -0.035, sl.z)); }); // floor top just above the sea
  group.add(floor, puffs);
  parent.add(group);

  let time = 0;
  let dirty = false;
  const write = (t) => {
    for (let i = 0; i < data.length; i++) {
      const d = data[i], sl = slots[d.slot];
      let k = 1, lift = 0;
      if (sl.gone) k = 0;
      else if (sl.fade >= 0) {
        const f = Math.min(1, Math.max(0, (t - sl.fade) / FADE));
        k = f < 0.25 ? 1 + f * 0.6 : Math.max(0, 1.15 * (1 - (f - 0.25) / 0.75)); // swell, then dissolve
        lift = f * 0.6;
      }
      const bob = Math.sin(t * 0.5 + d.ph) * 0.02;
      const s = d.s * k * (1 + Math.sin(t * 0.7 + d.ph * 2) * 0.03);
      p.set(d.x + Math.sin(t * 0.2 + d.ph) * 0.03, d.y + bob + lift, d.z);
      sc.set(s, s * 0.62, s);
      puffs.setMatrixAt(i, m.compose(p, q, sc));
    }
    puffs.instanceMatrix.needsUpdate = true;
  };
  write(0);

  return {
    group,
    /** Lift the fog from map cells (they must be shown by the caller). */
    /** instant: no animation (loading a saved game / debug start). */
    reveal(cis, { instant = false } = {}) {
      for (const ci of cis) {
        const k = index.get(ci);
        if (k === undefined || slots[k].fade >= 0) continue;
        slots[k].fade = instant ? Math.max(0, time - FADE - 1) : time;
        if (instant) slots[k].gone = true;
        dirty = true;
        floor.setMatrixAt(k, m.makeScale(0, 0, 0));
      }
      floor.instanceMatrix.needsUpdate = true;
    },
    isHidden(ci) { const k = index.get(ci); return k !== undefined && slots[k].fade < 0; },
    /** still = no idle drift (Fast mode): matrices are only rewritten while a reveal animates. */
    update(t, { still = false } = {}) {
      time = t;
      // (dirty: something was revealed since the last write — e.g. while the game was paused —
      //  so the matrices must be rewritten at least once even in Fast mode)
      if (!still || dirty || slots.some((sl) => sl.fade >= 0 && t - sl.fade < FADE + 0.1)) { write(t); dirty = false; }
    },
    dispose() {
      parent.remove(group);
      puffGeo.dispose(); floorGeo.dispose(); mat.dispose(); floorMat.dispose();
      puffs.dispose(); floor.dispose();
    },
  };
}
