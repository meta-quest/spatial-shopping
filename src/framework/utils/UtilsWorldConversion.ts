/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Object3D, Vector3, Quaternion } from "@iwsdk/core";

/**
 * Get the world quaternion for an Object3D
 * @param obj3D The Object3D to get the world quaternion from
 * @returns A new Quaternion containing the world quaternion
 */
export function getWorldQuaternionFor(
  obj3D: Object3D,
  worldQuaternion = new Quaternion(),
): Quaternion {
  obj3D.getWorldQuaternion(worldQuaternion);
  return worldQuaternion;
}

/**
 * Convert world quaternion to local quaternion (when object has a parent)
 * localQuat = parentWorldQuat^-1 * worldQuat
 * @param obj3D The Object3D to set the quaternion on
 * @param worldQuaternion The world quaternion to set
 */
export function setWorldQuaternion(
  obj3D: Object3D,
  worldQuaternion: Quaternion,
  localQuaternion = new Quaternion(),
): void {
  if (obj3D.parent) {
    getWorldQuaternionFor(obj3D.parent, localQuaternion)
      .invert()
      .multiply(worldQuaternion);
    obj3D.quaternion.copy(localQuaternion);
  } else {
    obj3D.quaternion.copy(worldQuaternion);
  }
}

/**
 * Set world position on an Object3D, converting to local space if it has a parent
 * @param obj3D The Object3D to set the position on
 * @param worldPosition The world position to set
 */
export function setWorldPosition(
  obj3D: Object3D,
  worldPosition: Vector3,
  localPosition = new Vector3(),
): void {
  if (obj3D.parent) {
    localPosition.copy(worldPosition);
    obj3D.parent.worldToLocal(localPosition);
    obj3D.position.copy(localPosition);
  } else {
    obj3D.position.copy(worldPosition);
  }
}
