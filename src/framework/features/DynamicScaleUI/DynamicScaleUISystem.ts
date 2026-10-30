/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, Vector3, MathUtils } from "@iwsdk/core";
import type { UIManager } from "../../managers/ui/UIManager.js";
import { CustomGrab } from "../CustomGrab/CustomGrabSystem.js";
import { SceneManager } from "../../managers/scene/SceneManager.js";
import { PanelDistanceScale } from "./PanelDistanceScale.js";
import { CONFIG } from "../../config/ViewerConfig.js";
import { PanelSize } from "./PanelSize.js";

/** Computes a clamped partial-angular scale. */
export function computeAngularScale(
  distance: number,
  referenceDistance: number,
  exponent: number,
  minScale: number,
  maxScale: number,
): number {
  if (referenceDistance <= 0) return 1;
  const ratio = Math.max(distance, 1e-3) / referenceDistance;
  return MathUtils.clamp(Math.pow(ratio, exponent), minScale, maxScale);
}

/** Frame-rate-independent exponential smoothing. */
export function smoothTowards(
  current: number,
  target: number,
  tau: number,
  delta: number,
): number {
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-delta / tau));
}

/** Applies a dead band around the near-product visibility boundary. */
export function computeForceHidden(
  distance: number,
  hideEnterDistance: number,
  hysteresis: number,
  currentlyHidden: boolean,
): boolean {
  return currentlyHidden
    ? distance < hideEnterDistance + hysteresis
    : distance < hideEnterDistance;
}

export class DynamicScaleUISystem extends createSystem({
  customGrab: { required: [CustomGrab] },
  panels: { required: [PanelSize, PanelDistanceScale] },
}) {
  public uiManager!: UIManager | null;
  public sceneManager!: SceneManager | null;
  private cameraPos = new Vector3();

  private placedObject: Entity | null = null;

  private longestAxis = 0;
  private placedObjectPosition = new Vector3();
  private isForceHidden = false;
  private static readonly SCALE_EPSILON = 0.0001;

  /**
   * Subscribes to customGrab qualification and resets distance ratios when the
   * active product is removed.
   */
  override init() {
    this.cleanupFuncs.push(
      this.queries.customGrab.subscribe("qualify", (entity) => {
        this.placedObject = entity;
        const arrowMover =
          this.sceneManager!.getArrowMoverSystemForPlacedProduct()!;
        const bboxInfo = arrowMover.updateBoundingBoxIfNeeded();
        this.longestAxis = Math.max(bboxInfo.worldSize.x, bboxInfo.worldSize.z);
      }),
    );

    this.cleanupFuncs.push(
      this.queries.customGrab.subscribe("disqualify", (_entity) => {
        this.placedObject = null;
        for (const panel of this.queries.panels.entities) {
          panel.setValue(PanelDistanceScale, "currenScaleRatio", 1);
        }
        this.isForceHidden = false;
      }),
    );
  }

  /**
   * Updates panel scales smoothly to preserve usable apparent target sizes.
   * Also toggles panel visibility when within uiTurnOffDistance + object size.
   */
  override update(delta: number) {
    if (!this.placedObject) return;
    this.world.player.head.getWorldPosition(this.cameraPos);
    this.placedObject!.object3D!.getWorldPosition(this.placedObjectPosition);
    const distance = this.placedObjectPosition.distanceTo(this.cameraPos);

    for (const panel of this.queries.panels.entities) {
      const previousScale = panel.getValue(
        PanelDistanceScale,
        "currenScaleRatio",
      ) as number;
      const targetScale = computeAngularScale(
        distance,
        panel.getValue(PanelDistanceScale, "referenceDistance") as number,
        panel.getValue(PanelDistanceScale, "exponent") as number,
        panel.getValue(PanelDistanceScale, "minScale") as number,
        panel.getValue(PanelDistanceScale, "maxScale") as number,
      );
      const scaleMultiplier = smoothTowards(
        previousScale,
        targetScale,
        panel.getValue(PanelDistanceScale, "smoothingTau") as number,
        delta,
      );
      if (
        Math.abs(scaleMultiplier - previousScale) <
        DynamicScaleUISystem.SCALE_EPSILON
      ) {
        continue;
      }
      panel.setValue(PanelDistanceScale, "currenScaleRatio", scaleMultiplier);
    }

    const hideEnterDistance = CONFIG.ui.uiTurnOffDistance + this.longestAxis;
    this.isForceHidden = computeForceHidden(
      distance,
      hideEnterDistance,
      CONFIG.ui.uiHideHysteresis,
      this.isForceHidden,
    );
    this.uiManager!.changeForcePanelHide(this.isForceHidden);
  }
}
