/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { CartEntryData } from "../../managers/session/AddToCartData.js";
import { CartItemView } from "./CartItemView.js";
import type { CartManager } from "../../managers/session/CartManager.js";

/**
 * CartDataPanelUIUpdater manages the cart panel list.
 * It spawns and manages CartItemView instances when items are added.
 */
export class CartDataPanelUIUpdater {
  private document: UIKitDocument;
  private itemViewSlots: CartItemView[] = [];
  private entryToSlot: Map<string, number> = new Map();
  private totalPriceElement: UIKit.Text | null = null;
  private backButton: UIKit.Container | null = null;
  private checkoutButton: UIKit.Container | null = null;
  private cartManager: CartManager | null = null;
  private emptyCartState: UIKit.Container | null = null;
  private itemsList: UIKit.Container | null = null;
  private totalSection: UIKit.Container | null = null;

  constructor(document: UIKitDocument) {
    this.document = document;

    this.totalPriceElement = this.document.getElementById(
      "total-price",
    ) as UIKit.Text | null;
    this.backButton = this.document.getElementById(
      "back-button",
    ) as UIKit.Container | null;
    this.checkoutButton = this.document.getElementById(
      "checkout-button",
    ) as UIKit.Container | null;
    this.emptyCartState = this.document.getElementById(
      "empty-cart-state",
    ) as UIKit.Container | null;
    this.itemsList = this.document.getElementById(
      "cart-items-list",
    ) as UIKit.Container | null;
    this.totalSection = this.document.getElementById(
      "total-section",
    ) as UIKit.Container | null;
  }

  /**
   * Connect this updater to a CartManager and set up the callback.
   * @param cartManager - The CartManager instance to connect to
   */
  public connectToCartManager(cartManager: CartManager) {
    this.cartManager = cartManager;
    cartManager.addOnCartEntryCallback((entry: CartEntryData) => {
      this.onCartEntryAdded(entry);
      this.updateTotalPrice();
      this.updateEmptyState();
    });

    const existingCartData = cartManager.getCartData();
    Object.values(existingCartData.products).forEach((entry: CartEntryData) => {
      this.onCartEntryAdded(entry);
    });

    this.updateTotalPrice();
    this.updateEmptyState();
  }

  /**
   * Update the total price display.
   */
  private updateTotalPrice() {
    if (this.totalPriceElement && this.cartManager) {
      const formattedTotal = this.cartManager.getFormattedTotal();
      this.totalPriceElement.setProperties({ text: formattedTotal });
    }
  }

  /**
   * Update the visibility of the empty cart state and cart content.
   */
  private updateEmptyState() {
    const hasItems = this.entryToSlot.size > 0;

    if (this.emptyCartState) {
      this.emptyCartState.setProperties({
        display: hasItems ? "none" : "flex",
      });
    }

    this.itemsList?.setProperties({ display: hasItems ? "flex" : "none" });
    this.totalSection?.setProperties({ display: hasItems ? "flex" : "none" });

    if (this.checkoutButton) {
      this.checkoutButton.setProperties({
        display: hasItems ? "flex" : "none",
        pointerEvents: hasItems ? "auto" : "none",
      });
    }
  }

  /**
   * Called when a cart entry is added or updated.
   * Spawns a new CartItemView or updates an existing one.
   * @param entry - The cart entry data
   */
  private onCartEntryAdded(entry: CartEntryData) {
    let slotIndex = this.entryToSlot.get(entry.id);

    if (slotIndex === undefined) {
      slotIndex = this.findAvailableSlot();
      this.entryToSlot.set(entry.id, slotIndex);

      entry.onRemove(() => {
        this.removeCartItem(entry.id);
      });

      entry.onQuantityChange(() => {
        this.updateTotalPrice();
      });
    }

    const itemView = this.itemViewSlots[slotIndex];
    itemView.Bind(entry);
  }

  /**
   * Find the first available slot that is not currently bound to data.
   * If no slots are available, creates a new one dynamically.
   * @returns The slot index
   */
  private findAvailableSlot(): number {
    for (let i = 0; i < this.itemViewSlots.length; i++) {
      if (!this.itemViewSlots[i].getBoundData()) {
        return i;
      }
    }

    const newSlotIndex = this.itemViewSlots.length;
    const itemView = new CartItemView(this.document, newSlotIndex);
    this.itemViewSlots.push(itemView);
    return newSlotIndex;
  }

  /**
   * Remove a cart item view by entry id.
   * @param entryId - The id of the cart entry to remove
   */
  removeCartItem(entryId: string) {
    const slotIndex = this.entryToSlot.get(entryId);
    if (slotIndex !== undefined) {
      const itemView = this.itemViewSlots[slotIndex];
      if (itemView) {
        itemView.unbind();
      }
      this.entryToSlot.delete(entryId);
      this.updateTotalPrice();
      this.updateEmptyState();
    }
  }

  /**
   * Clear all cart item views.
   */
  clearAllItems() {
    this.itemViewSlots.forEach((view) => view.unbind());
    this.entryToSlot.clear();
    this.updateTotalPrice();
    this.updateEmptyState();
  }

  /** Get the back button element. */
  getCloseButton(): UIKit.Container | null {
    return this.backButton;
  }

  /** Get the back button element. */
  getBackButton(): UIKit.Container | null {
    return this.backButton;
  }

  /** Get the checkout button element. */
  getCheckoutButton(): UIKit.Container | null {
    return this.checkoutButton;
  }
}
