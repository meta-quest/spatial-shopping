/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { ProductVariation } from "../../types/ProductData.js";
import { imagePreloader } from "../../utils/ImagePreloader.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

/** Optional "error" event surface on a UIKit image (not all versions emit it). */
type ImageErrorSource = {
  addEventListener?: (type: "error", listener: () => void) => void;
  removeEventListener?: (type: "error", listener: () => void) => void;
};

/** Default placeholder image for variant thumbnails. */
const PLACEHOLDER = "imgs/cube-3d-icon.png";

/**
 * VariantSelectorUIUpdater manages the UI updates for the variant selector panel.
 * It handles displaying variants and updating the selected state.
 */
export class VariantSelectorUIUpdater {
  private document: UIKitDocument;
  private variantCards: (UIKit.Container | null)[] = [];
  private variantRows: (UIKit.Container | null)[] = [];
  private prevButton: UIKit.Container | null = null;
  private nextButton: UIKit.Container | null = null;
  private currentSelectedIndex: number = -1;
  /** 2 rows x 2 columns */
  private readonly MAX_VARIANTS = 4;

  /** @param document - UIKit document for element lookups */
  constructor(document: UIKitDocument) {
    this.document = document;
    this.initializeElements();
  }

  /** Initialize references to UI elements. */
  private initializeElements() {
    for (let i = 0; i < this.MAX_VARIANTS; i++) {
      this.variantCards[i] = this.document.getElementById(
        `variant-card-${i}`,
      ) as UIKit.Container | null;
    }
    this.variantRows[0] = this.document.getElementById(
      "variants-row-0",
    ) as UIKit.Container | null;
    this.variantRows[1] = this.document.getElementById(
      "variants-row-1",
    ) as UIKit.Container | null;
    this.prevButton = this.document.getElementById(
      "prev-page-button",
    ) as UIKit.Container | null;
    this.nextButton = this.document.getElementById(
      "next-page-button",
    ) as UIKit.Container | null;
  }

  /**
   * Update the panel with variant data.
   * @param variants - Array of product variants (max 4 visible at a time)
   * @param selectedVariantId - ID of the currently selected variant
   * @param startIndex - Starting index for pagination (default 0)
   */
  updateVariants(
    variants: ProductVariation[],
    selectedVariantId?: string,
    startIndex: number = 0,
  ) {
    const visibleVariants = variants.slice(
      startIndex,
      startIndex + this.MAX_VARIANTS,
    );
    for (let i = 0; i < this.MAX_VARIANTS; i++) {
      if (i < visibleVariants.length) {
        const variant = visibleVariants[i];
        this.updateVariantCard(i, variant, variant.id === selectedVariantId);
      } else {
        this.hideVariantCard(i);
      }
    }
    this.updateRowVisibility(visibleVariants.length);
  }

  /** Update row visibility based on variant count. Row 0: variants 1-2, Row 1: variants 3-4. */
  private updateRowVisibility(variantCount: number) {
    if (this.variantRows[0]) {
      this.variantRows[0].setProperties({
        display: variantCount > 0 ? "flex" : "none",
      });
    }
    if (this.variantRows[1]) {
      this.variantRows[1].setProperties({
        display: variantCount > 2 ? "flex" : "none",
      });
    }
  }

  /** Update a specific variant card with image, name, price, and selected state. */
  private updateVariantCard(
    index: number,
    variant: ProductVariation,
    isSelected: boolean,
  ) {
    const card = this.variantCards[index];
    const imagePath = variant.thumbnailUrl || PLACEHOLDER;
    const urlToUse = imagePreloader.getUrlToUse(imagePath);
    const isImageLoaded = imagePreloader.isLoaded(imagePath);

    this.toggleLoadingClass(card, isImageLoaded, variant.thumbnailUrl);

    const image = this.document.getElementById(
      `variant-image-${index}`,
    ) as UIKit.Image | null;
    if (image) {
      if (!isImageLoaded && variant.thumbnailUrl) {
        image.setProperties({ src: PLACEHOLDER });
        imagePreloader
          .preload(imagePath)
          .then(() => {
            const finalUrl = imagePreloader.getUrlToUse(imagePath);
            if (!finalUrl) {
              this.removeLoadingState(index);
              return;
            }
            this.setImageSrcWithErrorFallback(image, finalUrl, index);
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            MessageHandler.raiseWarning(
              `VariantSelector: Failed to load variant image: ${message}`,
            );
            this.removeLoadingState(index);
          });
      } else {
        if (urlToUse) {
          this.setImageSrcWithErrorFallback(image, urlToUse, index);
        }
        if (card) {
          this.removeLoadingState(index);
        }
      }
    }

    const name = this.document.getElementById(
      `variant-name-${index}`,
    ) as UIKit.Text | null;
    if (name) {
      const displayName =
        variant.attributes.color ||
        variant.attributes.material ||
        Object.values(variant.attributes)[0] ||
        variant.id;
      name.setProperties({ text: displayName });
    }

    const price = this.document.getElementById(
      `variant-price-${index}`,
    ) as UIKit.Text | null;
    if (price) {
      price.setProperties({ text: variant.price || "$0.00" });
    }

    this.setCardSelected(index, isSelected);
    if (card) {
      card.setProperties({ display: "flex" });
    }
  }

