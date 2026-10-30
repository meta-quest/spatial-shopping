/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BufferGeometry,
  DoubleSide,
  Entity,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  XRPlane as XRPlaneComponent,
  createSystem,
  eq,
} from "@iwsdk/core";
import { CONFIG } from "../../config/ViewerConfig.js";
import { XRSessionErrorCode } from "../../managers/session/ErrorCodes.js";
import { loadShader } from "../../shaders/loadShader.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { CustomGrab, GrabState } from "../CustomGrab/CustomGrabSystem.js";
import { SnappableSurface } from "../PlaneProcessSystem/SnappableSurface.js";
import {
  createTrackedPlaneGeometry,
  trackedPlanePolygonMatchesSnapshot,
  writeTrackedPlanePolygonSnapshot,
} from "./TrackedPlaneGeometry.js";
import { calculatePlacementReticleRadius } from "./PlacementReticleSizing.js";

const RETICLE_GEOMETRY_KEY = "placementReticleGeometry";
const RETICLE_PLANE_CHANGE_KEY = "placementReticlePlaneChangeTime";
const RETICLE_POLYGON_SNAPSHOT_KEY = "placementReticlePolygonSnapshot";

/**
 * Projects a procedural placement field directly onto the exact tracked-plane
 * polygon. The lattice phase is evaluated in reference-space meters, so dots
 * remain world-locked while the radial reveal follows the local hit point.
 */
