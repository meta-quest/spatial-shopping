/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createComponent,
  createSystem,
  Types,
  Entity,
  Vector3,
  Quaternion,
} from "@iwsdk/core";
import {
  setWorldPosition,
  setWorldQuaternion,
} from "../../utils/UtilsWorldConversion.js";

/**
 * Component holding target position/rotation and flags for interpolation.
 */
export const InterpolationDestination = createComponent(
  "InterpolationDestination",
  {
    targetPosition: { type: Types.Vec3, default: [0, 0, 0] },
    targetRotation: { type: Types.Vec4, default: [0, 0, 0, 1] },
    InterpolationPosOn: { type: Types.Boolean, default: false },
    InterpolationRotOn: { type: Types.Boolean, default: false },
    forceImmediate: { type: Types.Boolean, default: false },
    positionSpeed: { type: Types.Float32, default: 0.1 },
    rotationSpeed: { type: Types.Float32, default: 0.1 },
  },
);

/**
 * System that interpolates entity position and rotation toward target values each frame.
 */
export class InterpolateSystem extends createSystem({
  interpolate: { required: [InterpolationDestination] },
}) {
  private readonly currentPosition = new Vector3();
  private readonly targetPosition = new Vector3();
  private readonly localPosition = new Vector3();
  private readonly currentRotation = new Quaternion();
  private readonly targetRotation = new Quaternion();
  private readonly localRotation = new Quaternion();

  /**
   * Performs position and rotation interpolation for each qualifying entity.
   * @param delta - Time since last frame in seconds.
   */
  override update(delta: number) {
    for (const entity of this.queries.interpolate.entities) {
      const positionEnabled = entity.getValue(
        InterpolationDestination,
        "InterpolationPosOn",
      );
      const rotationEnabled = entity.getValue(
        InterpolationDestination,
        "InterpolationRotOn",
      );
      if (!positionEnabled && !rotationEnabled) continue;

      const forceImmediate = entity.getValue(
        InterpolationDestination,
        "forceImmediate",
      );

      if (positionEnabled) {
        if (forceImmediate) {
          this.teleportPosition(entity);
        } else {
          this.interpolatePosition(entity, delta);
        }
      }

      if (rotationEnabled) {
        if (forceImmediate) {
          this.teleportRotation(entity);
        } else {
          this.interpolateRotation(entity, delta);
        }
      }

      if (positionEnabled) {
        entity.setValue(InterpolationDestination, "InterpolationPosOn", false);
      }
      if (rotationEnabled) {
        entity.setValue(InterpolationDestination, "InterpolationRotOn", false);
      }
      if (forceImmediate) {
        entity.setValue(InterpolationDestination, "forceImmediate", false);
      }
    }
  }

  /**
   * Lerps entity world position toward target.
   * @param entity - Entity to interpolate.
   * @param delta - Time since last frame in seconds.
   */
  /** Sets entity world position directly to target. */
  private teleportPosition(entity: Entity): void {
    const targetPosArray = entity.getVectorView(
      InterpolationDestination,
      "targetPosition",
    );
    this.targetPosition.fromArray(targetPosArray);
    setWorldPosition(entity.object3D!, this.targetPosition, this.localPosition);
  }

  /** Sets entity world rotation directly to target. */
  private teleportRotation(entity: Entity): void {
    const targetRotArray = entity.getVectorView(
      InterpolationDestination,
      "targetRotation",
    );
    this.targetRotation.fromArray(targetRotArray);
    setWorldQuaternion(
      entity.object3D!,
      this.targetRotation,
      this.localRotation,
    );
  }

  private interpolatePosition(entity: Entity, delta: number): void {
    const interpolationSpeed = entity.getValue(
      InterpolationDestination,
      "positionSpeed",
    );
    const targetPosArray = entity.getVectorView(
      InterpolationDestination,
      "targetPosition",
    );
    this.targetPosition.fromArray(targetPosArray);
    entity.object3D!.getWorldPosition(this.currentPosition);
    this.currentPosition.lerp(this.targetPosition, interpolationSpeed! * delta);
    setWorldPosition(
      entity.object3D!,
      this.currentPosition,
      this.localPosition,
    );
  }

  /**
   * Slerps entity world rotation toward target.
   * @param entity - Entity to interpolate.
   * @param delta - Time since last frame in seconds.
   */
  private interpolateRotation(entity: Entity, delta: number): void {
    const interpolationSpeed = entity.getValue(
      InterpolationDestination,
      "rotationSpeed",
    );
    const targetRotArray = entity.getVectorView(
      InterpolationDestination,
      "targetRotation",
    );
    this.targetRotation.fromArray(targetRotArray);
    entity.object3D!.getWorldQuaternion(this.currentRotation);
    this.currentRotation.slerp(
      this.targetRotation,
      interpolationSpeed! * delta,
    );
    setWorldQuaternion(
      entity.object3D!,
      this.currentRotation,
      this.localRotation,
    );
  }
}
