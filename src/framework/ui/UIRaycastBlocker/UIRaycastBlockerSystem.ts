/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, PanelUI, Hovered } from "@iwsdk/core";
import { RaycastUtils } from "../../utils/RaycastUtils.js";
import { UI_ASSET_URLS } from "../../../assets.js";

/**
 * UIRaycastBlockerSystem blocks raycasts when hovering over UI panels.
 *
 * This system tracks when any UI panel (with PanelUI component) is being hovered
 * and sets RaycastUtils.WasRaycastConsumed to prevent interaction with 3D objects behind UI.
 *
 * Excludes the initial product panel (xrProductPanel) from blocking.
 */
export class UIRaycastBlockerSystem extends createSystem({
  /** Query for all hovered UI panels */
  hoveredUIPanels: {
    required: [PanelUI, Hovered],
  },
}) {
  private currentlyHoveredPanels: Set<Entity> = new Set();

  /** Config path for the initial product panel to exclude */
  private readonly EXCLUDED_PANEL_CONFIG = UI_ASSET_URLS.productPanel;

  override init(): void {
    this.cleanupFuncs.push(
      this.queries.hoveredUIPanels.subscribe("qualify", (entity) => {
        const panelConfig = entity.getValue(PanelUI, "config");

        if (panelConfig === this.EXCLUDED_PANEL_CONFIG) {
          return;
        }

        this.currentlyHoveredPanels.add(entity);
      }),
    );

    this.cleanupFuncs.push(
      this.queries.hoveredUIPanels.subscribe("disqualify", (entity) => {
        const panelConfig = entity.getValue(PanelUI, "config");

        if (panelConfig === this.EXCLUDED_PANEL_CONFIG) {
          return;
        }

        this.currentlyHoveredPanels.delete(entity);
      }),
    );
  }

  override update() {
    if (this.currentlyHoveredPanels.size > 0) {
      RaycastUtils.WasRaycastConsumed = true;
    }
  }
}
