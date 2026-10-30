/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Entity,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  XRPlane as XRPlaneComponent,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { XrInputManager } from "../../managers/input/xrInputManager.js";
import type { SceneManager } from "../../managers/scene/SceneManager.js";
import { PreferredOrientation } from "../../utils/PlacementUtils.js";
import { isPointInTrackedPlanePolygon } from "../PlacementReticle/TrackedPlaneGeometry.js";
import { CustomGrab, PlacingOptions } from "../CustomGrab/CustomGrabSystem.js";
import { SnappableSurface } from "./SnappableSurface.js";

const NO_INTERSECTION_DISTANCE = 10000;
const PARALLEL_EPSILON = 1e-7;

interface PlaneTransformCache {
  readonly inverseMatrix: Matrix4;
  readonly matrixElements: Float64Array;
  initialized: boolean;
}

/** Maintains the single closest exact tracked-plane hit used by placement. */
export class PlaneProcessSystem extends createSystem({
  planeEntities: { required: [XRPlaneComponent] },
  grabbedEntities: {
    required: [CustomGrab],
    where: [eq(CustomGrab, "isGrabbed", true)],
  },
}) {
  public xrInputManager!: XrInputManager | null;
  public sceneManager!: SceneManager | null;

  private currentGrabbedEntity: Entity | null = null;
  private currentSnappableSurface: Entity | null = null;
  private readonly planeTransforms = new Map<Entity, PlaneTransformCache>();
  private readonly rayOrigin = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly handWorldPosition = new Vector3();
  private readonly handWorldQuaternion = new Quaternion();
  private readonly placementPosition = new Vector3();
  private readonly objectWorldQuaternion = new Quaternion();
  private readonly localRayOrigin = new Vector3();
  private readonly localRayDirection = new Vector3();
  private readonly localHitPoint = new Vector3();
  private readonly worldHitPoint = new Vector3();
  private readonly closestHitPoint = new Vector3();
  private closestHitSurface: Entity | null = null;
  private closestHitDistance = NO_INTERSECTION_DISTANCE;

  public hasDetectedPlanes(): boolean {
    return this.queries.planeEntities.entities.size > 0;
  }

  override init(): void {
    this.cleanupFuncs.push(
      this.queries.planeEntities.subscribe("qualify", (entity) => {
        if (!entity.hasComponent(SnappableSurface)) {
          entity.addComponent(SnappableSurface);
        }
        this.planeTransforms.set(entity, this.createTransformCache());
      }),
      this.queries.planeEntities.subscribe("disqualify", (entity) => {
        this.planeTransforms.delete(entity);
        if (this.currentSnappableSurface === entity) {
          this.currentSnappableSurface = null;
        }
      }),
      this.queries.grabbedEntities.subscribe("qualify", (entity) => {
        this.currentGrabbedEntity = entity;
      }),
      this.queries.grabbedEntities.subscribe("disqualify", (entity) => {
        if (this.currentGrabbedEntity === entity) {
          this.currentGrabbedEntity = null;
          this.clearCurrentSurface();
        }
      }),
    );
  }

  /** Returns whether an exact tracked surface exists within two meters below the head. */
  public isUserInScannedRoom(): boolean {
    if (!this.world?.camera || !this.hasDetectedPlanes()) return false;
    this.world.player.head.getWorldPosition(this.rayOrigin);
    this.rayDirection.set(0, -1, 0);
    return this.findClosestPlaneHit(this.rayOrigin, this.rayDirection, 2);
  }

  override update(): void {
    const grabbedEntity = this.currentGrabbedEntity;
    const object = grabbedEntity?.object3D;
    const cursorOffset = object?.userData.cursorOffset as Vector3 | undefined;
    if (!grabbedEntity || !object || !cursorOffset) {
      this.clearCurrentSurface();
      return;
    }

    const pinchingHand = this.xrInputManager?.getPinchingRayspace;
    if (!pinchingHand || !this.hasDetectedPlanes()) {
      this.clearCurrentSurface();
      return;
    }

    pinchingHand.getWorldPosition(this.handWorldPosition);
    pinchingHand.getWorldQuaternion(this.handWorldQuaternion);
    this.rayDirection
      .set(0, 0, -1)
      .applyQuaternion(this.handWorldQuaternion)
      .normalize();
    this.placementPosition
      .copy(this.handWorldPosition)
      .addScaledVector(
        this.rayDirection,
        object.userData.placementDistance as number,
      )
      .add(cursorOffset);

    const orientation = object.userData.orientation as string | undefined;
    if (!orientation) {
      this.clearCurrentSurface();
      return;
    }

    const placingOption = grabbedEntity.getValue(
      CustomGrab,
      "placingOption",
    ) as PlacingOptions;
    if (placingOption === PlacingOptions.FarGrab) {
      this.rayOrigin.copy(this.handWorldPosition);
      this.rayDirection.subVectors(
        this.placementPosition,
        this.handWorldPosition,
      );
    } else if (
      orientation === PreferredOrientation.horizontal ||
      orientation === PreferredOrientation.horizontalInverted
    ) {
      this.rayOrigin.copy(this.placementPosition);
      this.rayDirection.set(0, -1, 0);
    } else {
      const productObject = this.sceneManager?.currentProduct?.entity?.object3D;
      if (!productObject) {
        this.clearCurrentSurface();
        return;
      }
      this.rayOrigin.copy(this.placementPosition);
      productObject.getWorldQuaternion(this.objectWorldQuaternion);
      this.rayDirection
        .set(0, 0, -1)
        .applyQuaternion(this.objectWorldQuaternion);
    }

    if (!this.findClosestPlaneHit(this.rayOrigin, this.rayDirection)) {
      this.clearCurrentSurface();
      return;
    }

    this.setCurrentSurface(
      this.closestHitSurface!,
      this.closestHitDistance,
      this.closestHitPoint,
    );
  }

  /** Intersects a ray with exact WebXR polygons without allocating hit objects. */
  private findClosestPlaneHit(
    origin: Vector3,
    direction: Vector3,
    maxDistance = Number.POSITIVE_INFINITY,
  ): boolean {
    this.closestHitSurface = null;
    this.closestHitDistance = maxDistance;

    for (const entity of this.queries.planeEntities.entities) {
      const object = entity.object3D;
      if (!object) continue;
      const plane = entity.getValue(
        XRPlaneComponent,
        "_plane",
      ) as XRPlane | null;
      if (!plane || plane.polygon.length < 3) continue;

      const inverseMatrix = this.getInverseWorldMatrix(entity, object);
      this.localRayOrigin.copy(origin).applyMatrix4(inverseMatrix);
      this.localRayDirection.copy(direction).transformDirection(inverseMatrix);
      const denominator = this.localRayDirection.y;
      if (Math.abs(denominator) <= PARALLEL_EPSILON) continue;

      const distanceAlongLocalRay = -this.localRayOrigin.y / denominator;
      if (distanceAlongLocalRay < 0) continue;
      this.localHitPoint
        .copy(this.localRayDirection)
        .multiplyScalar(distanceAlongLocalRay)
        .add(this.localRayOrigin);
      if (
        !isPointInTrackedPlanePolygon(
          this.localHitPoint.x,
          this.localHitPoint.z,
          plane.polygon,
        )
      ) {
        continue;
      }

      this.worldHitPoint
        .copy(this.localHitPoint)
        .applyMatrix4(object.matrixWorld);
      const worldDistance = this.worldHitPoint.distanceTo(origin);
      if (worldDistance > this.closestHitDistance) continue;
      this.closestHitDistance = worldDistance;
      this.closestHitSurface = entity;
      this.closestHitPoint.copy(this.worldHitPoint);
    }

    return this.closestHitSurface !== null;
  }

  private getInverseWorldMatrix(entity: Entity, object: Object3D): Matrix4 {
    let cache = this.planeTransforms.get(entity);
    if (!cache) {
      cache = this.createTransformCache();
      this.planeTransforms.set(entity, cache);
    }

    object.updateWorldMatrix(true, false);
    const elements = object.matrixWorld.elements;
    let changed = !cache.initialized;
    for (let i = 0; i < elements.length; i++) {
      if (cache.matrixElements[i] !== elements[i]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      for (let i = 0; i < elements.length; i++) {
        cache.matrixElements[i] = elements[i];
      }
      cache.inverseMatrix.copy(object.matrixWorld).invert();
      cache.initialized = true;
    }
    return cache.inverseMatrix;
  }

  private createTransformCache(): PlaneTransformCache {
    return {
      inverseMatrix: new Matrix4(),
      matrixElements: new Float64Array(16),
      initialized: false,
    };
  }

  private setCurrentSurface(
    surface: Entity,
    distance: number,
    point: Vector3,
  ): void {
    if (this.currentSnappableSurface !== surface) {
      this.clearCurrentSurface();
      surface.setValue(SnappableSurface, "intersected", true);
      this.currentSnappableSurface = surface;
    }

    SnappableSurface.data.intersectionDistance[surface.index] = distance;
    const targetPoint = surface.getVectorView(
      SnappableSurface,
      "intersectionPoint",
    );
    targetPoint[0] = point.x;
    targetPoint[1] = point.y;
    targetPoint[2] = point.z;
  }

  private clearCurrentSurface(): void {
    const surface = this.currentSnappableSurface;
    if (!surface) return;
    surface.setValue(SnappableSurface, "intersected", false);
    SnappableSurface.data.intersectionDistance[surface.index] =
      NO_INTERSECTION_DISTANCE;
    this.currentSnappableSurface = null;
  }
}
