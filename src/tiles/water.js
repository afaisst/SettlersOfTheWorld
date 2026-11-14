// WATER (sea) tile.
// A subdivided hex surface animated in the vertex shader with several wave
// trains in WORLD space (so neighbouring sea tiles join seamlessly). Colour
// shifts from deep blue to turquoise near shores; on edges that touch land,
// swells steepen and break into rolling surf lines with foam.
//
// opts.landEdges: array of 6 booleans — edge k (normal at 60°·k, tile-local)
// borders a land tile. Water tiles are never rotated so local == world axes.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { createHexTerrainGeometry, createTileBody, SQRT3 } from './hexGeometry.js';
import { windUniforms } from './wind.js';

export const WATER_LEVEL = -0.035;
const waterGeoCache = {}; // sea surface sits a bit below land tops
// Quality: own clock (frozen in Fast mode), cheap shading flag, mesh detail.
export const waterUniforms = { uTime: { value: 0 }, uCheap: { value: 0 } };
const WATER_RINGS = { high: 30, balanced: 16, fast: 10 };
let waterRings = WATER_RINGS.balanced;
const surfaces = new Set();
const waterGeo = (radius) => (waterGeoCache[`${radius}:${waterRings}`] ??= createHexTerrainGeometry({ radius, rings: waterRings, heightFn: () => 0, colorFn: () => [1, 1, 1] }));
/** Fast: coarser sea with simpler open-water shading (shore surf still animated). */
export function setWaterQuality(name) {
  waterRings = WATER_RINGS[name] ?? WATER_RINGS.balanced;
  waterUniforms.uCheap.value = name === 'fast' ? 1 : 0;
  for (const m of surfaces) { if (!m.parent) { surfaces.delete(m); continue; } m.geometry = waterGeo(m.userData.radius); }
}

