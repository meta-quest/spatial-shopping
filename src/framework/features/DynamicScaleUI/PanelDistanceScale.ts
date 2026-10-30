/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from "@iwsdk/core";

/**
 * Component storing distance-based scale parameters for UI panels.
 * Used by DynamicScaleUISystem to scale panels based on camera distance.
 */
export const PanelDistanceScale = createComponent("PanelDistanceScale", {
  referenceDistance: { type: Types.Float32, default: 1.5 },
  exponent: { type: Types.Float32, default: 0.8 },
  minScale: { type: Types.Float32, default: 0.6 },
  maxScale: { type: Types.Float32, default: 2 },
  smoothingTau: { type: Types.Float32, default: 0.12 },
  currenScaleRatio: { type: Types.Float32, default: 1.0 },
});
