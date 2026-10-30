/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Box3,
  Vector3,
  Matrix4,
  Object3D,
  Quaternion,
  Mesh,
} from "@iwsdk/core";
import { getWorldQuaternionFor } from "./UtilsWorldConversion.js";
import { MessageHandler } from "./MessageHandler.js";

/**
 * Interface for bounding box information computed from an Object3D
 */
export interface BoundingBoxInfo {
  localMin: Vector3;
  localMax: Vector3;
  localCenter: Vector3;
  localSize: Vector3;
  worldCenter: Vector3;
  worldScale: Vector3;
  worldSize: Vector3;
  worldQuaternion: Quaternion;
  localBbox: Box3;
}

/**
 * Computes comprehensive bounding box information for an Object3D,
 * using cached values from userData when available for performance.
 *
 * @param object3D - The Object3D to compute bounding box info for
 * @returns Object containing local and world space bounding box information
 */
export function getObjectBoundingBoxInfo(
  object3D: Object3D,
  target?: BoundingBoxInfo,
): BoundingBoxInfo {
  const cachedLocalMin = object3D.userData.bboxMin as Vector3 | undefined;
  const cachedLocalMax = object3D.userData.bboxMax as Vector3 | undefined;
  const cachedLocalSize = object3D.userData.bboxSize as Vector3 | undefined;

  const fallbackLocalBbox =
    !cachedLocalMin || !cachedLocalMax || !cachedLocalSize
      ? getBoundingBox(object3D, { useWorldSpace: false })
      : null;

  const info =
    target ??
    ({
      localMin: new Vector3(),
      localMax: new Vector3(),
      localCenter: new Vector3(),
      localSize: new Vector3(),
      worldCenter: new Vector3(),
      worldScale: new Vector3(),
      worldSize: new Vector3(),
      worldQuaternion: new Quaternion(),
      localBbox: new Box3(),
    } satisfies BoundingBoxInfo);

  info.localMin.copy(cachedLocalMin ?? fallbackLocalBbox!.min);
  info.localMax.copy(cachedLocalMax ?? fallbackLocalBbox!.max);
  info.localCenter.addVectors(info.localMin, info.localMax).multiplyScalar(0.5);
  if (cachedLocalSize) info.localSize.copy(cachedLocalSize);
  else fallbackLocalBbox!.getSize(info.localSize);

  info.worldCenter.copy(info.localCenter).applyMatrix4(object3D.matrixWorld);
  object3D.getWorldScale(info.worldScale);
  info.worldSize.copy(info.localSize).multiply(info.worldScale);
  getWorldQuaternionFor(object3D, info.worldQuaternion);
  info.localBbox.min.copy(info.localMin);
  info.localBbox.max.copy(info.localMax);
  return info;
}

/**
 * Calculates the bounding box of an object, with option to use local or world space.
 * Ensures world matrices are updated before calculation to account for all transforms.
 * @param object3D - The object to calculate bounding box for
 * @param options - Options for the calculation
 * @param options.useWorldSpace - If true (default), returns bbox in world space. If false, returns in local space.
 * @returns The bounding box in the requested coordinate space
 */
export function getBoundingBox(
  object3D: Object3D,
  options: { useWorldSpace?: boolean } = {},
): Box3 {
  const { useWorldSpace = true } = options;
  object3D.updateMatrixWorld(true);
  const bbox = new Box3().setFromObject(object3D);
  if (!useWorldSpace) {
    const inverseRoot = new Matrix4().copy(object3D.matrixWorld).invert();
    bbox.applyMatrix4(inverseRoot);
  }
  return bbox;
}

/**
 * Computes a compound bounding box from all meshes in an object hierarchy.
 * Ensures world matrices are updated for each mesh before calculation.
 * @param obj3D - The root object to traverse
 * @param options - Options for the calculation
 * @param options.useWorldSpace - If true (default), returns bbox in world space. If false, returns in local space.
 * @returns Box3 containing all meshes, or null if no valid meshes found
 */
