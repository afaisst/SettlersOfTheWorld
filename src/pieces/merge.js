// Merge a piece's many small static meshes into one mesh per material.
// A castle goes from ~100 draw calls to ~8. Animated parts are left alone:
// flags (vertex-shader wave in their own frame), ships (they rock), and
// instanced meshes (road kerbs).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const byMat = new Map();
  const victims = [];
  root.traverse((o) => {
    if (o === root || !o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    if (o.name === 'flag') return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.name === 'ship') return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _m.multiplyMatrices(_inv, o.matrixWorld);
    g.applyMatrix4(_m);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    victims.push(o);
  });
  for (const o of victims) {
    o.parent.remove(o);
    if (!o.geometry.userData.shared) o.geometry.dispose();
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  // drop now-empty helper groups (houses, harbour) except ones still holding parts
  const empties = [];
  root.traverse((o) => { if (o !== root && o.type === 'Group' && o.children.length === 0) empties.push(o); });
  empties.forEach((o) => o.parent.remove(o));
  return root;
}
