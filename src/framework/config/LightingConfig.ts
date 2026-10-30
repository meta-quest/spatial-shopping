/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Lighting configuration for the XR viewer
 */

/**
 * HDR environment map asset key registered in `src/assets.ts`, or `"room"` for
 * IWSDK's built-in room lighting (no HDR loaded).
 */
export type LightingResource = "poly_haven_studio_1k" | "room";

export interface IBLConfig {
  /** HDR environment map resource to use for image-based lighting */
  resource: LightingResource;

  /** Intensity multiplier for IBL (affects reflections and ambient light) */
  intensity: number;
}

export interface DirectionalLightConfig {
  /** Intensity multiplier for directional lights (key, fill, rim lights) */
  intensity: number;
}

export interface ContactShadowConfig {
  /** Opacity for hard contact shadow (ambient occlusion) */
  hardOpacity: number;

  /** Opacity for soft contact shadow (penumbra) */
  softOpacity: number;

  /** Scale factor for hard shadow relative to object size */
  hardScaleFactor: number;

  /** Scale factor for soft shadow relative to object size */
  softScaleFactor: number;

  /** Position offset for hard shadow (meters) */
  positionOffsetHard: number;

  /** Position offset for soft shadow (meters) */
  positionOffsetSoft: number;
}

export interface ShadowsConfig {
  /** Enable/disable contact shadows */
  enabled: boolean;

  /** Contact shadow configuration */
  contactShadow: ContactShadowConfig;
}

export interface LightingConfig {
  /** Image-based lighting (IBL) configuration */
  ibl: IBLConfig;

  /** Directional lighting configuration */
  directional: DirectionalLightConfig;

  /** Shadows configuration */
  shadows: ShadowsConfig;
}
