/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Placement and snapping configuration
 */

export interface SnappingConfig {
  /** Distance threshold for snapping to detected planes (meters) */
  threshold: number;

  /** Enable/disable plane snapping */
  enabled: boolean;
}

export interface InitialPlacementConfig {
  /** Default position for objects when first placed [x, y, z] in meters */
  defaultPosition: [number, number, number];

  /** Forward margin from panel (meters) */
  forwardMargin: number;
}

export interface ReticleConfig {
  /** Smallest placement field radius in meters */
  minimumRadius: number;

  /** Largest placement field radius in meters */
  maximumRadius: number;

  /** Radius used when model bounds are unavailable */
  fallbackRadius: number;

  /** Outer margin over which the field fades beyond the model footprint */
  fadeDistance: number;

  /** World-locked distance between pattern cells in meters */
  spacing: number;

  /** Radius of each valid-placement dot in meters */
  dotRadius: number;

  /** Offset above the tracked surface to avoid z-fighting */
  surfaceOffset: number;

  /** Speed of opacity transitions (higher = faster) */
  opacityTransitionSpeed: number;

  /** Render order for reticle (higher = rendered on top) */
  renderOrder: number;
}

export interface RoomDetectionConfig {
  /** Times to poll for existing room data before starting room capture */
  pollAttempts: number;

  /** Delay between room data polls (ms) */
  pollIntervalMs: number;
}

export interface PlacementConfig {
  /** Snapping configuration */
  snapping: SnappingConfig;

  /** Initial placement configuration */
  initial: InitialPlacementConfig;

  /** Placement reticle configuration */
  reticle: ReticleConfig;

  /** Room data detection performed when the XR session starts */
  roomDetection: RoomDetectionConfig;
}
