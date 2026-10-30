/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3, Quaternion, Object3D } from "@iwsdk/core";
import { CONFIG } from "../../config/ViewerConfig";

/**
 * Tracks per-frame hand movement and converts it into incremental rotation
 * around a given axis. Each frame, the displacement since the *previous* frame
 * is projected onto the hand's current right and up directions so that
 * mid-drag changes in hand orientation are handled smoothly.
 */
export class PinchRotationTracker {
  public readonly previousPosition = new Vector3();
  public readonly rotationAxis = new Vector3(0, 1, 0);
  public sensitivityMultiplier: number;
  private readonly rightDirection = new Vector3();
  private readonly upDirection = new Vector3();
  private readonly forwardDirection = new Vector3();
  private readonly displacement = new Vector3();
  private readonly deltaRotation = new Quaternion();
  private readonly resultRotation = new Quaternion();

  /**
   * @param initialPosition - World position of the pinching rayspace at press start
   * @param rotationAxis - World-space axis to rotate around
   */
  constructor(initialPosition?: Vector3, rotationAxis?: Vector3) {
    if (initialPosition && rotationAxis) {
      this.reset(initialPosition, rotationAxis);
    }
    this.sensitivityMultiplier =
      CONFIG.interaction.arrows.rotationDragSensitivityFloor;
  }

  public reset(initialPosition: Vector3, rotationAxis: Vector3): void {
    this.previousPosition.copy(initialPosition);
    this.rotationAxis.copy(rotationAxis).normalize();
  }

  /**
   * Call once per frame while the rotation arrow is held.
   * @param currentPosition - Current world position of the pinching rayspace
   * @param rayspace - The pinching rayspace Object3D (used to extract current basis)
   * @param objectQuaternion - Current world quaternion of the placed object
   * @returns New world quaternion to apply to the placed object
   */
  computeIncrementalRotation(
    currentPosition: Vector3,
    rayspace: Object3D,
    objectQuaternion: Quaternion,
  ): Quaternion {
    rayspace.matrixWorld.extractBasis(
      this.rightDirection,
      this.upDirection,
      this.forwardDirection,
    );

    const distanceAlongRight =
      this.displacement
        .subVectors(currentPosition, this.previousPosition)
        .dot(this.rightDirection) * this.sensitivityMultiplier;

    this.previousPosition.copy(currentPosition);

    const rotationAngle = distanceAlongRight;
    this.deltaRotation.setFromAxisAngle(this.rotationAxis, rotationAngle);
    return this.resultRotation
      .copy(objectQuaternion)
      .premultiply(this.deltaRotation);
  }

  /** Replaces the rotation axis (e.g. if the object's basis changes). */
  setRotationAxis(axis: Vector3): void {
    this.rotationAxis.copy(axis).normalize();
  }
}
