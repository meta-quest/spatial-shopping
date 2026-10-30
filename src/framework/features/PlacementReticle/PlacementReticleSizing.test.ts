/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";
import { PreferredOrientation } from "../../utils/PlacementUtils.js";
import { calculatePlacementReticleRadius } from "./PlacementReticleSizing.js";

const config = {
  minimumRadius: 0.4,
  maximumRadius: 1.5,
  fallbackRadius: 1,
  fadeDistance: 0.3,
};

describe("calculatePlacementReticleRadius", () => {
  it("sizes floor fields from the X/Z footprint rather than model height", () => {
    const plantRadius = calculatePlacementReticleRadius(
      { x: 0.3, y: 2, z: 0.32 },
      { x: 1, y: 1, z: 1 },
      PreferredOrientation.horizontal,
      config,
    );
    const chairRadius = calculatePlacementReticleRadius(
      { x: 0.78, y: 0.76, z: 0.76 },
      { x: 1, y: 1, z: 1 },
      PreferredOrientation.horizontal,
      config,
    );

    expect(plantRadius).toBeCloseTo(0.519, 3);
    expect(chairRadius).toBeCloseTo(0.845, 3);
    expect(plantRadius).toBeLessThan(chairRadius);
  });

  it("uses the X/Y footprint for wall-oriented models", () => {
    expect(
      calculatePlacementReticleRadius(
        { x: 0.6, y: 0.8, z: 3 },
        { x: 1, y: 1, z: 1 },
        PreferredOrientation.vertical,
        config,
      ),
    ).toBeCloseTo(0.8);
  });

  it("accounts for live non-uniform model scale", () => {
    expect(
      calculatePlacementReticleRadius(
        { x: 0.3, y: 1, z: 0.4 },
        { x: 2, y: 1, z: 0.5 },
        PreferredOrientation.horizontal,
        config,
      ),
    ).toBeCloseTo(0.616, 3);
  });

  it("clamps unusually small and large footprints", () => {
    expect(
      calculatePlacementReticleRadius(
        { x: 0.01, y: 0.01, z: 0.01 },
        { x: 1, y: 1, z: 1 },
        PreferredOrientation.horizontal,
        config,
      ),
    ).toBe(config.minimumRadius);
    expect(
      calculatePlacementReticleRadius(
        { x: 10, y: 10, z: 10 },
        { x: 1, y: 1, z: 1 },
        PreferredOrientation.horizontal,
        config,
      ),
    ).toBe(config.maximumRadius);
  });

  it("uses the configured fallback for missing or invalid bounds", () => {
    const scale = { x: 1, y: 1, z: 1 };
    expect(
      calculatePlacementReticleRadius(
        undefined,
        scale,
        PreferredOrientation.horizontal,
        config,
      ),
    ).toBe(config.fallbackRadius);
    expect(
      calculatePlacementReticleRadius(
        { x: Number.NaN, y: 1, z: 1 },
        scale,
        PreferredOrientation.horizontal,
        config,
      ),
    ).toBe(config.fallbackRadius);
  });
});
