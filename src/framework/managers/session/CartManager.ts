/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { getProductDisplayInfo } from "../../types/ProductData";
import { ViewerProductManager } from "../product/ViewerProductManager";
import { UIManager } from "../ui/UIManager";
import type { AddToCartData as CartData } from "./AddToCartData";
import { CartEntryData } from "./AddToCartData";
import {
  ADD_TO_CART_FAILURE_MESSAGES,
  AddToCartFailureReason,
} from "./AddToCartFailureReason";
import { SessionManager } from "./SessionManager";
import { calculateCartTotalsFromEntries } from "../../utils/CartUtils.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { safeStorage } from "../../utils/SafeStorage.js";

/** Manages cart state and add-to-cart operations during an XR session. */
export class CartManager {
  public static readonly CART_STORAGE_KEY = "viyr_cart";

  public uiManager!: UIManager | null;
  public sessionManager!: SessionManager;
  public viewerProductManager!: ViewerProductManager;

  private cartData: CartData = {
    sessionId: "",
    products: {},
  };

  private onCartEntryCallbacks: Array<(entry: CartEntryData) => void> = [];

  /**
   * Adds awaiting host confirmation, oldest first. Each is resolved at most
   * once: by onAddToCartSuccess(), onAddToCartFailure(), or a host
   * cart-product-added callback that throws or rejects (rolled back).
   */
  private pendingAdds: Array<{ addId: string; productId: string }> = [];

  /**
   * Restores cart data from storage. When a stored cart is restored, the cart
   * change callbacks fire once so the host can show the restored total.
   */
  public initialize(): void {
    const restored = this.loadCartData();

    Object.values(this.cartData.products).forEach((entry: CartEntryData) => {
      this.subscribeToEntry(entry);
      this.onCartEntryCallbacks.forEach((callback) => callback(entry));
    });

    if (restored) this.sessionManager.onCartChange(this.cartData);
  }

