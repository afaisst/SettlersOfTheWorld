// Global wind shared by every swaying thing (trees now, grain fields later).
// The shader patch bends geometry quadratically with local height, so the
// trunk base stays planted and the crown sways. Direction is consistent in
// WORLD space even though every instance is randomly rotated.

import * as THREE from 'three';

export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
  uWindDir: { value: new THREE.Vector2(1, 0.35).normalize() },
};

/**
 * @param material  any built-in three.js material
 * @param bend      sway amount at local height 1
 * @param flutter   small high-frequency jitter (leaves)
 * @param waves     extra short-wavelength rolling waves (grass / grain fields)
 * @param sheen     brightens tips as a wave passes — makes wind visible on meadows
 */
export function applyWind(material, { bend = 0.06, flutter = 0.0, waves = 0.0, sheen = 0.0 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindDir = windUniforms.uWindDir;

    if (sheen > 0) {
      shader.fragmentShader = 'varying float vWindSheen;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= 1.0 + vWindSheen;'
      );
    }
    shader.vertexShader =
      (sheen > 0 ? 'varying float vWindSheen;\n' : '') +
      'uniform float uTime;\nuniform float uWindStrength;\nuniform vec2 uWindDir;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            mat4 instM = instanceMatrix;
          #else
            mat4 instM = mat4(1.0);
          #endif
          vec2 worldXZ = (modelMatrix * vec4(instM[3].xyz, 1.0)).xz;
          vec3 windW = vec3(uWindDir.x, 0.0, uWindDir.y);
          // wind direction expressed in the instance's local frame
          vec3 localDir = normalize(transpose(mat3(instM)) * windW + vec3(1e-5));
          float h = max(position.y, 0.0);
          float phase = dot(worldXZ, uWindDir) * 1.4;
          float gust = 0.55 + 0.45 * sin(uTime * 0.37 - phase * 0.3);
          float sway = (0.65 * sin(uTime * 1.6 - phase * 2.0) + 0.35 * sin(uTime * 2.7 - phase * 3.3 + 1.3));
          float push = (0.35 + sway * 0.65) * gust * uWindStrength; // leans downwind + oscillates
          ${waves > 0 ? `
          vec2 perp = vec2(-uWindDir.y, uWindDir.x);
          float roll = sin(uTime * 1.5 - dot(worldXZ, uWindDir) * 4.5 + sin(dot(worldXZ, perp) * 2.1) * 1.4);
          roll = roll * 0.5 + 0.5;
          push += roll * roll * ${waves.toFixed(4)} * uWindStrength;` : ''}
          ${sheen > 0 ? `vWindSheen = push * ${sheen.toFixed(4)} * h;` : ''}
          transformed += localDir * push * ${bend.toFixed(4)} * h * h;
          ${flutter > 0 ? `
          float fl = sin(uTime * 8.0 + position.x * 37.0 + position.z * 23.0 + phase * 5.0);
          transformed.xz += vec2(fl, -fl * 0.6) * ${flutter.toFixed(4)} * h * uWindStrength;` : ''}
        }
        `
      );
  };
  material.customProgramCacheKey = () => `wind-${bend}-${flutter}-${waves}-${sheen}-${material.type}`;
  return material;
}

// Matching depth material so shadows sway with the geometry.
export function windDepthMaterial(opts) {
  return applyWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), opts);
}
