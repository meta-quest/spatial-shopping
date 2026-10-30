/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";
import { computePanelFitScale } from "./PanelUISizeSystem.js";

describe("computePanelFitScale", () => {
  it("preserves a panel whose intrinsic size matches its target bounds", () => {
    expect(computePanelFitScale(30, 20, 0.3, 1)).toBe(1);
  });

  it("fits by the limiting axis", () => {
    expect(computePanelFitScale(63.6, 79.4, 0.5, 1)).toBeCloseTo(0.5 / 0.636);
  });

  it("scales a panel up when its target bounds are larger", () => {
    expect(computePanelFitScale(38.4, 20, 0.6, 1)).toBeCloseTo(1.5625);
  });

  it("falls back to identity for incomplete layout", () => {
    expect(computePanelFitScale(0, 20, 0.5, 1)).toBe(1);
  });

  it("keeps the unified control rail compact and height-limited", () => {
    const scale = computePanelFitScale(6, 43.1, 0.09, 0.5);

    expect(scale).toBeCloseTo(0.5 / 0.431, 3);
    expect(0.06 * scale).toBeLessThan(0.09);
  });
});
