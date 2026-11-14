// Materials shared by all tiles (one compiled shader each, no matter how many tiles).
import * as THREE from 'three';
import { applyWind, windDepthMaterial } from './wind.js';
import { getGroundDetailTexture } from './hexGeometry.js';

let mats = null;

export function getMaterials() {
  if (mats) return mats;
  mats = {
    // Trees / bushes sway; depth variants make their shadows sway too.
    tree: applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { bend: 0.07, flutter: 0.004 }),
    treeDepth: windDepthMaterial({ bend: 0.07 }),
    bush: applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { bend: 0.05 }),
    bushDepth: windDepthMaterial({ bend: 0.05 }),
    // Grass blades: very flexible, double-sided, no shadow casting (too fine).
    // (static for performance — thousands of tufts per tile; trees & wheat still sway)
    grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    // Ripe grain: strong rolling waves with a golden sheen
    wheat: applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), { bend: 0.22, flutter: 0.02, waves: 1.3, sheen: 0.45 }),
    flower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    // Static props with baked vertex colours
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    animal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0 }),
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, map: getGroundDetailTexture(), roughness: 1 }),
    // Faceted rock look for mountains
    rockGround: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }),
    rockSmooth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: '#3b5a5e', roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.88 }),
  };
  return mats;
}

// Helper: build InstancedMeshes from {key -> {geo, mat, depth, list:[{matrix,color}], shadow}}
export function buildInstanced(buckets, group) {
  const meshes = {};
  for (const [key, b] of buckets) {
    // small, numerous props get a level of detail: their instances are shuffled
    // so any prefix is an even random subset -> far away we just draw fewer
    const lod = /^(grass|wheat|stubble|flower|reeds|bush)/.test(key) ? (/^(wheat|bush)/.test(key) ? 'mid' : 'fine') : null;
    if (lod) {
      let h = 2166136261; for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      const l = b.list;
      for (let i = l.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [l[i], l[j]] = [l[j], l[i]]; }
    }
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
    mesh.name = key;
    if (lod) mesh.userData.lod = { kind: lod, full: b.list.length };
    b.list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.matrix);
      if (it.color) mesh.setColorAt(i, it.color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = b.castShadow ?? true;
    mesh.receiveShadow = true;
    if (b.depth) mesh.customDepthMaterial = b.depth;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes[key] = mesh;
  }
  return meshes;
}

// Shared scatter helper used by tile builders.
export function createScatter(rand, heightFn) {
  const buckets = new Map();
  const dummy = new THREE.Object3D();
  return {
    buckets,
    add(key, geo, mat, depth, x, z, scale, { tilt = 0.06, color = null, yOffset = -0.006, rotY = null, sx = 1, sz = 1, castShadow = true } = {}) {
      if (!buckets.has(key)) buckets.set(key, { geo, mat, depth, castShadow, list: [] });
      dummy.position.set(x, heightFn(x, z) + yOffset * scale, z);
      dummy.rotation.set((rand() - 0.5) * tilt, rotY ?? rand() * Math.PI * 2, (rand() - 0.5) * tilt);
      dummy.scale.set(scale * sx, scale, scale * sz);
      dummy.updateMatrix();
      buckets.get(key).list.push({ matrix: dummy.matrix.clone(), color });
    },
  };
}
