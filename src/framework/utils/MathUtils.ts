/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3, Quaternion, Matrix4 } from "@iwsdk/core";
import { Object3D } from "@iwsdk/core";
import { MessageHandler } from "./MessageHandler";

const WORLD_UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const angleCross = new Vector3();
const projectionScratch = new Vector3();
const rayPlaneOffset = new Vector3();
const copyWorldPositionScratch = new Vector3();
const copyWorldQuaternionScratch = new Quaternion();
const copyWorldScaleScratch = new Vector3();
const copyParentInverseScratch = new Matrix4();
const copyParentQuaternionScratch = new Quaternion();
const copyParentScaleScratch = new Vector3();
const faceObjectPositionScratch = new Vector3();
const faceRelativeDirectionScratch = new Vector3();
const faceProjectedDirectionScratch = new Vector3();
const faceAxisScratch = new Vector3();
const faceRotationScratch = new Quaternion();

/**
 * Converts an axis string to a unit Vector3 pointing along that axis
 * @param axis - The axis to convert ("x", "y", or "z")
 * @returns A new Vector3 with value 1 on the specified axis and 0 on others
 *
 * @example
 * getAxisVector("x") // Returns Vector3(1, 0, 0)
 * getAxisVector("y") // Returns Vector3(0, 1, 0)
 * getAxisVector("z") // Returns Vector3(0, 0, 1)
 */
export function getAxisVector(
  axis: "x" | "y" | "z",
  target = new Vector3(),
): Vector3 {
  const vector = target.set(0, 0, 0);
  switch (axis) {
    case "x":
      vector.set(1, 0, 0);
      break;
    case "y":
      vector.set(0, 1, 0);
      break;
    case "z":
      vector.set(0, 0, 1);
      break;
  }
  return vector;
}

/**
 * Calculates a scale factor based on distance, with optional min/max distance and scale values
 * @param distance - The distance to calculate the scale for
 * @param options - The options for the calculation
 * @param options.minDistance - The minimum distance to use for the calculation
 * @param options.maxDistance - The maximum distance to use for the calculation
 * @param options.minScale - The minimum scale to use for the calculation
 * @param options.maxScale - The maximum scale to use for the calculation
 * @returns The scale factor based on the distance
 */
export function calculateDistanceBasedScale(
  distance: number,
  options: {
    minDistance?: number;
    maxDistance?: number;
    minScale?: number;
    maxScale?: number;
  } = {},
): number {
  if (distance < 0) {
    MessageHandler.raiseWarning(
      "calculateDistanceBasedScale: distance cannot be negative, using minDistance",
    );
    distance = options.minDistance || 0.5;
  }
  const {
    minDistance = 0.5,
    maxDistance = 5.0,
    minScale = 0.3,
    maxScale = 1.5,
  } = options;

  if (maxDistance <= minDistance) {
    MessageHandler.raiseWarning(
      "calculateDistanceBasedScale: maxDistance must be greater than minDistance",
    );
    return minScale;
  }

  const clampedDistance = Math.max(
    minDistance,
    Math.min(maxDistance, distance),
  );
  const t = (clampedDistance - minDistance) / (maxDistance - minDistance);
  return minScale + (maxScale - minScale) * t;
}

/**
 * Projects a vector onto a plane defined by its normal vector.
 * This removes the component of the vector that's perpendicular to the plane,
 * leaving only the component that lies on the plane.
 *
 * @param vector - The vector to project
 * @param planeNormal - The normal vector of the plane (should be normalized)
 * @returns A new Vector3 representing the projection of the vector onto the plane
 *
 * @example
 * // Project a diagonal vector onto the XZ plane (floor)
 * const vec = new Vector3(1, 1, 1);
 * const floorNormal = new Vector3(0, 1, 0);
 * const projected = projectVectorOntoPlane(vec, floorNormal);
 * // Result: (1, 0, 1)
 */
export function projectVectorOntoPlane(
  vector: Vector3,
  planeNormal: Vector3,
  target: Vector3 = projectionScratch,
): Vector3 {
  const normalComponent = vector.dot(planeNormal);
  return target.copy(vector).addScaledVector(planeNormal, -normalComponent);
}

/**
 * Intersects a ray with a plane defined by a point and normal.
 * @param rayOrigin - Origin of the ray
 * @param rayDir - Direction of the ray (will be normalized)
 * @param planePoint - A point on the plane
 * @param planeNormal - Normal of the plane (will be normalized)
 * @param target - Optional Vector3 to write the intersection point into
 * @returns The intersection point, or null if the ray is parallel to the plane or points away
 */
export function rayPlaneIntersection(
  rayOrigin: Vector3,
  rayDir: Vector3,
  planePoint: Vector3,
  planeNormal: Vector3,
  target?: Vector3,
  offsetScratch: Vector3 = rayPlaneOffset,
): Vector3 | null {
  const result = target ?? new Vector3();
  const denominator = planeNormal.dot(rayDir);
  if (Math.abs(denominator) < 1e-8) return null;
  const distance = offsetScratch
    .subVectors(planePoint, rayOrigin)
    .dot(planeNormal);
  const amount = distance / denominator;
  if (amount < 0) return null;
  return result.copy(rayDir).multiplyScalar(amount).add(rayOrigin);
}

/**
 * Computes the signed angle between two normalized vectors.
 * @param vecA - The first vector. Must be normalized.
 * @param vecB - The second vector. Must be normalized.
 * @param referenceAxis - Axis used to determine sign of angle (default: (0, 1, 0))
 * @returns The angle between the two vectors in radians
 */