export function computeCompoundBoundingBox(
  obj3D: Object3D,
  options: { useWorldSpace?: boolean } = {},
): Box3 | null {
  const { useWorldSpace = true } = options;
  const bbox = new Box3();
  let meshCount = 0;
  obj3D.updateMatrixWorld(true);
  const rootInverse = useWorldSpace
    ? null
    : new Matrix4().copy(obj3D.matrixWorld).invert();

  obj3D.traverse((child) => {
    if (
      child instanceof Mesh &&
      child.geometry &&
      child.geometry.attributes.position
    ) {
      try {
        child.updateMatrixWorld(true);
        const meshBox = new Box3().setFromObject(child);
        if (rootInverse) {
          meshBox.applyMatrix4(rootInverse);
        }
        bbox.union(meshBox);
        meshCount++;
      } catch (error) {
        MessageHandler.raiseWarning(
          `BoundingBoxUtils: Failed to compute bounding box for mesh: ${child.name} - ${error}`,
        );
      }
    }
  });

  if (meshCount === 0) {
    MessageHandler.raiseWarning(
      "BoundingBoxUtils: No meshes with geometry found in object hierarchy",
    );
    return null;
  }

  return bbox;
}

/**
 * Helper class for working with bounding boxes and calculating positions around them
 */
type BoundingCornerName = "frontLeft" | "frontRight" | "backRight" | "backLeft";

export class BoundingBoxHelper {
  private bbox: Box3 | null;
  private orientation: "horizontal" | "vertical";
  private corners: {
    frontLeft: Vector3;
    frontRight: Vector3;
    backRight: Vector3;
    backLeft: Vector3;
  };
  private cardinalPoints: {
    front: Vector3;
    right: Vector3;
    back: Vector3;
    left: Vector3;
  };
  private cornerNeighbors: Record<BoundingCornerName, [Vector3, Vector3]>;
  private readonly cornerEntries: Array<[BoundingCornerName, Vector3]>;
  private readonly closestCornerResult: {
    cornerName: BoundingCornerName;
    cornerPosition: Vector3;
    neighbors: [Vector3, Vector3];
  };
  private readonly namedCornerResult: {
    cornerPosition: Vector3;
    neighbors: [Vector3, Vector3];
  };
  private readonly allPointsResult: [Vector3[], Vector3[]];

  /**
   * @param bbox - The bounding box to work with
   * @param transformMatrix - Optional matrix to transform corners/cardinals to world space
   * @param orientation - 'horizontal' for floor/table, 'vertical' for wall placement
   */
  constructor(
    bbox: Box3,
    transformMatrix?: Matrix4,
    orientation: "horizontal" | "vertical" = "horizontal",
  ) {
    this.bbox = null;
    this.orientation = orientation;

    this.corners = {
      frontLeft: new Vector3(),
      frontRight: new Vector3(),
      backRight: new Vector3(),
      backLeft: new Vector3(),
    };

    this.cardinalPoints = {
      front: new Vector3(),
      right: new Vector3(),
      back: new Vector3(),
      left: new Vector3(),
    };

    this.cornerNeighbors = {
      frontLeft: [this.cardinalPoints.front, this.cardinalPoints.left],
      frontRight: [this.cardinalPoints.front, this.cardinalPoints.right],
      backRight: [this.cardinalPoints.right, this.cardinalPoints.back],
      backLeft: [this.cardinalPoints.left, this.cardinalPoints.back],
    };
    this.cornerEntries = [
      ["frontLeft", this.corners.frontLeft],
      ["frontRight", this.corners.frontRight],
      ["backRight", this.corners.backRight],
      ["backLeft", this.corners.backLeft],
    ];
    this.closestCornerResult = {
      cornerName: "frontLeft",
      cornerPosition: this.corners.frontLeft,
      neighbors: this.cornerNeighbors.frontLeft,
    };
    this.namedCornerResult = {
      cornerPosition: this.corners.frontLeft,
      neighbors: this.cornerNeighbors.frontLeft,
    };
    this.allPointsResult = [
      this.cornerEntries.map(([, point]) => point),
      [
        this.cardinalPoints.front,
        this.cardinalPoints.right,
        this.cardinalPoints.back,
        this.cardinalPoints.left,
      ],
    ];

    this.update(bbox, transformMatrix, orientation);
  }

