/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, Vector3, Quaternion } from "@iwsdk/core";
import { CONFIG } from "../../config/ViewerConfig.js";
import { CustomFollower } from "../../features/CustomFollower/CustomFollowerSystem.js";
import { PanelDistanceScale } from "../../features/DynamicScaleUI/PanelDistanceScale.js";
import { RepositionProductPanel } from "./RepositionProductPanel.js";

const RepositionProductPanelQueries = {
  productPanelsToReposition: {
    required: [RepositionProductPanel, PanelDistanceScale],
  },
};

/**
 * Keeps the product details card beside the unified vertical control rail.
 */
export class RepositionProductPanelSystem extends createSystem(
  RepositionProductPanelQueries,
) {
  private readonly identityQuat = new Quaternion();
  private readonly inverseParentQuaternion = new Quaternion();
  private readonly parentWorldScale = new Vector3(1, 1, 1);
  private readonly sideDirection = new Vector3();

  /** Processes all product panels that need repositioning each frame. */
  override update() {
    for (const entity of this.queries.productPanelsToReposition.entities) {
      this.repositionProductPanel(entity);
    }
  }

  /** Applies a world-size-aware offset away from the product side. */
  private repositionProductPanel(productPanelEntity: Entity) {
    const controlBarEntity = productPanelEntity.getValue(
      RepositionProductPanel,
      "controlBarEntity",
    ) as Entity;
    const controlBar = controlBarEntity?.object3D;
    const productPanel = productPanelEntity!.object3D;
    if (!controlBar?.visible || !productPanel?.visible) return;
    const { productPanelAttachedHorizontalOffset } =
      CONFIG.ui.panelToProductOffsets;
    const scaleRatio =
      (productPanelEntity.getValue(
        PanelDistanceScale,
        "currenScaleRatio",
      ) as number) ?? 1;
    controlBar.getWorldScale(this.parentWorldScale);
    const controlFollowerSide = controlBarEntity.getVectorView(
      CustomFollower,
      "controlSideDirection",
    );
    let horizontalSign = 1;
    if (controlFollowerSide) {
      this.sideDirection
        .set(
          controlFollowerSide[0],
          controlFollowerSide[1],
          controlFollowerSide[2],
        )
        .applyQuaternion(
          controlBar.getWorldQuaternion(this.inverseParentQuaternion).invert(),
        );
      if (Math.abs(this.sideDirection.x) > 0.5) {
        horizontalSign = Math.sign(this.sideDirection.x) || 1;
      }
    }
    productPanel!.quaternion.copy(this.identityQuat);
    productPanel!.position.set(
      (horizontalSign * productPanelAttachedHorizontalOffset * scaleRatio) /
        Math.max(this.parentWorldScale.x, 1e-6),
      0,
      (-0.02 * scaleRatio) / Math.max(this.parentWorldScale.z, 1e-6),
    );
  }
}
