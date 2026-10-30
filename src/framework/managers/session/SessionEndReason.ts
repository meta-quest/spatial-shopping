/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** Reason for ending an XR session. */
export enum SessionEndReason {
  /** User manually exited the XR experience. */
  UserExit = "user_exit",
  /** System-initiated exit (e.g., restart, dispose). */
  SystemExit = "system_exit",
  /** Session ended due to an error. */
  Error = "error",
  /** User chose to proceed to checkout. */
  ProceedToCart = "proceed_to_cart",
}
