// 3D ships of the game state: one cog per ship, coloured sail, sailing
// smoothly between sea hexes (turning to face where they go). A ship at one of
// its owner's harbours moors close to that corner.

import * as THREE from 'three';
import { createShip } from '../pieces/ship.js';
import { PLAYERS } from '../pieces/pieces.js';
import { axialToWorld } from '../board/layout.js';
import { WATER_LEVEL } from '../tiles/water.js';

const SHIP_LENGTH = 0.34;
const SAIL_TIME = 1.4; // seconds per hex

export class ShipsView {
  constructor(parent) {
    this.parent = parent;
    this.views = new Map(); // id -> { obj, x, z, heading, anim }
    this.selected = null;
    this.dying = [];     // ships burning & sinking after a robbery
    this.wake = new Wake(parent); // foam trail behind sailing ships
    this.doomed = new Set(); // gone from the game state, but still to be animated going down
    this.targets = [];   // ships that may be robbed right now (pulsing red rings)
    this.targetRings = [];
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.25, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 9;
  }

  /** Where a ship rests in its hex: near an own harbour corner, spread out if several share it. */
  restPos(game, ship) {
    const c = game.cells[ship.ci];
    const w = axialToWorld(c.q, c.r);
    let x = w.x, z = w.z;
    const harbour = [...game.settlements].find(([vi, s]) => s.player === ship.player && game.graph.vertices[vi].cells.includes(ship.ci));
    if (harbour) { const v = game.graph.vertices[harbour[0]]; x += (v.x - x) * 0.5; z += (v.z - z) * 0.5; }
    const mates = [...game.ships.values()].filter((s) => s.ci === ship.ci);
    if (mates.length > 1) {
      const k = mates.indexOf(ship), a = (k / mates.length) * Math.PI * 2 + 0.6;
      x += Math.cos(a) * 0.22; z += Math.sin(a) * 0.22;
    }
    return { x, z };
  }

  /** Create / move / remove views so they match game.ships. */
  sync(game, { instant = false } = {}) {
    if (!this.ring.parent) this.parent.add(this.ring);
    for (const [id, v] of this.views) {
      if (game?.ships.has(id) || this.doomed.has(id)) continue; // doomed ships play their sinking first
      this.parent.remove(v.obj);
      this.views.delete(id);
    }
    if (!game) return;
    for (const ship of game.ships.values()) {
      const to = this.restPos(game, ship);
      let v = this.views.get(ship.id);
      if (!v) {
        const obj = createShip(PLAYERS[ship.player].color, { length: SHIP_LENGTH, seed: ship.id * 13 + 1 });
        obj.position.set(to.x, WATER_LEVEL + 0.004, to.z);
        v = { obj, heading: Math.random() * Math.PI * 2, anim: null, ci: ship.ci };
        obj.rotation.y = v.heading;
        obj.scale.setScalar(0.001);
        v.grow = 0;
        this.parent.add(obj);
        this.views.set(ship.id, v);
        continue;
      }
      const from = { x: v.obj.position.x, z: v.obj.position.z };
      if (Math.hypot(to.x - from.x, to.z - from.z) < 1e-3) continue;
      if (instant) { v.obj.position.x = to.x; v.obj.position.z = to.z; continue; }
      const sailing = v.ci !== ship.ci;
      v.ci = ship.ci;
      v.anim = { t: 0, from, to, dur: sailing ? SAIL_TIME : 0.6, h0: v.obj.rotation.y, h1: sailing ? headingTo(from, to) : v.obj.rotation.y };
    }
  }

  select(id) { this.selected = id; }

