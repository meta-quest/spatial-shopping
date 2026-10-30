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
import { CartDataPanelUIUpdater } from "./CartDataPanelUIUpdater.js";
import { SessionEndReason } from "../../managers/session/SessionEndReason.js";
import type { CartManager } from "../../managers/session/CartManager.js";
import type { SceneOpener } from "../../managers/initializer/SceneOpener.js";
import { UI_ASSET_URLS } from "../../../assets.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { RENDER_ORDER } from "../../config/RenderOrder.js";

/** Component storing visibility state for the cart data panel */
export const CartDataPanelState = createComponent("CartDataPanelState", {
  isVisible: { type: Types.Boolean, default: false },
});

const CartDataPanelQueries = {
  cartDataPanel: {
    required: [PanelUI, PanelDocument, CartDataPanelState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.cartDataPanel)],
  },
};

/** Panel system for the cart data panel */
export class CartDataSystem extends createBasePanelSystem(
  CartDataPanelQueries,
)<CartDataPanelUIUpdater> {
  public cartManager!: CartManager | null;
  public sceneOpener!: SceneOpener | null;

  override init(): void {
    this.cleanupFuncs.push(
      this.queries.cartDataPanel.subscribe("qualify", (entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) return;
        this.initializePanelEntity(entity, document, {
          renderOrder: RENDER_ORDER.overlayPanel,
        });
        this.uiUpdater!.connectToCartManager(this.cartManager!);
      }),
    );
  }
  /** Sets up button listeners for the cart data panel. */
  setupButtonListeners(_entity: Entity) {
    this.uiUpdater!.getBackButton()?.addEventListener("click", () =>
      this.hidePanel(),
    );
    this.uiUpdater!.getCheckoutButton()?.addEventListener("click", () => {
      this.sceneOpener!.close(true, SessionEndReason.ProceedToCart).catch(
        MessageHandler.reportRejection(
          "Closing the XR experience for checkout",
        ),
      );
    });
  }

  /** Creates a new cart data panel UI updater. */
  createUIUpdater(document: UIKitDocument): CartDataPanelUIUpdater {
    return new CartDataPanelUIUpdater(document);
  }

  /** Gets the panel state. */
  override getPanelState() {
    return CartDataPanelState.data;
  }
}