export function computeAngleBetweenVectors(
  vecA: Vector3,
  vecB: Vector3,
  referenceAxis: Vector3 = WORLD_UP,
  crossProduct = angleCross,
): number {
  const dotProduct = vecA.dot(vecB);
  const clampedDot = Math.max(-1, Math.min(1, dotProduct));
  const angle = Math.acos(clampedDot);

  crossProduct.crossVectors(vecA, vecB);
  const sign = Math.sign(crossProduct.dot(referenceAxis));
  return angle * sign;
}

/**
 * Computes a position relative to a camera.
 * @param camera - The camera to compute the position relative to
 * @param offset - The offset to apply to the camera position
 * @param forceEyesLevel - If true, flattens offset to horizontal plane and normalizes
 * @returns The computed position
 */
export function computePlacementRelativeToCamera(
  camera: Object3D,
  offset: Vector3,
  forceEyesLevel: boolean = false,
): Vector3 {
  const cameraWorldQuaternion = new Quaternion();
  camera.getWorldQuaternion(cameraWorldQuaternion);
  const cameraWorldPosition = new Vector3();
  camera.getWorldPosition(cameraWorldPosition);
  const offsetVector = offset.clone().applyQuaternion(cameraWorldQuaternion);
  if (forceEyesLevel) {
    offsetVector.y = 0;
    offsetVector.normalize();
  }
  const newPosition = cameraWorldPosition.clone().add(offsetVector);
  return newPosition;
}

/**
 * Copies the world transform from source to destination
 * @param destination - The Object3D to copy to
 * @param source - The Object3D to copy from
 */
export function copyWorldTransform(destination: Object3D, source: Object3D) {
  source.getWorldPosition(copyWorldPositionScratch);
  source.getWorldQuaternion(copyWorldQuaternionScratch);
  source.getWorldScale(copyWorldScaleScratch);

  if (destination.parent) {
    copyParentInverseScratch.copy(destination.parent.matrixWorld).invert();
    destination.position
      .copy(copyWorldPositionScratch)
      .applyMatrix4(copyParentInverseScratch);

    destination.parent.getWorldQuaternion(copyParentQuaternionScratch);
    destination.quaternion
      .copy(copyWorldQuaternionScratch)
      .premultiply(copyParentQuaternionScratch.invert());

    destination.parent.getWorldScale(copyParentScaleScratch);
    destination.scale.set(
      copyWorldScaleScratch.x / copyParentScaleScratch.x,
      copyWorldScaleScratch.y / copyParentScaleScratch.y,
      copyWorldScaleScratch.z / copyParentScaleScratch.z,
    );
  } else {
    destination.position.copy(copyWorldPositionScratch);
    destination.quaternion.copy(copyWorldQuaternionScratch);
    destination.scale.copy(copyWorldScaleScratch);
  }
}

/**
 * Rotates an object to face a target position, optionally restricting rotation around a specific axis
 * @param object - The Object3D to rotate
 * @param targetPosition - The world position to face
 * @param restrictedAxis - Optional axis to restrict rotation around ("x", "y", or "z")
 */
export function faceTarget(
  object: Object3D,
  targetPosition: Vector3,
  restrictedAxis?: "x" | "y" | "z",
) {
  object.getWorldPosition(faceObjectPositionScratch);
  faceRelativeDirectionScratch.subVectors(
    targetPosition,
    faceObjectPositionScratch,
  );

  if (faceRelativeDirectionScratch.lengthSq() < 0.0001) {
    return;
  }

  faceRelativeDirectionScratch.normalize();

  switch (restrictedAxis) {
    case "x":
      faceProjectedDirectionScratch
        .copy(faceRelativeDirectionScratch)
        .projectOnPlane(getAxisVector("x", faceAxisScratch));
      if (faceProjectedDirectionScratch.lengthSq() < 0.0001) return;
      faceProjectedDirectionScratch.normalize();
      break;
    case "y":
      faceProjectedDirectionScratch
        .copy(faceRelativeDirectionScratch)
        .projectOnPlane(getAxisVector("y", faceAxisScratch));
      if (faceProjectedDirectionScratch.lengthSq() < 0.0001) return;
      faceProjectedDirectionScratch.normalize();
      break;
    case "z":
      faceProjectedDirectionScratch
        .copy(faceRelativeDirectionScratch)
        .projectOnPlane(getAxisVector("z", faceAxisScratch));
      if (faceProjectedDirectionScratch.lengthSq() < 0.0001) return;
      faceProjectedDirectionScratch.normalize();
      break;
    default:
      faceProjectedDirectionScratch.copy(faceRelativeDirectionScratch);
      break;
  }

  faceRotationScratch.setFromUnitVectors(
    FORWARD,
    faceProjectedDirectionScratch,
  );
  object.quaternion.copy(faceRotationScratch);
}

/**
 * Remaps a Z euler angle (in degrees) to snap to common orientations
 * @param zAngleDegrees - The Z euler angle in degrees
 * @returns The remapped angle snapped to 0°, ±90°, or 180° if within threshold, otherwise the original angle
 *
 * @example
 * remapZEulerAngle(5)    // Returns 0
 * remapZEulerAngle(85)   // Returns 90
 * remapZEulerAngle(-95)  // Returns -90
 * remapZEulerAngle(170)  // Returns 180
 * remapZEulerAngle(45)   // Returns 45 (no snapping)
 */
export function remapZEulerAngle(zAngleDegrees: number): number {
  if (zAngleDegrees < -165 || zAngleDegrees > 165) {
    return 180;
  }
  if (zAngleDegrees >= 75 && zAngleDegrees <= 105) {
    return 90;
  }
  if (zAngleDegrees >= -15 && zAngleDegrees <= 15) {
    return 0;
  }
  if (zAngleDegrees >= -105 && zAngleDegrees <= -75) {
    return -90;
  }
  return zAngleDegrees;
}
