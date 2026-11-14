// Dolphins: every now and then a small pod leaps through the open sea —
// a few arcing jumps with splashes, then they are gone again. Purely decorative.
//
//   const dolphins = new Dolphins(board, { pickCell })   pickCell() -> {x, z} | null
//   dolphins.update(t, dt)   dolphins.spawn()   dolphins.clear()

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_LEVEL } from '../tiles/water.js';

const LENGTH = 0.27;           // dolphin length (board units; a ship is 0.34)
const JUMP_LEN = 0.5, JUMP_H = 0.2, JUMP_T = 0.9, DIVE_T = 0.7;
const GAP = [7, 18];           // seconds between pods

let sharedGeo = null;
function dolphinGeometry() {
  if (sharedGeo) return sharedGeo;
  // body: lathe profile along Y (tail at -0.5, nose at +0.5), then turned so the nose points +X
  const prof = [[0, -0.5], [0.035, -0.44], [0.06, -0.3], [0.1, -0.1], [0.12, 0.08], [0.115, 0.22], [0.09, 0.33], [0.05, 0.4], [0.03, 0.47], [0.012, 0.52], [0, 0.53]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 14);
  body.scale(1, 1, 0.85);
  body.rotateZ(-Math.PI / 2); // +Y -> +X
  // dorsal fin
  const fin = new THREE.Shape();
  fin.moveTo(-0.12, 0); fin.quadraticCurveTo(-0.02, 0.06, -0.08, 0.16); fin.quadraticCurveTo(0.02, 0.06, 0.08, 0);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.016, bevelEnabled: false });
  finGeo.translate(0, 0.1, -0.008);
  // tail flukes (horizontal)
  const fl = new THREE.Shape();
  fl.moveTo(0, 0); fl.quadraticCurveTo(-0.05, 0.08, -0.12, 0.13); fl.quadraticCurveTo(-0.08, 0.04, -0.1, 0);
  fl.quadraticCurveTo(-0.08, -0.04, -0.12, -0.13); fl.quadraticCurveTo(-0.05, -0.08, 0, 0);
  const flGeo = new THREE.ExtrudeGeometry(fl, { depth: 0.012, bevelEnabled: false });
  flGeo.rotateX(Math.PI / 2); flGeo.translate(-0.46, 0.006, 0);
  // pectoral flippers
  const fp = new THREE.Shape();
  fp.moveTo(0, 0); fp.quadraticCurveTo(-0.03, 0.02, -0.09, 0.07); fp.quadraticCurveTo(-0.02, 0.0, 0.03, 0);
  const flips = [1, -1].map((s) => {
    const g = new THREE.ExtrudeGeometry(fp, { depth: 0.01, bevelEnabled: false });
    g.rotateX(Math.PI / 2 * s); g.rotateZ(-0.3); g.translate(0.18, -0.06, 0.08 * s);
    return g;
  });
  const parts = [body, finGeo, flGeo, ...flips].map((g) => g.toNonIndexed());
  parts.forEach((g) => { g.deleteAttribute('uv'); });
  const geo = mergeGeometries(parts);
  // counter-shading: blue-grey back, pale belly
  const pos = geo.attributes.position, col = [];
  const back = new THREE.Color('#3b5060'), belly = new THREE.Color('#c9d4da'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.smoothstep(pos.getY(i), -0.06, 0.04);
    c.copy(belly).lerp(back, k);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.scale(LENGTH, LENGTH, LENGTH);
  geo.userData.shared = true;
  sharedGeo = geo;
  return geo;
}

const dolphinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
const splashGeo = new THREE.RingGeometry(0.02, 0.035, 20).rotateX(-Math.PI / 2);
splashGeo.userData.shared = true;

export class Dolphins {
  constructor(parent, { pickCell }) {
    this.parent = parent;
    this.pickCell = pickCell;
    this.group = new THREE.Group();
    this.group.name = 'dolphins';
    this.pods = [];
    this.splashes = [];
    this.next = 4 + Math.random() * 6;
  }

