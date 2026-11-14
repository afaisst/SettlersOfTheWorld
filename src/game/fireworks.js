// Victory fireworks: rockets shoot up from every town and city of the winner
// and burst into sparkling showers (the winner's colour, gold and white),
// over and over until the game is left.

import * as THREE from 'three';

let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}

const GRAVITY = 0.9;
// NOTE: no PointLights here — adding/removing a light makes three.js recompile
// every lit material in the scene (that froze the game on every burst).
// Materials are shared too; bursts fade by darkening their vertex colours
// (additive blending: darker = more transparent).
let rocketMat = null, sparkMat = null, flashMat = null;
function mats() {
  if (!rocketMat) {
    rocketMat = new THREE.PointsMaterial({ map: dotTexture(), color: '#fff3c4', size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    sparkMat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    flashMat = new THREE.SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  return { rocketMat, sparkMat, flashMat };
}
const SPARKS = 70;

export class Fireworks {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'fireworks';
    this.sites = [];
    this.rockets = [];
    this.bursts = [];
    this.active = false;
  }

  /** Celebrate at the given board points [{x, z}] in `color`. */
  start(sites, color) {
    this.stop();
    if (!this.group.parent) this.parent.add(this.group);
    this.sites = sites.map((s, i) => ({ ...s, next: 0.2 + i * 0.35 + Math.random() * 0.4 }));
    this.colors = [new THREE.Color(color), new THREE.Color('#ffd34d'), new THREE.Color('#ffffff'), new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45)];
    this.active = true;
  }

  stop() {
    for (const r of this.rockets) { this.group.remove(r.pts); r.pts.geometry.dispose(); }
    for (const b of this.bursts) { this.group.remove(b.pts, b.flash); b.pts.geometry.dispose(); b.flash.material.dispose(); }
    this.rockets = []; this.bursts = []; this.sites = []; this.active = false;
  }

  _launch(site) {
    // the rocket: a bright spark with a short trail (a few points)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 6), 3));
    const pts = new THREE.Points(geo, mats().rocketMat);
    pts.frustumCulled = false;
    this.group.add(pts);
    const ang = Math.random() * Math.PI * 2, drift = 0.15 + Math.random() * 0.2;
    this.rockets.push({
      pts, t: 0, life: 0.65 + Math.random() * 0.25,
      p: new THREE.Vector3(site.x, 0.15, site.z),
      v: new THREE.Vector3(Math.cos(ang) * drift, 1.15 + Math.random() * 0.35, Math.sin(ang) * drift), // bursts ~0.6–0.9 above the town
      trail: [],
    });
  }

  _burst(at) {
    const n = SPARKS, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    const main = this.colors[Math.floor(Math.random() * this.colors.length)];
    const second = this.colors[Math.floor(Math.random() * this.colors.length)];
    const speed = 0.4 + Math.random() * 0.25;
    for (let i = 0; i < n; i++) {
      // even directions on a sphere, a little random
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = speed * (0.85 + Math.random() * 0.3);
      vel.push(new THREE.Vector3(r * Math.cos(th) * s, u * s + 0.15, r * Math.sin(th) * s));
      pos.set([at.x, at.y, at.z], i * 3);
      const c = i % 3 === 0 ? second : main;
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, mats().sparkMat);
    pts.frustumCulled = false;
    this.group.add(pts);
    // a soft glow ball instead of a light
    const flash = new THREE.Sprite(mats().flashMat.clone());
    flash.material.color.copy(main);
    flash.position.copy(at);
    flash.scale.setScalar(0.9);
    this.group.add(flash);
    this.bursts.push({ pts, vel, t: 0, life: 1.7 + Math.random() * 0.5, flash, base: col.slice() });
  }

  update(dt) {
    if (!this.active) return;
    if (!this.group.parent) this.parent.add(this.group);
    for (const s of this.sites) {
      if ((s.next -= dt) > 0) continue;
      this._launch(s);
      s.next = 1.0 + Math.random() * 1.6;
    }
    // rockets rise, then pop
    for (const r of this.rockets) {
      r.t += dt;
      r.v.y -= GRAVITY * dt;
      r.p.addScaledVector(r.v, dt);
      r.trail.unshift(r.p.clone());
      r.trail.length = Math.min(r.trail.length, 6);
      const arr = r.pts.geometry.attributes.position;
      for (let i = 0; i < 6; i++) { const q = r.trail[Math.min(i, r.trail.length - 1)]; arr.setXYZ(i, q.x, q.y, q.z); }
      arr.needsUpdate = true;
      if (r.t >= r.life) { this._burst(r.p); r.done = true; }
    }
    for (const r of this.rockets.filter((x) => x.done)) { this.group.remove(r.pts); r.pts.geometry.dispose(); }
    this.rockets = this.rockets.filter((x) => !x.done);
    // sparks fly out, fall and fade (with a twinkle)
    for (const b of this.bursts) {
      b.t += dt;
      const arr = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.vel.length; i++) {
        const v = b.vel[i];
        v.multiplyScalar(1 - dt * 1.6);
        v.y -= GRAVITY * 0.35 * dt;
        arr.setXYZ(i, arr.getX(i) + v.x * dt, arr.getY(i) + v.y * dt, arr.getZ(i) + v.z * dt);
      }
      arr.needsUpdate = true;
      const k = b.t / b.life;
      const fade = Math.max(0, 1 - k * k);
      const cols = b.pts.geometry.attributes.color;
      for (let i = 0; i < b.vel.length; i++) {
        const tw = k > 0.5 ? 0.6 + Math.random() * 0.4 : 1; // twinkle while fading
        cols.setXYZ(i, b.base[i * 3] * fade * tw, b.base[i * 3 + 1] * fade * tw, b.base[i * 3 + 2] * fade * tw);
      }
      cols.needsUpdate = true;
      b.flash.material.opacity = Math.max(0, 0.8 * (1 - b.t / 0.4));
      b.flash.scale.setScalar(0.9 + b.t * 1.2);
      if (b.t >= b.life) b.done = true;
    }
    for (const b of this.bursts.filter((x) => x.done)) { this.group.remove(b.pts, b.flash); b.pts.geometry.dispose(); b.flash.material.dispose(); }
    this.bursts = this.bursts.filter((x) => !x.done);
  }
}
