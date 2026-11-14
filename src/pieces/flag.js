// Cloth that waves in the shared wind: banners and pennants.
// Displacement grows from the pole (uv.x = 0) to the free end (uv.x = 1),
// with a travelling wave; each flag gets its own phase from its world position.

import * as THREE from 'three';
import { windUniforms } from '../tiles/wind.js';

/**
 * @param color  cloth colour
 * @param amp    max sideways flutter at the free end, in the mesh's local units
 * @param waves  number of ripples along the flag
 */
export function flagMaterial(color, { amp = 0.01, waves = 1.4, roughness = 0.7 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWindStrength;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      {
        vec3 wp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float phase = dot(wp.xz, vec2(7.1, 4.3));
        float u = uv.x;
        float strength = 0.35 + 0.65 * clamp(uWindStrength, 0.0, 3.0);
        float speed = 2.2 + uWindStrength * 1.2;          // slow in light wind
        float w = sin(u * ${(waves * 6.2832).toFixed(4)} - uTime * speed + phase)
                + 0.35 * sin(u * ${(waves * 11.0).toFixed(4)} - uTime * speed * 1.7 + phase * 1.3);
        transformed.z += w * u * ${amp.toFixed(5)} * strength;
        transformed.y -= (1.0 - strength * 0.5) * u * u * ${(amp * 0.6).toFixed(5)}; // droops when calm
      }
      `
    );
  };
  mat.customProgramCacheKey = () => `flag-${amp}-${waves}`;
  return mat;
}
