/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";
import { CONFIG } from "./ViewerConfig.js";

describe("viewer panel scaling", () => {
  it("keeps every object-attached panel configuration usable", () => {
    const configs = [
      CONFIG.ui.controlBarDistanceScale,
      CONFIG.ui.variantPanelDistanceScale,
      CONFIG.ui.productPanelDistanceScale,
    ];

    for (const config of configs) {
      expect(config.minScale).toBeLessThanOrEqual(config.maxScale);
      expect(config.referenceDistance).toBeGreaterThan(0);
      expect(config.exponent).toBeGreaterThanOrEqual(0);
      expect(config.exponent).toBeLessThanOrEqual(1);
      expect(config.smoothingTau).toBeGreaterThan(0);
      expect(config.smoothingTau).toBeLessThanOrEqual(0.15);
    }
  });
});