  /** Toggle loading CSS class on card based on image load state. */
  private toggleLoadingClass(
    card: UIKit.Container | null,
    isLoaded: boolean,
    hasThumbnail?: string,
  ) {
    if (!card) return;
    if (isLoaded && card.classList.contains("variant-card--loading")) {
      card.classList.remove("variant-card--loading");
    } else if (
      !isLoaded &&
      hasThumbnail &&
      !card.classList.contains("variant-card--loading")
    ) {
      card.classList.add("variant-card--loading");
    }
  }

  /**
   * Set image src and attach a one-time error handler to fall back to placeholder
   * if the URL fails to load or decode (e.g. invalid blob, wrong content-type).
   */
  private setImageSrcWithErrorFallback(
    image: UIKit.Image,
    src: string,
    index: number,
  ): void {
    const onError = () => {
      image.setProperties({ src: PLACEHOLDER });
      this.removeLoadingState(index);
      errorSource.removeEventListener?.("error", onError);
    };
    const errorSource = image as unknown as ImageErrorSource;
    errorSource.addEventListener?.("error", onError);
    image.setProperties({ src });
    this.removeLoadingState(index);
  }

  /** Remove loading state from a variant card. */
  private removeLoadingState(index: number): void {
    const card = this.variantCards[index];
    if (card && card.classList.contains("variant-card--loading")) {
      card.classList.remove("variant-card--loading");
    }
  }

  /** Hide a variant card. */
  private hideVariantCard(index: number) {
    if (this.variantCards[index]) {
      this.variantCards[index]!.setProperties({ display: "none" });
    }
  }

  /** Set the selected state for a variant card. */
  setCardSelected(index: number, isSelected: boolean) {
    const card = this.variantCards[index];
    if (!card) return;
    this.toggleSelectedClass(card, isSelected);
    if (isSelected) {
      this.currentSelectedIndex = index;
    }
  }

  /** Toggle variant-card--selected class on element. */
  private toggleSelectedClass(card: UIKit.Container, add: boolean) {
    if (add && !card.classList.contains("variant-card--selected")) {
      card.classList.add("variant-card--selected");
    } else if (!add && card.classList.contains("variant-card--selected")) {
      card.classList.remove("variant-card--selected");
    }
  }

  /** Get a variant card element by index. */
  getVariantCard(index: number): UIKit.Container | null {
    return this.variantCards[index] || null;
  }

  /** Get the current selected variant index. */
  getCurrentSelectedIndex(): number {
    return this.currentSelectedIndex;
  }

  /** Get the maximum number of variants that can be displayed at once (useful for pagination). */
  getMaxVariants(): number {
    return this.MAX_VARIANTS;
  }

  /** Get the prev button element. */
  getPrevButton(): UIKit.Container | null {
    return this.prevButton;
  }

  /** Get the next button element. */
  getNextButton(): UIKit.Container | null {
    return this.nextButton;
  }

  /** Update pagination controls based on current page and total pages. */
  updatePaginationControls(currentPage: number, totalPages: number) {
    this.setPaginationButtonState(this.prevButton, currentPage === 0);
    this.setPaginationButtonState(
      this.nextButton,
      currentPage >= totalPages - 1,
    );
  }

  /** Set disabled state on pagination button. */
  private setPaginationButtonState(
    button: UIKit.Container | null,
    disabled: boolean,
  ) {
    if (!button) return;
    const hasDisabled = button.classList.contains(
      "pagination-button--disabled",
    );
    if (disabled && !hasDisabled) {
      button.classList.add("pagination-button--disabled");
    } else if (!disabled && hasDisabled) {
      button.classList.remove("pagination-button--disabled");
    }
  }
}
