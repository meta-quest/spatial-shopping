/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * UI configuration for panels, dimension labels, and distance-based scaling
 */

export interface PanelTimingConfig {
  /** Duration for panel fade-in animation (ms) */
  fadeInDuration: number;

  /** Duration for panel fade-out animation (ms) */
  fadeOutDuration: number;

  /** Delay before showing control panels after placement (ms) */
  controlPanelsShowDelay: number;

  /** Delay before hiding control panels (ms) */
  controlPanelsHideDelay: number;

  /** Delay before hiding variant panel (ms) */
  variantPanelHideDelay: number;

  /** Delay before showing the wrong surface notifier (ms) */
  wrongSurfaceNotifierShowDelay: number;
}

export interface TooltipTimingConfig {
  /** Duration for tooltip fade-in animation (ms) */
  fadeInDuration: number;

  /** Duration for tooltip fade-out animation (ms) */
  fadeOutDuration: number;
}

export interface DimensionsConfig {
  /** Height of dimension label texture in pixels */
  textureHeight: number;

  /** Font size for dimension text */
  fontSize: number;

  /** Width of dimension label plane (meters) */
  planeWidth: number;

  /** Height of dimension label plane (meters) */
  planeHeight: number;

  /** Render order for dimension labels (higher = rendered on top) */
  renderOrder: number;

  /** Conversion factor from meters to display unit (e.g., 100 for centimeters) */
  metersToDisplayUnit: number;

  /** Suffix to append to dimension values (e.g., "cm", "in") */
  displayUnitSuffix: string;

  /** Distance-based scaling configuration */
  distanceScale: DistanceScaleConfig;
}

export interface DistanceScaleConfig {
  /** Distance threshold at which UI scaling begins (meters) */
  distanceChangeThreshold: number;

  /** Minimum distance for distance-based scaling */
  minDistance: number;

  /** Maximum distance for distance-based scaling */
  maxDistance: number;

  /** Minimum scale for distance-based scaling */
  minScale: number;

  /** Maximum scale for distance-based scaling */
  maxScale: number;
}

/** Angular scaling used by object-attached UIKit panels. */
export interface PanelDistanceScaleConfig {
  /** Distance in metres where scale equals 1. */
  referenceDistance: number;

  /** 0 keeps physical size fixed; 1 keeps angular size fixed. */
  exponent: number;

  /** Lower clamp for the scale multiplier. */
  minScale: number;

  /** Upper clamp for the scale multiplier. */
  maxScale: number;

  /** Exponential smoothing time constant in seconds. */
  smoothingTau: number;
}

/** Stable product-side placement for the unified vertical control rail. */
export interface ControlBarAnchorConfig {
  /** Clearance between the product side and the rail (meters). */
  sideGap: number;

  /** Keeps floor and ceiling rails from crossing their support plane. */
  surfaceClearance: number;
}

export interface PanelToProductOffsetsConfig {
  /** Offset from product bounding plane left edge to the left panel (meters) */
  leftPanelOffset: number;

  /** Offset from product bounding plane right edge to the right panel (meters) */
  rightPanelOffset: number;

  /** Offset from product bounding plane bottom edge to the bottom panel (meters) */
  bottomPanelOffset: number;

  /** Offset from product bounding plane top edge to the top panel (meters) */
  topPanelOffset: number;

  /** Horizontal offset for the details card beside the control rail (meters). */
  productPanelAttachedHorizontalOffset: number;
}

export interface UIConfig {
  /** Panel animation and timing configuration */
  panelTiming: PanelTimingConfig;

  /** Tooltip animation timing configuration */
  tooltipTiming: TooltipTimingConfig;

  /** Dimension label configuration */
  dimensions: DimensionsConfig;

  /** Offsets from product bounding plane edges to panels (meters) */
  panelToProductOffsets: PanelToProductOffsetsConfig;

  /** Default distance scaling for UI (meters) */
  distanceScale: DistanceScaleConfig;

  /** Distance scaling for variant panel */
  variantPanelDistanceScale: PanelDistanceScaleConfig;

  /** Distance scaling for the unified product control rail. */
  controlBarDistanceScale: PanelDistanceScaleConfig;

  /** Distance scaling for product panel */
  productPanelDistanceScale: PanelDistanceScaleConfig;

  /** Stable product-side placement for the unified control rail. */
  controlBarAnchor: ControlBarAnchorConfig;

  /** Distance at which UI is completely hidden (meters) */
  uiTurnOffDistance: number;

  /** Dead band that prevents panel visibility flicker near the hide boundary. */
  uiHideHysteresis: number;
}