  /**
   * Loads cart data from localStorage.
   * @returns Whether a stored cart was restored.
   */
  private loadCartData(): boolean {
    const storedCart = safeStorage.getItem(CartManager.CART_STORAGE_KEY);
    if (!storedCart) return false;

    try {
      const parsed: unknown = JSON.parse(storedCart);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Stored cart is not an object.");
      }
      const record = parsed as Record<string, unknown>;
      if (
        typeof record.sessionId !== "string" ||
        !record.products ||
        typeof record.products !== "object" ||
        Array.isArray(record.products)
      ) {
        throw new Error("Stored cart has an invalid shape.");
      }

      this.cartData = {
        sessionId: record.sessionId,
        products: Object.fromEntries(
          Object.entries(record.products).map(([key, value]) => [
            key,
            this.restoreCartEntry(value),
          ]),
        ),
      };
      return true;
    } catch (error) {
      MessageHandler.raiseWarning(
        `Discarding invalid stored cart: ${String(error)}`,
      );
      safeStorage.removeItem(CartManager.CART_STORAGE_KEY);
      this.cartData = { sessionId: "", products: {} };
      return false;
    }
  }

  private restoreCartEntry(value: unknown): CartEntryData {
    if (!value || typeof value !== "object") {
      throw new Error("Stored cart entry is not an object.");
    }
    const entry = value as Record<string, unknown>;
    for (const field of ["id", "title", "price", "assetUrl"] as const) {
      if (typeof entry[field] !== "string") {
        throw new Error(`Stored cart entry has an invalid ${field}.`);
      }
    }
    if (entry.subtitle !== undefined && typeof entry.subtitle !== "string") {
      throw new Error("Stored cart entry has an invalid subtitle.");
    }
    if (
      typeof entry.quantity !== "number" ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity <= 0
    ) {
      throw new Error("Stored cart entry has an invalid quantity.");
    }

    let rating: { score: number; count: number } | undefined;
    if (entry.rating !== undefined) {
      if (!entry.rating || typeof entry.rating !== "object") {
        throw new Error("Stored cart entry has an invalid rating.");
      }
      const storedRating = entry.rating as Record<string, unknown>;
      if (
        typeof storedRating.score !== "number" ||
        !Number.isFinite(storedRating.score) ||
        typeof storedRating.count !== "number" ||
        !Number.isInteger(storedRating.count) ||
        storedRating.count < 0
      ) {
        throw new Error("Stored cart entry has an invalid rating.");
      }
      rating = { score: storedRating.score, count: storedRating.count };
    }

    return new CartEntryData({
      id: entry.id as string,
      title: entry.title as string,
      subtitle: entry.subtitle as string | undefined,
      price: entry.price as string,
      assetUrl: entry.assetUrl as string,
      rating,
      quantity: entry.quantity,
    });
  }

  /** Subscribe to cart entry events. */
  private subscribeToEntry(entry: CartEntryData): void {
    entry.onQuantityChange((_newQuantity: number) => {
      this.saveCartToStorage();
      this.sessionManager.onCartChange(this.cartData);
      this.uiManager?.updateCartBadge();
    });

    entry.onRemove(() => {
      delete this.cartData.products[entry.id];
      this.saveCartToStorage();
      this.sessionManager.onCartChange(this.cartData);
      this.uiManager?.updateCartBadge();
    });
  }

  /** Saves cart data to localStorage. */
  private saveCartToStorage(): void {
    safeStorage.setItem(
      CartManager.CART_STORAGE_KEY,
      JSON.stringify(this.cartData),
    );
  }

  /** Clears cart data for a given session id. */
  public clearCartData(sessionId: string): void {
    this.pendingAdds = [];
    this.cartData = {
      sessionId: sessionId,
      products: {},
    };
    this.saveCartToStorage();
    this.sessionManager.onCartChange(this.cartData);
  }

  /**
   * Adds the current product variant to the cart. The cart updates
   * immediately; when a host cart-product-added callback is registered the
   * add stays pending until the host resolves it, otherwise it is committed
   * and confirmed right away.
   * @returns The add token, also sent to hosts as `CartProductAddedData.addId`.
   */
  public addToCart(): string {
    this.cartData.sessionId =
      this.sessionManager.getSessionStartEvent().sessionId;

    const currentProduct = this.viewerProductManager.getCurrentProduct();
    const productInfo = getProductDisplayInfo(currentProduct!);
    const addId = crypto.randomUUID();
    const awaitsHost = SessionManager.hasCartProductAddedCallbacks();
    if (awaitsHost) {
      this.pendingAdds.push({ addId, productId: productInfo.id });
    }

    const existingEntry = this.cartData.products[productInfo.id];
    if (existingEntry) {
      existingEntry.incrementQuantity();
    } else {
      const newEntry = new CartEntryData({
        id: productInfo.id,
        title: productInfo.title,
        subtitle: productInfo.subtitle,
        price: productInfo.price,
        assetUrl: productInfo.assetUrl,
        rating: productInfo.rating,
        quantity: productInfo.quantity,
      });
      this.subscribeToEntry(newEntry);
      this.cartData.products[productInfo.id] = newEntry;

      this.saveCartToStorage();
      this.onCartEntryCallbacks.forEach((callback) => callback(newEntry));
      this.sessionManager.onCartChange(this.cartData);
    }

    this.sessionManager.onProductAdded(
      this.cartData,
      productInfo.id,
      addId,
      () => {
        if (this.rollbackPendingAdd(addId)) {
          this.uiManager?.showErrorPanel(
            ADD_TO_CART_FAILURE_MESSAGES[AddToCartFailureReason.Other],
          );
        }
      },
    );
    if (!awaitsHost) this.uiManager?.showAddToCartConfirmation();
    return addId;
  }

  /** Removes and returns the pending add with `addId`, or the oldest one. */
  private takePendingAdd(
    addId?: string,
  ): { addId: string; productId: string } | undefined {
    const index =
      addId === undefined
        ? 0
        : this.pendingAdds.findIndex((pending) => pending.addId === addId);
    if (index < 0 || index >= this.pendingAdds.length) return undefined;
    return this.pendingAdds.splice(index, 1)[0];
  }

  /**
   * Confirms a pending add.
   * @param addId - The add to confirm; defaults to the oldest pending add.
   * @returns Whether a pending add was confirmed (false if already resolved).
   */
  public confirmPendingAdd(addId?: string): boolean {
    return this.takePendingAdd(addId) !== undefined;
  }

  /**
   * Reverts a pending add by decrementing its product by one (removing it at
   * zero). The change is persisted and reported through the cart change
   * callbacks.
   * @param addId - The add to revert; defaults to the oldest pending add.
   * @returns Whether a pending add was reverted (false if already resolved).
   */
  public rollbackPendingAdd(addId?: string): boolean {
    const pending = this.takePendingAdd(addId);
    if (!pending) return false;
    this.cartData.products[pending.productId]?.decrementQuantity();
    return true;
  }

  /** Returns current cart data without modifying it. */
  public getCartData(): CartData {
    return this.cartData;
  }

  /** Adds a callback to be called when a cart entry is added. */
  public addOnCartEntryCallback(
    callback: (entry: CartEntryData) => void,
  ): () => void {
    this.onCartEntryCallbacks.push(callback);
    return () => this.removeOnCartEntryCallback(callback);
  }

  /** Removes a callback from the list of callbacks to be called when a cart entry is added. */
  public removeOnCartEntryCallback(
    callback: (entry: CartEntryData) => void,
  ): void {
    const index = this.onCartEntryCallbacks.indexOf(callback);
    if (index > -1) {
      this.onCartEntryCallbacks.splice(index, 1);
    }
  }

  /** Returns the total count of items in the cart (sum of all quantities). */
  public getTotalItemCount(): number {
    return Object.values(this.cartData.products).reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    );
  }

  /** Returns the formatted total price of all items in the cart (e.g. "$1,498.00"). */
  public getFormattedTotal(): string {
    const totals = calculateCartTotalsFromEntries(this.cartData.products);
    return totals.formattedTotal;
  }
}
