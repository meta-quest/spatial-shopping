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
  Object3D,
  Vector3,
  Quaternion,
  Entity,
  Matrix4,
  Box3,
} from "@iwsdk/core";
import { setWorldPosition } from "../../utils/UtilsWorldConversion.js";
import {
  copyWorldTransform,
  faceTarget as faceTargetUtil,
} from "../../utils/MathUtils.js";
import {
  BoundingPlaneData,
  BoundingPlaneProjector,
  getObjectBoundingBoxInfo,
  type BoundingBoxInfo,
} from "../../utils/BoundingBoxUtils.js";
import { calculateDistanceBasedScale } from "../../utils/MathUtils.js";
import { CONFIG } from "../../config/ViewerConfig.js";
import { PanelDistanceScale } from "../DynamicScaleUI/PanelDistanceScale.js";
import { PanelSize } from "../DynamicScaleUI/PanelSize.js";

export enum CustomFollowBehavior {
  /** Rotates the object to face the target while keeping the vertical axis aligned */
  FACE_TARGET_RESPECTING_VERTICAL_AXIS = "FACE_TARGET_RESPECTING_VERTICAL_AXIS",
  /** Rotates the object to face the target directly */
  FACE_TARGET = "FACE_TARGET",
  /** Copies the transform (position, rotation, scale) of the target */
  COPY_TRANSFORM = "COPY_TRANSFORM",
  /** Follows the target position but rotates to face the user */
  FOLLOW_TARGET_AND_FACE_USER = "FOLLOW_TARGET_AND_FACE_USER",
  /** Follows target and dynamically chooses the closest edge to the user */
  FOLLOW_TARGET_AND_FACE_USER_DYNAMIC_EDGE = "FOLLOW_TARGET_AND_FACE_USER_DYNAMIC_EDGE",
  /** Positions on edges of target's bounding plane as seen by user */
  FOLLOW_TARGET_BOUNDING_PLANE_EDGE = "FOLLOW_TARGET_BOUNDING_PLANE_EDGE",
  /** Uses a rotation-invariant cylinder anchor beside the target. */
  FOLLOW_TARGET_STABLE_CONTROL_ANCHOR = "FOLLOW_TARGET_STABLE_CONTROL_ANCHOR",
}

/** Component attached to an entity to make it follow a target object. */
export const CustomFollower = createComponent("CustomFollower", {
  target: {
    type: Types.Object,
    default: undefined,
  },
  behavior: {
    type: Types.Enum,
    enum: CustomFollowBehavior,
    default: CustomFollowBehavior.FACE_TARGET_RESPECTING_VERTICAL_AXIS,
  },
  offsetPosition: {
    type: Types.Vec3,
    default: [0, 0, 0],
  },
  /** Rotation override - use fixed rotation instead of copying target's rotation */
  overrideRotation: {
    type: Types.Boolean,
    default: false,
  },
  fixedRotation: {
    type: Types.Vec4,
    default: [0, 0, 0, 1],
  },
  previousClosestEdgeOffset: {
    type: Types.Vec3,
    default: [0, 0, 0],
  },
  previousClosestEdgeValid: {
    type: Types.Boolean,
    default: false,
  },
  boundingPlaneEdge: {
    type: Types.String,
    default: "",
  },
  /** Whether the panel-to-product gap should contract at close range. */
  scaleOffsetWithDistance: {
    type: Types.Boolean,
    default: true,
  },
  /** Current world-space viewer-left direction around the product cylinder. */
  controlSideDirection: {
    type: Types.Vec3,
    default: [0, 0, 0],
  },
  /** Current yaw-only world-space direction the control rail faces. */
  controlFaceDirection: {
    type: Types.Vec3,
    default: [0, 0, 0],
  },
});

/**
 * Maps viewer distance to the close-range panel gap multiplier.
 * Clamping keeps the gap positive when the viewer is nearer than minDistance.
 */
export function calculatePanelOffsetMultiplier(distance: number): number {
  const minDistance = CONFIG.ui.distanceScale.minDistance;
  const maxDistance = CONFIG.ui.distanceScale.distanceChangeThreshold;
  const minOffset = 0.15;
  const normalized = Math.min(
    1,
    Math.max(0, (distance - minDistance) / (maxDistance - minDistance)),
  );
  return minOffset + normalized * (1 - minOffset);
}

