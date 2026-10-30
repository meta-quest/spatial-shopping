/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { XRSessionErrorCode } from "../managers/session/ErrorCodes.js";

/** Utility class for classifying and categorizing XR and asset errors. */
export class ErrorUtil {
  /** Delay before checking plane detection after room capture (ms). */
  static readonly ROOM_CAPTURE_PLANE_DETECTION_DELAY_MS = 500;

  /** Returns whether the given error indicates a permission denial. */
  static isPermissionError(error: Error): boolean {
    if (!error) return false;

    return (
      error.message?.toLowerCase().includes("denied") ||
      error.message?.toLowerCase().includes("permission") ||
      (error.name === "NotSupportedError" &&
        error.message?.toLowerCase().includes("denied")) ||
      error.name === "SecurityError" ||
      error.name === "NotAllowedError"
    );
  }

  /** Maps an XR error to either a permission-denied or unsupported error code. */
  static classifyXRError(error: Error): XRSessionErrorCode {
    return this.isPermissionError(error)
      ? XRSessionErrorCode.XR_PERMISSION_DENIED
      : XRSessionErrorCode.XR_UNSUPPORTED;
  }

  /** Returns whether the given error indicates the user cancelled room capture. */
  static isRoomCaptureCancellation(error: Error): boolean {
    if (!error) return false;

    return (
      error.message?.toLowerCase().includes("cancel") ||
      error.message?.toLowerCase().includes("abort") ||
      error.name === "AbortError"
    );
  }

  /** Maps an asset-loading error to either a fetch-failed or parse-failed error code. */
  static classifyAssetError(error: Error): XRSessionErrorCode {
    const msg = error.message ?? "";
    const isFetchError =
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("404") ||
      error.name === "TypeError" ||
      error.name === "NetworkError";

    return isFetchError
      ? XRSessionErrorCode.ASSET_FETCH_FAILED
      : XRSessionErrorCode.ASSET_PARSE_FAILED;
  }
}