const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
uniform float uLand[6];
uniform float uApothem;
uniform float uCheap;
varying vec2 vLocal;
varying float vShore;
varying float vCrest;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
// distance (tile-local) to the nearest land edge; large if none
float shoreDist(vec2 p) {
  float d = 10.0;
  for (int k = 0; k < 6; k++) {
    float a = float(k) * 1.0471976;
    vec2 n = vec2(cos(a), sin(a));
    float e = uApothem - dot(p, n);
    d = mix(d, min(d, e), step(0.5, uLand[k]));
  }
  return d;
}
`;

const GLSL_WAVES = /* glsl */ `
// returns height; writes analytic gradient
float seaHeight(vec2 w, vec2 local, out vec2 grad) {
  float amp = 0.0025 + 0.0018 * uWindStrength; // calm enough for moored ships
  float h = 0.0; grad = vec2(0.0);
  // two gentle, slow wave trains (cheaper and calmer than before)
  vec2 dirs[2];
  dirs[0] = normalize(vec2(1.0, 0.35)); dirs[1] = normalize(vec2(0.7, -0.6));
  float freqs[2]; freqs[0] = 9.0; freqs[1] = 15.0;
  float amps[2];  amps[0] = 1.0;  amps[1] = 0.5;
  float spd[2];   spd[0] = 0.75;  spd[1] = 1.0;
  for (int i = 0; i < 2; i++) {
    float ph = dot(dirs[i], w) * freqs[i] - uTime * spd[i];
    h += sin(ph) * amps[i] * amp;
    grad += dirs[i] * cos(ph) * amps[i] * amp * freqs[i];
  }
  // surf: swells roll in toward land and steepen in the shallows
  float sd = shoreDist(local);
  float zone = 1.0 - smoothstep(0.0, 0.3, sd);
  float ph = sd * 38.0 + uTime * 1.5 + vnoise(w * 3.0) * 2.0;
  float swell = pow(0.5 + 0.5 * sin(ph), 3.0);
  h += swell * zone * (0.004 + 0.002 * uWindStrength) * smoothstep(0.0, 0.06, sd);
  return h;
}
`;

function createWaterMaterial(landEdges, apothem) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.0, envMapIntensity: 0.45 });
  const uLand = { value: landEdges.map((b) => (b ? 1 : 0)) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uCheap = waterUniforms.uCheap;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uLand = uLand;
    shader.uniforms.uApothem = { value: apothem };
    shader.vertexShader = GLSL_COMMON + GLSL_WAVES + shader.vertexShader
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec2 wpos = (modelMatrix * vec4(position, 1.0)).xz;
        vec2 sGrad;
        float sH = seaHeight(wpos, position.xz, sGrad);
        vec3 objectNormal = normalize(vec3(-sGrad.x, 1.0, -sGrad.y));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        vec3 transformed = vec3(position);
        #ifdef USE_ALPHAHASH
          vPosition = vec3(position);
        #endif
        transformed.y += sH;
        vLocal = position.xz;
        vShore = shoreDist(position.xz);
        vCrest = sH;
      `);
    shader.fragmentShader = GLSL_COMMON + shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec3 deep = vec3(0.01, 0.05, 0.11);
        vec3 mid = vec3(0.02, 0.11, 0.18);
        vec3 shallow = vec3(0.06, 0.3, 0.32);
        float zone = 1.0 - smoothstep(0.0, 0.35, vShore);
        vec2 wp = vLocal;
        float n = uCheap > 0.5 ? 0.5 : vnoise(wp * 9.0 + uTime * 0.08);
        vec3 col = mix(deep, mid, 0.35 + n * 0.3);
        col = mix(col, shallow, zone * zone);
        // crest highlights out at sea (whitecaps when windy)
        float caps = smoothstep(0.009 + 0.006 / max(uWindStrength, 0.2), 0.022, vCrest) * smoothstep(0.7, 0.95, n);
        // surf foam: lines that roll toward the shore and dissolve
        float ph = vShore * 38.0 + uTime * 1.5 + (uCheap > 0.5 ? 0.0 : vnoise(wp * 3.0) * 2.0);
        float band = smoothstep(0.75, 0.98, 0.5 + 0.5 * sin(ph));
        float foamNoise = (uCheap > 0.5 && vShore > 0.25) ? 0.6 : vnoise(wp * 40.0 + vec2(uTime * 0.15, 0.0)); // cheap mode: noise only near shores
        float surf = band * (1.0 - smoothstep(0.03, 0.22, vShore)) * smoothstep(0.25, 0.7, foamNoise + 0.3);
        float wash = (1.0 - smoothstep(0.0, 0.03 + 0.02 * sin(uTime * 1.1 + wp.x * 7.0 + wp.y * 5.0), vShore)) * smoothstep(0.35, 0.7, foamNoise + 0.3 * sin(uTime * 1.3 + wp.x * 9.0));
        float foam = clamp(surf + wash + caps * 0.6, 0.0, 1.0);
        diffuseColor.rgb = mix(col, vec3(0.92, 0.95, 0.96), foam);
        float foamMask = foam;
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, foamMask);
      `);
  };
  mat.customProgramCacheKey = () => 'sea-water';
  return mat;
}

export function createWaterTile({ seed = 1, radius = 1.0, landEdges = [false, false, false, false, false, false] } = {}) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'water';
  const apothem = (radius * SQRT3) / 2;

  // flat surface is identical for every sea tile -> share one geometry
  const mat = createWaterMaterial(landEdges, apothem);
  const surface = new THREE.Mesh(waterGeo(radius), mat);
  surface.userData.radius = radius;
  surface.position.y = WATER_LEVEL;
  surface.receiveShadow = true; // frustum-culled: off-screen sea isn't drawn
  surfaces.add(surface);
  group.add(surface);

  // Body: sea-coloured band at the top of the side, sandy/rocky seabed below.
  // (body top sits a little below the surface so wave troughs never reveal the seams)
  const body = createTileBody({ radius, thickness: 0.16 + WATER_LEVEL - 0.014, strata: { top: '#1d4a5a', layers: [
    { color: '#c2ad7e', size: 0.2 }, { color: '#a8936a', size: 0.25 }, { color: '#8a785a', size: 0.25 }, { color: '#6e604a', size: 0.3 },
  ] } });
  body.position.y = WATER_LEVEL - 0.014;
  group.add(body);

  void rand;
  return {
    group,
    type: 'water',
    update() {},
    dispose() { mat.dispose(); },
  };
}
