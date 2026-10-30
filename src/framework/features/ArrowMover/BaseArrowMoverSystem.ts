/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  Entity,
  RayInteractable,
  Hovered,
  Pressed,
  Box3,
} from "@iwsdk/core";
import { RaycastUtils } from "../../utils/RaycastUtils.js";
import {
  Vector3,
  Intersection,
  Quaternion,
  Object3DEventMap,
  Group,
} from "@iwsdk/core";
import { ArrowStateMachine } from "./ArrowStateMachine.js";
import { ArrowComponent, ArrowState } from "./ArrowComponent.js";
import { ArrowGizmoDrawer } from "./ArrowGizmoDrawer.js";
import {
  BoundingBoxHelper,
  type BoundingBoxInfo,
  getObjectBoundingBoxInfo,
} from "../../utils/BoundingBoxUtils.js";
import { Object3D } from "@iwsdk/core";
import { setWorldPosition } from "../../utils/UtilsWorldConversion.js";
import { projectVectorOntoPlane } from "../../utils/MathUtils.js";
import type { ArrowStateChangeCallbackWithEntity } from "./ArrowFactory.js";
import { CONFIG } from "../../../framework/config/ViewerConfig.js";
import { XrInputManager, Hand } from "../../managers/input/xrInputManager.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { PinchRotationTracker } from "./PinchRotationTracker.js";
import { ManagedTweenGroup } from "../../utils/ManagedTweenGroup.js";

export { ArrowComponent } from "./ArrowComponent.js";

