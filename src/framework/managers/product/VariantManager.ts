/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ProductData, ProductVariation } from "../../types/ProductData";
import { MessageHandler } from "../../utils/MessageHandler";
import { SceneManager } from "../scene/SceneManager";
import { UIManager } from "../ui/UIManager";
import { ViewerProductManager } from "./ViewerProductManager";
import { imagePreloader } from "../../utils/ImagePreloader";

export class VariantManager {
  public viewerProductManager!: ViewerProductManager;
  public sceneManager!: SceneManager;
  public uiManager!: UIManager;
  private selectionGeneration = 0;

  /**
   * Applies the default variant for the given product if none is selected.
   * @param productData - The product data containing variant information.
   */
  public async applyDefaultVariant(productData: ProductData): Promise<void> {
    const currentProduct = this.viewerProductManager!.getCurrentProduct();

    if (currentProduct!.selectedVariationId) {
      return;
    }

    const variants = await this.getProductVariants(productData.id);
    if (!variants || variants.length === 0) {
      return;
    }

    const defaultVariant = variants.find(
      (variant) => variant.isDefault === true,
    );

    if (!defaultVariant) {
      return;
    }

    await this.handleVariantSelected(defaultVariant);
  }

  /**
   * Shows or hides the product info panel.
   * @param show - True to show, false to hide.
   */
  public setProductInfoPanelVisible(show: boolean): void {
    if (show) {
      this.uiManager!.showProductInfoPanel();
    } else {
      this.uiManager!.hideProductInfoPanel();
    }
  }

  /**
   * Toggles the variants panel visibility.
   */
  public async toggleVariantsPanel(): Promise<void> {
    const isVisible = this.uiManager!.isVariantSelectorVisible() ?? false;

    if (isVisible) {
      this.uiManager!.hideVariantSelector();
    } else {
      await this.showVariantsPanel();
    }
  }

  /**
   * Shows the variants panel for the current product.
   */
  async showVariantsPanel(): Promise<void> {
    const productData = this.viewerProductManager!.getCurrentProduct();
    if (!productData) {
      MessageHandler.raiseWarning("VariantManager: No product data available");
      return;
    }

    const variants = await this.getProductVariants(productData.id);
    if (!variants || variants.length === 0) {
      return;
    }

    this.uiManager!.showVariantSelectorPanel(
      variants,
      productData.id,
      productData.selectedVariationId!,
    );

    imagePreloader
      .preloadVariantPages(variants, 1, 2, "low", "VariantManager")
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        MessageHandler.raiseWarning(
          `VariantManager: Some background images failed to preload: ${message}`,
        );
      });
  }

  /**
   * Retrieves product variants for the given product ID.
   * @param productId - The product ID to fetch variants for.
   * @returns The product variations or null if not found.
   */
  private async getProductVariants(
    productId: string,
  ): Promise<ProductVariation[] | null> {
    try {
      const productData = this.viewerProductManager.getCurrentProduct();

      if (!productData || productData.id !== productId) {
        MessageHandler.raiseLog(
          `VariantManager: Product not found or ID mismatch (current: ${productData?.id}, requested: ${productId})`,
        );
        return null;
      }

      const variations = productData.variations;

      if (!variations || variations.length === 0) {
        return null;
      }

      return variations;
    } catch (e) {
      MessageHandler.raiseError(`VariantManager: Error loading variants: ${e}`);
      return null;
    }
  }

  /**
   * Handles variant selection: updates UI state and applies material/XR changes.
   * @param variant - The selected product variation.
   * @returns Whether this request remained current and committed.
   */
  async handleVariantSelected(variant: ProductVariation): Promise<boolean> {
    const requestGeneration = ++this.selectionGeneration;
    const productData = this.viewerProductManager!.getCurrentProduct();
    const productEntity = this.sceneManager.currentProduct?.entity;
    if (!productData || !productEntity?.object3D) {
      throw new Error("VariantManager: No active product is available");
    }

    const baseXR = this.viewerProductManager.getBaseXRData() ?? productData.xr;
    const nextXR = { ...baseXR, ...variant.xr };
    const isCurrentRequest = () =>
      requestGeneration === this.selectionGeneration &&
      this.viewerProductManager.getCurrentProduct() === productData &&
      this.sceneManager.currentProduct?.entity === productEntity &&
      Boolean(productEntity.object3D);

    try {
      if (variant.materialSet) {
        const committed = await this.sceneManager!.applyMaterialSet(
          productEntity,
          variant.materialSet,
          nextXR.assetUrl,
          isCurrentRequest,
        );
        if (!committed) return false;
      }

      if (!isCurrentRequest()) return false;

      if (nextXR.materialAdjustments) {
        this.sceneManager.applyMaterialAdjustments(
          productEntity.object3D,
          nextXR.materialAdjustments,
        );
      }

      productData.xr = nextXR;
      this.viewerProductManager.updateSelectedVariation(variant.id);
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      MessageHandler.raiseError(
        `VariantManager: Error applying variant configuration: ${error}`,
      );
      throw error;
    }
  }
}
