/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";
import {
  computeAngularScale,
  computeForceHidden,
  smoothTowards,
} from "./DynamicScaleUISystem.js";

describe("computeAngularScale", () => {
  it("uses the reference distance as identity", () => {
    expect(computeAngularScale(1.5, 1.5, 1, 0.7, 2)).toBe(1);
  });

  it("clamps near and far target sizes", () => {
    expect(computeAngularScale(0.5, 1.5, 1, 0.7, 2)).toBe(0.7);
    expect(computeAngularScale(4, 1.5, 1, 0.7, 2)).toBe(2);
  });

  it("keeps angular size constant inside the unclamped working range", () => {
    const angularSizes = [1.1, 1.5, 2, 2.5, 3].map(
      (distance) => computeAngularScale(distance, 1.5, 1, 0.7, 2) / distance,
    );
    angularSizes.forEach((value) =>
      expect(value).toBeCloseTo(angularSizes[0], 8),
    );
  });
});

describe("smoothTowards", () => {
  it("moves 63.2 percent through one time constant", () => {
    expect(smoothTowards(0, 1, 0.12, 0.12)).toBeCloseTo(0.6321, 3);
  });

  it("does not move an already settled value", () => {
    expect(smoothTowards(0.75, 0.75, 0.12, 1 / 72)).toBe(0.75);
  });
});

describe("computeForceHidden", () => {
  it("requires crossing the exit side of the dead band before showing", () => {
    expect(computeForceHidden(0.99, 1, 0.15, false)).toBe(true);
    expect(computeForceHidden(1.1, 1, 0.15, true)).toBe(true);
    expect(computeForceHidden(1.16, 1, 0.15, true)).toBe(false);
  });
});
