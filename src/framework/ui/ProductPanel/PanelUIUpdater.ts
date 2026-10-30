/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { ProductData } from "../../types/ProductData.js";
import { formatDimensionsForDisplay } from "../../utils/ProductDataUtils.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

const TITLE_MAX_CHARS = 42;

/** Normalizes volatile marketplace copy and keeps the spatial card height stable. */
export function clampProductTitle(rawTitle: string): string {
  const title = rawTitle.replace(/\s+/g, " ").trim();
  if (title.length <= TITLE_MAX_CHARS) return title;

  const cut = title.slice(0, TITLE_MAX_CHARS - 3);
  const lastSpace = cut.lastIndexOf(" ");
  const clamped =
    lastSpace > TITLE_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${clamped.trimEnd()}...`;
}

/**
 * Handles updating the XR panel UI with product information
 * Follows Single Responsibility Principle - only responsible for UI updates
 */
export class PanelUIUpdater {
  private document: UIKitDocument;
  private backButton: UIKit.Container | null = null;
  private hintButton: UIKit.Container | null = null;
  private bottomControlPanel: UIKit.Container | null = null;

  /**
   * @param document - The UIKit document containing panel elements
   */
  constructor(document: UIKitDocument) {
    this.document = document;
    this.initializeButtonElements();
  }

  /**
   * Initialize references to button UI elements
   */
  private initializeButtonElements(): void {
    this.backButton = this.document.getElementById(
      "back-button",
    ) as UIKit.Container | null;
    this.hintButton = this.document.getElementById(
      "hint-button",
    ) as UIKit.Container | null;
    this.bottomControlPanel = this.document.getElementById(
      "bottom-control-panel",
    ) as UIKit.Container | null;
  }

  /**
   * Updates all product information in the panel
   * @param product - The product data to display
   */
  public updateProductInfo(product: ProductData): void {
    this.updatePrice(product.metadata.price);
    if (product.metadata.rating) {
      this.updateRating(
        product.metadata.rating.score.toString(),
        product.metadata.rating.count.toString(),
      );
    }
    this.updateProductImage(product.assets.thumbnailUrl);
    this.updateProductTitle(product.metadata.title);
    if (product.metadata.dimensions) {
      this.updateDimensions(product.metadata.dimensions);
    }
  }

  /**
   * Sets text on a UIKit.Text element by ID, or logs warning if not found
   * @param elementId - DOM element ID
   * @param text - Text to set
   * @param context - Context string for warning message
   */
  private setTextElement(
    elementId: string,
    text: string,
    context: string,
  ): void {
    const el = this.document.getElementById(elementId) as UIKit.Text;
    if (el) el.setProperties({ text });
    else
      MessageHandler.raiseWarning(
        `PanelUIUpdater: ${context} element not found`,
      );
  }

  /**
   * Updates the price display
   * @param price - The price string to display
   */
  private updatePrice(price: string): void {
    this.setTextElement("price", price, "Price");
  }

  /**
   * Updates the rating information
   * @param value - The rating value (e.g., "4.4")
   * @param count - The number of reviews (e.g., "605")
   */
  private updateRating(value: string, count: string): void {
    this.setTextElement("rating-value", value, "Rating value");
    this.updateStarImages(parseFloat(value));
    const formattedCount = count.startsWith("(") ? count : `(${count})`;
    this.setTextElement("rating-count", formattedCount, "Rating count");
  }

  /**
   * Updates the star images based on the rating value
   * @param rating - Numeric rating value (0-5)
   */
  private updateStarImages(rating: number): void {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.3;

    for (let i = 1; i <= 5; i++) {
      const starElement = this.document.getElementById(
        `star-${i}`,
      ) as UIKit.Image;
      if (starElement) {
        if (i <= fullStars) {
          starElement.setProperties({ src: "imgs/star-full.png" });
        } else if (i === fullStars + 1 && hasHalfStar) {
          starElement.setProperties({ src: "imgs/star-half.png" });
        } else {
          starElement.setProperties({ src: "imgs/star-empty.png" });
        }
      }
    }
  }

  /**
   * Updates the product image
   * @param imagePath - Path to the product image
   */
  private updateProductImage(imagePath: string): void {
    if (imagePath === "") return;
    const imageElement = this.document.getElementById(
      "product-image",
    ) as UIKit.Image;
    if (imageElement) {
      imageElement.setProperties({
        src: imagePath,
        width: "auto",
        height: "100%",
        keepAspectRatio: true,
      });
    }
  }

  /**
   * Updates the product title
   * @param title - The product title/name
   */
  private updateProductTitle(title: string): void {
    this.setTextElement(
      "product-title",
      clampProductTitle(title),
      "Product title",
    );
  }

  /**
   * Updates the product dimensions
   * @param dimensions - The structured dimensions object
   */
  private updateDimensions(
    dimensions: ProductData["metadata"]["dimensions"],
  ): void {
    const displayText = formatDimensionsForDisplay(dimensions);
    this.setTextElement("dimensions-text", displayText, "Dimensions");
  }

  /**
   * Gets the document instance (useful for additional operations)
   */
  public getDocument(): UIKitDocument {
    return this.document;
  }

  /**
   * Get the back button element
   */
  getBackButton(): UIKit.Container | null {
    return this.backButton;
  }

  /**
   * Get the hint button element
   */
  getHintButton(): UIKit.Container | null {
    return this.hintButton;
  }

  /**
   * Hide the bottom control panel
   */
  hideBottomPanel(): void {
    if (this.bottomControlPanel) {
      this.bottomControlPanel.setProperties({ display: "none", opacity: 0 });
    }
  }

  /**
   * Show the bottom control panel
   */
  showBottomPanel(): void {
    if (this.bottomControlPanel) {
      this.bottomControlPanel.setProperties({ display: "flex", opacity: 1 });
    }
  }
}
