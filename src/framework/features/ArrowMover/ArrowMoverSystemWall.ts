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
import { TimedUILogger } from "../../utils/TimedUILogger.js";
import { MathConstants } from "../../utils/MathConstants.js";
import { CONFIG } from "../../../framework/config/ViewerConfig.js";
import { RaycastUtils } from "../../utils/RaycastUtils.js";
import {
  setWorldQuaternion,
  getWorldQuaternionFor,
} from "../../utils/UtilsWorldConversion.js";
import {
  projectVectorOntoPlane,
  rayPlaneIntersection,
  computeAngleBetweenVectors,
} from "../../utils/MathUtils.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

/**
 * Arrow mover system for wall-mounted objects (vertical orientation).
 * Displays 4 directional arrows at cardinals and 4 rotation arrows at corners.
 */
export class ArrowMoverSystemWall extends BaseArrowMoverSystem {
  /** Corner indices (UpperLeft=0, lowerRight=2) that invert rotation direction. */
  private static readonly CORNER_INDICES_INVERT_DIRECTION: readonly number[] = [
    0, 2,
  ];

  private rotationMapX: number[] = [
    -MathConstants.HALF_PI,
    (-MathConstants.PI * 3) / 2,
    -MathConstants.HALF_PI,
    MathConstants.HALF_PI,
  ];

  private rotationMapY: number[] = [0, MathConstants.PI, MathConstants.PI, 0];
  private readonly handWorldPosition = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly objectCenter = new Vector3();
  private readonly rotationAxis = new Vector3();
  private readonly rayIntersection = new Vector3();
  private readonly rayPlaneOffset = new Vector3();
  private readonly projectedStart = new Vector3();
  private readonly projectedCurrent = new Vector3();
  private readonly projectionInput = new Vector3();
  private readonly angleCross = new Vector3();
  private readonly deltaQuaternion = new Quaternion();
  private readonly resultQuaternion = new Quaternion();
  private readonly localQuaternion = new Quaternion();

