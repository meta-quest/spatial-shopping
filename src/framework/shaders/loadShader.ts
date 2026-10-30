/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import reticleVert from "./reticle.vert.glsl?raw";
import reticleFrag from "./reticle.frag.glsl?raw";

export type ShaderPair = { vertex: string; fragment: string };

const shaderMap: Record<string, ShaderPair> = {
  reticle: { vertex: reticleVert, fragment: reticleFrag },
};

/**
 * Returns vertex and fragment shader source for a named shader.
 * Shaders are loaded at build time via Vite's ?raw imports.
 *
 * @param name - Shader name (e.g. 'reticle')
 * @returns Shader pair or undefined if not found
 */
export function loadShader(name: string): ShaderPair | undefined {
  return shaderMap[name];
}
