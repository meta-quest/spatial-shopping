/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { CartEntryData } from "../../managers/session/AddToCartData.js";
import { imagePreloader } from "../../utils/ImagePreloader.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

/** Optional "error" event surface on a UIKit image (not all versions emit it). */
type ImageErrorSource = {
  addEventListener?: (type: "error", listener: () => void) => void;
  removeEventListener?: (type: "error", listener: () => void) => void;
};

const PLACEHOLDER_IMAGE = "imgs/cube-3d-icon.png";
const MAX_TITLE_LENGTH = 30;
const MAX_SUBTITLE_LENGTH = 10;

/**
 * CartItemView manages the display and interaction of a single cart item.
 * It handles binding data, displaying images, ratings, and quantity controls.
 */
export class CartItemView {
  private document: UIKitDocument;
  private index: number;
  private rootContainer: UIKit.Container | null = null;
  private imageElement: UIKit.Image | null = null;
  private nameElement: UIKit.Text | null = null;
  private subtitleElement: UIKit.Text | null = null;
  private priceValueElement: UIKit.Text | null = null;
  private quantityValueElement: UIKit.Text | null = null;
  private increaseButton: UIKit.Container | null = null;
  private decreaseButton: UIKit.Container | null = null;
  private removeButton: UIKit.Container | null = null;

  private Model: CartEntryData | null = null;
  private increaseClickHandler: (() => void) | null = null;
  private decreaseClickHandler: (() => void) | null = null;
  private removeClickHandler: (() => void) | null = null;

  constructor(document: UIKitDocument, index: number) {
    this.document = document;
    this.index = index;
    this.initializeElements();
  }

  private initializeElements() {
    this.rootContainer = this.document.getElementById(
      `cart-item-root-${this.index}`,
    ) as UIKit.Container | null;
    this.imageElement = this.document.getElementById(
      `cart-item-image-${this.index}`,
    ) as UIKit.Image | null;
    this.nameElement = this.document.getElementById(
      `cart-item-name-${this.index}`,
    ) as UIKit.Text | null;
    this.subtitleElement = this.document.getElementById(
      `cart-item-subtitle-${this.index}`,
    ) as UIKit.Text | null;
    this.priceValueElement = this.document.getElementById(
      `price-value-${this.index}`,
    ) as UIKit.Text | null;
    this.quantityValueElement = this.document.getElementById(
      `quantity-value-${this.index}`,
    ) as UIKit.Text | null;
    this.increaseButton = this.document.getElementById(
      `quantity-increase-${this.index}`,
    ) as UIKit.Container | null;
    this.decreaseButton = this.document.getElementById(
      `quantity-decrease-${this.index}`,
    ) as UIKit.Container | null;
    this.removeButton = this.document.getElementById(
      `remove-button-${this.index}`,
    ) as UIKit.Container | null;
  }

  /**
   * Bind cart entry data to this view and set up event listeners.
   * @param data - The cart entry data to display
   */
  Bind(data: CartEntryData) {
    this.Model = data;

    this.updateName(data.title);
    this.updateSubtitle(data.subtitle);
    this.updateImage(data.assetUrl);
    this.updatePrice(data.price);
    this.updateQuantity(data.quantity);

    this.setupEventListeners();
    this.show();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength).trimEnd() + "...";
  }

  private updateName(name: string) {
    if (this.nameElement) {
      const truncatedName = this.truncateText(name, MAX_TITLE_LENGTH);
      this.nameElement.setProperties({ text: truncatedName });
    }
  }

  private updateSubtitle(subtitle?: string) {
    if (this.subtitleElement) {
      const truncatedSubtitle = subtitle
        ? this.truncateText(subtitle, MAX_SUBTITLE_LENGTH)
        : "";
      this.subtitleElement.setProperties({ text: truncatedSubtitle });
    }
  }

  private updatePrice(price: string) {
    if (this.priceValueElement) {
      this.priceValueElement.setProperties({ text: price });
    }
  }

  private updateImage(assetUrl: string) {
    if (!this.imageElement) return;

    const imagePath = assetUrl || PLACEHOLDER_IMAGE;
    const urlToUse = imagePreloader.getUrlToUse(imagePath);
    const isImageLoaded = imagePreloader.isLoaded(imagePath);

    if (!isImageLoaded && assetUrl) {
      this.imageElement.setProperties({ src: PLACEHOLDER_IMAGE });
      imagePreloader
        .preload(imagePath)
        .then(() => {
          const finalUrl = imagePreloader.getUrlToUse(imagePath);
          if (!finalUrl || !this.imageElement) return;
          this.setImageWithErrorFallback(this.imageElement, finalUrl);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          MessageHandler.raiseWarning(
            `CartItemView: Failed to load image: ${message}`,
          );
        });
    } else if (urlToUse) {
      this.setImageWithErrorFallback(this.imageElement, urlToUse);
    }
  }

  private setImageWithErrorFallback(image: UIKit.Image, src: string): void {
    const onError = () => {
      image.setProperties({ src: PLACEHOLDER_IMAGE });
      errorSource.removeEventListener?.("error", onError);
    };
    const errorSource = image as unknown as ImageErrorSource;
    errorSource.addEventListener?.("error", onError);
    image.setProperties({ src });
  }

  private updateQuantity(quantity: number) {
    if (this.quantityValueElement) {
      this.quantityValueElement.setProperties({ text: quantity.toString() });
    }
  }

  private setupEventListeners() {
    this.removeEventListeners();

    this.increaseClickHandler = () => {
      this.Model!.incrementQuantity();
    };

    this.decreaseClickHandler = () => {
      this.Model!.decrementQuantity();
    };

    this.removeClickHandler = () => {
      this.Model!.setQuantity(0);
    };

    this.increaseButton!.addEventListener("click", this.increaseClickHandler);
    this.decreaseButton!.addEventListener("click", this.decreaseClickHandler);
    this.removeButton!.addEventListener("click", this.removeClickHandler);

    this.Model!.onQuantityChange((newQuantity: number) => {
      this.updateQuantity(newQuantity);
    });
  }

  private removeEventListeners() {
    this.increaseButton!.removeEventListener(
      "click",
      this.increaseClickHandler!,
    );
    this.decreaseButton!.removeEventListener(
      "click",
      this.decreaseClickHandler!,
    );
    this.removeButton!.removeEventListener("click", this.removeClickHandler!);

    this.increaseClickHandler = null;
    this.decreaseClickHandler = null;
    this.removeClickHandler = null;
  }

  /**
   * Show this cart item view.
   */
  show() {
    if (this.rootContainer) {
      this.rootContainer.setProperties({ display: "flex" });
    }
  }

  /**
   * Hide this cart item view.
   */
  hide() {
    if (this.rootContainer) {
      this.rootContainer.setProperties({ display: "none" });
    }
  }

  /**
   * Get the bound cart entry data.
   */
  getBoundData(): CartEntryData | null {
    return this.Model;
  }

  /**
   * Unbind the current data and clear the view.
   */
  unbind() {
    this.removeEventListeners();
    this.Model = null;
    this.hide();
  }
}
