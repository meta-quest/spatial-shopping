/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  PanelDocument,
  PanelUI,
  UIKitDocument,
  Vector3,
} from "@iwsdk/core";
import { PanelDistanceScale } from "./PanelDistanceScale.js";
import { PanelSize } from "./PanelSize.js";

const MIN_SCALE = 1e-6;
const SCALE_EPSILON = 0.0001;

/** Computes the uniform fit scale for UIKit centimetres and target metres. */
export function computePanelFitScale(
  widthCm: number,
  heightCm: number,
  maxWidthMeters: number,
  maxHeightMeters: number,
): number {
  if (
    widthCm <= 0 ||
    heightCm <= 0 ||
    maxWidthMeters <= 0 ||
    maxHeightMeters <= 0
  ) {
    return 1;
  }

  return Math.min(
    maxWidthMeters / (widthCm / 100),
    maxHeightMeters / (heightCm / 100),
  );
}

/**
 * Preserves the pre-0.5 panel bounds while letting the entity transform own
 * world-space sizing, as required since IWSDK 0.5.
 */
export class PanelUISizeSystem extends createSystem({
  panels: { required: [PanelUI, PanelDocument, PanelSize] },
}) {
  private readonly parentWorldScale = new Vector3(1, 1, 1);

  override update(): void {
    for (const entity of this.queries.panels.entities) {
      const object = entity.object3D;
      if (!object) continue;

      const document = entity.getValue(
        PanelDocument,
        "document",
      ) as UIKitDocument | null;
      const intrinsicSize = document?.rootElement.size?.value;
      if (!intrinsicSize || intrinsicSize.length < 2) continue;

      const widthCm = intrinsicSize[0];
      const heightCm = intrinsicSize[1];
      if (typeof widthCm !== "number" || typeof heightCm !== "number") {
        continue;
      }

      const fitScale = computePanelFitScale(
        widthCm,
        heightCm,
        entity.getValue(PanelSize, "maxWidth") as number,
        entity.getValue(PanelSize, "maxHeight") as number,
      );
      const distanceScale = entity.hasComponent(PanelDistanceScale)
        ? (entity.getValue(PanelDistanceScale, "currenScaleRatio") as number)
        : 1;
      const targetWorldScale = fitScale * distanceScale;

      if (object.parent) {
        object.parent.getWorldScale(this.parentWorldScale);
      } else {
        this.parentWorldScale.set(1, 1, 1);
      }

      const targetX =
        targetWorldScale / Math.max(this.parentWorldScale.x, MIN_SCALE);
      const targetY =
        targetWorldScale / Math.max(this.parentWorldScale.y, MIN_SCALE);
      const targetZ =
        targetWorldScale / Math.max(this.parentWorldScale.z, MIN_SCALE);

      if (
        Math.abs(object.scale.x - targetX) < SCALE_EPSILON &&
        Math.abs(object.scale.y - targetY) < SCALE_EPSILON &&
        Math.abs(object.scale.z - targetZ) < SCALE_EPSILON
      ) {
        continue;
      }
      object.scale.set(targetX, targetY, targetZ);
    }
  }
}
