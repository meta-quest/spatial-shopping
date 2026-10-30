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
  Hovered,
} from "@iwsdk/core";
import { VariantSelectorUIUpdater } from "./VariantSelectorUIUpdater.js";
import { ProductVariation } from "../../types/ProductData.js";
import {
  CustomGrab,
  GrabState,
} from "../../features/CustomGrab/CustomGrabSystem.js";
import { createBasePanelSystem } from "../BasePanelSystem.js";
import { imagePreloader } from "../../utils/ImagePreloader.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { VariantManager } from "../../managers/product/VariantManager.js";
import { UI_ASSET_URLS } from "../../../assets.js";

/**
 * Component storing state for variant selector panel
 */
export const VariantSelectorState = createComponent("VariantSelectorState", {
  isVisible: { type: Types.Boolean, default: false },
  productId: { type: Types.String, default: "" },
  selectedVariantId: { type: Types.String, default: "" },
  currentPage: { type: Types.Int8, default: 0 },
});

/**
 * Query definitions for the variant selector panel
 */
const VariantSelectorQueries = {
  variantPanel: {
    required: [PanelUI, PanelDocument, VariantSelectorState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.variantSelector)],
  },
  idleEntities: {
    required: [CustomGrab],
    where: [eq(CustomGrab, "state", GrabState.IDLE)],
  },
  hoveredPanelEntities: {
    required: [PanelUI, Hovered, VariantSelectorState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.variantSelector)],
  },
};

