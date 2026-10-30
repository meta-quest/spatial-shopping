/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Tween } from "@tweenjs/tween.js";
import { describe, expect, it } from "vitest";
import { ManagedTweenGroup } from "./ManagedTweenGroup.js";

describe("ManagedTweenGroup", () => {
  it("tracks active tweens and removes completed or canceled work", () => {
    const group = new ManagedTweenGroup();
    expect(group.hasActiveTweens).toBe(false);
    group.updateActive(0);

    new Tween({ value: 0 }, group).to({ value: 1 }, 100).start(0);
    expect(group.hasActiveTweens).toBe(true);
    group.updateActive(100);
    expect(group.hasActiveTweens).toBe(false);

    const canceled = new Tween({ value: 0 }, group)
      .to({ value: 1 }, 100)
      .start(0);
    canceled.stop().remove();
    expect(group.hasActiveTweens).toBe(false);
  });
});
