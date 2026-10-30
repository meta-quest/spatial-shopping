/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, UIKit, Vector3 } from "@iwsdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PointerDragWrapper } from "./PointerDragWrapper.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("PointerDragWrapper", () => {
  it("releases capture and clears a pending drag on pointer cancellation", () => {
    vi.useFakeTimers();
    const image = new Group() as unknown as UIKit.Image;
    vi.spyOn(image, "setPointerCapture").mockImplementation(() => {});
    vi.spyOn(image, "hasPointerCapture").mockReturnValue(true);
    const release = vi
      .spyOn(image, "releasePointerCapture")
      .mockImplementation(() => {});
    const onHoldComplete = vi.fn();
    const wrapper = new PointerDragWrapper(image, onHoldComplete);

    image.dispatchEvent({
      type: "pointerdown",
      pointerId: 7,
      point: new Vector3(),
    } as never);
    image.dispatchEvent({ type: "pointercancel", pointerId: 7 } as never);
    image.dispatchEvent({
      type: "pointermove",
      pointerId: 7,
      point: new Vector3(1, 0, 0),
      distance: 1,
    } as never);
    vi.advanceTimersByTime(200);

    expect(release).toHaveBeenCalledWith(7);
    expect(onHoldComplete).not.toHaveBeenCalled();
    wrapper.dispose();
  });
});