  /** Recomputes positions while reusing the helper's vectors and lookup tables. */
  public update(
    bbox: Box3,
    transformMatrix?: Matrix4,
    orientation: "horizontal" | "vertical" = this.orientation,
  ): void {
    this.bbox = bbox;
    this.orientation = orientation;
    if (orientation === "vertical") {
      this.calculateVerticalPositions(transformMatrix);
    } else {
      this.calculateHorizontalPositions(transformMatrix);
    }
  }

  /**
   * Calculates the 4 corners at middle height and the 4 cardinal points (edge midpoints)
   * for horizontal placement (floor/table)
   * @param transformMatrix - Optional matrix to transform local space corners to world space
   */
  private calculateHorizontalPositions(transformMatrix?: Matrix4): void {
    const bboxMin = this.bbox!.min;
    const bboxMax = this.bbox!.max;
    const midY = (bboxMin.y + bboxMax.y) / 2;

    this.corners.frontLeft.set(bboxMin.x, midY, bboxMin.z);
    this.corners.frontRight.set(bboxMax.x, midY, bboxMin.z);
    this.corners.backRight.set(bboxMax.x, midY, bboxMax.z);
    this.corners.backLeft.set(bboxMin.x, midY, bboxMax.z);

    this.cardinalPoints.front.set((bboxMin.x + bboxMax.x) / 2, midY, bboxMin.z);
    this.cardinalPoints.right.set(bboxMax.x, midY, (bboxMin.z + bboxMax.z) / 2);
    this.cardinalPoints.back.set((bboxMin.x + bboxMax.x) / 2, midY, bboxMax.z);
    this.cardinalPoints.left.set(bboxMin.x, midY, (bboxMin.z + bboxMax.z) / 2);

    this.applyTransformToPoints(transformMatrix);
  }

  /** Applies transform matrix to corners and cardinal points when provided. */
  private applyTransformToPoints(transformMatrix?: Matrix4): void {
    if (!transformMatrix) return;
    this.corners.frontLeft.applyMatrix4(transformMatrix);
    this.corners.frontRight.applyMatrix4(transformMatrix);
    this.corners.backRight.applyMatrix4(transformMatrix);
    this.corners.backLeft.applyMatrix4(transformMatrix);
    this.cardinalPoints.front.applyMatrix4(transformMatrix);
    this.cardinalPoints.right.applyMatrix4(transformMatrix);
    this.cardinalPoints.back.applyMatrix4(transformMatrix);
    this.cardinalPoints.left.applyMatrix4(transformMatrix);
  }

  /**
   * Calculates the 4 corners at middle depth and the 4 cardinal points (edge midpoints)
   * for vertical placement (wall)
   * @param transformMatrix - Optional matrix to transform local space corners to world space
   */
  private calculateVerticalPositions(transformMatrix?: Matrix4): void {
    const bboxMin = this.bbox!.min;
    const bboxMax = this.bbox!.max;
    const midZ = (bboxMin.z + bboxMax.z) / 2;

    this.corners.frontLeft.set(bboxMin.x, bboxMax.y, midZ);
    this.corners.frontRight.set(bboxMax.x, bboxMax.y, midZ);
    this.corners.backRight.set(bboxMax.x, bboxMin.y, midZ);
    this.corners.backLeft.set(bboxMin.x, bboxMin.y, midZ);

    this.cardinalPoints.front.set((bboxMin.x + bboxMax.x) / 2, bboxMax.y, midZ);
    this.cardinalPoints.right.set(bboxMax.x, (bboxMin.y + bboxMax.y) / 2, midZ);
    this.cardinalPoints.back.set((bboxMin.x + bboxMax.x) / 2, bboxMin.y, midZ);
    this.cardinalPoints.left.set(bboxMin.x, (bboxMin.y + bboxMax.y) / 2, midZ);

    this.applyTransformToPoints(transformMatrix);
  }

