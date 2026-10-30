/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BufferGeometry,
  Entity,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SceneUnderstandingSystem,
  XRPlane as XRPlaneComponent,
  createSystem,
} from "@iwsdk/core";

type CoreSceneUnderstandingControl = {
  planeFeatureEnabled?: boolean;
  meshFeatureEnabled?: boolean;
};

type TrackedPlaneRecord = {
  entity: Entity;
  readonly poseElements: Float64Array;
  poseInitialized: boolean;
};

/**
 * Synchronizes WebXR planes without IWSDK 0.4.2's per-plane, per-frame
 * BoxGeometry allocation. Core scene understanding remains enabled for anchors.
 */
export class TrackedPlaneSystem extends createSystem({}) {
  private readonly recordsByPlane = new Map<XRPlane, TrackedPlaneRecord>();
  private readonly poseMatrix = new Matrix4();
  private material: MeshBasicMaterial | null = null;

  private readonly onSessionStart = (): void => {
    this.disableCorePlaneUpdates(true);
  };

  private readonly onSessionEnd = (): void => {
    this.recordsByPlane.clear();
  };

  override init(): void {
    this.material = new MeshBasicMaterial();
    if (this.xrManager.getSession()) this.disableCorePlaneUpdates(true);
    this.xrManager.addEventListener("sessionstart", this.onSessionStart);
    this.xrManager.addEventListener("sessionend", this.onSessionEnd);
    this.cleanupFuncs.push(() => {
      this.xrManager.removeEventListener("sessionstart", this.onSessionStart);
      this.xrManager.removeEventListener("sessionend", this.onSessionEnd);
      for (const record of this.recordsByPlane.values()) {
        record.entity.destroy();
      }
      this.recordsByPlane.clear();
      this.material?.dispose();
      this.material = null;
    });
  }

  override update(): void {
    const frame = this.xrFrame;
    const planes = frame?.detectedPlanes;
    const referenceSpace = this.xrManager.getReferenceSpace();
    if (!frame || !planes || !referenceSpace || !this.material) return;

    for (const [plane, record] of this.recordsByPlane) {
      if (planes.has(plane)) continue;
      this.recordsByPlane.delete(plane);
      record.entity.destroy();
    }

    for (const plane of planes) {
      const pose = frame.getPose(plane.planeSpace, referenceSpace);
      if (!pose) continue;

      let record = this.recordsByPlane.get(plane);
      if (!record) {
        const mesh = new Mesh(new BufferGeometry(), this.material);
        mesh.visible = false;
        const entity = this.world.createTransformEntity(mesh);
        entity.addComponent(XRPlaneComponent, { _plane: plane });
        record = {
          entity,
          poseElements: new Float64Array(16),
          poseInitialized: false,
        };
        this.recordsByPlane.set(plane, record);
      }

      const poseElements = pose.transform.matrix;
      let poseChanged = !record.poseInitialized;
      for (let i = 0; i < poseElements.length; i++) {
        if (record.poseElements[i] !== poseElements[i]) {
          poseChanged = true;
          break;
        }
      }
      if (!poseChanged) continue;
      for (let i = 0; i < poseElements.length; i++) {
        record.poseElements[i] = poseElements[i];
      }
      record.poseInitialized = true;
      this.poseMatrix.fromArray(poseElements);
      const object = record.entity.object3D!;
      this.poseMatrix.decompose(
        object.position,
        object.quaternion,
        object.scale,
      );
    }
  }

  private disableCorePlaneUpdates(requireKnownInternals = false): void {
    const coreSystem = this.world.getSystem(
      SceneUnderstandingSystem,
    ) as unknown as CoreSceneUnderstandingControl | null;
    if (coreSystem) {
      const hasExpectedInternals =
        Object.prototype.hasOwnProperty.call(
          coreSystem,
          "planeFeatureEnabled",
        ) &&
        Object.prototype.hasOwnProperty.call(coreSystem, "meshFeatureEnabled");
      if (requireKnownInternals && !hasExpectedInternals) {
        throw new Error(
          "IWSDK scene-understanding internals changed; review TrackedPlaneSystem before upgrading @iwsdk/core.",
        );
      }
      coreSystem.planeFeatureEnabled = false;
      coreSystem.meshFeatureEnabled = false;
    }
  }
}
