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
  UIKit,
  Entity,
  RayInteractable,
} from "@iwsdk/core";
import { PanelUIUpdater } from "./PanelUIUpdater.js";
import { PointerDragWrapper } from "./PointerDragWrapper.js";
import { createBasePanelSystem } from "../BasePanelSystem.js";
import { ViewerProductManager } from "../../managers/product/ViewerProductManager.js";
import { SceneManager } from "../../managers/scene/SceneManager.js";
import { UI_ASSET_URLS } from "../../../assets.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { pauseUIKitVideo, playUIKitVideo } from "../../utils/UIUtils.js";

/** Delay before playing the loading video, giving UIKit a frame to attach it. */
const LOADING_VIDEO_START_DELAY_MS = 100;

/**
 * Component storing state for the spatial product panel
 */
export const SpatialPanelState = createComponent("SpatialPanelState", {
  isVisible: { type: Types.Boolean, default: false },
  isLoadingProduct: { type: Types.Boolean, default: false },
});

/**
 * Query definitions for the spatial panel.
 * Note: SpatialPanelState not in query - added dynamically on qualify
 */
const SpatialPanelQueries = {
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.productPanel)],
  },
};

export class SpatialPanelSystem extends createBasePanelSystem(
  SpatialPanelQueries,
)<PanelUIUpdater> {
  public viewerProductManager!: ViewerProductManager | null;
  public sceneManager!: SceneManager | null;
  private productImageElement: UIKit.Image | null = null;
  private loadingProductElement: UIKit.Container | null = null;
  private loadingVideoElement: UIKit.Video | null = null;
  private loadingVideoTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerDragWrapper: PointerDragWrapper | null = null;
  private isProductLoaded: boolean = false;

  /** Subscribes to panel qualify/disqualify and initializes product image drag handling. */
  override init(): void {
    this.cleanupFuncs.push(
      this.queries.welcomePanel.subscribe("qualify", (entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) return;

        entity.addComponent(SpatialPanelState);
        this.initializePanelEntity(entity, document);

        this.productImageElement = document.getElementById(
          "product-image",
        ) as UIKit.Image;
        this.loadingProductElement = document.getElementById(
          "loading-product",
        ) as UIKit.Container | null;
        this.loadingVideoElement = document.getElementById(
          "loading-video",
        ) as UIKit.Video | null;

        const productImage = document.getElementById(
          "product-image",
        ) as UIKit.Image;
        if (productImage) {
          this.pointerDragWrapper = new PointerDragWrapper(productImage, () => {
            if (!this.isProductLoaded) return;
            this.sceneManager!.enableMovementOfProduct().catch(
              MessageHandler.reportRejection("Starting product placement"),
            );
            this.pointerDragWrapper!.disable();
            this.hideProductImage();
            this.hide();
          });
        }
      }),
    );

    this.cleanupFuncs.push(
      this.queries.welcomePanel.subscribe("disqualify", () => {
        if (this.pointerDragWrapper) {
          this.pointerDragWrapper.dispose();
          this.pointerDragWrapper = null;
        }
        this.stopLoadingVideo();
      }),
    );
  }

  /** Creates the panel UI updater for the given document. */
  createUIUpdater(document: UIKitDocument): PanelUIUpdater {
    return new PanelUIUpdater(document);
  }

  /** Returns the shared SpatialPanelState data. */
  override getPanelState() {
    return SpatialPanelState.data;
  }

  /** Attaches click handlers to back and hint buttons. */
  setupButtonListeners(_entity: Entity) {
    const buttons: [() => UIKit.Container | null, () => void][] = [
      [
        () => this.uiUpdater!.getBackButton(),
        () => this.uiManager!.showLeaveConfirmation(),
      ],
      [
        () => this.uiUpdater!.getHintButton(),
        () => this.uiManager!.showTooltipSteppedTutorial(),
      ],
    ];
    buttons.forEach(([getBtn, action]) => {
      const btn = getBtn();
      if (btn) btn.addEventListener("click", action);
    });
  }

  /** Updates and displays product info from the current viewer product. */
  public setAndDisplayProduct() {
    const productData = this.viewerProductManager!.getCurrentProduct();
    if (productData && this.uiUpdater)
      this.uiUpdater.updateProductInfo(productData);
  }

  /** Shows the product image without affecting the overlaid loading state. */
  showProductImage() {
    if (this.productImageElement) {
      this.isProductLoaded = true;
      this.productImageElement.setProperties({ display: "flex" });
    }
  }

  /** Hides the product image while preserving its layout container. */
  hideProductImage() {
    if (this.productImageElement)
      this.productImageElement.setProperties({ display: "none" });
  }

  /** Shows loading state and hides product image. */
  showLoadingProduct() {
    if (!this.panelEntity) return;
    SpatialPanelState.data.isLoadingProduct[this.panelEntity.index] = 1;
    if (this.loadingProductElement) {
      this.isProductLoaded = false;
      this.loadingProductElement.setProperties({ display: "flex", opacity: 1 });
      this.playLoadingVideo();
    }
    this.hideProductImage();
  }

  /** Hides loading state and shows product image. */
  hideLoadingProduct() {
    if (!this.panelEntity) return;
    SpatialPanelState.data.isLoadingProduct[this.panelEntity.index] = 0;
    if (this.loadingProductElement) {
      this.loadingProductElement.setProperties({ display: "none", opacity: 0 });
    }
    this.stopLoadingVideo();
    this.showProductImage();
  }

  /** Activates panel entity and shows panel with animation. */
  public override showPanel() {
    if (!this.panelEntity) return;
    this.panelEntity.active = true;
    super.showPanel();
  }

  /** Shows panel in minimized (non-interactable) state. */
  public showPanelMinimized() {
    if (!this.panelEntity) return;
    this.panelEntity.active = true;
    super.showPanel();
    this.panelEntity!.removeComponent(RayInteractable);
  }

  /** Activates panel entity and hides panel with animation. */
  public hide() {
    if (!this.panelEntity) return;
    this.panelEntity.active = true;
    this.stopLoadingVideo();
    this.hidePanel();
  }

  /** Returns the product image UIKit element or null. */
  public getProductImageElement(): UIKit.Image | null {
    return this.productImageElement;
  }

  public restartDrag(): void {
    this.pointerDragWrapper?.enable();
  }

  /** Plays the loading video once UIKit has had a frame to attach it. */
  private playLoadingVideo(): void {
    this.cancelLoadingVideoTimer();
    this.loadingVideoTimer = setTimeout(() => {
      this.loadingVideoTimer = null;
      playUIKitVideo(this.loadingVideoElement);
    }, LOADING_VIDEO_START_DELAY_MS);
  }

  /** Cancels a pending play and pauses the loading video. */
  private stopLoadingVideo(): void {
    this.cancelLoadingVideoTimer();
    pauseUIKitVideo(this.loadingVideoElement);
  }

  private cancelLoadingVideoTimer(): void {
    if (this.loadingVideoTimer !== null) {
      clearTimeout(this.loadingVideoTimer);
      this.loadingVideoTimer = null;
    }
  }

  /** Hides the bottom control bar. */
  public hideBottomControlBar() {
    this.uiUpdater!.hideBottomPanel();
  }

  /** Shows the bottom control bar. */
  public showBottomControlBar() {
    this.uiUpdater!.showBottomPanel();
  }
}