  /**
   * Gets the 4 corners at middle height
   */
  public getCorners() {
    return this.corners;
  }

  /**
   * Gets the 4 cardinal points (edge midpoints)
   */
  public getCardinalPoints() {
    return this.cardinalPoints;
  }

  /**
   * Finds the closest corner to a given position and returns it with its neighboring cardinal points
   * @param position - The position to check against (typically camera position)
   * @returns Object containing the closest corner name, its position, and its two neighboring cardinal points
   */
  public getClosestCornerWithNeighbors(position: Vector3): {
    cornerName: BoundingCornerName;
    cornerPosition: Vector3;
    neighbors: [Vector3, Vector3];
  } {
    let closestCornerName: BoundingCornerName = "frontLeft";
    let minDistance = Infinity;

    for (const [cornerName, cornerPosition] of this.cornerEntries) {
      const distance = position.distanceToSquared(cornerPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestCornerName = cornerName;
      }
    }

    this.closestCornerResult.cornerName = closestCornerName;
    this.closestCornerResult.cornerPosition = this.corners[closestCornerName];
    this.closestCornerResult.neighbors =
      this.cornerNeighbors[closestCornerName];
    return this.closestCornerResult;
  }

  /**
   * Returns corner position and neighbors for a specific corner by name.
   */
  public getCornerWithNeighborsByName(cornerName: BoundingCornerName): {
    cornerPosition: Vector3;
    neighbors: [Vector3, Vector3];
  } {
    this.namedCornerResult.cornerPosition = this.corners[cornerName];
    this.namedCornerResult.neighbors = this.cornerNeighbors[cornerName];
    return this.namedCornerResult;
  }

  /**
   * Returns all corners and all cardinal points as arrays
   * @returns Tuple with [corners array, cardinals array]
   * Corners order: [frontLeft, frontRight, backRight, backLeft]
   * Cardinals order: [front, right, back, left]
   */
  public getAllCornersAndCardinals(): [Vector3[], Vector3[]] {
    return this.allPointsResult;
  }
}

/**
 * Interface for bounding plane data computed from a target object's bounding plane
 */
export interface BoundingPlaneData {
  center: Vector3;
  width: number;
  height: number;
  right: Vector3;
  up: Vector3;
  normal: Vector3;
  origin: Vector3;
  rotation: Quaternion;
}

/**
 * Gets the index of the closest corner to the camera position.
 * @param corners - Array of corner positions in world space
 * @param cameraPosition - Camera position in world space
 * @returns Index of the closest corner
 */
function getClosestCornerIndex(
  corners: Vector3[],
  cameraPosition: Vector3,
): number {
  let closestIdx = 0;
  let closestDistanceSq = corners[0].distanceToSquared(cameraPosition);

  for (let i = 1; i < corners.length; i++) {
    const distanceSq = corners[i].distanceToSquared(cameraPosition);
    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestIdx = i;
    }
  }

  return closestIdx;
}

/**
 * Computes the bounding plane data for the target object.
 * The plane represents the bounding plane of the object as seen from the camera position.
 * @param target - The target Object3D with bounding box data
 * @param cameraPosition - The camera/observer position in world space
 * @returns Plane data or null if bounding box is unavailable
 */
