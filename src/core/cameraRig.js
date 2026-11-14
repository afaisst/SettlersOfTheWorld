// Orbit camera over the board.
//  - Drag (mouse / one finger) in the middle of the screen: pan — the map
//    follows the pointer in any direction.
//  - SHIFT + drag: rotate around the point the camera looks at (left/right).
//  - Wheel / pinch: zoom. Zooming also changes the viewing angle:
//    close-up = low, cinematic angle; zoomed out = more top-down.

import * as THREE from 'three';

const DEG = Math.PI / 180;
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15a8 8 0 0 1 14-6" stroke="#fff" stroke-width="5"/><path d="M22 13a8 8 0 0 1-14 6" stroke="#fff" stroke-width="5"/><path d="M6 15a8 8 0 0 1 14-6M22 13a8 8 0 0 1-14 6" stroke="#4a3628" stroke-width="2.4"/><path d="M20 4v5h-5M8 24v-5h5" stroke="#4a3628" stroke-width="2.4"/></g></svg>')}") 14 14, ew-resize`;

export class CameraRig {
  constructor(camera, dom, opts = {}) {
    this.camera = camera;
    this.dom = dom;
    this.target = opts.target ?? new THREE.Vector3();
    this.minDist = opts.minDist ?? 4;
    this.maxDist = opts.maxDist ?? 18;
    this.minElev = (opts.minElevDeg ?? 22) * DEG; // when fully zoomed in
    this.maxElev = (opts.maxElevDeg ?? 68) * DEG; // when fully zoomed out
    this.azimuth = this.targetAzimuth = opts.azimuth ?? 0;
    this.zoom = this.targetZoom = opts.zoom ?? 0.5; // 0 = closest, 1 = farthest
    this.rotateSpeed = 0.006;
    this.autoRotate = false;
    this.pan = this.targetPan = 0; // (legacy) view centre offset along the viewing direction
    this.home = this.target.clone();  // where turnTo() re-centres
    this.goal = this.target.clone();  // eased target position
    this.bounds = opts.bounds ?? 6;   // max distance of the target from home
    this.edgeBand = 0.15;
    this.panEnabled = true;
    this.focusShift = opts.focusShift ?? 0.08; // fraction of maxDist the view centre moves toward the viewer at full zoom-in

    this._pointers = new Map();
    this._pinchDist = 0;
    this._bind();
    this.update(1);
  }

  /** Smoothly swing the camera around the table to azimuth `az` (hot-seat turn change). */
  turnTo(az, duration = 1.6, zoom = null, to = this.home) {
    const d = Math.atan2(Math.sin(az - this.targetAzimuth), Math.cos(az - this.targetAzimuth));
    this._tween = {
      t: 0, duration,
      fromAz: this.targetAzimuth, toAz: this.targetAzimuth + d,
      fromZoom: this.targetZoom, toZoom: zoom ?? this.targetZoom,
      fromPan: this.targetPan,
      from: this.goal.clone(), to: to.clone ? to.clone() : new THREE.Vector3(to.x, this.target.y, to.z),
    };
  }

  /** Smoothly slide the view to world point (x, z) keeping angle & zoom. */
  lookAt(x, z) { this.goal.set(x, this.target.y, z); this._clampGoal(); }

  setRange(minDist, maxDist, bounds = this.bounds) {
    this.minDist = minDist;
    this.maxDist = maxDist;
    this.bounds = bounds;
    this.pan = this.targetPan = 0;
    this.goal.copy(this.home); this.target.copy(this.home);
  }

  _clampGoal() {
    const dx = this.goal.x - this.home.x, dz = this.goal.z - this.home.z, d = Math.hypot(dx, dz);
    if (d > this.bounds) { this.goal.x = this.home.x + dx / d * this.bounds; this.goal.z = this.home.z + dz / d * this.bounds; }
  }

  _dist() { return this.minDist * Math.pow(this.maxDist / this.minDist, this.zoom); }
  _shift() { return this.focusShift * this.maxDist * Math.pow(1 - this.zoom, 1.5) + this.pan; }

  /** Which edge band a screen point is in -> rotation mode, or null (pan). */
  _edgeMode(x, y) {
    const r = this.dom.getBoundingClientRect();
    const u = (x - r.left) / r.width, v = (y - r.top) / r.height, b = this.edgeBand;
    const m = { left: u < b, right: u > 1 - b, top: v < b, bottom: v > 1 - b };
    return m.left || m.right || m.top || m.bottom ? m : null;
  }

