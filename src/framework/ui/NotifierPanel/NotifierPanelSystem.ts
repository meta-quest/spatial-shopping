/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createComponent,
  Types,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  Entity,
} from "@iwsdk/core";
import { createBasePanelSystem } from "../BasePanelSystem.js";
import { UI_ASSET_URLS } from "../../../assets.js";
import { RENDER_ORDER } from "../../config/RenderOrder.js";

/** Component storing visibility state for the wrong-surface notifier panel */
export const NotifierPanelState = createComponent("NotifierPanelState", {
  isVisible: { type: Types.Boolean, default: false },
});

const NotifierPanelQueries = {
  notifierPanel: {
    required: [PanelUI, PanelDocument, NotifierPanelState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.wrongSurfaceNotifier)],
  },
};

/** Panel system for the wrong-surface notifier */
export class NotifierPanelSystem extends createBasePanelSystem(
  NotifierPanelQueries,
)<null> {
  override init(): void {
    this.cleanupFuncs.push(
      this.queries.notifierPanel.subscribe("qualify", (entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) return;
        this.initializePanelEntity(entity, document, {
          renderOrder: RENDER_ORDER.overlayPanel,
        });
      }),
    );
  }

  createUIUpdater(_document: UIKitDocument): null {
    return null;
  }

  override getPanelState() {
    return NotifierPanelState.data;
  }

  setupButtonListeners(_entity: Entity): void {}
}
