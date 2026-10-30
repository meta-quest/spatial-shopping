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
  Hovered,
  UIKitDocument,
  Entity,
} from "@iwsdk/core";
import { SceneManager } from "../../managers/scene/SceneManager";
import { CartManager } from "../../managers/session/CartManager.js";
import { VariantManager } from "../../managers/product/VariantManager.js";
import { createBasePanelSystem } from "../BasePanelSystem.js";
import { BottomControlPanelUIUpdater } from "./BottomControlPanelUIUpdater";
import { CustomGrab } from "../../features/CustomGrab/CustomGrabSystem.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { isRealQuestDevice } from "../../utils/DeviceDetection.js";
import { UI_ASSET_URLS } from "../../../assets.js";

/** State for the unified object control bar. */
export const BottomControlPanelState = createComponent(
  "BottomControlPanelState",
  {
    isVisible: { type: Types.Boolean, default: false },
    isDimensionsVisible: { type: Types.Boolean, default: false },
    isAdjustPositionActive: { type: Types.Boolean, default: false },
    isOcclusionEnabled: { type: Types.Boolean, default: false },
  },
);

const BottomControlPanelQueries = {
  bottomControlPanel: {
    required: [PanelUI, PanelDocument, BottomControlPanelState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.bottomControlPanel)],
  },
  hoveredBottomPanels: {
    required: [PanelUI, Hovered, BottomControlPanelState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.bottomControlPanel)],
  },
  objectSnappedToPlane: {
    required: [CustomGrab],
    where: [eq(CustomGrab, "snappedToPlane", true)],
  },
};

