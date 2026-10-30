/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Object3D, Quaternion, Vector3 } from "@iwsdk/core";

/** Shared interaction state and allocation-free XR direction helpers. */
export class RaycastUtils {
  public static WasRaycastConsumed = false;

  private static readonly direction = new Vector3();
  private static readonly rotation = new Quaternion();

  public static getHandRayDirection(
    hand: Object3D,
    target: Vector3 = this.direction,
  ): Vector3 {
    hand.getWorldQuaternion(this.rotation);
    return target.set(0, 0, -1).applyQuaternion(this.rotation).normalize();
  }
}