export class VariantSelectorSystem extends createBasePanelSystem(
  VariantSelectorQueries,
)<VariantSelectorUIUpdater> {
  public variantManager!: VariantManager | null;
  private currentVariants: ProductVariation[] = [];
  private currentPage: number = 0;

  /**
   * Subscribes to variant panel, idle entities, and hovered panel queries.
   */
  override init(): void {
    this.cleanupFuncs.push(
      this.queries.variantPanel.subscribe("qualify", (entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) return;
        this.initializePanelEntity(entity, document);
      }),
    );

    this.cleanupFuncs.push(
      this.queries.idleEntities.subscribe("disqualify", () => {
        this.uiManager!.hideVariantSelector();
      }),
    );

    this.cleanupFuncs.push(
      this.queries.hoveredPanelEntities.subscribe("qualify", () => {
        this.uiManager!.onVariantPanelHovered();
      }),
    );

    this.cleanupFuncs.push(
      this.queries.hoveredPanelEntities.subscribe("disqualify", () => {
        this.uiManager!.onVariantPanelUnhovered();
      }),
    );
  }

  /**
   * Creates a VariantSelectorUIUpdater for the given document.
   */
  createUIUpdater(document: UIKitDocument): VariantSelectorUIUpdater {
    return new VariantSelectorUIUpdater(document);
  }

  /**
   * Returns the shared VariantSelectorState data.
   */
  override getPanelState() {
    return VariantSelectorState.data;
  }

  /**
   * Attaches click listeners to variant cards and pagination buttons.
   */
  setupButtonListeners(_entity: Entity) {
    for (let i = 0; i < 4; i++) {
      const variantCard = this.uiUpdater!.getVariantCard(i);
      if (variantCard) {
        variantCard.addEventListener(
          "click",
          () => void this.handleVariantSelection(i),
        );
      }
    }

    const prevButton = this.uiUpdater?.getPrevButton();
    if (prevButton)
      prevButton.addEventListener("click", () => this.previousPage());

    const nextButton = this.uiUpdater?.getNextButton();
    if (nextButton) nextButton.addEventListener("click", () => this.nextPage());
  }

  /**
   * Handles variant card click: updates selection state and notifies VariantManager.
   */
  private async handleVariantSelection(index: number): Promise<void> {
    const maxVariants = this.uiUpdater!.getMaxVariants() || 4;
    const startIndex = this.currentPage * maxVariants;
    const actualIndex = startIndex + index;
    if (actualIndex >= this.currentVariants.length) return;

    const state = VariantSelectorState.data;
    const panelIndex = this.panelEntity!.index;
    const selectedVariant = this.currentVariants[actualIndex];

    try {
      const committed =
        await this.variantManager!.handleVariantSelected(selectedVariant);
      if (!committed) return;
      state.selectedVariantId[panelIndex] = selectedVariant.id;
    } catch (error) {
      MessageHandler.raiseWarning(`Variant selection failed: ${String(error)}`);
    }

    const visibleStartIndex = this.currentPage * maxVariants;
    for (let i = 0; i < maxVariants; i++) {
      const variant = this.currentVariants[visibleStartIndex + i];
      this.uiUpdater!.setCardSelected(
        i,
        variant?.id === state.selectedVariantId[panelIndex],
      );
    }
  }

  /**
   * Shows the panel with the given variants, product ID, and selected variant.
   */
  public showPanelWithVariants(
    variants: ProductVariation[],
    productId: string,
    selectedVariantId: string,
  ) {
    this.currentVariants = variants;
    this.currentPage = 0;

    const state = VariantSelectorState.data;
    const idx = this.panelEntity!.index;
    state.productId[idx] = productId;
    state.selectedVariantId[idx] = selectedVariantId;
    state.currentPage[idx] = 0;

    const maxVariants = this.uiUpdater!.getMaxVariants();
    const startIndex = this.currentPage * maxVariants;
    const totalPages = this.getTotalPages();

    this.uiUpdater!.updateVariants(variants, selectedVariantId, startIndex);
    this.uiUpdater!.updatePaginationControls(this.currentPage, totalPages);
    super.showPanel();
  }

  /**
   * Advances to the next page and preloads adjacent pages.
   */
  public nextPage() {
    const maxVariants = this.uiUpdater!.getMaxVariants() || 4;
    const totalPages = Math.ceil(this.currentVariants.length / maxVariants);
    if (this.currentPage >= totalPages - 1) return;

    this.currentPage++;
    this.updateVariantDisplay();
    this.preloadVariantPages(this.currentPage + 1, 2);
  }

  /**
   * Goes back to the previous page and preloads adjacent pages.
   */
  public previousPage() {
    if (this.currentPage <= 0) return;
    this.currentPage--;
    this.updateVariantDisplay();
    const startPage = Math.max(0, this.currentPage - 2);
    const pageCount = this.currentPage - startPage;
    if (pageCount > 0) this.preloadVariantPages(startPage, pageCount);
  }

  /**
   * Preloads variant images for the given page range. Logs warnings via MessageHandler on failure.
   */
  private preloadVariantPages(startPage: number, pageCount: number) {
    imagePreloader
      .preloadVariantPages(
        this.currentVariants,
        startPage,
        pageCount,
        "low",
        "VariantSelectorSystem",
      )
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        MessageHandler.raiseWarning(
          `VariantSelectorSystem: Some images failed to preload: ${message}`,
        );
      });
  }

  /**
   * Refreshes variant cards and pagination controls from current state.
   */
  private updateVariantDisplay() {
    const state = VariantSelectorState.data;
    const idx = this.panelEntity!.index;
    const maxVariants = this.uiUpdater!.getMaxVariants();
    const startIndex = this.currentPage * maxVariants;
    const totalPages = this.getTotalPages();

    state.currentPage[idx] = this.currentPage;
    const selectedVariantId = state.selectedVariantId[idx];

    this.uiUpdater!.updateVariants(
      this.currentVariants,
      selectedVariantId,
      startIndex,
    );
    this.uiUpdater!.updatePaginationControls(this.currentPage, totalPages);
  }

  /**
   * Returns total number of pages for current variants.
   */
  public getTotalPages(): number {
    const maxVariants = this.uiUpdater!.getMaxVariants() || 4;
    return Math.ceil(this.currentVariants.length / maxVariants);
  }

  /**
   * Returns the current page index.
   */
  public getCurrentPage(): number {
    return this.currentPage;
  }
}