type ControlPlacementOrientation =
  "horizontal" | "horizontal-inverted" | "vertical";

/** Returns a yaw-only direction from the cylinder center toward the viewer. */
export function computeHorizontalFacingDirection(
  cameraPosition: Vector3,
  worldCenter: Vector3,
  result: Vector3 = new Vector3(),
): Vector3 {
  result.subVectors(cameraPosition, worldCenter).setY(0);
  if (result.lengthSq() < 1e-8) return result.set(0, 0, 1);
  return result.normalize();
}

/** Returns screen-left on the horizontal plane for a viewer-facing direction. */
export function computeViewerLeftDirection(
  faceDirection: Vector3,
  result: Vector3 = new Vector3(),
): Vector3 {
  const length = Math.hypot(faceDirection.x, faceDirection.z);
  if (length < 1e-8) return result.set(-1, 0, 0);
  return result.set(-faceDirection.z / length, 0, faceDirection.x / length);
}

/** Returns the half extent of an oriented product along a world-space axis. */
export function computeOrientedHalfExtent(
  worldSize: Vector3,
  worldQuaternion: Quaternion,
  worldDirection: Vector3,
  localDirection: Vector3 = new Vector3(),
  inverseQuaternion: Quaternion = new Quaternion(),
): number {
  inverseQuaternion.copy(worldQuaternion).invert();
  localDirection.copy(worldDirection).applyQuaternion(inverseQuaternion);
  return (
    Math.abs(localDirection.x) * worldSize.x * 0.5 +
    Math.abs(localDirection.y) * worldSize.y * 0.5 +
    Math.abs(localDirection.z) * worldSize.z * 0.5
  );
}

/**
 * Centers a vertical control rail beside the product. Floor rails never cross
 * below the supporting surface; ceiling rails never cross above it.
 */
export function computeProductSideControlAnchor(
  worldCenter: Vector3,
  worldSize: Vector3,
  worldQuaternion: Quaternion,
  sideDirection: Vector3,
  orientation: ControlPlacementOrientation,
  sideGap: number,
  surfaceClearance: number,
  panelHalfWidth: number,
  panelHalfHeight: number,
  result: Vector3 = new Vector3(),
  localDirection: Vector3 = new Vector3(),
  inverseQuaternion: Quaternion = new Quaternion(),
): Vector3 {
  const sideExtent = Math.hypot(worldSize.x, worldSize.z) * 0.5;
  result
    .copy(sideDirection)
    .multiplyScalar(sideExtent + sideGap + panelHalfWidth)
    .add(worldCenter);

  const verticalExtent = computeOrientedHalfExtent(
    worldSize,
    worldQuaternion,
    localDirection.set(0, 1, 0),
    localDirection,
    inverseQuaternion,
  );
  if (orientation === "horizontal") {
    const productBottom = worldCenter.y - verticalExtent;
    result.y = Math.max(
      worldCenter.y,
      productBottom + panelHalfHeight + surfaceClearance,
    );
  } else if (orientation === "horizontal-inverted") {
    const productTop = worldCenter.y + verticalExtent;
    result.y = Math.min(
      worldCenter.y,
      productTop - panelHalfHeight - surfaceClearance,
    );
  } else {
    result.y = worldCenter.y;
  }
  return result;
}

type DimensionCandidates = Record<"x" | "y" | "z", number[]>;
type DimensionCandidatesCache = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  candidates: DimensionCandidates;
};