export class BoundingPlaneProjector {
  private readonly targetPosition = new Vector3();
  private readonly userForward = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);
  private readonly userRight = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly toPlane = new Vector3();
  private readonly projectedPoint = new Vector3();
  private readonly relativePoint = new Vector3();
  private readonly rotationMatrix = new Matrix4();
  private readonly localX = new Float64Array(8);
  private readonly localY = new Float64Array(8);
  private readonly worldCorners: Vector3[] = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ];
  private readonly result: BoundingPlaneData = {
    center: new Vector3(),
    width: 0,
    height: 0,
    right: new Vector3(),
    up: new Vector3(),
    normal: new Vector3(),
    origin: new Vector3(),
    rotation: new Quaternion(),
  };

  public compute(
    target: Object3D,
    cameraPosition: Vector3,
  ): BoundingPlaneData | null {
    const bboxMin = target.userData.bboxMin as Vector3 | undefined;
    const bboxMax = target.userData.bboxMax as Vector3 | undefined;
    if (!bboxMin || !bboxMax) return null;

    target.updateWorldMatrix(true, false);
    this.targetPosition.setFromMatrixPosition(target.matrixWorld);
    this.userForward
      .subVectors(this.targetPosition, cameraPosition)
      .normalize();
    this.userRight.crossVectors(this.worldUp, this.userForward);
    if (this.userRight.lengthSq() < 1e-8) this.userRight.set(1, 0, 0);
    else this.userRight.normalize();

    const corners = this.worldCorners;
    corners[0].set(bboxMin.x, bboxMin.y, bboxMin.z);
    corners[1].set(bboxMax.x, bboxMin.y, bboxMin.z);
    corners[2].set(bboxMin.x, bboxMax.y, bboxMin.z);
    corners[3].set(bboxMax.x, bboxMax.y, bboxMin.z);
    corners[4].set(bboxMin.x, bboxMin.y, bboxMax.z);
    corners[5].set(bboxMax.x, bboxMin.y, bboxMax.z);
    corners[6].set(bboxMin.x, bboxMax.y, bboxMax.z);
    corners[7].set(bboxMax.x, bboxMax.y, bboxMax.z);
    for (let i = 0; i < corners.length; i++) {
      corners[i].applyMatrix4(target.matrixWorld);
    }

    const result = this.result;
    result.normal.subVectors(cameraPosition, this.targetPosition).normalize();
    result.up.crossVectors(this.userRight, result.normal).normalize();
    result.right.crossVectors(result.up, result.normal).normalize();
    result.origin.copy(corners[getClosestCornerIndex(corners, cameraPosition)]);

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      this.rayDirection.subVectors(cameraPosition, corner).normalize();
      this.toPlane.subVectors(result.origin, corner);
      const denominator = this.rayDirection.dot(result.normal);

      this.projectedPoint.copy(corner);
      if (Math.abs(denominator) < 0.0001) {
        this.projectedPoint.addScaledVector(
          result.normal,
          this.toPlane.dot(result.normal),
        );
      } else {
        this.projectedPoint.addScaledVector(
          this.rayDirection,
          this.toPlane.dot(result.normal) / denominator,
        );
      }

      this.relativePoint.subVectors(this.projectedPoint, result.origin);
      this.localX[i] = this.relativePoint.dot(result.right);
      this.localY[i] = this.relativePoint.dot(result.up);
    }

    let minX = this.localX[0];
    let maxX = minX;
    let minY = this.localY[0];
    let maxY = minY;
    for (let i = 1; i < corners.length; i++) {
      minX = Math.min(minX, this.localX[i]);
      maxX = Math.max(maxX, this.localX[i]);
      minY = Math.min(minY, this.localY[i]);
      maxY = Math.max(maxY, this.localY[i]);
    }

    result.width = maxX - minX;
    result.height = maxY - minY;
    result.center
      .copy(result.origin)
      .addScaledVector(result.right, (minX + maxX) * 0.5)
      .addScaledVector(result.up, (minY + maxY) * 0.5);
    this.rotationMatrix.makeBasis(result.right, result.up, result.normal);
    result.rotation.setFromRotationMatrix(this.rotationMatrix);
    return result;
  }
}
