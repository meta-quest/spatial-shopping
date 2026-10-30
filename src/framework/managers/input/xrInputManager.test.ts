/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { World } from "@iwsdk/core";
import { describe, expect, it } from "vitest";
import { XrInputManager, Hand } from "./xrInputManager.js";

describe("XrInputManager", () => {
  it("treats XR input as idle while the XR manager is unavailable", () => {
    const manager = new XrInputManager();
    manager.world = {
      input: { xr: undefined },
      player: { raySpaces: { left: undefined, right: undefined } },
    } as unknown as World;

    expect(manager.leftStatefulGamepad).toBeUndefined();
    expect(manager.rightStatefulGamepad).toBeUndefined();
    expect(manager.isPinchThisFrame(Hand.Left)).toBe(false);
    expect(manager.isAnyHandPinching()).toBe(false);
    expect(manager.getPinchingRayspace).toBeUndefined();
  });
});
