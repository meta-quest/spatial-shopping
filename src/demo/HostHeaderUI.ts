/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CartChangeData } from "../framework/managers/session/CartChangeData.js";
import { calculateCartTotals } from "../framework/utils/CartUtils.js";

/**
 * Manages the Host Application's header cart summary.
 * The cart is owned by the AR runtime; this view only renders the data it
 * receives through `ARViewer.setCartChangeCallback()`.
 */
export class HostHeaderUI {
  private cartBadgeNumber: HTMLElement | null = null;
  private cartTotal: HTMLElement | null = null;
  private cartBadge: HTMLElement | null = null;

  /** Looks up the header elements and renders an empty cart. */
  init(): void {
    this.cartBadgeNumber = document.getElementById("cart-badge-number");
    this.cartTotal = document.getElementById("cart-total");
    this.cartBadge = document.getElementById("cart-badge");
    this.updateCart({ sessionId: "", products: {} });
  }

  /**
   * Updates the cart display with new cart data.
   */
  public updateCart(cartData: CartChangeData): void {
    if (!this.cartBadgeNumber || !this.cartTotal || !this.cartBadge) {
      return;
    }
    try {
      const totals = calculateCartTotals(cartData.products);

      if (totals.totalItems > 0) {
        this.cartBadgeNumber.textContent = totals.totalItems.toString();
        this.cartBadge.style.display = "flex";
      } else {
        this.cartBadge.style.display = "none";
      }

      this.cartTotal.textContent = totals.formattedTotal;
    } catch (error) {
      console.error("Error updating cart UI:", error);
      this.cartBadgeNumber.textContent = "0";
      this.cartTotal.textContent = "$0.00";
      this.cartBadge.style.display = "none";
    }
  }
}
