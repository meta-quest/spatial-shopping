/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";

import { XRSessionErrorCode } from "../managers/session/ErrorCodes";
import { ErrorUtil } from "./ErrorUtil";

describe("ErrorUtil.classifyXRError", () => {
  it("maps permission failures to XR_PERMISSION_DENIED", () => {
    expect(
      ErrorUtil.classifyXRError(new DOMException("no", "NotAllowedError")),
    ).toBe(XRSessionErrorCode.XR_PERMISSION_DENIED);
  });

  it("maps a denial message to XR_PERMISSION_DENIED", () => {
    expect(
      ErrorUtil.classifyXRError(new Error("User denied the session")),
    ).toBe(XRSessionErrorCode.XR_PERMISSION_DENIED);
  });

  it("maps other launch failures to XR_UNSUPPORTED", () => {
    expect(
      ErrorUtil.classifyXRError(new DOMException("no", "NotSupportedError")),
    ).toBe(XRSessionErrorCode.XR_UNSUPPORTED);
  });
});