export class PlacementReticleSystem extends createSystem({
  trackedSurfaces: { required: [XRPlaneComponent, SnappableSurface] },
  intersectedSurfaces: {
    required: [XRPlaneComponent, SnappableSurface],
    where: [eq(SnappableSurface, "intersected", true)],
  },
  translatingEntities: {
    required: [CustomGrab],
    where: [eq(CustomGrab, "state", GrabState.TRANSLATING)],
  },
}) {
  private material: ShaderMaterial | null = null;
  private readonly emptyGeometry = new BufferGeometry();
  private productEntity: Entity | null = null;
  private activeSurface: Entity | null = null;
  private opacity = 0;
  private targetOpacity = 0;
  private readonly intersectionWorld = new Vector3();
  private readonly intersectionLocal = new Vector3();
  private readonly surfaceNormal = new Vector3();
  private readonly patternRight = new Vector3();
  private readonly patternUp = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);
  private readonly headWorldPosition = new Vector3();
  private readonly headLocalPosition = new Vector3();
  private readonly surfaceInverseMatrix = new Matrix4();
  private lastProductScaleX = Number.NaN;
  private lastProductScaleY = Number.NaN;
  private lastProductScaleZ = Number.NaN;
  private geometryRefreshAccumulator = 0;
  private static readonly GEOMETRY_REFRESH_INTERVAL = 0.25;

  override init(): void {
    this.material = this.createMaterial();

    this.cleanupFuncs.push(
      this.queries.trackedSurfaces.subscribe("qualify", (entity) => {
        this.configureTrackedSurface(entity);
      }),
      this.queries.trackedSurfaces.subscribe("disqualify", (entity) => {
        if (this.activeSurface === entity) this.activeSurface = null;
        this.disposeTrackedSurfaceGeometry(entity);
      }),
      this.queries.intersectedSurfaces.subscribe("qualify", (entity) => {
        if (this.activeSurface !== entity) {
          this.setSurfaceVisible(this.activeSurface, false);
          this.activeSurface = entity;
        }
      }),
      this.queries.intersectedSurfaces.subscribe("disqualify", (entity) => {
        this.setSurfaceVisible(entity, false);
        if (this.activeSurface === entity) this.activeSurface = null;
      }),
      this.queries.translatingEntities.subscribe("qualify", (entity) => {
        this.productEntity = entity;
        this.invalidateProductScale();
        this.updateReticleSize(entity);
        this.showReticle();
      }),
      this.queries.translatingEntities.subscribe("disqualify", (entity) => {
        if (this.productEntity === entity) {
          this.productEntity = null;
          this.invalidateProductScale();
        }
        this.hideReticle();
      }),
      () => {
        for (const entity of this.queries.trackedSurfaces.entities) {
          this.disposeTrackedSurfaceGeometry(entity);
        }
        this.material?.dispose();
        this.material = null;
        this.emptyGeometry.dispose();
      },
    );
  }

  override update(delta: number): void {
    this.geometryRefreshAccumulator += delta;
    if (
      this.geometryRefreshAccumulator >=
      PlacementReticleSystem.GEOMETRY_REFRESH_INTERVAL
    ) {
      this.geometryRefreshAccumulator = 0;
      this.refreshChangedPlaneGeometry();
    }

    const surface = this.activeSurface;
    if (surface) this.refreshSurfaceGeometryIfChanged(surface);
    const product = this.productEntity;
    const material = this.material;
    if (product && material) this.updateReticleSize(product);
    if (!surface || !product || !material) return;

    this.opacity +=
      (this.targetOpacity - this.opacity) *
      Math.min(1, delta * CONFIG.placement.reticle.opacityTransitionSpeed);
    if (Math.abs(this.targetOpacity - this.opacity) < 0.001) {
      this.opacity = this.targetOpacity;
    }

    const intersectionPoint = surface.getVectorView(
      SnappableSurface,
      "intersectionPoint",
    );
    const surfaceObject = surface.object3D;
    if (!surfaceObject) return;
    surfaceObject.updateWorldMatrix(true, false);
    this.surfaceInverseMatrix.copy(surfaceObject.matrixWorld).invert();
    this.intersectionWorld.fromArray(intersectionPoint);
    this.intersectionLocal
      .copy(this.intersectionWorld)
      .applyMatrix4(this.surfaceInverseMatrix);

    const center = material.uniforms.uCenterLocal.value as Vector2;
    center.set(this.intersectionLocal.x, this.intersectionLocal.z);
    this.surfaceNormal
      .set(0, 1, 0)
      .transformDirection(surfaceObject.matrixWorld);
    if (Math.abs(this.surfaceNormal.dot(this.worldUp)) > 0.999) {
      this.patternRight.set(1, 0, 0);
      this.patternUp.set(0, 0, 1);
    } else {
      this.patternRight
        .crossVectors(this.worldUp, this.surfaceNormal)
        .normalize();
      this.patternUp
        .crossVectors(this.surfaceNormal, this.patternRight)
        .normalize();
    }
    (material.uniforms.uPatternRight.value as Vector3).copy(this.patternRight);
    (material.uniforms.uPatternUp.value as Vector3).copy(this.patternUp);
    this.world.player.head.getWorldPosition(this.headWorldPosition);
    this.headLocalPosition
      .copy(this.headWorldPosition)
      .applyMatrix4(this.surfaceInverseMatrix);
    material.uniforms.uSurfaceOffsetSign.value =
      this.headLocalPosition.y >= 0 ? 1 : -1;
    material.uniforms.uOpacity.value = this.opacity;
    material.uniforms.uIsValid.value = product.getValue(
      CustomGrab,
      "snappedToPlane",
    )
      ? 1
      : 0;

    this.setSurfaceVisible(surface, this.opacity > 0.01);
  }

  showReticle(): void {
    this.targetOpacity = 1;
  }

  public hideReticle(): void {
    this.targetOpacity = 0;
    this.opacity = 0;
    if (this.material) this.material.uniforms.uOpacity.value = 0;
    this.setSurfaceVisible(this.activeSurface, false);
  }

  private createMaterial(): ShaderMaterial {
    const pair = loadShader("reticle");
    if (!pair) {
      throw MessageHandler.raiseError(
        XRSessionErrorCode.PLACEMENT_RETICLE_SHADER_LOAD_FAILED,
      );
    }

    try {
      return new ShaderMaterial({
        uniforms: {
          uCenterLocal: { value: new Vector2() },
          uPatternRight: { value: new Vector3(1, 0, 0) },
          uPatternUp: { value: new Vector3(0, 0, 1) },
          uOpacity: { value: 0 },
          uIsValid: { value: 1 },
          uRadius: { value: CONFIG.placement.reticle.fallbackRadius },
          uFadeDistance: { value: CONFIG.placement.reticle.fadeDistance },
          uSpacing: { value: CONFIG.placement.reticle.spacing },
          uDotRadius: { value: CONFIG.placement.reticle.dotRadius },
          uSurfaceOffset: { value: CONFIG.placement.reticle.surfaceOffset },
          uSurfaceOffsetSign: { value: 1 },
        },
        vertexShader: pair.vertex,
        fragmentShader: pair.fragment,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      });
    } catch {
      throw MessageHandler.raiseError(
        XRSessionErrorCode.PLACEMENT_RETICLE_MATERIAL_LOAD_FAILED,
      );
    }
  }

  private configureTrackedSurface(entity: Entity): void {
    const mesh = entity.object3D;
    if (!(mesh instanceof Mesh) || !this.material) return;

    const plane = entity.getValue(XRPlaneComponent, "_plane") as XRPlane | null;
    if (!plane) return;

    const ownedGeometry = mesh.userData[RETICLE_GEOMETRY_KEY] as
      BufferGeometry | undefined;
    mesh.userData[RETICLE_POLYGON_SNAPSHOT_KEY] =
      writeTrackedPlanePolygonSnapshot(
        plane.polygon,
        mesh.userData[RETICLE_POLYGON_SNAPSHOT_KEY] as Float64Array | undefined,
      );
    mesh.userData[RETICLE_PLANE_CHANGE_KEY] = plane.lastChangedTime;

    const geometry = createTrackedPlaneGeometry(plane.polygon);
    if (!geometry) {
      if (ownedGeometry) ownedGeometry.dispose();
      else if (mesh.geometry !== this.emptyGeometry) mesh.geometry.dispose();
      delete mesh.userData[RETICLE_GEOMETRY_KEY];
      mesh.geometry = this.emptyGeometry;
      mesh.visible = false;
      return;
    }

    if (ownedGeometry) ownedGeometry.dispose();
    else if (mesh.geometry !== this.emptyGeometry) mesh.geometry.dispose();
    delete mesh.userData[RETICLE_GEOMETRY_KEY];
    mesh.geometry = geometry;
    mesh.material = this.material;
    mesh.renderOrder = CONFIG.placement.reticle.renderOrder;
    mesh.visible = false;
    mesh.userData[RETICLE_GEOMETRY_KEY] = geometry;
  }

  private refreshChangedPlaneGeometry(): void {
    for (const entity of this.queries.trackedSurfaces.entities) {
      this.refreshSurfaceGeometryIfChanged(entity);
    }
  }

  private refreshSurfaceGeometryIfChanged(entity: Entity): void {
    const mesh = entity.object3D;
    if (!(mesh instanceof Mesh)) return;
    const plane = entity.getValue(XRPlaneComponent, "_plane") as XRPlane | null;
    if (!plane) return;
    if (mesh.userData[RETICLE_PLANE_CHANGE_KEY] === plane.lastChangedTime)
      return;
    mesh.userData[RETICLE_PLANE_CHANGE_KEY] = plane.lastChangedTime;
    const snapshot = mesh.userData[RETICLE_POLYGON_SNAPSHOT_KEY] as
      Float64Array | undefined;
    if (trackedPlanePolygonMatchesSnapshot(plane.polygon, snapshot)) return;
    this.configureTrackedSurface(entity);
  }

  private disposeTrackedSurfaceGeometry(entity: Entity): void {
    const mesh = entity.object3D;
    if (!(mesh instanceof Mesh)) return;
    const geometry = mesh.userData[RETICLE_GEOMETRY_KEY] as
      BufferGeometry | undefined;
    geometry?.dispose();
    delete mesh.userData[RETICLE_GEOMETRY_KEY];
    delete mesh.userData[RETICLE_PLANE_CHANGE_KEY];
    delete mesh.userData[RETICLE_POLYGON_SNAPSHOT_KEY];
  }

  private setSurfaceVisible(entity: Entity | null, visible: boolean): void {
    if (entity?.object3D) entity.object3D.visible = visible;
  }

  private updateReticleSize(product: Entity): void {
    const object = product.object3D;
    const material = this.material;
    if (!object || !material) return;

    const scale = object.scale;
    if (
      scale.x === this.lastProductScaleX &&
      scale.y === this.lastProductScaleY &&
      scale.z === this.lastProductScaleZ
    ) {
      return;
    }
    this.lastProductScaleX = scale.x;
    this.lastProductScaleY = scale.y;
    this.lastProductScaleZ = scale.z;

    material.uniforms.uRadius.value = calculatePlacementReticleRadius(
      object.userData.bboxSize as Vector3 | undefined,
      scale,
      object.userData.orientation as string | undefined,
      CONFIG.placement.reticle,
    );
  }

  private invalidateProductScale(): void {
    this.lastProductScaleX = Number.NaN;
    this.lastProductScaleY = Number.NaN;
    this.lastProductScaleZ = Number.NaN;
  }
}