  /** Pulsing red rings under ships that can be robbed. */
  setTargets(ids) {
    this.targets = ids;
    while (this.targetRings.length < ids.length) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#e0402a', transparent: true, opacity: 0.9, depthWrite: false }));
      r.renderOrder = 9;
      this.targetRings.push(r);
    }
    this.targetRings.forEach((r, i) => { r.visible = i < ids.length; if (!r.parent) this.parent.add(r); });
  }

  /** Set ship `id` ablaze, then let it sink; it no longer follows the game state. */
  /** Keep ship `id` on screen although the game removed it (it will sink shortly). */
  doom(id) { this.doomed.add(id); }

  /** Sail ship `id` into `cell` (the tornado), then let it be whirled down. */
  moveThenSink(id, cell) {
    const v = this.views.get(id);
    if (!v) return;
    this.doomed.add(id);
    const to = axialToWorld(cell.q, cell.r), from = { x: v.obj.position.x, z: v.obj.position.z };
    v.anim = { t: 0, from, to, dur: SAIL_TIME, h0: v.obj.rotation.y, h1: headingTo(from, to) };
    v.sinkAfter = true;
  }

  burn(id, { fire = true } = {}) {
    const v = this.views.get(id);
    this.doomed.delete(id);
    if (!v) return;
    this.views.delete(id);
    v.obj.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.userData.base = o.material.color?.clone(); } });
    const flames = new THREE.Group();
    const tex = flameTexture();
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 3 ? '#ff9a3a' : '#ffd36a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.userData = { x: (Math.random() - 0.5) * 0.28, z: (Math.random() - 0.5) * 0.1, ph: Math.random() * 6, s: 0.13 + Math.random() * 0.12, smoke: false };
      flames.add(sp);
    }
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#2e2926', transparent: true, opacity: 0.5, depthWrite: false }));
      sp.userData = { x: (Math.random() - 0.5) * 0.18, z: (Math.random() - 0.5) * 0.08, ph: Math.random(), s: 0.18, smoke: true };
      flames.add(sp);
    }
    flames.visible = fire;
    this.parent.add(flames);
    this.dying.push({ v, flames, fire, t: 0, x: v.obj.position.x, z: v.obj.position.z, y0: v.obj.position.y });
  }

  update(t, dt) {
    this.wake.update(dt);
    for (const [id, v] of this.views) {
      // foam wake while the ship is under way
      const px = v.obj.position.x, pz = v.obj.position.z;
      if (v.last && dt > 0) {
        const speed = Math.hypot(px - v.last.x, pz - v.last.z) / dt;
        if (speed > 0.08) { v.wakeT = (v.wakeT ?? 0) - dt; if (v.wakeT <= 0) { v.wakeT = 0.035 + Math.random() * 0.02; this.wake.spawn(v.obj, Math.min(1, speed / 0.6)); } }
      }
      v.last = { x: px, z: pz };
      if (v.grow != null) { // launch: pop up from the water
        v.grow = Math.min(1, v.grow + dt / 0.8);
        const e = 1 - Math.pow(1 - v.grow, 3);
        v.obj.scale.setScalar(SHIP_LENGTH * Math.max(0.001, e));
        if (v.grow >= 1) v.grow = null;
      }
      if (v.anim) {
        const a = v.anim;
        a.t += dt;
        const k = Math.min(1, a.t / a.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        v.obj.position.x = a.from.x + (a.to.x - a.from.x) * e;
        v.obj.position.z = a.from.z + (a.to.z - a.from.z) * e;
        const turn = Math.min(1, k * 3);
        const dh = Math.atan2(Math.sin(a.h1 - a.h0), Math.cos(a.h1 - a.h0));
        v.obj.rotation.y = a.h0 + dh * turn;
        if (k >= 1) { v.anim = null; if (v.sinkAfter) { this.burn(id, { fire: false }); continue; } }
      }
      if (id === this.selected) {
        this.ring.visible = true;
        this.ring.position.set(v.obj.position.x, WATER_LEVEL + 0.02, v.obj.position.z);
        this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      }
    }
    if (!this.views.has(this.selected)) this.ring.visible = false;
    this.targets.forEach((id, i) => {
      const v = this.views.get(id), r = this.targetRings[i];
      if (!v || !r) { if (r) r.visible = false; return; }
      r.visible = true;
      r.position.set(v.obj.position.x, WATER_LEVEL + 0.02, v.obj.position.z);
      r.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
    });
    // burning ships: 2.2 s of fire, then they list and sink
    for (const d of this.dying) {
      d.t += dt;
      const burn = Math.min(1, d.t / 2.2), sink = Math.max(0, (d.t - 2.0) / 2.4);
      if (d.fire) d.v.obj.traverse((o) => { if (o.userData.base) o.material.color.copy(o.userData.base).multiplyScalar(1 - burn * 0.82); });
      else { d.v.obj.rotation.y += dt * 6 * Math.min(1, d.t); } // whirled round by the tornado
      d.v.obj.position.y = d.y0 - sink * sink * 0.35;
      d.v.obj.rotation.x = sink * 0.6; d.v.obj.rotation.z = -sink * 0.35;
      const fire = sink < 0.4 ? Math.min(1, d.t * 3) : Math.max(0, 1 - (sink - 0.4) * 3);
      const h = d.v.obj.rotation.y, c = Math.cos(h), sn = Math.sin(h);
      for (const sp of d.flames.children) {
        const u = sp.userData;
        const lx = u.x * c + u.z * sn, lz = -u.x * sn + u.z * c;
        if (u.smoke) {
          const k = (d.t * 0.5 + u.ph) % 1;
          sp.position.set(d.x + lx, d.v.obj.position.y + 0.1 + k * 0.7, d.z + lz);
          sp.scale.setScalar(u.s * (1 + k * 2.5));
          sp.material.opacity = 0.6 * (1 - k) * Math.min(1, fire * 1.5 + (sink > 0 ? 0.3 : 0));
        } else {
          const fl = 0.75 + Math.sin(t * 17 + u.ph * 5) * 0.25;
          sp.position.set(d.x + lx, d.v.obj.position.y + 0.04 + Math.abs(Math.sin(t * 6 + u.ph)) * 0.05, d.z + lz);
          sp.scale.set(u.s * fl, u.s * 1.6 * fl, 1).multiplyScalar(fire);
        }
      }
      if (d.t > 4.6) { this.parent.remove(d.v.obj); this.parent.remove(d.flames); d.flames.children.forEach((sp) => sp.material.dispose()); d.done = true; }
    }
    this.dying = this.dying.filter((d) => !d.done);
  }

  /** Screen position (px) above ship `id`, or null. */
  screenPos(id, camera, lift = 0.32) {
    const v = this.views.get(id);
    if (!v) return null;
    const p = new THREE.Vector3(v.obj.position.x, v.obj.position.y + lift, v.obj.position.z);
    this.parent.localToWorld(p);
    p.project(camera);
    if (p.z > 1) return null;
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  }

  /** Ship whose model is nearest to board point pt (within r). */
  pick(pt, r = 0.35) {
    let best = null, bd = r;
    for (const [id, v] of this.views) {
      const d = Math.hypot(v.obj.position.x - pt.x, v.obj.position.z - pt.z);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  clear() {
    for (const v of this.views.values()) this.parent.remove(v.obj);
    for (const d of this.dying) { this.parent.remove(d.v.obj); this.parent.remove(d.flames); }
    this.wake.clear();
    this.views.clear(); this.dying = []; this.doomed.clear(); this.selected = null; this.ring.visible = false; this.setTargets([]);
  }
}

let _flameTex = null;
function flameTexture() {
  if (_flameTex) return _flameTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 36, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,220,150,0.8)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _flameTex = new THREE.CanvasTexture(c);
  return _flameTex;
}

// ship model's bow points along local +X; rotation.y = -angle of travel
const headingTo = (a, b) => -Math.atan2(b.z - a.z, b.x - a.x);

// ---------------------------------------------------------------------------
// Wake: soft foam blobs left at the stern; they drift apart in a V, grow and
// fade, plus a little spray at the bow.
// ---------------------------------------------------------------------------
let _foamTex = null;
function foamTexture() {
  if (_foamTex) return _foamTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.55, 'rgba(240,250,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _foamTex = new THREE.CanvasTexture(c);
  return _foamTex;
}
const foamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
foamGeo.userData.shared = true;

class Wake {
  constructor(parent) { this.parent = parent; this.parts = []; this.pool = []; }

  _mesh() {
    const m = this.pool.pop() ?? new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    m.renderOrder = 3;
    if (!m.parent) this.parent.add(m);
    m.visible = true;
    return m;
  }

  /** Drop foam at the stern (two, drifting out to both sides) and a puff at the bow. */
  spawn(ship, strength = 1) {
    const h = ship.rotation.y, fx = Math.cos(h), fz = -Math.sin(h); // bow direction (ship +X)
    const lx = -fz, lz = fx;                                         // to one side
    const half = ship.scale.x * 0.5;
    const sx = ship.position.x - fx * half * 0.9, sz = ship.position.z - fz * half * 0.9;
    for (const side of [-1, 1]) {
      const m = this._mesh();
      const j = (Math.random() - 0.5) * 0.02;
      m.position.set(sx + lx * (side * 0.03 + j), WATER_LEVEL + 0.012, sz + lz * (side * 0.03 + j));
      m.rotation.y = Math.random() * Math.PI;
      this.parts.push({ m, t: 0, life: 1.5 + Math.random() * 0.4, vx: lx * side * 0.07 - fx * 0.02, vz: lz * side * 0.07 - fz * 0.02, s0: 0.1, s1: 0.2, a: 0.75 * strength });
    }
    // churned water straight behind the stern
    const c = this._mesh();
    c.position.set(sx - fx * 0.02, WATER_LEVEL + 0.011, sz - fz * 0.02);
    this.parts.push({ m: c, t: 0, life: 1.1, vx: 0, vz: 0, s0: 0.11, s1: 0.16, a: 0.6 * strength });
    // bow spray
    if (Math.random() < 0.5) {
      const b = this._mesh();
      b.position.set(ship.position.x + fx * half * 0.95, WATER_LEVEL + 0.013, ship.position.z + fz * half * 0.95);
      this.parts.push({ m: b, t: 0, life: 0.5, vx: fx * 0.05, vz: fz * 0.05, s0: 0.04, s1: 0.09, a: 0.7 * strength });
    }
  }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt;
      p.vx *= 1 - dt * 0.8; p.vz *= 1 - dt * 0.8;
      const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
      p.m.scale.set(s, 1, s * 0.75);
      p.m.material.opacity = p.a * (1 - k) * Math.min(1, p.t * 20);
    }
    for (const p of this.parts.filter((x) => x.t >= x.life)) { p.m.visible = false; this.pool.push(p.m); }
    this.parts = this.parts.filter((x) => x.t < x.life);
  }

  clear() { for (const p of this.parts) { p.m.visible = false; this.pool.push(p.m); } this.parts = []; }
}