  _bind() {
    const el = this.dom;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this._tween = null; // grabbing the view cancels an automatic turn
      el.setPointerCapture(e.pointerId);
      // Shift held (or panning disabled) -> rotate; otherwise pan
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, mode: e.shiftKey || !this.panEnabled ? { bottom: true } : null });
      if (this._pointers.size === 2) this._pinchDist = this._currentPinch();
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) {
        if (this._pointers.size === 0 && el.style.cursor !== 'pointer') el.style.cursor = this.cursorAt(e.clientX, e.clientY);
        return;
      }
      if (this._pointers.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        const az = this.targetAzimuth;
        if (p.mode) {
          // rotate like turning the table by its rim, pivoting on the view centre
          const m = p.mode;
          const delta = (m.bottom ? dx : 0) - (m.top ? dx : 0) - (m.right ? dy : 0) + (m.left ? dy : 0);
          const na = az - delta * this.rotateSpeed;
          const sh = this._shift();
          this.goal.x += (Math.sin(az) - Math.sin(na)) * sh; this.goal.z += (Math.cos(az) - Math.cos(na)) * sh;
          this.target.x += (Math.sin(az) - Math.sin(na)) * sh; this.target.z += (Math.cos(az) - Math.cos(na)) * sh;
          this.targetAzimuth = this.azimuth = na;
        } else {
          // pan: the map follows the pointer (world units per pixel at the view centre)
          const k = 2 * this._dist() * Math.tan((this.camera.fov * Math.PI) / 360) / this.dom.clientHeight;
          const elev = this.minElev + (this.maxElev - this.minElev) * this.zoom;
          const rx = Math.cos(az), rz = -Math.sin(az);      // screen right on the ground
          const fx = -Math.sin(az), fz = -Math.cos(az);     // screen up (away from viewer)
          const kv = k / Math.max(0.35, Math.sin(elev));
          this.goal.x += -rx * dx * k + fx * dy * kv;
          this.goal.z += -rz * dx * k + fz * dy * kv;
          this._clampGoal();
        }
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this._pointers.size === 2) {
        const d = this._currentPinch();
        this.targetZoom = THREE.MathUtils.clamp(this.targetZoom - (d - this._pinchDist) * 0.004, 0, 1);
        this._pinchDist = d;
      }
    });
    const end = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) el.style.cursor = this.cursorAt(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom + dy * 0.0011, 0, 1);
    }, { passive: false });
    el.style.cursor = 'grab';
    const shift = (e) => {
      this._shiftHeld = e.shiftKey; // (not `_shift`: that name is the focus-offset method)
      if (this._pointers.size === 0 && (el.style.cursor === 'grab' || el.style.cursor.startsWith('url'))) el.style.cursor = this.cursorAt();
    };
    window.addEventListener('keydown', shift);
    window.addEventListener('keyup', shift);
    window.addEventListener('blur', () => { this._shiftHeld = false; });
  }

  /** Cursor hint: rotate arrows near the edges, grab hand elsewhere. */
  cursorAt() { return this._shiftHeld ? ROTATE_CURSOR : 'grab'; }

  _currentPinch() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  update(dt) {
    if (this._tween) {
      const tw = this._tween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in-out
      this.targetAzimuth = this.azimuth = tw.fromAz + (tw.toAz - tw.fromAz) * e;
      this.targetZoom = this.zoom = tw.fromZoom + (tw.toZoom - tw.fromZoom) * e;
      this.targetPan = this.pan = tw.fromPan * (1 - e); // turn changes re-centre the board
      this.goal.lerpVectors(tw.from, tw.to, e);
      this.target.copy(this.goal);
      if (k >= 1) this._tween = null;
    }
    if (this.autoRotate && this._pointers.size === 0) this.targetAzimuth += dt * 0.08;
    const k = 1 - Math.exp(-dt * 9);
    this.azimuth += (this.targetAzimuth - this.azimuth) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;
    this.pan += (this.targetPan - this.pan) * k;
    this.target.lerp(this.goal, 1 - Math.exp(-dt * 12));

    // ease so distance changes feel uniform
    const z = this.zoom;
    const dist = this.minDist * Math.pow(this.maxDist / this.minDist, z);
    const elev = this.minElev + (this.maxElev - this.minElev) * z;
    // The view centre slides toward the viewer's side of the board as you zoom
    // in, so the tiles nearest you stay on screen. Rotation still pivots on the
    // board centre (the shift turns with the azimuth).
    const shift = this.focusShift * this.maxDist * Math.pow(1 - z, 1.5) + this.pan;
    const sx = Math.sin(this.azimuth), sz = Math.cos(this.azimuth);
    const fx = this.target.x + sx * shift, fz = this.target.z + sz * shift;
    const c = this.camera.position;
    c.set(
      fx + dist * Math.cos(elev) * sx,
      this.target.y + dist * Math.sin(elev),
      fz + dist * Math.cos(elev) * sz
    );
    this._focus ??= new THREE.Vector3();
    this.camera.lookAt(this._focus.set(fx, this.target.y, fz));
  }
}
