// Mini map (lower right): a round overview of the world that turns with the
// camera (forward = up). Explored tiles in their colours, fog in white,
// settlements & ships as player-coloured marks, the tornado, and the area the
// camera sees. Click / drag on it to move the view there.

import * as THREE from 'three';
import { axialToWorld } from '../board/layout.js';
import { PLAYERS } from '../pieces/pieces.js';
import { TILE_THICKNESS } from '../tiles/hexGeometry.js';

const COLORS = {
  forest: '#2f6a32', pasture: '#94c45a', field: '#e3c65e', hills: '#c0703f', mountains: '#8f939b', water: '#2f78a3',
};
const FOG = '#fbfaf7';

export class Minimap {
  constructor(engine, { onPan }) {
    this.engine = engine;
    this.onPan = onPan;
    this.el = document.getElementById('minimap');
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_THICKNESS);
    this._t = 0;
    const pan = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const p = this.toWorld((e.clientX - r.left) / r.width * this.size, (e.clientY - r.top) / r.height * this.size);
      if (p) this.onPan(p.x, p.z);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.canvas.setPointerCapture(e.pointerId);
      this._drag = true; pan(e);
    });
    this.canvas.addEventListener('pointermove', (e) => { if (this._drag) pan(e); });
    const up = () => { this._drag = false; };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  show(v) { this.el.hidden = !v; }

  /** Redraw at most ~6× per second. */
  update(dt, game, cells, radius) {
    if (this.el.hidden || !game) return;
    if ((this._t -= dt) > 0) return;
    this._t = 0.16;
    this.draw(game, cells, radius);
  }

  _frame(radius) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = this.canvas.clientWidth || 180;
    const px = Math.round(css * dpr);
    if (this.canvas.width !== px) { this.canvas.width = this.canvas.height = px; }
    this.size = css;
    this.dpr = dpr;
    const ext = (radius + 0.9) * 1.62; // world half-extent shown (the map hexagon just fits the circle)
    this.scale = (css / 2) / ext;
    this.az = this.engine.rig.azimuth;
  }

  // world (x,z) <-> minimap (u,v) in CSS px; the camera's forward direction points up
  toMap(x, z) {
    const c = Math.cos(this.az), s = Math.sin(this.az);
    return [this.size / 2 + (x * c - z * s) * this.scale, this.size / 2 + (x * s + z * c) * this.scale];
  }
  toWorld(u, v) {
    if (!this.scale) return null;
    const a = (u - this.size / 2) / this.scale, b = (v - this.size / 2) / this.scale;
    const c = Math.cos(this.az), s = Math.sin(this.az);
    return { x: a * c + b * s, z: -a * s + b * c };
  }

  draw(game, cells, radius) {
    this._frame(radius);
    const g = this.ctx, S = this.size;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#8c7a66'; g.fillRect(0, 0, S, S); // the table
    // tiles
    const hex = (x, z, r) => {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 180) * (30 + 60 * k);
        const [u, v] = this.toMap(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (k) g.lineTo(u, v); else g.moveTo(u, v);
      }
      g.closePath();
    };
    cells.forEach((c, ci) => {
      const { x, z } = axialToWorld(c.q, c.r);
      hex(x, z, 1.02);
      const seen = game.revealed.has(ci);
      g.fillStyle = seen ? COLORS[c.type] ?? '#888' : FOG;
      g.fill();
      if (!seen) { g.strokeStyle = 'rgba(120,110,100,0.25)'; g.lineWidth = 0.6; g.stroke(); }
      else if (c.type !== 'water') { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.6; g.stroke(); }
    });
    // roads
    g.lineCap = 'round';
    for (const [ei, pid] of game.roads) {
      const e = game.graph.edges[ei], a = game.graph.vertices[e.a], b = game.graph.vertices[e.b];
      const [u1, v1] = this.toMap(a.x, a.z), [u2, v2] = this.toMap(b.x, b.z);
      g.strokeStyle = PLAYERS[pid].color; g.lineWidth = Math.max(1.5, this.scale * 0.14);
      g.beginPath(); g.moveTo(u1, v1); g.lineTo(u2, v2); g.stroke();
    }
    // settlements
    for (const [vi, s] of game.settlements) {
      const v = game.graph.vertices[vi];
      const [u, w] = this.toMap(v.x, v.z);
      const r = Math.max(2.5, this.scale * (s.kind === 'city' ? 0.32 : 0.24));
      g.fillStyle = PLAYERS[s.player].color; g.strokeStyle = '#fff'; g.lineWidth = 1.2;
      g.beginPath();
      if (s.kind === 'city') g.rect(u - r, w - r, r * 2, r * 2); else g.arc(u, w, r, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    // ships
    for (const s of game.ships.values()) {
      const c = cells[s.ci], p = axialToWorld(c.q, c.r);
      const [u, w] = this.toMap(p.x, p.z);
      const r = Math.max(3, this.scale * 0.35);
      g.fillStyle = PLAYERS[s.player].color; g.strokeStyle = '#2b2622'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(u, w - r); g.lineTo(u + r * 0.8, w + r * 0.6); g.lineTo(u - r * 0.8, w + r * 0.6); g.closePath(); g.fill(); g.stroke();
    }
    // tornados (only where explored)
    for (const t of game.tornados ?? []) {
      if (!game.revealed.has(t.ci)) continue;
      const c = cells[t.ci], p = axialToWorld(c.q, c.r);
      const [u, w] = this.toMap(p.x, p.z);
      const r = Math.max(4, this.scale * 0.6);
      g.strokeStyle = '#3c4048'; g.lineWidth = 1.6;
      g.beginPath();
      for (let k = 0; k < 3; k++) g.ellipse(u, w - r * 0.5 + k * r * 0.45, r * (1 - k * 0.3), r * 0.25, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // camera footprint: where the screen corners hit the board
    const cam = this.engine.camera, hit = new THREE.Vector3(), pts = [];
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
      if (this.ray.ray.intersectPlane(this.plane, hit)) pts.push(this.toMap(hit.x, hit.z));
      else { // looking above the horizon: take a far point along the ray direction
        const d = this.ray.ray.direction; const o = this.ray.ray.origin;
        pts.push(this.toMap(o.x + d.x * 60, o.z + d.z * 60));
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.strokeStyle = '#fff'; g.lineWidth = 1.6;
    g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v))); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // rim + "forward" notch
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
  }
}
