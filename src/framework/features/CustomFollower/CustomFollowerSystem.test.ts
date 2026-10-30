/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Quaternion, Vector3 } from "@iwsdk/core";
import { describe, expect, it } from "vitest";
import {
  calculatePanelOffsetMultiplier,
  computeHorizontalFacingDirection,
  computeOrientedHalfExtent,
  computeProductSideControlAnchor,
  computeViewerLeftDirection,
} from "./CustomFollowerSystem.js";

describe("calculatePanelOffsetMultiplier", () => {
  it("clamps the close-range gap to a positive minimum", () => {
    expect(calculatePanelOffsetMultiplier(0)).toBe(0.15);
    expect(calculatePanelOffsetMultiplier(1)).toBe(0.15);
  });

  it("smoothly expands the gap through the close-range interval", () => {
    expect(calculatePanelOffsetMultiplier(1.75)).toBeCloseTo(0.575);
  });

  it("clamps the gap to its full size at and beyond the threshold", () => {
    expect(calculatePanelOffsetMultiplier(2.5)).toBe(1);
    expect(calculatePanelOffsetMultiplier(10)).toBe(1);
  });
});

describe("computeProductSideControlAnchor", () => {
  it("yaw-billboards and ignores the camera's vertical delta", () => {
    const face = computeHorizontalFacingDirection(
      new Vector3(0, 4, 3),
      new Vector3(0, 0.5, 0),
    );

    expect(face.toArray()).toEqual([0, 0, 1]);
  });

  it("places the rail at viewer-left rather than viewer-front", () => {
    expect(computeViewerLeftDirection(new Vector3(0, 0, 1)).toArray()).toEqual([
      -1, 0, 0,
    ]);
  });

  it("centers a floor product rail on the selected side", () => {
    const center = new Vector3(1, 0.5, 2);
    const size = new Vector3(0.8, 1, 0.6);
    const face = new Vector3(0, 0, 1);

    const anchor = computeProductSideControlAnchor(
      center,
      size,
      new Quaternion(),
      new Vector3(-1, 0, 0),
      "horizontal",
      0.04,
      0.02,
      0.045,
      0.25,
    );

    expect(anchor.x).toBeCloseTo(0.415);
    expect(anchor.y).toBeCloseTo(0.5);
    expect(anchor.z).toBeCloseTo(2);
    expect(anchor.clone().sub(center).dot(face)).toBeCloseTo(0);

    const scaledAnchor = computeProductSideControlAnchor(
      center,
      size,
      new Quaternion(),
      new Vector3(-1, 0, 0),
      "horizontal",
      0.04,
      0.02,
      0.09,
      0.5,
    );
    expect(scaledAnchor.clone().sub(center).dot(face)).toBeCloseTo(0);
    expect(scaledAnchor.x).toBeLessThan(center.x);
  });

  it("keeps a floor rail above the supporting surface", () => {
    const anchor = computeProductSideControlAnchor(
      new Vector3(0, 0.1, 0),
      new Vector3(0.4, 0.2, 0.4),
      new Quaternion(),
      new Vector3(1, 0, 0),
      "horizontal",
      0.04,
      0.02,
      0.045,
      0.25,
    );

    expect(anchor.y).toBeCloseTo(0.27);
  });

  it("keeps a ceiling rail below the supporting surface", () => {
    const anchor = computeProductSideControlAnchor(
      new Vector3(0, 2.9, 0),
      new Vector3(0.4, 0.2, 0.4),
      new Quaternion(),
      new Vector3(1, 0, 0),
      "horizontal-inverted",
      0.04,
      0.02,
      0.045,
      0.25,
    );

    expect(anchor.y).toBeCloseTo(2.73);
  });

  it("uses the oriented product extent along the selected side", () => {
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 2,
    );

    expect(
      computeOrientedHalfExtent(
        new Vector3(2, 1, 0.5),
        rotation,
        new Vector3(0, 0, 1),
      ),
    ).toBeCloseTo(1);
  });

  it("keeps the floor-product cylinder radius unchanged across yaw", () => {
    const size = new Vector3(2, 1, 0.5);
    const side = new Vector3(-1, 0, 0);
    const yaw0 = computeProductSideControlAnchor(
      new Vector3(),
      size,
      new Quaternion(),
      side,
      "horizontal",
      0.04,
      0.02,
      0.045,
      0.25,
    );
    const yaw90 = computeProductSideControlAnchor(
      new Vector3(),
      size,
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      side,
      "horizontal",
      0.04,
      0.02,
      0.045,
      0.25,
    );

    expect(yaw0.toArray()).toEqual(yaw90.toArray());
    expect(yaw0.x).toBeCloseTo(-(Math.hypot(2, 0.5) / 2 + 0.085));
  });

  it("centers a wall-mounted rail vertically", () => {
    const anchor = computeProductSideControlAnchor(
      new Vector3(0, 1.4, 0),
      new Vector3(0.8, 0.6, 0.2),
      new Quaternion(),
      new Vector3(1, 0, 0),
      "vertical",
      0.04,
      0.02,
      0.045,
      0.05,
    );

    expect(anchor.y).toBe(1.4);
  });
});
