/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Detects if the app is running on a real Quest device vs IWER emulator.
 *
 * @returns true if running on a real Quest device with native WebXR support
 */
export function isRealQuestDevice(): boolean {
  const xrConstructor = navigator.xr?.constructor?.name ?? "";
  const isQuestBrowser = /OculusBrowser/i.test(navigator.userAgent);
  return isQuestBrowser && xrConstructor === "XRSystem";
}