/** System that updates entities with CustomFollower to follow their targets. */
export class CustomFollowerSystem extends createSystem({
  customFollower: {
    required: [CustomFollower],
  },
}) {
  private tmpCameraPosition = new Vector3();
  private tmpPreviousOffset = new Vector3();
  private tmpLocalOffset = new Vector3();
  private tmpSize = new Vector3();
  private tmpMin = new Vector3();
  private tmpMax = new Vector3();
  private tmpTargetPosition = new Vector3();
  private tmpLookDirection = new Vector3();
  private tmpLookTarget = new Vector3();
  private tmpLabelPosition = new Vector3();
  private tmpPanelPosition = new Vector3();
  private tmpOffsetVector = new Vector3();
  private tmpDynamicOffset = new Vector3();
  private tmpLocalPosition = new Vector3();
  private tmpRotationMatrix = new Matrix4();
  private tmpRotationQuaternion = new Quaternion();
  private tmpInverseQuaternion = new Quaternion();
  private tmpSideDirection = new Vector3();
  private tmpFaceDirection = new Vector3();
  private tmpPanelRight = new Vector3();
  private tmpPanelUp = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);
  private readonly boundingPlaneProjector = new BoundingPlaneProjector();
  private boundingPlaneTarget: Object3D | null = null;
  private boundingPlaneData: BoundingPlaneData | null = null;
  private preparedTarget: Object3D | null = null;
  private readonly stableBounds: BoundingBoxInfo = {
    localMin: new Vector3(),
    localMax: new Vector3(),
    localCenter: new Vector3(),
    localSize: new Vector3(),
    worldCenter: new Vector3(),
    worldScale: new Vector3(),
    worldSize: new Vector3(),
    worldQuaternion: new Quaternion(),
    localBbox: new Box3(),
  };
  private readonly dimensionScaleOptions = {
    minDistance: CONFIG.ui.dimensions.distanceScale.minDistance,
    maxDistance: CONFIG.ui.dimensions.distanceScale.maxDistance,
    minScale: CONFIG.ui.dimensions.distanceScale.minScale,
    maxScale: CONFIG.ui.dimensions.distanceScale.maxScale,
  };

  /**
   * Main update loop for the CustomFollower system.
   */
  override update() {
    this.world.player.head.getWorldPosition(this.tmpCameraPosition);
    this.boundingPlaneTarget = null;
    this.boundingPlaneData = null;
    this.preparedTarget = null;

    for (const entity of this.queries.customFollower.entities) {
      if (!entity.object3D || !entity.object3D.visible) continue;
      const behavior = entity.getValue(
        CustomFollower,
        "behavior",
      ) as keyof typeof CustomFollowBehavior;
      const target = entity.getValue(CustomFollower, "target") as Object3D;
      if (!behavior || !target) continue;
      if (this.preparedTarget !== target) {
        target.updateWorldMatrix(true, false);
        this.preparedTarget = target;
      }
      switch (behavior) {
        case CustomFollowBehavior.FACE_TARGET_RESPECTING_VERTICAL_AXIS: {
          target.getWorldPosition(this.tmpTargetPosition);
          faceTargetUtil(entity.object3D!, this.tmpTargetPosition, "y");
          break;
        }
        case CustomFollowBehavior.FACE_TARGET: {
          target.getWorldPosition(this.tmpTargetPosition);
          faceTargetUtil(entity.object3D!, this.tmpTargetPosition);
          break;
        }
        case CustomFollowBehavior.COPY_TRANSFORM:
          copyWorldTransform(entity.object3D!, target);
          this.applyRotationOverride(entity);
          this.applyOffset(entity);
          break;
        case CustomFollowBehavior.FOLLOW_TARGET_AND_FACE_USER:
          this.followTargetAndFaceUser(entity, target);
          break;
        case CustomFollowBehavior.FOLLOW_TARGET_AND_FACE_USER_DYNAMIC_EDGE:
          this.followTargetAndFaceUserDynamicEdge(entity, target);
          break;
        case CustomFollowBehavior.FOLLOW_TARGET_BOUNDING_PLANE_EDGE:
          this.followTargetBoundingPlaneEdge(entity, target);
          break;
        case CustomFollowBehavior.FOLLOW_TARGET_STABLE_CONTROL_ANCHOR:
          this.followStableControlAnchor(entity, target);
          break;
      }
      this.applyDimensionLabelScaling(entity);
    }
  }

  /**
   * Applies distance-based scaling to dimension labels.
   * @param entity - The entity with dimension label to scale
   */
  private applyDimensionLabelScaling(entity: Entity) {
    const obj3D = entity.object3D;
    const dimensionType = obj3D!.userData!.dimensionType as
      "x" | "y" | "z" | undefined;
    if (!obj3D || !dimensionType) return;

    obj3D.getWorldPosition(this.tmpLabelPosition);
    const distance = this.tmpLabelPosition.distanceTo(this.tmpCameraPosition);

    const distanceScale = calculateDistanceBasedScale(
      distance,
      this.dimensionScaleOptions,
    );
    const baseScale = obj3D.userData!.baseScale as number | undefined;
    const finalScale =
      baseScale !== undefined ? baseScale * distanceScale : distanceScale;
    obj3D.scale.setScalar(finalScale);
  }

  /**
   * Follows the target's transform and rotates to face the user.
   * @param entity - The entity to update
   * @param target - The target Object3D to follow
   */
  private followTargetAndFaceUser(entity: Entity, target: Object3D) {
    const obj3D = entity.object3D;
    if (!obj3D) return;

    const offsetPosition = entity.getVectorView(
      CustomFollower,
      "offsetPosition",
    );
    if (offsetPosition) {
      this.tmpLocalOffset.set(
        offsetPosition[0],
        offsetPosition[1],
        offsetPosition[2],
      );
      this.tmpLocalOffset.applyMatrix4(target.matrixWorld);
      setWorldPosition(obj3D, this.tmpLocalOffset, this.tmpLocalPosition);
    } else {
      target.getWorldPosition(this.tmpLocalOffset);
      setWorldPosition(obj3D, this.tmpLocalOffset, this.tmpLocalPosition);
    }
    this.faceUser(entity);
  }

  /**
   * Follows the target with positioning relative to the product's bounding plane.
   * Positions panels on the edges of the bounding plane (left, right, or bottom).
   * @param entity - The entity to update
   * @param target - The target Object3D to follow
   */
  private followTargetBoundingPlaneEdge(entity: Entity, target: Object3D) {
    const obj3D = entity.object3D;
    if (!obj3D) return;

    const planeData = this.getBoundingPlaneData(target);
    if (!planeData) return;

    const boundingPlaneEdge = entity.getValue(
      CustomFollower,
      "boundingPlaneEdge",
    ) as "left" | "right" | "bottom" | "top";

    const panelPosition = this.tmpPanelPosition.copy(planeData.center);
    if (boundingPlaneEdge === "left") {
      panelPosition.addScaledVector(planeData.right, -planeData.width / 2);
    } else if (boundingPlaneEdge === "right") {
      panelPosition.addScaledVector(planeData.right, planeData.width / 2);
    } else if (boundingPlaneEdge === "top") {
      panelPosition.addScaledVector(planeData.up, planeData.height / 2);
    } else {
      panelPosition.addScaledVector(planeData.up, -planeData.height / 2);
    }

    target.getWorldPosition(this.tmpTargetPosition);
    const distance = this.tmpTargetPosition.distanceTo(this.tmpCameraPosition);
    let offsetMultiplier = 1;
    const scaleOffsetWithDistance = entity.getValue(
      CustomFollower,
      "scaleOffsetWithDistance",
    ) as boolean;
    if (
      scaleOffsetWithDistance &&
      distance < CONFIG.ui.distanceScale.distanceChangeThreshold
    ) {
      offsetMultiplier = calculatePanelOffsetMultiplier(distance);
    }
    const offsetPosition = entity.getVectorView(
      CustomFollower,
      "offsetPosition",
    );

    if (
      offsetPosition &&
      (offsetPosition[0] !== 0 ||
        offsetPosition[1] !== 0 ||
        offsetPosition[2] !== 0)
    ) {
      panelPosition.addScaledVector(
        planeData.right,
        offsetPosition[0] * offsetMultiplier,
      );
      panelPosition.addScaledVector(
        planeData.up,
        offsetPosition[1] * offsetMultiplier,
      );
      panelPosition.addScaledVector(
        planeData.normal,
        offsetPosition[2] * offsetMultiplier,
      );
    }

    const isAtMaximumScale =
      distance >= CONFIG.ui.distanceScale.distanceChangeThreshold;
    const isSidePanel =
      boundingPlaneEdge === "left" || boundingPlaneEdge === "right";

    if (isAtMaximumScale && isSidePanel && entity.hasComponent(PanelSize)) {
      const distanceScale = entity.hasComponent(PanelDistanceScale)
        ? (entity.getValue(PanelDistanceScale, "currenScaleRatio") as number)
        : 1;
      const panelMaxHeight =
        (entity.getValue(PanelSize, "maxHeight") as number) * distanceScale;

      if (panelMaxHeight > planeData.height) {
        const heightDifference = panelMaxHeight - planeData.height;
        panelPosition.addScaledVector(planeData.up, heightDifference);
      }
    }

    setWorldPosition(obj3D, panelPosition, this.tmpLocalPosition);

    this.faceUserFromTargetPosition(obj3D, target, 0.5);
  }

  /** Places the unified vertical rail on the current viewer-left side. */
  private followStableControlAnchor(entity: Entity, target: Object3D): void {
    const obj3D = entity.object3D;
    if (!obj3D) return;

    const bounds = getObjectBoundingBoxInfo(target, this.stableBounds);
    const distanceScale = entity.hasComponent(PanelDistanceScale)
      ? (entity.getValue(PanelDistanceScale, "currenScaleRatio") as number)
      : 1;
    const panelHalfWidth = entity.hasComponent(PanelSize)
      ? ((entity.getValue(PanelSize, "maxWidth") as number) * distanceScale) / 2
      : 0;
    const panelHalfHeight = entity.hasComponent(PanelSize)
      ? ((entity.getValue(PanelSize, "maxHeight") as number) * distanceScale) /
        2
      : 0;
    const orientation = (target.userData.orientation ??
      "horizontal") as ControlPlacementOrientation;

    this.resolveControlBarFrame(entity, bounds);
    const sideDirection = entity.getVectorView(
      CustomFollower,
      "controlSideDirection",
    );
    const faceDirection = entity.getVectorView(
      CustomFollower,
      "controlFaceDirection",
    );
    if (!sideDirection || !faceDirection) return;
    this.tmpSideDirection.set(
      sideDirection[0],
      sideDirection[1],
      sideDirection[2],
    );
    this.tmpFaceDirection.set(
      faceDirection[0],
      faceDirection[1],
      faceDirection[2],
    );

    computeProductSideControlAnchor(
      bounds.worldCenter,
      bounds.worldSize,
      bounds.worldQuaternion,
      this.tmpSideDirection,
      orientation,
      CONFIG.ui.controlBarAnchor.sideGap,
      CONFIG.ui.controlBarAnchor.surfaceClearance,
      panelHalfWidth,
      panelHalfHeight,
      this.tmpPanelPosition,
      this.tmpLocalOffset,
      this.tmpInverseQuaternion,
    );
    setWorldPosition(obj3D, this.tmpPanelPosition, this.tmpLocalPosition);
    this.orientControlBar(obj3D, this.tmpFaceDirection);
  }

  /** Resolves the current yaw-only facing and viewer-left cylinder direction. */
  private resolveControlBarFrame(
    entity: Entity,
    bounds: BoundingBoxInfo,
  ): void {
    computeHorizontalFacingDirection(
      this.tmpCameraPosition,
      bounds.worldCenter,
      this.tmpLookDirection,
    );
    const side = this.tmpSideDirection;
    const face = this.tmpFaceDirection;
    face.copy(this.tmpLookDirection);

    computeViewerLeftDirection(face, side);

    const sideValue = entity.getVectorView(
      CustomFollower,
      "controlSideDirection",
    );
    const faceValue = entity.getVectorView(
      CustomFollower,
      "controlFaceDirection",
    );
    if (sideValue) {
      sideValue[0] = side.x;
      sideValue[1] = side.y;
      sideValue[2] = side.z;
    }
    if (faceValue) {
      faceValue[0] = face.x;
      faceValue[1] = face.y;
      faceValue[2] = face.z;
    }
  }

  /** Keeps the rail upright while facing it toward the current viewer. */
  private orientControlBar(obj3D: Object3D, faceDirection: Vector3): void {
    this.tmpPanelRight.crossVectors(this.worldUp, faceDirection).normalize();
    this.tmpPanelUp.crossVectors(faceDirection, this.tmpPanelRight).normalize();
    this.tmpRotationMatrix.makeBasis(
      this.tmpPanelRight,
      this.tmpPanelUp,
      faceDirection,
    );
    this.tmpRotationQuaternion.setFromRotationMatrix(this.tmpRotationMatrix);
    obj3D.quaternion.copy(this.tmpRotationQuaternion);
  }

  /**
   * Follows the target and dynamically selects the closest edge to the user's camera.
   *
   * @param entity - The entity to update
   * @param target - The target Object3D to follow
   */
  private followTargetAndFaceUserDynamicEdge(entity: Entity, target: Object3D) {
    const dimensionType = entity.object3D!.userData!.dimensionType as
      "x" | "y" | "z" | undefined;
    if (!dimensionType) {
      this.followTargetAndFaceUser(entity, target);
      return;
    }

    const dynamicOffset = this.calculateClosestEdgeOffset(
      dimensionType,
      target,
      this.tmpCameraPosition,
    );
    if (!dynamicOffset) {
      this.followTargetAndFaceUser(entity, target);
      return;
    }

    const previousValid = entity.getValue(
      CustomFollower,
      "previousClosestEdgeValid",
    ) as boolean;
    const previousOffset = entity.getVectorView(
      CustomFollower,
      "previousClosestEdgeOffset",
    );
    if (previousValid && previousOffset) {
      this.tmpPreviousOffset.set(
        previousOffset[0],
        previousOffset[1],
        previousOffset[2],
      );
      const previousDistance = this.getDistanceToCameraSquared(
        target,
        this.tmpPreviousOffset,
        this.tmpCameraPosition,
      );
      const newDistance = this.getDistanceToCameraSquared(
        target,
        dynamicOffset,
        this.tmpCameraPosition,
      );
      const hysteresisFactor = 0.9;
      if (newDistance >= previousDistance * hysteresisFactor) {
        this.applyDynamicOffset(entity, target, this.tmpPreviousOffset);
        return;
      }
    }

    if (previousOffset) {
      previousOffset[0] = dynamicOffset.x;
      previousOffset[1] = dynamicOffset.y;
      previousOffset[2] = dynamicOffset.z;
    }
    entity.setValue(CustomFollower, "previousClosestEdgeValid", true);
    this.applyDynamicOffset(entity, target, dynamicOffset);
  }

  /**
   * Applies a dynamic offset to the entity after copying the target's transform.
   * The offset is applied in the entity's local space (relative to its rotation),
   * then the entity is rotated to face the user.
   *
   * @param entity - The entity to update
   * @param target - The target Object3D to copy transform from
   * @param offset - The local space offset to apply
   */
  private applyDynamicOffset(
    entity: Entity,
    target: Object3D,
    offset: Vector3,
  ) {
    const obj3D = entity.object3D;
    if (!obj3D) return;

    this.tmpLocalOffset.copy(offset);
    this.tmpLocalOffset.applyMatrix4(target.matrixWorld);
    setWorldPosition(obj3D, this.tmpLocalOffset, this.tmpLocalPosition);
    this.faceUser(entity);
  }

  /**
   * Calculates the closest edge offset position for a given dimension type.
   * Evaluates candidate edge positions and returns the one closest to the camera.
   *
   * @param dimensionType - The dimension axis to calculate edge positions for ("x", "y", or "z")
   * @param target - The target Object3D to calculate edges for
   * @param cameraPosition - The camera position to measure distance from
   * @returns The local space offset to the closest edge, or null if calculation fails
   */
  private calculateClosestEdgeOffset(
    dimensionType: "x" | "y" | "z",
    target: Object3D,
    cameraPosition: Vector3,
  ): Vector3 | null {
    const bboxSize = target.userData!.bboxSize as Vector3 | undefined;
    const bboxMin = target.userData!.bboxMin as Vector3 | undefined;
    const bboxMax = target.userData!.bboxMax as Vector3 | undefined;
    if (!bboxSize || !bboxMin || !bboxMax) {
      return null;
    }
    this.tmpSize.copy(bboxSize);
    if (this.tmpSize.x === 0 || this.tmpSize.y === 0 || this.tmpSize.z === 0)
      return null;
    this.tmpMin.copy(bboxMin);
    this.tmpMax.copy(bboxMax);

    const candidatesByDimension = this.getCachedCandidates(
      target,
      this.tmpMin,
      this.tmpMax,
    );
    const candidates = candidatesByDimension[dimensionType];
    if (!candidates || candidates.length < 3) return null;

    let closestX = candidates[0];
    let closestY = candidates[1];
    let closestZ = candidates[2];
    this.tmpLocalOffset.set(closestX, closestY, closestZ);
    let closestDistance = this.getDistanceToCameraSquared(
      target,
      this.tmpLocalOffset,
      cameraPosition,
    );
    for (let i = 3; i < candidates.length; i += 3) {
      const x = candidates[i];
      const y = candidates[i + 1];
      const z = candidates[i + 2];
      this.tmpLocalOffset.set(x, y, z);
      const distance = this.getDistanceToCameraSquared(
        target,
        this.tmpLocalOffset,
        cameraPosition,
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestX = x;
        closestY = y;
        closestZ = z;
      }
    }

    return this.tmpDynamicOffset.set(closestX, closestY, closestZ);
  }

  /**
   * Calculates the squared distance from a local offset point on the target to the camera position.
   * Uses squared distance for performance (avoids square root calculation).
   *
   * @param target - The Object3D with the local offset
   * @param localOffset - The local space offset position on the target
   * @param cameraPosition - The world space camera position
   * @returns The squared distance (use Math.sqrt() if actual distance is needed)
   */
  private getDistanceToCameraSquared(
    target: Object3D,
    localOffset: Vector3,
    cameraPosition: Vector3,
  ): number {
    this.tmpLocalOffset.copy(localOffset);
    this.tmpLocalOffset.applyMatrix4(target.matrixWorld);
    return this.tmpLocalOffset.distanceToSquared(cameraPosition);
  }

  /**
   * Gets or generates cached candidate edge positions for each dimension axis.
   * Caches results in the target's userData to avoid recalculating for the same bounding box size.
   *
   * @param target - The target Object3D to cache candidates for
   * @param size - The bounding box size
   * @param min - The minimum bounding box corner
   * @param max - The maximum bounding box corner
   * @returns A record containing arrays of candidate positions for each dimension axis
   */
  private getCachedCandidates(
    target: Object3D,
    min: Vector3,
    max: Vector3,
  ): DimensionCandidates {
    const centerX = (min.x + max.x) / 2;
    const centerY = (min.y + max.y) / 2;
    const centerZ = (min.z + max.z) / 2;
    const cache = target.userData!.dimensionCandidatesCache as
      DimensionCandidatesCache | undefined;
    if (
      cache &&
      cache.minX === min.x &&
      cache.minY === min.y &&
      cache.minZ === min.z &&
      cache.maxX === max.x &&
      cache.maxY === max.y &&
      cache.maxZ === max.z
    ) {
      return cache.candidates;
    }

    const candidates = {
      x: [] as number[],
      y: [] as number[],
      z: [] as number[],
    };

    candidates.x.push(centerX, max.y, min.z);
    candidates.x.push(centerX, max.y, max.z);
    candidates.x.push(centerX, min.y, min.z);
    candidates.x.push(centerX, min.y, max.z);

    candidates.y.push(min.x, centerY, min.z);
    candidates.y.push(max.x, centerY, min.z);
    candidates.y.push(min.x, centerY, max.z);
    candidates.y.push(max.x, centerY, max.z);

    candidates.z.push(min.x, max.y, centerZ);
    candidates.z.push(min.x, min.y, centerZ);
    candidates.z.push(max.x, max.y, centerZ);
    candidates.z.push(max.x, min.y, centerZ);

    target.userData.dimensionCandidatesCache = {
      minX: min.x,
      minY: min.y,
      minZ: min.z,
      maxX: max.x,
      maxY: max.y,
      maxZ: max.z,
      candidates,
    } satisfies DimensionCandidatesCache;

    return candidates;
  }

  /**
   * Applies the offset position from the component to the entity.
   * The offset is applied in local space (relative to the entity's rotation).
   * Only applies if the offset is non-zero.
   *
   * @param entity - The entity to apply the offset to
   */
  private applyOffset(entity: Entity) {
    const offsetPosition = entity.getVectorView(
      CustomFollower,
      "offsetPosition",
    );
    if (
      offsetPosition &&
      (offsetPosition[0] !== 0 ||
        offsetPosition[1] !== 0 ||
        offsetPosition[2] !== 0)
    ) {
      const offsetVector = this.tmpOffsetVector.set(
        offsetPosition[0],
        offsetPosition[1],
        offsetPosition[2],
      );
      offsetVector.multiply(entity.object3D!.scale);
      offsetVector.applyQuaternion(entity.object3D!.quaternion);
      entity.object3D!.position.add(offsetVector);
    }
  }

  /**
   * Applies a fixed rotation override instead of using the target's rotation.
   * Only applies if the overrideRotation component value is true.
   *
   * @param entity - The entity to apply the rotation override to
   */
  private applyRotationOverride(entity: Entity) {
    const overrideRotation = entity.getValue(
      CustomFollower,
      "overrideRotation",
    ) as boolean;
    if (!overrideRotation) return;

    const fixedRotation = entity.getVectorView(CustomFollower, "fixedRotation");
    if (fixedRotation) {
      entity.object3D!.quaternion.set(
        fixedRotation[0],
        fixedRotation[1],
        fixedRotation[2],
        fixedRotation[3],
      );
    }
  }

  /**
   * Rotates the entity to face the user's head position.
   * Calculates the direction from the entity to the user and constructs a rotation matrix
   * that aligns the entity's forward direction (z-axis) with that direction.
   *
   * @param entity - The entity to rotate
   */
  private faceUser(entity: Entity) {
    entity.object3D!.getWorldPosition(this.tmpLabelPosition);
    this.tmpLocalOffset
      .subVectors(this.tmpCameraPosition, this.tmpLabelPosition)
      .normalize();

    this.tmpTargetPosition
      .crossVectors(this.tmpSize.set(0, 1, 0), this.tmpLocalOffset)
      .normalize();
    this.tmpPreviousOffset
      .crossVectors(this.tmpLocalOffset, this.tmpTargetPosition)
      .normalize();

    this.tmpRotationMatrix.makeBasis(
      this.tmpTargetPosition,
      this.tmpPreviousOffset,
      this.tmpLocalOffset,
    );
    this.tmpRotationQuaternion.setFromRotationMatrix(this.tmpRotationMatrix);
    entity.object3D!.quaternion.copy(this.tmpRotationQuaternion);
  }

  /**
   * Makes an object face the user with rotation calculated from the target's position.
   * This creates consistent orientation for multiple entities following the same target.
   * @param obj3D - The object to rotate
   * @param target - The reference point for calculating the direction to user
   * @param viewDirectionFlattening - 0 = full tilt toward user, 1 = fully upright (no vertical tilt). Default: 1
   */
  private faceUserFromTargetPosition(
    obj3D: Object3D,
    target: Object3D,
    viewDirectionFlattening: number = 1,
  ) {
    target.getWorldPosition(this.tmpTargetPosition);
    this.tmpLookDirection.subVectors(
      this.tmpCameraPosition,
      this.tmpTargetPosition,
    );
    this.tmpLookDirection.y *= 1 - viewDirectionFlattening;

    if (this.tmpLookDirection.lengthSq() > 0.0001) {
      this.tmpLookDirection.normalize();
      obj3D.getWorldPosition(this.tmpLookTarget);
      this.tmpLookTarget.add(this.tmpLookDirection);
      obj3D.lookAt(this.tmpLookTarget);
    }
  }

  private getBoundingPlaneData(target: Object3D): BoundingPlaneData | null {
    if (this.boundingPlaneTarget !== target) {
      this.boundingPlaneTarget = target;
      this.boundingPlaneData = this.boundingPlaneProjector.compute(
        target,
        this.tmpCameraPosition,
      );
    }
    return this.boundingPlaneData;
  }
}
