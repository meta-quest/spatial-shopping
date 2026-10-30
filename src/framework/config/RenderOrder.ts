/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Three.js render order layers, lowest drawn first. Transparent UI must draw
 * after the product so panels stay readable when they overlap it.
 */
export const RENDER_ORDER = {
  /** The placed product model. */
  product: 500,
  /** Placement reticle drawn on detected surfaces. */
  placementReticle: 999,
  /** Base spatial UI: product panel, control bar, variant selector, dimension labels. */
  panel: 1000,
  /** Panels shown above base UI: tooltips, notifier, cart. */
  overlayPanel: 1001,
  /** Modal confirmation panels. */
  modalPanel: 1002,
  /** Developer log panel. */
  debugLog: 2000,
  /** Developer gizmos. */
  debugGizmo: 9999,
} as const;
