/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createComponent,
  createSystem,
  Vector3,
  XRPlane,
  Types,
  Entity,
  Quaternion,
  Group,
  Object3DEventMap,
  eq,
  Intersection,
  Euler,
} from "@iwsdk/core";
import { Tween } from "@tweenjs/tween.js";
import { SnappableSurface } from "../PlaneProcessSystem/SnappableSurface.js";
import { CONFIG } from "../../config/ViewerConfig.js";
import { XrInputManager, Hand } from "../../managers/input/xrInputManager.js";
import { getBoundingBox } from "../../utils/BoundingBoxUtils.js";
import {
  getAxisVector,
  computeAngleBetweenVectors,
  remapZEulerAngle,
} from "../../utils/MathUtils.js";
import { setMaterialProperties } from "../../utils/MeshUtils.js";
import { RaycastUtils } from "../../utils/RaycastUtils.js";
import { getImageWorldTransform } from "../../utils/UIUtils.js";
import {
  getWorldQuaternionFor,
  setWorldPosition,
} from "../../utils/UtilsWorldConversion.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import {
  isPlaneAllowedForPlacement,
  PreferredOrientation,
} from "../../utils/PlacementUtils.js";
import { InterpolationDestination } from "../Interpolate/InterpolateSystem.js";
import { ManagedTweenGroup } from "../../utils/ManagedTweenGroup.js";
import type { SpatialPanelSystem } from "../../ui/ProductPanel/SpatialPanelSystem.js";

/** Fields read from the native WebXR plane stored on an XRPlane entity. */
type TrackedPlaneData = {
  orientation?: string;
  semanticLabel?: string;
};

/**
 * Drag state machine for smooth object placement & rotation
 */
export enum GrabState {
  INITIAL_PLACEMENT = "INITIAL_PLACEMENT",
  TRANSLATING = "TRANSLATING",
  IDLE = "IDLE",
  ROTATING = "ROTATING",
}

/** Placement mode: far grab (ray) or close grab (hand) */
export enum PlacingOptions {
  FarGrab = "FarGrab",
  CloseGrab = "CloseGrab",
}

/**
 * Component that tracks drag state and transition progress
 */
export const CustomGrab = createComponent("CustomGrab", {
  state: { type: Types.String, default: GrabState.INITIAL_PLACEMENT },
  previousState: { type: Types.String, default: GrabState.INITIAL_PLACEMENT },
  placingOption: { type: Types.String, default: PlacingOptions.FarGrab },
  /** -1.0 means not set */
  placementDistance: { type: Types.Float32, default: -1.0 },
  rotationAxis: { type: Types.String, default: "y" },
  snappedToPlane: { type: Types.Boolean, default: false },
  isGrabbed: { type: Types.Boolean, default: false },
});

