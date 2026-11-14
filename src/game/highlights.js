// "Here are your towns!" — at the start of a player's turn a dashed, slowly
// turning ring in their colour circles each of their towns and cities for a
// few seconds, then fades away.

import * as THREE from 'three';
import { PLAYERS } from '../pieces/pieces.js';

const SHOW = 3.2, FADE = 0.8; // seconds fully visible, seconds fading out

function dashedRing(r0, r1, dashes = 10) {
  const g = new THREE.Group();
  const geo = new THREE.RingGeometry(r0, r1, 10, 1, 0, (Math.PI * 2 / dashes) * 0.62).rotateX(-Math.PI / 2);
  for (let i = 0; i < dashes; i++) {
    const m = new THREE.Mesh(geo, null);
    m.rotation.y = (i / dashes) * Math.PI * 2;
    g.add(m);
  }
  g.userData.geo = geo;
  return g;
}

export class TurnRings {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'turn-rings';
    this.items = [];
    this.t = -1;
  }

  /** Ring every settlement of player `pid` (graph vertices give the positions). */
  show(game, pid) {
    this.clear();
    if (!this.group.parent) this.parent.add(this.group);
    const col = new THREE.Color(PLAYERS[pid].color);
    for (const [vi, s] of game.settlements) {
      if (s.player !== pid) continue;
      const v = game.graph.vertices[vi];
      const big = s.kind === 'city';
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
      const halo = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
      const ring = dashedRing(big ? 0.4 : 0.32, big ? 0.47 : 0.38);
      ring.children.forEach((m) => { m.material = mat; m.renderOrder = 11; });
      const under = new THREE.Mesh(new THREE.RingGeometry(big ? 0.38 : 0.3, big ? 0.49 : 0.4, 40).rotateX(-Math.PI / 2), halo);
      under.renderOrder = 10;
      const g = new THREE.Group();
      g.add(under, ring);
      g.position.set(v.x, 0.03, v.z);
      this.group.add(g);
      this.items.push({ g, ring, mat, halo, under });
    }
    this.t = 0;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const fade = this.t < SHOW ? 1 : Math.max(0, 1 - (this.t - SHOW) / FADE);
    const pop = Math.min(1, this.t / 0.35);
    for (const it of this.items) {
      it.ring.rotation.y = this.t * 1.4;
      it.g.scale.setScalar((0.6 + 0.4 * (1 - Math.pow(1 - pop, 3))) * (1 + Math.sin(this.t * 5) * 0.04));
      it.mat.opacity = 0.95 * fade;
      it.halo.opacity = 0.55 * fade;
    }
    if (fade <= 0) this.clear();
  }

  clear() {
    for (const it of this.items) {
      this.group.remove(it.g);
      it.ring.userData.geo.dispose(); it.under.geometry.dispose(); it.mat.dispose(); it.halo.dispose();
    }
    this.items = [];
    this.t = -1;
  }
}
