/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";

import {
  isPlaneAllowedForPlacement,
  PreferredOrientation,
} from "./PlacementUtils";

describe("isPlaneAllowedForPlacement", () => {
  it.each([
    ["floor", PreferredOrientation.horizontal, true],
    ["floor", PreferredOrientation.vertical, false],
    ["wall", PreferredOrientation.vertical, true],
    ["wall", PreferredOrientation.horizontal, false],
    ["ceiling", PreferredOrientation.horizontalInverted, true],
    ["ceiling", PreferredOrientation.horizontal, false],
  ])(
    "handles the %s semantic surface with %s orientation",
    (surfaceLabel, orientation, expected) => {
      expect(isPlaneAllowedForPlacement(orientation, surfaceLabel)).toBe(
        expected,
      );
    },
  );

  it.each([undefined, "unrecognized-surface"])(
    "uses the permissive fallback for %s labels",
    (surfaceLabel) => {
      expect(
        isPlaneAllowedForPlacement(
          PreferredOrientation.horizontal,
          surfaceLabel,
        ),
      ).toBe(true);
      expect(
        isPlaneAllowedForPlacement(PreferredOrientation.vertical, surfaceLabel),
      ).toBe(true);
      expect(
        isPlaneAllowedForPlacement(
          PreferredOrientation.horizontalInverted,
          surfaceLabel,
        ),
      ).toBe(true);
    },
  );

  it.each([
    [undefined, "floor"],
    ["", "floor"],
    ["diagonal", "floor"],
  ])("rejects invalid orientation %s", (orientation, surfaceLabel) => {
    expect(isPlaneAllowedForPlacement(orientation, surfaceLabel)).toBe(false);
  });
});