  /**
   * Initializes 4 straight (directional) arrows and 4 rotation arrows for wall orientation.
   */
  async initializeArrows(): Promise<void> {
    const handleStateChange = this.createArrowStateChangeHandler();
    const blueConfig = CONFIG.interaction.arrows.blue;
    const greenConfig = CONFIG.interaction.arrows.green;

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
        blueConfig,
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
        blueConfig,
      ),
    );
    this.straightArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_basic.glb",
        "Arrow3",
        (event) => this.onArrowClicked(event),
        (event) => this.onArrowPressed(event),
        handleStateChange,
        blueConfig,
      ),
    );
    this.straightArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_basic.glb",
        "Arrow4",
        (event) => this.onArrowClicked(event),
        (event) => this.onArrowPressed(event),
        handleStateChange,
        blueConfig,
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
        greenConfig,
      ),
    );
    this.rotateArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_Rotate_v3.glb",
        "RotateArrows2",
        (event) => this.onRotateArrowClicked(event),
        (event) => this.onRotateArrowPressed(event),
        handleStateChange,
        greenConfig,
      ),
    );
    this.rotateArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_Rotate_v3.glb",
        "RotateArrows3",
        (event) => this.onRotateArrowClicked(event),
        (event) => this.onRotateArrowPressed(event),
        handleStateChange,
        greenConfig,
      ),
    );
    this.rotateArrows.push(
      await ArrowFactory.spawnArrow(
        this.world,
        this.tweenGroup,
        this.XrInputManager,
        "3dUI/Arrow_Rotate_v3.glb",
        "RotateArrows4",
        (event) => this.onRotateArrowClicked(event),
        (event) => this.onRotateArrowPressed(event),
        handleStateChange,
        greenConfig,
      ),
    );

    this.allArrows = [...this.straightArrows, ...this.rotateArrows];
  }

  /**
   * Skips update when placed object has horizontal orientation.
   */
  shouldSkipUpdate(): boolean {
    return this.placedObject?.object3D?.userData.orientation !== "vertical";
  }

  /**
   * Returns vertical orientation for wall-mounted objects.
   */
  getOrientation(): "vertical" {
    return "vertical";
  }

  /**
   * Normalizes movement direction for wall (no Y clamping).
   */
  protected normalizeMovementDirection(direction: Vector3): Vector3 {
    return direction.normalize();
  }

  /**
   * Returns Z axis for wall rotation (depth axis).
   */
  protected getRotationAxis(): "Z" {
    return "Z";
  }

  /**
   * Returns forward vector as rotation projection plane for wall.
   */
  protected getRotationProjectionPlane(objectBasis: {
    right: Vector3;
    up: Vector3;
    forward: Vector3;
  }): Vector3 {
    return objectBasis.forward;
  }

  /**
   * Calculates rotation direction multiplier; corners 0 and 2 invert direction.
   */
  protected calculateRotationDirectionMultiplier(
    angleDegrees: number,
    arrowIndex: number,
  ): number {
    const baseDirection =
      angleDegrees < CONFIG.interaction.arrows.wallAngleThreshold ? -1 : 1;
    if (
      ArrowMoverSystemWall.CORNER_INDICES_INVERT_DIRECTION.includes(arrowIndex)
    ) {
      return -baseDirection;
    }
    return baseDirection;
  }

  /**
   * Logs angle when rotation is computed for non-continuous rotation.
   */
  protected override onRotationAngleComputed(
    angleDegrees: number,
    arrowIndex: number,
    isContinuous: boolean,
  ): void {
    void arrowIndex;
    if (!isContinuous) {
      TimedUILogger.getInstance().LOG(`angle: ${angleDegrees}`);
    }
  }

  /**
   * Wall rotation drag uses ray-plane intersection to compute absolute rotation
   * from the initial pinch point, giving stable results for vertical surfaces.
   */
  public override onRotateArrowPressed(event: {
    entity: Entity;
    intersection: Intersection;
  }): void {
    const arrowObj = event.entity.object3D;
    const targetObj = this.placedObject!.object3D;

    if (!arrowObj || !targetObj) {
      MessageHandler.raiseError("ArrowMoverSystem: No arrowObj or targetObj");
      return;
    }

    const handWorldPosition = this.currentPinchingRayspace!.getWorldPosition(
      this.handWorldPosition,
    );
    const rayDir = RaycastUtils.getHandRayDirection(
      this.currentPinchingRayspace!,
      this.rayDirection,
    );
    const objectCenter = targetObj.getWorldPosition(this.objectCenter);
    const rotationAxisWorld = this.rotationAxis.copy(
      this.getRotationAxisWorld(),
    );
    const ud = arrowObj.userData;

    if (ud.rotateDragP0 === undefined) {
      const intersection = rayPlaneIntersection(
        handWorldPosition,
        rayDir,
        objectCenter,
        rotationAxisWorld,
        this.rayIntersection,
        this.rayPlaneOffset,
      );
      if (intersection === null) {
        return;
      }
      ud.rotateDragP0 = intersection.clone();
      ud.rotateDragInitialWorldQuat = getWorldQuaternionFor(targetObj).clone();
      ud.rotateDragAxisWorld = rotationAxisWorld.clone().normalize();
    }

    this.handleRotationArrowDrag(ud);
  }

  /**
   * Computes rotation from the initial drag anchor to the current hand ray intersection,
   * then applies it as an absolute delta on top of the initial quaternion.
   */
  private handleRotationArrowDrag(userData: Record<string, unknown>): void {
    const targetObj = this.placedObject!.object3D;
    const pinchingHand = this.currentPinchingRayspace!;

    const handWorldPosition = pinchingHand!.getWorldPosition(
      this.handWorldPosition,
    );
    const rayDir = RaycastUtils.getHandRayDirection(
      pinchingHand!,
      this.rayDirection,
    );
    const objectCenter = targetObj!.getWorldPosition(this.objectCenter);
    const axisNorm = userData.rotateDragAxisWorld as Vector3;
    if (axisNorm.lengthSq() < 1e-12) {
      return;
    }

    const rotationDragAnchor = userData.rotateDragP0 as Vector3;
    const initialWorldQuat = userData.rotateDragInitialWorldQuat as Quaternion;

    const P_current = rayPlaneIntersection(
      handWorldPosition,
      rayDir,
      objectCenter,
      axisNorm,
      this.rayIntersection,
      this.rayPlaneOffset,
    );
    if (P_current === null) {
      MessageHandler.raiseError("ArrowMoverSystem: No P_current");
      return;
    }

    const V0 = projectVectorOntoPlane(
      this.projectionInput.subVectors(rotationDragAnchor, objectCenter),
      axisNorm,
      this.projectedStart,
    );
    const Vcurrent = projectVectorOntoPlane(
      this.projectionInput.subVectors(P_current, objectCenter),
      axisNorm,
      this.projectedCurrent,
    );

    const eps = 1e-6;
    if (V0.lengthSq() < eps || Vcurrent.lengthSq() < eps) {
      return;
    }
    V0.normalize();
    Vcurrent.normalize();

    const signedAngle = computeAngleBetweenVectors(
      V0,
      Vcurrent,
      axisNorm,
      this.angleCross,
    );
    this.deltaQuaternion.setFromAxisAngle(axisNorm, signedAngle);
    this.resultQuaternion.copy(this.deltaQuaternion).multiply(initialWorldQuat);
    setWorldQuaternion(targetObj!, this.resultQuaternion, this.localQuaternion);
  }

  /**
   * Positions 4 straight arrows at cardinals and 4 rotation arrows at corners.
   */
  positionArrows(bboxInfo: ReturnType<typeof getObjectBoundingBoxInfo>): void {
    if (!this.boundingBoxChangedThisFrame) return;
    const { worldCenter, worldQuaternion } = bboxInfo;
    const [cornersArray, cardinalsArray] =
      this.bboxHelper!.getAllCornersAndCardinals();

    this.positionStraightArrows(cardinalsArray, worldCenter);

    for (let index = 0; index < this.rotateArrows.length; index++) {
      const arrow = this.rotateArrows[index];
      this.positionRotateArrowBase(arrow, cornersArray[index], worldQuaternion);
      arrow.object3D!.rotateX(this.rotationMapX[index]);
      arrow.object3D!.rotateY(this.rotationMapY[index]);
    }
  }
}
