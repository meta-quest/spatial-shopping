/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Object3D, Vector3 } from "@iwsdk/core";
import { describe, expect, it, vi } from "vitest";
import { BoundingPlaneProjector } from "./BoundingBoxUtils.js";

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
    }),
  });
});

describe("BoundingPlaneProjector", () => {
  it("returns null when cached object bounds are unavailable", () => {
    expect(
      new BoundingPlaneProjector().compute(
        new Object3D(),
        new Vector3(0, 0, 5),
      ),
    ).toBeNull();
  });

  it("reuses its complete result graph across stationary frames", () => {
    const target = new Object3D();
    target.userData.bboxMin = new Vector3(-1, -1, -1);
    target.userData.bboxMax = new Vector3(1, 1, 1);
    const projector = new BoundingPlaneProjector();
    const camera = new Vector3(0, 0, 5);

    const first = projector.compute(target, camera)!;
    const firstCenter = first.center;
    const firstRotation = first.rotation;
    const second = projector.compute(target, camera)!;

    expect(second).toBe(first);
    expect(second.center).toBe(firstCenter);
    expect(second.rotation).toBe(firstRotation);
    expect(second.width).toBeCloseTo(2);
    expect(second.height).toBeCloseTo(2);
    expect(second.center.toArray()).toEqual([0, 0, 1]);
  });

  it("keeps a finite basis when the camera is directly above the target", () => {
    const target = new Object3D();
    target.userData.bboxMin = new Vector3(-1, -1, -1);
    target.userData.bboxMax = new Vector3(1, 1, 1);

    const result = new BoundingPlaneProjector().compute(
      target,
      new Vector3(0, 5, 0),
    )!;

    expect(result.center.toArray().every(Number.isFinite)).toBe(true);
    expect(result.right.toArray().every(Number.isFinite)).toBe(true);
    expect(result.up.toArray().every(Number.isFinite)).toBe(true);
    expect(result.rotation.toArray().every(Number.isFinite)).toBe(true);
  });
});