/** System for grab/place/rotate interactions with spatial objects */
export class CustomGrabSystem extends createSystem({
  customGrab: { required: [CustomGrab] },
  snappableSurfaces: {
    required: [SnappableSurface],
    where: [eq(SnappableSurface, "intersected", true)],
  },
}) {
  private objectEntity: Entity | null = null;
  private lastRotationEndTime: number = 0;
  private currentIntersectingSurface: Entity | null = null;
  public xrInputManager!: XrInputManager | null;
  public spatialPanelSystem: SpatialPanelSystem | null = null;
  private tweenGroup = new ManagedTweenGroup();
  private readonly initialHandsDirection = new Vector3();
  private readonly initialObjectRotation = new Quaternion();
  private forceImmediateTeleportationCount: number = 0;
  private readonly raySpaceWorldQuaternion = new Quaternion();
  private readonly handWorldPosition = new Vector3();
  private readonly panelWorldPosition = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly placementPosition = new Vector3();
  private readonly intersectingPoint = new Vector3();
  private readonly distanceScratch = new Vector3();
  private readonly rightHandPosition = new Vector3();
  private readonly leftHandPosition = new Vector3();
  private readonly handsDirectionScratch = new Vector3();
  private readonly rotationReferenceAxis = new Vector3();
  private readonly rotationLocalAxis = new Vector3();
  private readonly rotationCrossProduct = new Vector3();
  private readonly deltaRotation = new Quaternion();
  private readonly targetRotation = new Quaternion();
  private readonly planeWorldQuaternion = new Quaternion();
  private readonly handWorldQuaternion = new Quaternion();
  private readonly extraQuaternion = new Quaternion();
  private readonly baseQuaternion = new Quaternion();
  private readonly surfaceDeltaQuaternion = new Quaternion();
  private readonly surfaceNormal = new Vector3();
  private readonly objectForwardDirection = new Vector3();
  private readonly cursorOffsetScratch = new Vector3();
  private readonly snapEuler = new Euler();

  /** Subscribes to customGrab qualify/disqualify to track the object entity */
  override init() {
    this.cleanupFuncs.push(
      this.queries.customGrab.subscribe("qualify", (entity) => {
        this.objectEntity = entity;
      }),
    );

    this.cleanupFuncs.push(
      this.queries.customGrab.subscribe("disqualify", (_entity) => {
        this.objectEntity = null;
      }),
    );

    this.cleanupFuncs.push(
      this.queries.snappableSurfaces.subscribe("qualify", (entity) => {
        this.currentIntersectingSurface = entity;
      }),
    );

    this.cleanupFuncs.push(
      this.queries.snappableSurfaces.subscribe("disqualify", (entity) => {
        if (this.currentIntersectingSurface === entity) {
          this.currentIntersectingSurface = null;
        }
      }),
    );
  }

  /** Updates grab state and logs transition */
  private setGrabState(entity: Entity, newState: GrabState) {
    const previousState = entity.getValue(CustomGrab, "state") as GrabState;
    if (previousState !== newState) {
      entity.setValue(CustomGrab, "previousState", previousState);
      entity.setValue(CustomGrab, "state", newState);
      MessageHandler.raiseLog(
        "GrabbedItem changed from " + previousState + " to " + newState,
      );
    }
  }

  /** Main update loop: validates surface, handles rotation/translation based on input */
  override update(_delta: number) {
    if (!this.objectEntity) {
      return;
    }

    this.validateCurrentSurface();
    this.tweenGroup.updateActive();

    if (RaycastUtils.WasRaycastConsumed) {
      return;
    }

    const anyHandPinching = this.xrInputManager!.isAnyHandPinching();
    if (!anyHandPinching) {
      this.setIsGrabbed(this.objectEntity, false);
      if (this.objectEntity.getValue(CustomGrab, "state") !== GrabState.IDLE) {
        this.setGrabState(this.objectEntity!, GrabState.IDLE);
      }

      return;
    }

    if (
      this.xrInputManager!.areBothHandsPinching() &&
      this.objectEntity!.getValue(CustomGrab, "state") !==
        GrabState.INITIAL_PLACEMENT
    ) {
      this.handleRotation(this.objectEntity!);
      return;
    }

    if (anyHandPinching) {
      if (
        Date.now() - this.lastRotationEndTime <
        CONFIG.interaction.grab.rotationSwitchDelay
      ) {
        return;
      }
      this.handleTranslation(this.objectEntity!);
    }
  }

  /** Handles two-hand rotation around the configured axis */
  private handleRotation(entity: Entity) {
    const currentState = entity.getValue(CustomGrab, "state") as GrabState;

    if (currentState !== GrabState.ROTATING) {
      this.initialHandsDirection.copy(this.computeCurrentHandsDirection());
      getWorldQuaternionFor(entity.object3D!, this.initialObjectRotation);
      this.setGrabState(entity, GrabState.ROTATING);
      this.lastRotationEndTime = Date.now();
      return;
    }

    this.lastRotationEndTime = Date.now();

    const rotationAxis = entity.getValue(CustomGrab, "rotationAxis") as
      "x" | "y" | "z";
    const currentHandsDirection = this.computeCurrentHandsDirection();

    const referenceAxis = getAxisVector(
      rotationAxis,
      this.rotationReferenceAxis,
    )
      .applyQuaternion(this.initialObjectRotation)
      .normalize();
    const totalAngle = computeAngleBetweenVectors(
      this.initialHandsDirection,
      currentHandsDirection,
      referenceAxis,
      this.rotationCrossProduct,
    );

    const localAxis = getAxisVector(rotationAxis, this.rotationLocalAxis);
    this.deltaRotation.setFromAxisAngle(localAxis, totalAngle);
    this.targetRotation
      .copy(this.initialObjectRotation)
      .multiply(this.deltaRotation);

    this.setInterpolationTargetRotation(entity, this.targetRotation);
  }

  /** Handles translation: initial placement, translating, or activating from idle */
  private handleTranslation(entity: Entity) {
    const state = entity.getValue(CustomGrab, "state") as GrabState;

    switch (state) {
      case GrabState.INITIAL_PLACEMENT: {
        const panelEntity = this.spatialPanelSystem!.getPanelEntity();
        if (panelEntity) {
          if (
            !this.tryPointerInteraction(panelEntity, entity, Hand.Left, true)
          ) {
            this.tryPointerInteraction(panelEntity, entity, Hand.Right, true);
          }
        }
        break;
      }
      case GrabState.TRANSLATING:
        this.setIsGrabbed(entity, true);
        this.orientObjectToXRInput(entity);
        this.computePlacementwRay(entity);
        if (entity.getValue(CustomGrab, "snappedToPlane")) {
          this.orientObjectToSurfaceNormal(entity);
        }

        break;
      case GrabState.IDLE: {
        this.setIsGrabbed(entity, false);
        if (!this.tryPointerInteraction(entity, entity, Hand.Left, false)) {
          this.tryPointerInteraction(entity, entity, Hand.Right, false);
        }
        break;
      }
      default:
        this.setGrabState(entity, GrabState.IDLE);
        break;
    }
  }

  private tryPointerInteraction(
    targetEntity: Entity,
    productEntity: Entity,
    hand: Hand,
    initialPlacement: boolean,
  ): boolean {
    if (!this.xrInputManager!.isPinchingFromHand(hand)) return false;
    const pointer = this.world.input.xr.multiPointers[hand].getPointer(
      "ray",
    ) as {
      getIntersection(): Intersection | undefined;
    };
    const intersection = pointer.getIntersection();
    if (
      !intersection ||
      !this.intersectionBelongsToEntity(targetEntity, intersection)
    ) {
      return false;
    }

    const raySpace = this.xrInputManager!.getHand(hand);
    if (!raySpace) return false;
    if (initialPlacement) {
      this.startPlacementOfProduct(intersection, raySpace);
    } else {
      this.activateTranslationIfGrabbingOrPinching(
        productEntity,
        intersection,
        raySpace,
      );
    }
    return true;
  }

  private intersectionBelongsToEntity(
    entity: Entity,
    intersection: Intersection,
  ): boolean {
    const root = entity.object3D;
    let object = intersection.object;
    while (object) {
      if (object === root) return true;
      object = object.parent!;
    }
    return false;
  }

  /** Aligns object to the current intersecting surface normal */
  private orientObjectToSurfaceNormal(entity: Entity) {
    if (!this.currentIntersectingSurface) {
      return;
    }
    let plane: TrackedPlaneData | null;
    try {
      plane = this.currentIntersectingSurface.getValue(
        XRPlane,
        "_plane",
      ) as TrackedPlaneData | null;
    } catch (error) {
      MessageHandler.raiseWarning(`Failed to access plane anchor:${error}`);
      this.currentIntersectingSurface = null;
      return;
    }

    const planeObject = this.currentIntersectingSurface.object3D;
    if (!plane || !planeObject) return;

    if (!plane.orientation) {
      return;
    }

    entity.object3D!.userData.planeAttachedTo = planeObject.uuid;

    const surfaceNormal = this.surfaceNormal
      .set(0, -1, 0)
      .applyQuaternion(
        getWorldQuaternionFor(planeObject, this.planeWorldQuaternion),
      );

    const objectForwardDirection = this.objectForwardDirection.set(0, 0, 0);
    switch (entity.object3D!.userData.orientation) {
      case PreferredOrientation.vertical:
        objectForwardDirection.set(0, 0, 1);
        break;
      case PreferredOrientation.horizontal:
        objectForwardDirection.set(0, 1, 0);
        break;
      case PreferredOrientation.horizontalInverted:
        objectForwardDirection.set(0, -1, 0);
        break;
      default:
        break;
    }

    const targetRotArray = entity.getVectorView(
      InterpolationDestination,
      "targetRotation",
    );
    const baseQuaternion = this.baseQuaternion.set(
      targetRotArray[0],
      targetRotArray[1],
      targetRotArray[2],
      targetRotArray[3],
    );
    objectForwardDirection.applyQuaternion(baseQuaternion);

    const deltaQuaternion = this.surfaceDeltaQuaternion.setFromUnitVectors(
      objectForwardDirection,
      surfaceNormal,
    );
    let newWorldQuaternion = deltaQuaternion.multiply(baseQuaternion);

    if (
      entity.object3D!.userData.orientation == PreferredOrientation.vertical
    ) {
      newWorldQuaternion = this.SnapObjectTo90Rotations(newWorldQuaternion);
    }

    this.setInterpolationTargetRotation(entity, newWorldQuaternion);
  }

  private SnapObjectTo90Rotations(newWorldQuaternion: Quaternion) {
    const euler = this.snapEuler;
    euler.setFromQuaternion(newWorldQuaternion);
    const zAngleDegrees = (euler.z * 180) / Math.PI;
    const remappedZ = remapZEulerAngle(zAngleDegrees);
    euler.z = (remappedZ * Math.PI) / 180;
    newWorldQuaternion.setFromEuler(euler);
    return newWorldQuaternion;
  }

  /** Orients object to the pinching hand's world quaternion */
  private orientObjectToXRInput(entity: Entity) {
    const pinchingHand = this.xrInputManager!.getPinchingRayspace;
    const handWorldQuaternion = getWorldQuaternionFor(
      pinchingHand!,
      this.handWorldQuaternion,
    );

    if (entity.object3D!.userData.grabRotationOffset) {
      const worldQuaternionToApply = this.targetRotation
        .copy(handWorldQuaternion)
        .multiply(entity.object3D!.userData.grabRotationOffset);
      this.setInterpolationTargetRotation(entity, worldQuaternionToApply);

      if (entity.object3D!.userData.localCursorOffset) {
        const newCursorOffset = this.cursorOffsetScratch
          .copy(entity.object3D!.userData.localCursorOffset)
          .applyQuaternion(worldQuaternionToApply);
        entity.object3D!.userData.cursorOffset.copy(newCursorOffset);
      }

      return;
    }

    const extraQuat = this.extraQuaternion.identity();
    if (pinchingHand!.userData.usingHand) {
      extraQuat.set(0, 0, Math.SQRT1_2, Math.SQRT1_2);

      if (this.xrInputManager!.isLeftHandPinching()) {
        extraQuat.invert();
      }
    }

    this.setInterpolationTargetRotation(
      entity,
      this.targetRotation.copy(handWorldQuaternion).multiply(extraQuat),
    );
  }
  /**
   * Activates translation when user grabs (Pressed) or pinches (Hovered) the object
   * @param entity - The grabbed entity
   * @param intersection - Ray intersection data
   * @param pinchingHand - The hand performing the pinch
   */
  private activateTranslationIfGrabbingOrPinching(
    entity: Entity,
    intersection: Intersection,
    pinchingHand: Group<Object3DEventMap>,
  ) {
    const handPosition = pinchingHand!.getWorldPosition(new Vector3());
    const objectWorldPosition = entity.object3D!.getWorldPosition(
      new Vector3(),
    );
    const isWithinCloseGrabRange =
      intersection.distance < CONFIG.interaction.grab.closeGrabThreshold;

    if (!isWithinCloseGrabRange) {
      entity.setValue(CustomGrab, "placingOption", PlacingOptions.FarGrab);
      entity.setValue(
        CustomGrab,
        "placementDistance",
        Math.max(
          intersection.distance,
          CONFIG.interaction.grab.minPlacementDistance,
        ),
      );

      this.setGrabState(entity, GrabState.TRANSLATING);
      entity.object3D!.userData.cursorOffset = this.computeCursorOffset(
        objectWorldPosition,
        intersection,
      ).clone();
      this.computeGrabOffsets(entity, pinchingHand!);
    } else {
      entity.setValue(CustomGrab, "placingOption", PlacingOptions.CloseGrab);
      entity.setValue(CustomGrab, "placementDistance", 0);

      this.setGrabState(entity, GrabState.TRANSLATING);
      entity.object3D!.userData.cursorOffset = new Vector3().subVectors(
        objectWorldPosition,
        handPosition,
      );
      this.computeGrabOffsets(entity, pinchingHand!);
    }
  }

  /** Computes grab rotation offset and local cursor offset for the entity */
  private computeGrabOffsets(
    entity: Entity,
    pinchingHand: Group<Object3DEventMap>,
  ) {
    const objectWorldQuaternion = getWorldQuaternionFor(entity.object3D!);
    entity.object3D!.userData.grabRotationOffset = getWorldQuaternionFor(
      pinchingHand,
    )
      .invert()
      .multiply(objectWorldQuaternion);

    if (entity.object3D!.userData.cursorOffset) {
      const inverseObjectWorldRotation = objectWorldQuaternion.clone().invert();
      entity.object3D!.userData.localCursorOffset = entity
        .object3D!.userData.cursorOffset.clone()
        .applyQuaternion(inverseObjectWorldRotation);
    }
  }

  /** Returns normalized direction vector from left to right hand */
  private computeCurrentHandsDirection() {
    this.world.player.raySpaces.right.getWorldPosition(this.rightHandPosition);
    this.world.player.raySpaces.left.getWorldPosition(this.leftHandPosition);
    return this.handsDirectionScratch
      .subVectors(this.rightHandPosition, this.leftHandPosition)
      .normalize();
  }

  /** Tweens object scale to 1,1,1 with material opacity transition */
  private handleScalingTransition(entity: Entity) {
    setMaterialProperties(entity.object3D!, { transparent: true, opacity: 1 });
    if (this.tweenGroup.hasActiveTweens) {
      return;
    }

    const scaleValues = entity.object3D!.scale.clone();
    new Tween(scaleValues)
      .to({ x: 1, y: 1, z: 1 }, CONFIG.interaction.scaling.duration)
      .easing(CONFIG.interaction.scaling.easing)
      .group(this.tweenGroup)
      .onUpdate(() => {
        entity.object3D!.scale.copy(scaleValues);
      })
      .onComplete(() => {
        setMaterialProperties(entity.object3D!, {
          transparent: false,
          opacity: 1,
        });
      })
      .start();
  }

  /** Returns offset from reference position to intersection point */
  private computeCursorOffset(
    referencePosition: Vector3,
    intersection: Intersection,
  ) {
    return new Vector3().subVectors(
      referencePosition,
      intersection.point.clone(),
    );
  }

  /**
   * Starts initial placement: scales to image, positions on panel, sets up grab state
   * @param intersection - Ray intersection with product image
   * @param pinchingHand - Hand performing the pinch
   */
  public startPlacementOfProduct(
    intersection: Intersection,
    pinchingHand: Group<Object3DEventMap>,
  ) {
    const productObj3D = this.objectEntity!.object3D;
    const imageElement = this.spatialPanelSystem!.getProductImageElement();
    const panelEntity = this.spatialPanelSystem!.getPanelEntity();
    if (!imageElement || !panelEntity) {
      MessageHandler.raiseWarning(
        "CustomGrab: product panel is not ready; cannot start placement",
      );
      return;
    }

    const imageTransform = getImageWorldTransform(panelEntity, imageElement);
    const originalBBox = getBoundingBox(productObj3D!);
    const originalSize = originalBBox.getSize(new Vector3());
    productObj3D!.userData.originalSize = originalSize;

    const scaleX = imageTransform!.size.width / originalSize.x;
    const scaleY = imageTransform!.size.height / originalSize.y;
    const uniformScale = Math.min(scaleX, scaleY);

    const originalScale = productObj3D!.scale.clone();
    productObj3D!.userData.originalScale = originalScale;
    productObj3D!.scale.setScalar(uniformScale * originalScale.y);

    const scaledBBox = getBoundingBox(productObj3D!);
    const scaledSize = scaledBBox.getSize(new Vector3());
    const scaledCenter = scaledBBox.getCenter(new Vector3());

    const centerOffset = new Vector3().subVectors(
      scaledCenter,
      productObj3D!.position,
    );
    productObj3D!.userData.centerOffset = centerOffset;

    const basePosition = new Vector3()
      .copy(imageTransform!.position)
      .sub(centerOffset);

    productObj3D!.userData.basePosition = basePosition;

    setWorldPosition(productObj3D!, basePosition);

    const referencePosition = imageTransform!.position.clone();
    const cursorOffset = this.computeCursorOffset(
      referencePosition,
      intersection,
    );

    cursorOffset.y -= scaledSize.y / 2;
    productObj3D!.userData.cursorOffset = cursorOffset.clone();

    MessageHandler.raiseLog(
      "Initial placement complete (center aligned with correct scale)",
      true,
    );
    const handWorldPosition = pinchingHand!.getWorldPosition(new Vector3());

    this.setGrabState(this.objectEntity!, GrabState.TRANSLATING);
    this.handleScalingTransition(this.objectEntity!);
    const panelWorldPosition =
      this.spatialPanelSystem!.getPanelEntity()!.object3D!.getWorldPosition(
        new Vector3(),
      );
    this.objectEntity!.setValue(
      CustomGrab,
      "placementDistance",
      new Vector3().subVectors(handWorldPosition, panelWorldPosition).length(),
    );
    this.forceImmediateTeleportationCount = 0;
  }

  public computePlacementwRay(entity: Entity) {
    const pinchingHand = this.xrInputManager!.getPinchingRayspace;
    pinchingHand!.getWorldQuaternion(this.raySpaceWorldQuaternion);
    const handWorldPosition = pinchingHand!.getWorldPosition(
      this.handWorldPosition,
    );

    const rayDirection = this.rayDirection.set(0, 0, -1);
    rayDirection.applyQuaternion(this.raySpaceWorldQuaternion).normalize();
    if (entity.getValue(CustomGrab, "placementDistance") === -1.0) {
      const panelWorldPosition =
        this.spatialPanelSystem!.getPanelEntity()!.object3D!.getWorldPosition(
          this.panelWorldPosition,
        );
      entity.setValue(
        CustomGrab,
        "placementDistance",
        this.distanceScratch
          .subVectors(handWorldPosition, panelWorldPosition)
          .length(),
      );
    }

    const placementDistance =
      entity.getValue(CustomGrab, "placementDistance") ?? 1;
    entity.object3D!.userData.placementDistance = placementDistance;
    const placementPosition = this.placementPosition;
    const placingOption = entity.getValue(
      CustomGrab,
      "placingOption",
    ) as PlacingOptions;
    let intersectingPlaneExistsAndIsAcceptable = false;
    let snappedToPlane = false;

    if (this.currentIntersectingSurface) {
      try {
        const plane = this.currentIntersectingSurface.getValue(
          XRPlane,
          "_plane",
        ) as TrackedPlaneData | null;
        if (plane) {
          const semanticLable = plane.semanticLabel ?? "";
          const orientation = entity.object3D!.userData.orientation as string;
          const placementAllowed = isPlaneAllowedForPlacement(
            orientation,
            semanticLable,
          );
          intersectingPlaneExistsAndIsAcceptable = placementAllowed;
        }
      } catch (error) {
        MessageHandler.raiseWarning(
          `Failed to access plane anchor in computePlacementwRay:${error}`,
        );
        this.currentIntersectingSurface = null;
        intersectingPlaneExistsAndIsAcceptable = false;
      }
    }

    if (!intersectingPlaneExistsAndIsAcceptable) {
      placementPosition
        .copy(handWorldPosition)
        .addScaledVector(rayDirection, placementDistance)
        .add(entity.object3D!.userData.cursorOffset);
    } else if (this.currentIntersectingSurface) {
      const intersectionDistance =
        this.currentIntersectingSurface!.getValue(
          SnappableSurface,
          "intersectionDistance",
        ) ?? 10000.0;
      const isSnappingThresholdAchieved =
        intersectionDistance < CONFIG.placement.snapping.threshold;
      const intersectingPoint = this.currentIntersectingSurface!.getVectorView(
        SnappableSurface,
        "intersectionPoint",
      );
      const intersectingPointVector3 = this.intersectingPoint.set(
        intersectingPoint[0],
        intersectingPoint[1],
        intersectingPoint[2],
      );

      if (placingOption === PlacingOptions.CloseGrab) {
        if (isSnappingThresholdAchieved) {
          placementPosition.copy(intersectingPointVector3);
          snappedToPlane = true;
        } else {
          placementPosition
            .copy(handWorldPosition)
            .add(entity.object3D!.userData.cursorOffset);
        }
      } else {
        placementPosition.copy(intersectingPointVector3);
        snappedToPlane = true;
      }
    }

    this.setSnappedToPlane(entity, snappedToPlane);
    this.setInterpolationTarget(entity, placementPosition);
  }

  private static readonly FORCE_IMMEDIATE_FRAME_LIMIT = 2;

  /** Sets interpolation target position for the entity */
  private setInterpolationTarget(entity: Entity, position: Vector3): void {
    const targetPosArray = entity.getVectorView(
      InterpolationDestination,
      "targetPosition",
    );
    targetPosArray[0] = position.x;
    targetPosArray[1] = position.y;
    targetPosArray[2] = position.z;

    entity.setValue(InterpolationDestination, "InterpolationPosOn", true);
    if (
      this.forceImmediateTeleportationCount <
      CustomGrabSystem.FORCE_IMMEDIATE_FRAME_LIMIT
    ) {
      entity.setValue(InterpolationDestination, "forceImmediate", true);
      this.forceImmediateTeleportationCount++;
    }
  }

  /** Sets interpolation target rotation for the entity */
  private setInterpolationTargetRotation(
    entity: Entity,
    rotation: Quaternion,
  ): void {
    const targetRotArray = entity.getVectorView(
      InterpolationDestination,
      "targetRotation",
    );

    targetRotArray[0] = rotation.x;
    targetRotArray[1] = rotation.y;
    targetRotArray[2] = rotation.z;
    targetRotArray[3] = rotation.w;

    entity.setValue(InterpolationDestination, "InterpolationRotOn", true);
  }

  private setIsGrabbed(entity: Entity, value: boolean): void {
    if (entity.getValue(CustomGrab, "isGrabbed") !== value) {
      entity.setValue(CustomGrab, "isGrabbed", value);
    }
  }

  private setSnappedToPlane(entity: Entity, value: boolean): void {
    if (entity.getValue(CustomGrab, "snappedToPlane") !== value) {
      entity.setValue(CustomGrab, "snappedToPlane", value);
    }
  }

  /** Validates that currentIntersectingSurface still has a valid plane; clears if invalid */
  private validateCurrentSurface(): boolean {
    if (!this.currentIntersectingSurface) return false;

    try {
      const plane = this.currentIntersectingSurface.getValue(
        XRPlane,
        "_plane",
      ) as XRPlane | undefined;
      return plane !== null && plane !== undefined;
    } catch {
      MessageHandler.raiseWarning(
        "Invalid surface detected, clearing reference",
      );
      this.currentIntersectingSurface = null;
      return false;
    }
  }
}
