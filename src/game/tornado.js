// Tornado: a twisting grey funnel under a dark thunder cloud that roams the
// sea. It wobbles in place and glides to its next hex when the game moves it.
// Spray swirls at its foot, debris spirals up, lightning flickers in the cloud.

import * as THREE from 'three';
import { axialToWorld } from '../board/layout.js';
import { WATER_LEVEL } from '../tiles/water.js';

const H = 1.35;          // funnel height
const SEGMENTS = 10;
const MOVE_TIME = 2.6;

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 128, w = 2 + Math.random() * 7, a = 0.15 + Math.random() * 0.45;
    const shade = 150 + Math.floor(Math.random() * 80);
    g.strokeStyle = `rgba(${shade},${shade},${shade + 8},${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 30, 80, x - 30, 170, x + 10, 256); // slanted, swirling streaks
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class TornadoView {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'tornado';
    this.group.visible = false;
    const tex = streakTexture();
    // funnel: stacked open frustums, each its own sway; inner + outer skin
    this.segs = [];
    const radius = (y) => 0.07 + 0.36 * Math.pow(y / H, 1.8);
    for (let i = 0; i < SEGMENTS; i++) {
      const y0 = (i / SEGMENTS) * H, y1 = ((i + 1) / SEGMENTS) * H;
      const seg = new THREE.Group();
      for (const [k, op, col] of [[1, 0.8, '#a9afb8'], [0.78, 0.95, '#5f6670']]) {
        const geo = new THREE.CylinderGeometry(radius(y1) * k, radius(y0) * k, y1 - y0 + 0.01, 24, 1, true);
        const map = tex.clone(); map.needsUpdate = true;
        map.repeat.set(2, 0.12); map.offset.y = i / SEGMENTS;
        const mat = new THREE.MeshBasicMaterial({ map, color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, fog: true });
        const m = new THREE.Mesh(geo, mat);
        m.position.y = (y0 + y1) / 2;
        m.userData.spin = k === 1 ? 2.6 : 3.8;
        m.renderOrder = 7;
        seg.add(m);
      }
      this.group.add(seg);
      this.segs.push(seg);
    }
    // thunder cloud
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#555a63', roughness: 1, emissive: '#9aa6ff', emissiveIntensity: 0 });
    this.cloudMat = cloudMat;
    this.cloud = new THREE.Group();
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4, d = i < 4 ? Math.random() * 0.2 : 0.25 + Math.random() * 0.3;
      const s = 0.17 + Math.random() * 0.13;
      const m = new THREE.Mesh(puff, cloudMat);
      m.position.set(Math.cos(a) * d, (Math.random() - 0.3) * 0.1, Math.sin(a) * d);
      m.scale.set(s, s * 0.55, s);
      this.cloud.add(m);
    }
    this.cloud.position.y = H + 0.08;
    this.group.add(this.cloud);
    // lightning glow (a sprite, not a light: lights force shader recompiles)
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: '#dfe6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.position.y = H - 0.05;
    this.flash.scale.setScalar(1.6);
    this.group.add(this.flash);
    // spray at the foot + debris spiralling up
    const ptex = puffTexture();
    this.spray = [];
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ptex, color: '#eef3f6', transparent: true, opacity: 0.6, depthWrite: false }));
      sp.userData = { a: Math.random() * Math.PI * 2, r: 0.08 + Math.random() * 0.14, ph: Math.random() };
      this.group.add(sp);
      this.spray.push(sp);
    }
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.012, 0.018), new THREE.MeshStandardMaterial({ color: '#4a3b2c' }), 40);
    this.debrisData = Array.from({ length: 40 }, () => ({ a: Math.random() * Math.PI * 2, y: Math.random(), sp: 0.15 + Math.random() * 0.25 }));
    this.group.add(this.debris);
    this.pos = new THREE.Vector2();
    this.anim = null;
    this.nextFlash = 2;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
  }

  /**
   * Put the tornado over cell `ci`. `visible` = is that cell explored? Hidden
   * tornados aren't drawn or animated. Moving out of sight it glides away first.
   */
  setCell(cells, ci, { instant = false, visible = true, wasVisible = this.group.visible } = {}) {
    if (!this.group.parent) this.parent.add(this.group);
    const c = cells[ci], w = axialToWorld(c.q, c.r);
    this.hideAfter = false;
    if (instant || !wasVisible || !this.group.visible) { this.pos.set(w.x, w.z); this.anim = null; this.group.visible = visible; return; }
    this.anim = { t: 0, from: this.pos.clone(), to: new THREE.Vector2(w.x, w.z) };
    this.hideAfter = !visible; // glide into the fog, then vanish
  }

  hide() { this.group.visible = false; }

  update(t, dt) {
    if (!this.group.visible) return;
    if (!this.group.parent) this.parent.add(this.group);
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const k = Math.min(1, a.t / MOVE_TIME), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.pos.lerpVectors(a.from, a.to, e);
      if (k >= 1) { this.anim = null; if (this.hideAfter) { this.group.visible = false; this.hideAfter = false; return; } }
    }
    // wander a little around the hex centre
    const wx = Math.sin(t * 0.37) * 0.18 + Math.sin(t * 0.91) * 0.06, wz = Math.cos(t * 0.29) * 0.18;
    this.group.position.set(this.pos.x + wx, WATER_LEVEL, this.pos.y + wz);
    // the funnel snakes: lower segments lag behind the cloud
    this.segs.forEach((seg, i) => {
      const f = i / SEGMENTS;
      seg.position.x = Math.sin(t * 1.3 - f * 2.2) * 0.07 * (1 - f) + Math.sin(t * 2.1 + i) * 0.008;
      seg.position.z = Math.cos(t * 1.1 - f * 2.0) * 0.07 * (1 - f);
      for (const m of seg.children) { m.rotation.y = t * m.userData.spin + i * 0.3; }
    });
    this.cloud.rotation.y = t * 0.25;
    // spray
    for (const sp of this.spray) {
      const u = sp.userData, k = (t * 0.6 + u.ph) % 1;
      const a = u.a + t * 3;
      sp.position.set(Math.cos(a) * (u.r + k * 0.15), 0.02 + k * 0.12, Math.sin(a) * (u.r + k * 0.15));
      sp.scale.setScalar(0.08 + k * 0.12);
      sp.material.opacity = 0.65 * (1 - k);
    }
    // debris
    this.debrisData.forEach((d, i) => {
      d.y = (d.y + dt * d.sp) % 1;
      d.a += dt * (5 - d.y * 3);
      const y = d.y * H * 0.9, r = 0.06 + 0.38 * Math.pow(d.y, 2.2) + 0.03;
      this._e.set(t * 3 + i, t * 2, 0);
      this._m.compose(new THREE.Vector3(Math.cos(d.a) * r, y, Math.sin(d.a) * r), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1));
      this.debris.setMatrixAt(i, this._m);
    });
    this.debris.instanceMatrix.needsUpdate = true;
    // lightning flicker
    this.nextFlash -= dt;
    let f = 0;
    if (this.nextFlash < 0) { f = Math.random() < 0.5 ? 1 : 0.4; if (this.nextFlash < -0.25) this.nextFlash = 1.5 + Math.random() * 4; }
    this.flash.material.opacity = f * 0.8;
    this.cloudMat.emissiveIntensity = f * 0.6;
  }
}