  /** Start a pod of 1–3 dolphins in a random sea hex. */
  spawn() {
    const at = this.pickCell();
    if (!at) return;
    const n = 1 + Math.floor(Math.random() * 3);
    const dir = Math.random() * Math.PI * 2;
    const dx = Math.cos(dir), dz = Math.sin(dir);
    const jumps = 2 + Math.floor(Math.random() * 2); // ≤ 2.7 long: stays inside the open-sea hex & its sea neighbours
    const span = jumps * JUMP_LEN * (1 + DIVE_T / JUMP_T);
    const start = { x: at.x - dx * span / 2, z: at.z - dz * span / 2 }; // the pod's path crosses the hex centre
    const members = [];
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(dolphinGeometry(), dolphinMat);
      mesh.castShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      const side = (i - (n - 1) / 2) * 0.09;
      members.push({ mesh, ox: -dz * side - dx * i * 0.05, oz: dx * side - dz * i * 0.05, delay: i * 0.22 + Math.random() * 0.1, splashed: -1 });
    }
    this.pods.push({ t: 0, start, dx, dz, dir, jumps, members });
  }

  _splash(x, z, big = 1) {
    const m = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, WATER_LEVEL + 0.006, z);
    m.userData.big = big;
    this.group.add(m);
    this.splashes.push({ m, t: 0 });
  }

  update(t, dt) {
    if (!this.group.parent) this.parent.add(this.group); // the board may have been rebuilt
    if ((this.next -= dt) <= 0) { this.spawn(); this.next = GAP[0] + Math.random() * (GAP[1] - GAP[0]); }
    const cycle = JUMP_T + DIVE_T;
    for (const pod of this.pods) {
      pod.t += dt;
      let alive = false;
      for (const d of pod.members) {
        const lt = pod.t - d.delay;
        const k = Math.floor(lt / cycle);          // which jump
        const ph = lt - k * cycle;                 // time within the jump cycle
        if (lt < 0 || k >= pod.jumps) { d.mesh.visible = false; if (lt < 0) alive = true; continue; }
        alive = true;
        const along = (k + ph / cycle) * JUMP_LEN * (1 + DIVE_T / JUMP_T);
        const x = pod.start.x + pod.dx * along + d.ox, z = pod.start.z + pod.dz * along + d.oz;
        if (ph > JUMP_T) { d.mesh.visible = false; continue; } // swimming under water
        const u = ph / JUMP_T;                      // 0..1 through the leap
        const y = WATER_LEVEL - 0.015 + Math.sin(Math.PI * u) * JUMP_H;
        d.mesh.visible = true;
        d.mesh.position.set(x, y, z);
        // nose follows the arc: pitch from the slope of the jump
        const slope = Math.cos(Math.PI * u) * Math.PI * JUMP_H / (JUMP_LEN);
        d.mesh.rotation.set(0, -pod.dir, Math.atan(slope), 'YXZ');
        if (d.splashed !== k * 2 && u < 0.15) { d.splashed = k * 2; this._splash(x, z, 1); }
        if (d.splashed !== k * 2 + 1 && u > 0.88) { d.splashed = k * 2 + 1; this._splash(x + pod.dx * 0.04, z + pod.dz * 0.04, 1.3); }
      }
      pod.done = !alive;
    }
    for (const pod of this.pods.filter((p) => p.done)) {
      for (const d of pod.members) this.group.remove(d.mesh);
      this.pods.splice(this.pods.indexOf(pod), 1);
    }
    for (const s of this.splashes) {
      s.t += dt;
      const k = s.t / 0.9;
      s.m.scale.setScalar((1 + k * 3) * s.m.userData.big);
      s.m.material.opacity = Math.max(0, 0.9 * (1 - k));
    }
    for (const s of this.splashes.filter((x) => x.t > 0.9)) {
      this.group.remove(s.m); s.m.material.dispose();
      this.splashes.splice(this.splashes.indexOf(s), 1);
    }
  }

  clear() {
    for (const p of this.pods) for (const d of p.members) this.group.remove(d.mesh);
    for (const s of this.splashes) { this.group.remove(s.m); s.m.material.dispose(); }
    this.pods = []; this.splashes = [];
  }
}