export abstract class BaseArrowMoverSystem extends createSystem({
  hoveredArrows: { required: [ArrowComponent, Hovered] },
  pressedArrows: { required: [ArrowComponent, Pressed] },
}) {
  public XrInputManager!: XrInputManager | null;

  /** Shared state. */
  protected allArrows: Entity[] = [];
  protected straightArrows: Entity[] = [];
  protected rotateArrows: Entity[] = [];
  protected placedObject: Entity | null = null;
  protected tweenGroup = new ManagedTweenGroup();
  public areArrowsVisible = false;
  protected gizmoDrawer: ArrowGizmoDrawer = new ArrowGizmoDrawer();
  protected bboxHelper: BoundingBoxHelper | null = null;
  protected pendingScaleUpdateCallback: (() => void) | null = null;
  protected pressedArrow: Entity | null = null;
  protected readonly pinchRotationTracker = new PinchRotationTracker();
  protected deltaTime: number = 1 / 60;
  protected currentPinchingRayspace: Group<Object3DEventMap> | null = null;
  private readonly previousPositionScratch = new Vector3();
  private readonly currentPositionScratch = new Vector3();
  private readonly displacementScratch = new Vector3();
  private readonly arrowPositionScratch = new Vector3();
  private readonly objectPositionScratch = new Vector3();
  private readonly movementScratch = new Vector3();
  private readonly localPositionScratch = new Vector3();
  private readonly objectPivotScratch = new Vector3();
  private readonly pivotToClickScratch = new Vector3();
  private readonly straightDirectionScratch = new Vector3();
  private readonly basisRight = new Vector3();
  private readonly basisUp = new Vector3();
  private readonly basisForward = new Vector3();
  private readonly objectBasis = {
    right: this.basisRight,
    up: this.basisUp,
    forward: this.basisForward,
  };
  private readonly fallbackAxis = new Vector3(0, 1, 0);
  private readonly arrowUpAxis = new Vector3(0, 1, 0);
  private readonly cachedMatrixWorld = new Float64Array(16);
  private matrixWorldCached = false;
  protected boundingBoxChangedThisFrame = true;
  private readonly bboxInfoScratch: BoundingBoxInfo = {
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

  /** Whether to skip update this frame (e.g. wrong orientation). */
  abstract shouldSkipUpdate(): boolean;
  /** Initializes arrow entities for this orientation. */
  abstract initializeArrows(): Promise<void>;
  /** Positions arrows based on bounding box info. */
  abstract positionArrows(
    bboxInfo: ReturnType<typeof getObjectBoundingBoxInfo>,
  ): void;
  /** Returns 'horizontal' for floor, 'vertical' for wall. */
  abstract getOrientation(): "horizontal" | "vertical";
  /** Normalizes movement direction (e.g. floor clamps Y to 0). */
  protected abstract normalizeMovementDirection(direction: Vector3): Vector3;
  /** Returns rotation axis ('X' | 'Y' | 'Z'). */
  protected abstract getRotationAxis(): "X" | "Y" | "Z";
  /** Returns normal of plane to project click onto for angle calculation. */
  protected abstract getRotationProjectionPlane(objectBasis: {
    right: Vector3;
    up: Vector3;
    forward: Vector3;
  }): Vector3;
  /** Returns +1 or -1 for rotation direction based on angle and arrow index. */
  protected abstract calculateRotationDirectionMultiplier(
    angleDegrees: number,
    arrowIndex: number,
  ): number;
  /** Called when rotation angle is computed; override for logging or caching. */
  protected onRotationAngleComputed(
    angleDegrees: number,
    arrowIndex: number,
    isContinuous: boolean,
  ): void {
    void angleDegrees;
    void arrowIndex;
    void isContinuous;
  }

  override init(): void {
    this.cleanupFuncs.push(
      this.queries.hoveredArrows.subscribe("qualify", (entity) => {
        if (!this.ownsArrow(entity)) return;
        this.getStateMachine(entity)?.handleHoverStart();
      }),
      this.queries.hoveredArrows.subscribe("disqualify", (entity) => {
        if (!this.ownsArrow(entity)) return;
        if (!entity.hasComponent(Pressed)) {
          this.getStateMachine(entity)?.handleExit();
        }
      }),
      this.queries.pressedArrows.subscribe("qualify", (entity) => {
        if (!this.ownsArrow(entity)) return;
        this.tryStartPressedArrow(entity);
      }),
      this.queries.pressedArrows.subscribe("disqualify", (entity) => {
        if (!this.ownsArrow(entity)) return;
        const stateMachine = this.getStateMachine(entity);
        if (
          this.pressedArrow === entity &&
          stateMachine?.isOwningInputActive()
        ) {
          return;
        }
        stateMachine?.handlePressEnd(entity.hasComponent(Hovered));
      }),
    );
  }

  /**
   * Updates the arrow mover system each frame.
   * @param deltaTime - Time since last frame in seconds
   */
  override update(deltaTime?: number) {
    this.deltaTime = deltaTime ?? 1 / 60;

    this.tweenGroup.updateActive();

    if (this.pendingScaleUpdateCallback) {
      this.pendingScaleUpdateCallback();
      this.pendingScaleUpdateCallback = null;
    }

    if (!this.placedObject || !this.placedObject.object3D) {
      return;
    }
    if (this.shouldSkipUpdate()) {
      return;
    }
    if (!this.areArrowsVisible) {
      return;
    }

    const bboxInfo = this.updateBoundingBoxIfNeeded();
    this.positionArrows(bboxInfo);
    for (let i = 0; i < this.rotateArrows.length; i++) {
      this.gizmoDrawer.drawArrowOrientationDebug(this.rotateArrows[i], i);
    }

    if (!this.pressedArrow) {
      for (const entity of this.queries.pressedArrows.entities) {
        if (this.ownsArrow(entity) && this.tryStartPressedArrow(entity)) break;
      }
    }

    if (this.pressedArrow) {
      RaycastUtils.WasRaycastConsumed = true;
      this.handlePressedArrowContinuation();
      return;
    }

    RaycastUtils.WasRaycastConsumed =
      RaycastUtils.WasRaycastConsumed || this.areArrowsVisible;
  }

  /**
   * Handles arrow click event for movement.
   * @param event - Event containing entity and raycast intersection
   */
  public onArrowClicked(event: {
    entity: Entity;
    intersection: Intersection;
  }): void {
    MessageHandler.raiseLog("BaseArrowMoverSystem: Arrow clicked");
    const direction = this.calculateMovementDirection(
      event.entity.object3D!,
      this.placedObject!.object3D!,
    );
    this.handleArrowMovement(
      direction,
      CONFIG.interaction.arrows.movementClickDistance,
    );
  }

  /**
   * Handles arrow press/held event for continuous movement.
   * Uses frame-to-frame (incremental) scalar deltas so that player rotation
   * mid-drag doesn't cause the object to jump.
   * @param event - Event containing entity and raycast intersection
   */
  public onArrowPressed(event: {
    entity: Entity;
    intersection: Intersection;
  }): void {
    const arrowObj = event.entity.object3D;
    const targetObj = this.placedObject!.object3D;
    const direction = this.calculateMovementDirection(arrowObj!, targetObj!);
    const prevPos = this.previousPositionScratch.copy(
      this.pinchRotationTracker!.previousPosition,
    );
    const currentPos = this.currentPinchingRayspace!.getWorldPosition(
      this.currentPositionScratch,
    );
    const displacement = this.displacementScratch.subVectors(
      currentPos,
      prevPos,
    );
    const distanceAlongDirection = displacement.dot(direction);
    this.pinchRotationTracker!.previousPosition.copy(currentPos);

    this.handleArrowMovement(
      direction,
      distanceAlongDirection *
        CONFIG.interaction.arrows.movementDragSensitivity,
    );
  }

  /**
   * Sets the placed object's world position with optional interpolation.
   * @param targetPosition - World position to move to
   */
  private setPlacedObjectPosition(targetPosition: Vector3): void {
    setWorldPosition(
      this.placedObject!.object3D!,
      targetPosition,
      this.localPositionScratch,
    );
  }

  /**
   * Handles rotation arrow click for discrete rotation step.
   * @param event - Event containing entity and raycast intersection
   */
  public onRotateArrowClicked(event: {
    entity: Entity;
    intersection: Intersection;
  }): void {
    const arrowIndex = this.rotateArrows.indexOf(event.entity);
    this.handleArrowRotation(
      event,
      CONFIG.interaction.arrows.rotationStepRadians,
      arrowIndex,
      false,
    );
  }

  /**
   * Handles the press event for the rotation arrow.
   * Override in subclasses for orientation-specific rotation drag behavior.
   * @param event - The event object containing the entity and intersection.
   */
  public onRotateArrowPressed(event: {
    entity: Entity;
    intersection: Intersection;
  }): void {
    void event;
  }

  /**
   * Returns the rotation axis in world space for the placed object (Y for floor, Z for wall, etc.).
   */
  protected getRotationAxisWorld(): Vector3 {
    const targetObj = this.placedObject!.object3D;
    if (!targetObj) {
      MessageHandler.raiseError("ArrowMoverSystem: No targetObj");
      return this.fallbackAxis.set(0, 1, 0);
    }

    const basis = this.extractObjectBasis(targetObj);
    const axis = this.getRotationAxis();
    switch (axis) {
      case "X":
        return basis.right;
      case "Y":
        return basis.up;
      case "Z":
        return basis.forward.negate();
      default:
        return basis.up;
    }
  }

  /** Extracts right, up, forward basis vectors from an object's world matrix. */
  private extractObjectBasis(obj: Object3D): {
    right: Vector3;
    up: Vector3;
    forward: Vector3;
  } {
    obj.matrixWorld.extractBasis(
      this.basisRight,
      this.basisUp,
      this.basisForward,
    );
    return this.objectBasis;
  }

  /**
   * Toggles arrow visibility and interactability.
   */
  public handleVisibilityToggle() {
    this.areArrowsVisible = !this.areArrowsVisible;
    this.doForAllArrows((arrow, _index) => {
      arrow.object3D!.visible = this.areArrowsVisible;
      if (this.areArrowsVisible) {
        arrow.addComponent(RayInteractable);
      } else {
        arrow.removeComponent(RayInteractable);
      }
    });
  }

  /**
   * Updates bounding box helper and returns current bbox info.
   * @returns Bounding box info for the placed object
   */
  public updateBoundingBoxIfNeeded() {
    const object = this.placedObject!.object3D!;
    object.updateWorldMatrix(true, false);
    const elements = object.matrixWorld.elements;
    let transformChanged = !this.matrixWorldCached || !this.bboxHelper;
    for (let i = 0; i < elements.length; i++) {
      if (this.cachedMatrixWorld[i] !== elements[i]) {
        transformChanged = true;
        break;
      }
    }
    this.boundingBoxChangedThisFrame = transformChanged;
    if (!transformChanged) return this.bboxInfoScratch;
    for (let i = 0; i < elements.length; i++) {
      this.cachedMatrixWorld[i] = elements[i];
    }
    this.matrixWorldCached = true;

    const bboxInfo = getObjectBoundingBoxInfo(object, this.bboxInfoScratch);
    const orientation = this.getOrientation();
    if (this.bboxHelper) {
      this.bboxHelper.update(
        bboxInfo.localBbox,
        this.placedObject!.object3D!.matrixWorld,
        orientation,
      );
    } else {
      this.bboxHelper = new BoundingBoxHelper(
        bboxInfo.localBbox,
        this.placedObject!.object3D!.matrixWorld,
        orientation,
      );
    }
    return bboxInfo;
  }

  /**
   * Handles continuation of pressed arrow state when raycast may not hit.
   */
  protected handlePressedArrowContinuation() {
    if (!this.pressedArrow) {
      return;
    }

    const stateMachine = this.pressedArrow.getValue(
      ArrowComponent,
      "stateMachine",
    ) as ArrowStateMachine | null;
    if (stateMachine) {
      stateMachine.handlePressedContinuation();
    }
  }

  /**
   * Calculates normalized movement direction from placed object toward arrow.
   * @param arrowObject - Arrow object3D
   * @param placedObject - Placed object3D
   * @returns Normalized direction vector
   */
  protected calculateMovementDirection(
    arrowObject: Object3D,
    placedObject: Object3D,
  ): Vector3 {
    arrowObject.getWorldPosition(this.arrowPositionScratch);
    placedObject.getWorldPosition(this.objectPositionScratch);
    const direction = this.straightDirectionScratch.subVectors(
      this.arrowPositionScratch,
      this.objectPositionScratch,
    );
    return this.normalizeMovementDirection(direction);
  }

  /**
   * Moves the placed object by the given direction and distance.
   * @param direction - Normalized movement direction
   * @param speed - Distance to move in meters
   */
  protected handleArrowMovement(direction: Vector3, speed: number): void {
    this.movementScratch.copy(direction).multiplyScalar(speed);
    this.placedObject!.object3D!.getWorldPosition(this.objectPositionScratch);
    this.objectPositionScratch.add(this.movementScratch);
    this.setPlacedObjectPosition(this.objectPositionScratch);
  }

  /**
   * Rotates the placed object around its axis based on click position.
   * @param event - Event containing entity and intersection
   * @param speed - Rotation amount in radians
   * @param arrowIndex - Index of the rotation arrow
   * @param useCachedDirection - Whether to use cached rotation direction
   */
  protected handleArrowRotation(
    event: { entity: Entity; intersection: Intersection },
    speed: number,
    arrowIndex: number,
    useCachedDirection: boolean = false,
  ): void {
    if (!this.placedObject!.object3D || !event.entity.object3D) {
      return;
    }

    const {
      right: objectRight,
      up: objectUp,
      forward: objectForward,
    } = this.extractObjectBasis(this.placedObject!.object3D);

    this.placedObject!.object3D.getWorldPosition(this.objectPivotScratch);
    const pivotToClick = this.pivotToClickScratch.subVectors(
      event.intersection.point,
      this.objectPivotScratch,
    );

    const projectionPlane = this.getRotationProjectionPlane({
      right: objectRight,
      up: objectUp,
      forward: objectForward,
    });
    projectVectorOntoPlane(
      pivotToClick,
      projectionPlane.normalize(),
      pivotToClick,
    );

    const angleRadians = pivotToClick.angleTo(objectRight);
    let angleDegrees = angleRadians * (180 / Math.PI);

    if (angleDegrees > 90) {
      angleDegrees = 180 - angleDegrees;
    }

    this.onRotationAngleComputed(angleDegrees, arrowIndex, useCachedDirection);

    let direction = this.calculateRotationDirectionMultiplier(
      angleDegrees,
      arrowIndex,
    );

    if (useCachedDirection) {
      const storedDirection = event.entity.object3D!.userData!
        .cachedRotateDirection as number | undefined;
      if (storedDirection === undefined && event.entity.object3D!.userData) {
        event.entity.object3D.userData.cachedRotateDirection = direction;
      }
      direction = storedDirection ?? direction;
    }

    const rotationAmount = direction * speed;
    const axis = this.getRotationAxis();

    switch (axis) {
      case "X":
        this.placedObject!.object3D.rotateX(rotationAmount);
        break;
      case "Y":
        this.placedObject!.object3D.rotateY(rotationAmount);
        break;
      case "Z":
        this.placedObject!.object3D.rotateZ(rotationAmount);
        break;
    }
  }

  /**
   * Creates callback for arrow state changes (e.g. pressed/released).
   * Override in subclasses for orientation-specific press/release behavior.
   * @returns Callback that handles state transitions
   */
  protected createArrowStateChangeHandler(): ArrowStateChangeCallbackWithEntity {
    return (entity: Entity, newState: ArrowState, oldState: ArrowState) => {
      if (newState === ArrowState.PRESSED) {
        const raySpace =
          this.currentPinchingRayspace ??
          this.XrInputManager?.getPinchingRayspace ??
          null;
        if (!raySpace) return;
        this.currentPinchingRayspace = raySpace;
        this.pressedArrow = entity;
        const startPosition = raySpace.getWorldPosition(
          this.currentPositionScratch,
        );
        const rotationAxis = this.getRotationAxisWorld();
        this.pinchRotationTracker.reset(startPosition, rotationAxis);
      } else if (oldState === ArrowState.PRESSED) {
        this.pressedArrow = null;
        this.currentPinchingRayspace = null;
        if (entity.object3D!.userData) {
          delete entity.object3D!.userData.cachedRotateDirection;
          delete entity.object3D!.userData.cachedMovementDirection;
          delete entity.object3D!.userData.arrowDragPreviousScalar;
          delete entity.object3D!.userData.rotateDragP0;
          delete entity.object3D!.userData.rotateDragInitialWorldQuat;
          delete entity.object3D!.userData.rotateDragAxisWorld;
        }
      }
    };
  }

  /**
   * Sets the placed object that arrows will manipulate.
   * @param entity - Entity to place, or null to clear
   */
  public setPlacedObject(entity: Entity | null) {
    this.placedObject = entity;
    this.bboxHelper = null;
    this.matrixWorldCached = false;
    this.boundingBoxChangedThisFrame = true;
    if (!this.placedObject || !this.placedObject.object3D) {
      return;
    }

    this.updateArrowScales();
  }

  /**
   * Updates arrow scales based on placed object bounding box.
   */
  private updateArrowScales() {
    const bboxInfo = this.updateBoundingBoxIfNeeded();
    this.doForAllArrows((arrow) => {
      this.applyScaleFromSize(arrow.object3D!, bboxInfo.worldSize);
      arrow.setValue(ArrowComponent, "baseScale", arrow.object3D!.scale.x);
    });
  }

  /**
   * Applies uniform scale to an object based on a size vector.
   */
  private applyScaleFromSize(object3D: Object3D, size: Vector3): void {
    const baseScale = Math.max(size.x, size.y, size.z);
    const multiplier = CONFIG.interaction.arrows.scaleConfig.multiplier;
    const min = CONFIG.interaction.arrows.scaleConfig.min;
    const max = CONFIG.interaction.arrows.scaleConfig.max;
    const finalScale = Math.min(Math.max(baseScale * multiplier, min), max);
    object3D.scale.setScalar(finalScale);
  }

  /**
   * Iterates over arrows and invokes callback for each.
   * @param arrows - Array of arrow entities
   * @param callback - Callback invoked with (arrow, index)
   */
  private doForArrows(
    arrows: Entity[],
    callback: (arrow: Entity, index: number) => void,
  ): void {
    for (let i = 0; i < arrows.length; i++) {
      callback(arrows[i], i);
    }
  }

  /**
   * Iterates over all arrows (straight + rotate).
   * @param callback - Callback invoked with (arrow, index)
   */
  protected doForAllArrows(callback: (arrow: Entity, index: number) => void) {
    this.doForArrows(this.allArrows, callback);
  }

  /**
   * Iterates over rotation arrows only.
   * @param callback - Callback invoked with (arrow, index)
   */
  protected doForRotateArrows(
    callback: (arrow: Entity, index: number) => void,
  ) {
    this.doForArrows(this.rotateArrows, callback);
  }

  /**
   * Iterates over straight (movement) arrows only.
   * @param callback - Callback invoked with (arrow, index)
   */
  protected doForStraightArrows(
    callback: (arrow: Entity, index: number) => void,
  ) {
    this.doForArrows(this.straightArrows, callback);
  }

  /** Positions straight arrows at given positions, oriented toward worldCenter. */
  protected positionStraightArrows(
    positions: Vector3[],
    worldCenter: Vector3,
  ): void {
    for (let index = 0; index < this.straightArrows.length; index++) {
      const arrow = this.straightArrows[index];
      arrow.object3D!.position.copy(positions[index]);
      this.straightDirectionScratch
        .subVectors(positions[index], worldCenter)
        .normalize();
      arrow.object3D!.quaternion.setFromUnitVectors(
        this.arrowUpAxis,
        this.straightDirectionScratch,
      );
    }
  }

  /** Sets position and base quaternion for a rotation arrow; subclasses add axis-specific rotation. */
  protected positionRotateArrowBase(
    arrow: Entity,
    position: Vector3,
    worldQuaternion: Quaternion,
  ): void {
    arrow.object3D!.position.copy(position);
    arrow.object3D!.quaternion.copy(worldQuaternion);
  }

  private getStateMachine(entity: Entity): ArrowStateMachine | null {
    return entity.getValue(
      ArrowComponent,
      "stateMachine",
    ) as ArrowStateMachine | null;
  }

  private ownsArrow(entity: Entity): boolean {
    return this.allArrows.includes(entity);
  }

  private tryStartPressedArrow(entity: Entity): boolean {
    const stateMachine = this.getStateMachine(entity);
    if (!stateMachine || stateMachine.isPressed()) return false;
    const hand = this.findPressingHand(entity);
    const intersection = hand ? this.getRayIntersection(hand) : null;
    if (!hand || !intersection) return false;
    const raySpace = this.XrInputManager?.getHand(hand);
    if (!raySpace) return false;
    this.currentPinchingRayspace = raySpace;
    stateMachine.handlePressStart(hand, intersection);
    return true;
  }

  private findPressingHand(entity: Entity): Hand | null {
    if (
      this.XrInputManager?.isPinchingFromHand(Hand.Left) &&
      this.intersectionBelongsToEntity(
        entity,
        this.getRayIntersection(Hand.Left),
      )
    ) {
      return Hand.Left;
    }
    if (
      this.XrInputManager?.isPinchingFromHand(Hand.Right) &&
      this.intersectionBelongsToEntity(
        entity,
        this.getRayIntersection(Hand.Right),
      )
    ) {
      return Hand.Right;
    }
    return null;
  }

  private getRayIntersection(hand: Hand): Intersection | null {
    const pointer = this.world.input.xr.multiPointers[hand].getPointer(
      "ray",
    ) as {
      getIntersection(): Intersection | undefined;
    };
    return pointer.getIntersection() ?? null;
  }

  private intersectionBelongsToEntity(
    entity: Entity,
    intersection: Intersection | null,
  ): boolean {
    const root = entity.object3D;
    let object = intersection?.object ?? null;
    while (object) {
      if (object === root) return true;
      object = object.parent;
    }
    return false;
  }
}
