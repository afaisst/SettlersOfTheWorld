// Placing pieces with the mouse: when a build tool is active, every legal spot
// gets a glowing marker (rings on corners, bars on edges). Hovering near one
// shows a translucent preview of the piece; a click (not a drag) places it.

import * as THREE from 'three';
import { TILE_THICKNESS } from '../tiles/hexGeometry.js';
import { createRoad, createTown, createCity, PLAYERS } from '../pieces/pieces.js';
import { PIECE_SCALE } from '../pieces/placement.js';
import { axialToWorld } from '../board/layout.js';

// 'sail' = pick a sea hex for the selected ship (spots are cell indices)
const PICK_RADIUS = { road: 0.32, town: 0.3, city: 0.3, sail: 0.8 };

export class Placer {
  constructor(engine, { onPlace }) {
    this.engine = engine;
    this.onPlace = onPlace;
    this.game = null;
    this.tool = null;
    this.valid = [];
    this.hover = -1;
    this.root = new THREE.Group();
    this.root.name = 'placer';
    engine.board.add(this.root);
    this.markers = new Map(); // id -> mesh
    this.ghost = null;
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_THICKNESS);
    this._down = null;
    this._bind();
    engine.onUpdate((t) => this._animate(t));
  }

  setGame(game) {
    this.game = game;
    this.setTool(null);
    if (!this.root.parent) this.engine.board.add(this.root); // board may have been cleared
  }

  setTool(tool, { spots = null } = {}) {
    this.tool = tool;
    this.spots = spots;
    this.refresh();
  }

  _pos(id) {
    if (this.tool === 'sail') { const c = this.game.cells[id]; const w = axialToWorld(c.q, c.r); return { x: w.x, z: w.z }; }
    const g = this.game.graph;
    return this.tool === 'road' ? g.edges[id] : g.vertices[id];
  }

  /** Recompute legal spots (after any change to the board or the current player). */
  refresh() {
    if (!this.root.parent) this.engine.board.add(this.root);
    this._clearMarkers();
    if (this.hover >= 0) this.onHover?.(this.tool, -1, null);
    this.hover = -1;
    if (!this.game || !this.tool) { this.engine.canvas.style.cursor = this.engine.rig.cursorAt(); return; }
    const p = this.game.player;
    this.valid = this.spots ?? this.game.validSpots(this.tool, p.id);
    const col = new THREE.Color(PLAYERS[p.id].color);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthTest: false });
    const g = this.game.graph;
    for (const id of this.valid) {
      let m;
      if (this.tool === 'sail') {
        const c = this._pos(id);
        m = new THREE.Mesh(markerHex, mat.clone());
        m.position.set(c.x, 0.0, c.z);
      } else if (this.tool === 'road') {
        const e = g.edges[id];
        m = new THREE.Mesh(markerBar, mat.clone());
        m.position.set(e.x, 0.03, e.z);
        m.rotation.y = -e.angle;
      } else {
        const v = g.vertices[id];
        m = new THREE.Mesh(markerRing, mat.clone());
        m.position.set(v.x, 0.03, v.z);
      }
      m.renderOrder = 10;
      m.userData.phase = id * 0.37;
      this.root.add(m);
      this.markers.set(id, m);
    }
    mat.dispose();
    this._buildGhost(p.id);
  }

  _clearMarkers() {
    for (const m of this.markers.values()) { this.root.remove(m); m.material.dispose?.(); }
    this.markers.clear();
    this.valid = [];
    if (this.ghost) {
      this.root.remove(this.ghost);
      this.ghost.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
      this.ghost = null;
    }
  }

  _buildGhost(pid) {
    if (this.tool === 'sail') return;
    let piece;
    if (this.tool === 'road') piece = createRoad(pid, { from: -0.36, to: 0.36 });
    else if (this.tool === 'town') { piece = createTown(pid, { seed: 3 }); piece.scale.setScalar(PIECE_SCALE.town); }
    else { piece = createCity(pid, { seed: 3 }); piece.scale.setScalar(PIECE_SCALE.city); }
    const mat = new THREE.MeshStandardMaterial({ color: PLAYERS[pid].color, transparent: true, opacity: 0.55, depthWrite: false });
    piece.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    piece.visible = false;
    this.ghost = piece;
    this.root.add(piece);
  }

  _animate(t) {
    for (const [id, m] of this.markers) {
      const hovered = id === this.hover;
      const s = this.tool === 'sail' ? (hovered ? 1.08 : 1 + Math.sin(t * 3 + m.userData.phase) * 0.03)
        : hovered ? 1.35 : 1 + Math.sin(t * 3 + m.userData.phase) * 0.08;
      m.scale.setScalar(s);
      m.material.opacity = hovered ? 1 : 0.7;
    }
  }

  // ---------- picking ----------
  _boardPoint(ev) {
    const r = this.engine.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.engine.camera);
    const hit = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(this._plane, hit)) return null;
    return hit; // board has no x/z offset, so world x,z = board x,z
  }

  _nearest(pt) {
    if (!pt || !this.valid.length) return -1;
    let best = -1, bestD = PICK_RADIUS[this.tool];
    for (const id of this.valid) {
      const o = this._pos(id);
      const d = Math.hypot(o.x - pt.x, o.z - pt.z);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  _setHover(id) {
    if (id !== this.hover) this.onHover?.(this.tool, id, id >= 0 ? this._pos(id) : null);
    this.hover = id;
    const c = this.engine.canvas;
    if (!this.ghost) { c.style.cursor = id >= 0 ? 'pointer' : this.engine.rig.cursorAt(); return; }
    if (id < 0) { this.ghost.visible = false; c.style.cursor = this.engine.rig.cursorAt(); return; }
    const g = this.game.graph;
    if (this.tool === 'road') {
      const e = g.edges[id];
      this.ghost.position.set(e.x, 0.002, e.z);
      this.ghost.rotation.y = -e.angle;
    } else {
      const v = g.vertices[id];
      this.ghost.position.set(v.x, 0.002, v.z);
    }
    this.ghost.visible = true;
    c.style.cursor = 'pointer';
  }

  _bind() {
    const c = this.engine.canvas;
    c.addEventListener('pointermove', (ev) => {
      if (!this.tool || !this.game) return;
      if (this._down && Math.hypot(ev.clientX - this._down.x, ev.clientY - this._down.y) > 6) { this._setHover(-1); return; }
      this._setHover(this._nearest(this._boardPoint(ev)));
    });
    c.addEventListener('pointerdown', (ev) => { this._down = { x: ev.clientX, y: ev.clientY }; });
    c.addEventListener('pointerup', (ev) => {
      const d = this._down;
      this._down = null;
      if (!d || !this.game) return;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return; // that was a drag (camera)
      if (!this.tool) { const pt = this._boardPoint(ev); if (pt) this.onBoardClick?.(pt); return; }
      // place what the player sees highlighted (robust even if the camera is still easing)
      const id = this.hover >= 0 ? this.hover : this._nearest(this._boardPoint(ev));
      if (id >= 0) this.onPlace(this.tool, id);
    });
    c.addEventListener('contextmenu', (ev) => { if (this.tool) { ev.preventDefault(); this.onCancel?.(); } });
  }
}

// shared marker shapes
const markerRing = new THREE.TorusGeometry(0.075, 0.014, 8, 28).rotateX(Math.PI / 2);
markerRing.userData.shared = true;
const markerBar = new THREE.BoxGeometry(0.5, 0.012, 0.045);
markerBar.userData.shared = true;
const markerHex = new THREE.TorusGeometry(0.82, 0.03, 4, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6);
markerHex.userData.shared = true;
