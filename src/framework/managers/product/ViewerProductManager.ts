/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ProductData, XRData } from "../../types/ProductData";
import { imagePreloader } from "../../utils/ImagePreloader";
import { MessageHandler } from "../../utils/MessageHandler";

export class ViewerProductManager {
  private currentProduct: ProductData | null = null;
  private baseXRData: XRData | null = null;

  /**
   * Sets the current product data directly.
   * @param productData The full product data object.
   */
  setProduct(productData: ProductData): void {
    this.baseXRData = this.cloneXRData(productData.xr);
    this.currentProduct = {
      ...productData,
      xr: this.cloneXRData(this.baseXRData),
      selectedVariationId: undefined,
    };
    this.preloadImage(productData.assets.thumbnailUrl);
    this.preloadVariantImages(productData.variations);
  }

  /** Returns the current product or null if none is set. */
  getCurrentProduct(): ProductData | null {
    return this.currentProduct;
  }

  /** Returns an isolated copy of the product's original XR configuration. */
  getBaseXRData(): XRData | null {
    return this.baseXRData ? this.cloneXRData(this.baseXRData) : null;
  }

  /**
   * Updates the selected variation ID on the current product.
   * @param variantId The selected variant ID.
   */
  updateSelectedVariation(variantId: string): void {
    if (!this.currentProduct) return;
    this.currentProduct.selectedVariationId = variantId;
  }

  /** Clears the current product. */
  clearProduct(): void {
    this.currentProduct = null;
    this.baseXRData = null;
  }

  private cloneXRData(xr: XRData): XRData {
    return {
      ...xr,
      initialScale: Array.isArray(xr.initialScale)
        ? [...xr.initialScale]
        : xr.initialScale,
      initialPosition: xr.initialPosition ? [...xr.initialPosition] : undefined,
      initialRotation: xr.initialRotation ? [...xr.initialRotation] : undefined,
      materialAdjustments: xr.materialAdjustments
        ? { ...xr.materialAdjustments }
        : undefined,
    };
  }

  /**
   * Preloads the product image into browser cache.
   * @param url The image URL to preload.
   */
  private preloadImage(url: string): void {
    if (!url) return;
    imagePreloader
      .preload(url)
      .catch((err) =>
        MessageHandler.raiseError(
          `ViewerProductManager: Failed to preload product image: ${err.message}`,
        ),
      );
  }

  /**
   * Preloads first-page images for all product variations.
   * @param variations Optional array of product variations.
   */
  private preloadVariantImages(variations?: ProductData["variations"]): void {
    if (!variations?.length) return;
    imagePreloader
      .preloadVariantFirstPage(variations, "high", "ViewerProductManager")
      .catch(() =>
        MessageHandler.raiseWarning(
          "ViewerProductManager: Some page 0 images failed to preload",
          true,
        ),
      );
  }
}