/** Coordinates session, inspection, manipulation, and commerce actions in one bar. */
export class BottomControlPanelSystem extends createBasePanelSystem(
  BottomControlPanelQueries,
)<BottomControlPanelUIUpdater> {
  public sceneManager!: SceneManager | null;
  public cartManager!: CartManager | null;
  public variantManager!: VariantManager | null;
  public areArrowsVisible = false;
  private isProductInfoPanelVisible = false;

  override init(): void {
    this.cleanupFuncs.push(
      this.queries.bottomControlPanel.subscribe("qualify", (entity: Entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (document) this.initializePanelEntity(entity, document);
      }),
      this.queries.hoveredBottomPanels.subscribe("qualify", () => {
        this.uiManager!.onBottomPanelHovered();
      }),
      this.queries.hoveredBottomPanels.subscribe("disqualify", () => {
        this.uiManager!.onBottomPanelUnhovered();
      }),
      this.queries.objectSnappedToPlane.subscribe("qualify", () => {
        this.uiUpdater!.setAdjustPositionEnabled(true);
      }),
      this.queries.objectSnappedToPlane.subscribe("disqualify", () => {
        if (this.areArrowsVisible) {
          this.sceneManager!.getArrowMoverSystemForPlacedProduct()?.handleVisibilityToggle();
        }
        this.resetAdjustPositionButtonState();
        this.uiUpdater!.setAdjustPositionEnabled(false);
      }),
    );
  }

  createUIUpdater(document: UIKitDocument): BottomControlPanelUIUpdater {
    return new BottomControlPanelUIUpdater(
      document,
      this.uiManager?.uiTweenGroup,
    );
  }

  override getPanelState() {
    return BottomControlPanelState.data;
  }

  setupButtonListeners(_entity: Entity): void {
    this.uiUpdater!.getBackButton()?.addEventListener("click", () =>
      this.uiManager!.showLeaveConfirmation(),
    );
    this.uiUpdater!.getMaxMinButton()?.addEventListener("click", () =>
      this.handleMaxMinButtonClick(),
    );
    this.uiUpdater!.getVariantsButton()?.addEventListener("click", () => {
      this.variantManager!.toggleVariantsPanel().catch(
        MessageHandler.reportRejection("Toggling the variants panel"),
      );
    });

    const adjustButton = this.uiUpdater!.getAdjustPositionButton();
    if (adjustButton) {
      this.uiUpdater!.setAdjustPositionEnabled(false);
      adjustButton.addEventListener("click", () =>
        this.handleAdjustPositionButtonClick(),
      );
    }

    this.uiUpdater!.getShowDimensionsButton()?.addEventListener("click", () =>
      this.handleShowDimensionsButtonClick(),
    );
    const occlusionButton = this.uiUpdater!.getOcclusionButton();
    if (occlusionButton) {
      this.uiUpdater!.setOcclusionEnabled(isRealQuestDevice());
      occlusionButton.addEventListener("click", () =>
        this.handleOcclusionButtonClick(),
      );
    }
    this.uiUpdater!.getAddToCartButton()?.addEventListener("click", () => {
      this.cartManager!.addToCart();
      this.updateCartDataButtonState();
    });
    this.uiUpdater!.getCartDataButton()?.addEventListener("click", () =>
      this.uiManager!.showCartDataPanel(),
    );
    this.uiUpdater!.setupAllTooltips();
  }

  private handleMaxMinButtonClick(): void {
    this.isProductInfoPanelVisible = !this.isProductInfoPanelVisible;
    this.uiUpdater!.setMaxMinButtonState(this.isProductInfoPanelVisible);
    this.variantManager!.setProductInfoPanelVisible(
      this.isProductInfoPanelVisible,
    );
  }

  private handleAdjustPositionButtonClick(): void {
    if (this.uiUpdater!.isAdjustPositionDisabled()) {
      MessageHandler.raiseLog(
        "ControlBar: Manipulate button is disabled until the product is snapped",
      );
      return;
    }

    const state = BottomControlPanelState.data;
    const index = this.panelEntity!.index;
    const nextState = state.isAdjustPositionActive[index] !== 1;
    state.isAdjustPositionActive[index] = nextState ? 1 : 0;
    this.sceneManager!.getArrowMoverSystemForPlacedProduct()!.handleVisibilityToggle();
    this.uiUpdater!.setAdjustPositionActive(nextState);
    this.areArrowsVisible = nextState;
  }

  private handleShowDimensionsButtonClick(): void {
    const state = BottomControlPanelState.data;
    const index = this.panelEntity!.index;
    const nextState = state.isDimensionsVisible[index] !== 1;
    state.isDimensionsVisible[index] = nextState ? 1 : 0;
    this.sceneManager!.setProductDimensionsVisibility(nextState);
    this.uiUpdater!.setShowDimensionsActive(nextState);
  }

  private handleOcclusionButtonClick(): void {
    if (this.uiUpdater!.isOcclusionDisabled()) return;

    const state = BottomControlPanelState.data;
    const index = this.panelEntity!.index;
    const nextState = state.isOcclusionEnabled[index] !== 1;
    state.isOcclusionEnabled[index] = nextState ? 1 : 0;
    this.sceneManager!.setOcclusionEnabled(nextState);
    this.uiUpdater!.setOcclusionActive(nextState);
  }

  public resetProductInfoPanelState(): void {
    this.isProductInfoPanelVisible = false;
    this.uiUpdater!.setMaxMinButtonState(false);
  }

  public resetDimensionButtonState(): void {
    BottomControlPanelState.data.isDimensionsVisible[this.panelEntity!.index] =
      0;
    this.uiUpdater!.setShowDimensionsActive(false);
  }

  public resetAdjustPositionButtonState(): void {
    BottomControlPanelState.data.isAdjustPositionActive[
      this.panelEntity!.index
    ] = 0;
    this.uiUpdater!.setAdjustPositionActive(false);
    this.areArrowsVisible = false;
  }

  public resetOcclusionButtonState(): void {
    BottomControlPanelState.data.isOcclusionEnabled[this.panelEntity!.index] =
      0;
    this.uiUpdater!.setOcclusionActive(false);
  }

  public updateVariantsButtonState(): void {
    const product =
      this.variantManager!.viewerProductManager!.getCurrentProduct();
    this.uiUpdater!.setVariantsButtonEnabled(
      Boolean(product?.variations?.length),
    );
  }

  public updateCartDataButtonState(): void {
    const cartData = this.cartManager!.getCartData();
    const itemCount = this.cartManager!.getTotalItemCount();
    this.uiUpdater!.setCartDataButtonEnabled(
      Object.keys(cartData.products).length > 0,
    );
    this.uiUpdater!.updateCartBadge(itemCount);
  }
}
