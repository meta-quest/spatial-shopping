/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3, Quaternion, Intersection } from "@iwsdk/core";
import { Entity } from "@iwsdk/core";
import { BaseArrowMoverSystem } from "./BaseArrowMoverSystem.js";
import { ArrowFactory } from "./ArrowFactory.js";
import { getObjectBoundingBoxInfo } from "../../utils/BoundingBoxUtils.js";
import { MathConstants } from "../../utils/MathConstants.js";
import { CONFIG } from "../../../framework/config/ViewerConfig.js";
import { TimedUILogger } from "../../utils/TimedUILogger.js";
import {
  setWorldQuaternion,
  getWorldQuaternionFor,
} from "../../utils/UtilsWorldConversion.js";

export class ArrowMoverSystemFloor extends BaseArrowMoverSystem {
  private rotationMap: Record<string, number> = {
    frontLeft: (MathConstants.PI * 3) / 2, // 270° in radians
    frontRight: MathConstants.PI, // 180° in radians
    backRight: MathConstants.HALF_PI, // 90° in radians
    backLeft: 0, // 0° in radians
  };
  private currentCornerName: string = "";
  private worldCenter: Vector3 = new Vector3();
  private worldQuaternion: Quaternion = new Quaternion();

  private cornerName: string = "";
  private cornerPosition: Vector3 = new Vector3();
  private neighbors: Vector3[] = [];
  private viewerWorldPosition: Vector3 = new Vector3();
  private readonly currentHandPosition = new Vector3();
  private readonly currentObjectQuaternion = new Quaternion();
  private readonly localQuaternion = new Quaternion();

  /**
   * Initializes straight and rotation arrows for floor orientation.
   */
  async initializeArrows(): Promise<void> {
    const handleStateChange = this.createArrowStateChangeHandler();

    this.straightArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_basic.glb",
        "Arrow1",
        (event) => this.onArrowClicked(event),
        (event) => this.onArrowPressed(event),
        handleStateChange,
        CONFIG.interaction.arrows.blue,
      ),
    );
    this.straightArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_basic.glb",
        "Arrow2",
        (event) => this.onArrowClicked(event),
        (event) => this.onArrowPressed(event),
        handleStateChange,
        CONFIG.interaction.arrows.blue,
      ),
    );
    this.rotateArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_Rotate_v3.glb",
        "RotateArrows",
        (event) => this.onRotateArrowClicked(event),
        (event) => this.onRotateArrowPressed(event),
        handleStateChange,
        CONFIG.interaction.arrows.green,
      ),
    );

    this.allArrows = [...this.straightArrows, ...this.rotateArrows];
  }

  /**
   * Skips update when placed object has vertical orientation.
   */
  shouldSkipUpdate(): boolean {
    return this.placedObject?.object3D?.userData.orientation === "vertical";
  }

  /**
   * Returns horizontal orientation for floor-mounted objects.
   */
  getOrientation(): "horizontal" {
    return "horizontal";
  }

  /**
   * Normalizes movement direction for floor (Y set to 0).
   */
  protected normalizeMovementDirection(direction: Vector3): Vector3 {
    return direction.setY(0).normalize();
  }

  /**
   * Returns Y axis for floor rotation (up axis).
   */
  protected getRotationAxis(): "Y" {
    return "Y";
  }

  /**
   * Returns up vector as rotation projection plane for floor.
   */
  protected getRotationProjectionPlane(objectBasis: {
    right: Vector3;
    up: Vector3;
    forward: Vector3;
  }): Vector3 {
    return objectBasis.up;
  }

  /**
   * Calculates rotation direction multiplier; frontLeft and backRight invert direction.
   */
  protected calculateRotationDirectionMultiplier(
    angleDegrees: number,
    arrowIndex: number,
  ): number {
    void arrowIndex;
    const baseDirection =
      angleDegrees < CONFIG.interaction.arrows.floorAngleThreshold ? -1 : 1;
    if (
      this.currentCornerName === "frontLeft" ||
      this.currentCornerName === "backRight"
    ) {
      return -baseDirection;
    }
    return baseDirection;
  }

  /**
   * Logs angle and corner when rotation is computed for non-continuous rotation.
   */
  protected override onRotationAngleComputed(
    angleDegrees: number,
    arrowIndex: number,
    isContinuous: boolean,
  ): void {
    void arrowIndex;
    if (!isContinuous) {
      TimedUILogger.getInstance().LOG(
        `angle: ${angleDegrees} Current Corner: ${this.currentCornerName}`,
      );
    }
  }

  /**
   * Floor rotation drag uses PinchRotationTracker for smooth incremental rotation
   * based on hand displacement projected onto the hand's local axes.
   */
  public override onRotateArrowPressed(_event: {
    entity: Entity;
    intersection: Intersection;
  }): void {
    const pinchingRayspace = this.currentPinchingRayspace!;
    const currentPosition = pinchingRayspace.getWorldPosition(
      this.currentHandPosition,
    );
    const currentObjectQuat = getWorldQuaternionFor(
      this.placedObject!.object3D!,
      this.currentObjectQuaternion,
    );
    const newRotation = this.pinchRotationTracker!.computeIncrementalRotation(
      currentPosition,
      pinchingRayspace,
      currentObjectQuat,
    );
    setWorldQuaternion(
      this.placedObject!.object3D!,
      newRotation,
      this.localQuaternion,
    );
  }

  /**
   * Positions straight arrows at neighbors and rotation arrow at closest corner.
   */
  positionArrows(bboxInfo: ReturnType<typeof getObjectBoundingBoxInfo>): void {
    this.worldCenter = bboxInfo.worldCenter;
    this.worldQuaternion = bboxInfo.worldQuaternion;
    const previousCornerName = this.cornerName;

    if (this.pressedArrow) {
      const lockedData = this.bboxHelper!.getCornerWithNeighborsByName(
        this.cornerName as
          "frontLeft" | "frontRight" | "backRight" | "backLeft",
      );
      this.cornerPosition = lockedData.cornerPosition;
      this.neighbors = lockedData.neighbors;
    } else {
      this.world.player.head.getWorldPosition(this.viewerWorldPosition);
      const closestCornerData = this.bboxHelper!.getClosestCornerWithNeighbors(
        this.viewerWorldPosition,
      );
      this.cornerName = closestCornerData.cornerName;
      this.cornerPosition = closestCornerData.cornerPosition;
      this.neighbors = closestCornerData.neighbors;
    }

    if (
      !this.boundingBoxChangedThisFrame &&
      previousCornerName === this.cornerName
    ) {
      return;
    }

    this.currentCornerName = this.cornerName;

    this.positionStraightArrows(this.neighbors, this.worldCenter);

    for (let i = 0; i < this.rotateArrows.length; i++) {
      const arrow = this.rotateArrows[i];
      this.positionRotateArrowBase(
        arrow,
        this.cornerPosition,
        this.worldQuaternion,
      );
      arrow.object3D!.rotateY(this.rotationMap[this.cornerName] || 0);
      this.gizmoDrawer.drawRotateArrowCenter(arrow.object3D!.position);
    }
  }
}
