/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import type { ProductData } from "../../types/ProductData";
import { MessageHandler } from "../../utils/MessageHandler";
import type { ViewerProductManager } from "../product/ViewerProductManager";
import type { UIManager } from "../ui/UIManager";
import { CartManager } from "./CartManager";
import {
  SessionManager,
  type CartChangeCallback,
  type CartProductAddedCallback,
} from "./SessionManager";

const chair: ProductData = {
  id: "chair",
  metadata: { title: "Chair", price: "$10.00" },
  assets: { thumbnailUrl: "/chair.png" },
  xr: { assetUrl: "/chair.glb" },
};

function storedCart(): { products: Record<string, { quantity: number }> } {
  return JSON.parse(localStorage.getItem(CartManager.CART_STORAGE_KEY)!);
}

describe("CartManager", () => {
  let sessionManager: SessionManager;
  let cartManager: CartManager;
  let onChange: Mock<CartChangeCallback>;
  let onAdded: Mock<CartProductAddedCallback>;

  beforeEach(() => {
    localStorage.clear();
    sessionManager = new SessionManager();
    sessionManager.createOrRestoreSession();
    onChange = vi.fn<CartChangeCallback>();
    onAdded = vi.fn<CartProductAddedCallback>();
    SessionManager.addCartChangeCallback(onChange);
    SessionManager.addCartProductAddedCallback(onAdded);

    cartManager = new CartManager();
    cartManager.uiManager = null;
    cartManager.sessionManager = sessionManager;
    cartManager.viewerProductManager = {
      getCurrentProduct: () => chair,
    } as unknown as ViewerProductManager;
  });

  afterEach(() => {
    sessionManager.dispose();
    SessionManager.clearHostCallbacks();
    MessageHandler.dispose();
    localStorage.clear();
  });

  it("restores a valid persisted cart", () => {
    localStorage.setItem(
      CartManager.CART_STORAGE_KEY,
      JSON.stringify({
        sessionId: "session",
        products: {
          chair: {
            id: "chair",
            title: "Chair",
            price: "$10.00",
            assetUrl: "/chair.png",
            rating: { score: 4.5, count: 12 },
            quantity: 2,
          },
        },
      }),
    );
    const onEntry = vi.fn();
    cartManager.addOnCartEntryCallback(onEntry);

    cartManager.initialize();

    expect(cartManager.getTotalItemCount()).toBe(2);
    expect(cartManager.getCartData().products.chair.rating).toEqual({
      score: 4.5,
      count: 12,
    });
    expect(onEntry).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        products: { chair: { id: "chair", quantity: 2, price: "$10.00" } },
      }),
    );
  });

  it("does not emit a cart change when there is nothing to restore", () => {
    cartManager.initialize();

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a missing title",
      { id: "chair", price: "$1", assetUrl: "/a.png", quantity: 1 },
    ],
    [
      "a fractional quantity",
      {
        id: "chair",
        title: "Chair",
        price: "$1",
        assetUrl: "/a.png",
        quantity: 1.5,
      },
    ],
    [
      "an invalid rating",
      {
        id: "chair",
        title: "Chair",
        price: "$1",
        assetUrl: "/a.png",
        quantity: 1,
        rating: { score: "5", count: 1 },
      },
    ],
  ])("discards a persisted cart with %s", (_label, entry) => {
    localStorage.setItem(
      CartManager.CART_STORAGE_KEY,
      JSON.stringify({ sessionId: "session", products: { chair: entry } }),
    );

    cartManager.initialize();

    expect(cartManager.getCartData().products).toEqual({});
    expect(localStorage.getItem(CartManager.CART_STORAGE_KEY)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds a new product, then increments it on a repeated add", () => {
    cartManager.addToCart();
    expect(cartManager.getTotalItemCount()).toBe(1);
    expect(storedCart().products.chair.quantity).toBe(1);
    expect(onAdded).toHaveBeenLastCalledWith(
      expect.objectContaining({
        addedProduct: { id: "chair", quantity: 1, price: "$10.00" },
      }),
    );

    cartManager.addToCart();
    expect(cartManager.getTotalItemCount()).toBe(2);
    expect(storedCart().products.chair.quantity).toBe(2);
    expect(onAdded).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("removes a newly added product when the host reports failure", () => {
    cartManager.addToCart();
    onChange.mockClear();

    expect(cartManager.rollbackPendingAdd()).toBe(true);

    expect(cartManager.getCartData().products).toEqual({});
    expect(storedCart().products).toEqual({});
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ products: {} }),
    );
  });

  it("decrements an incremented product when the host reports failure", () => {
    cartManager.addToCart();
    cartManager.confirmPendingAdd();
    cartManager.addToCart();

    cartManager.rollbackPendingAdd();

    expect(cartManager.getTotalItemCount()).toBe(1);
    expect(storedCart().products.chair.quantity).toBe(1);
  });

  it("does nothing on rollback when every add was confirmed", () => {
    cartManager.addToCart();
    cartManager.confirmPendingAdd();

    expect(cartManager.rollbackPendingAdd()).toBe(false);

    expect(cartManager.getTotalItemCount()).toBe(1);
  });

  it("exposes the add token to hosts as addId", () => {
    const addId = cartManager.addToCart();

    expect(addId).toEqual(expect.any(String));
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ addId }));
  });

  it("commits immediately when no add-to-cart callback is registered", () => {
    SessionManager.removeCartProductAddedCallback(onAdded);
    const showAddToCartConfirmation = vi.fn();
    cartManager.uiManager = {
      showAddToCartConfirmation,
    } as unknown as UIManager;

    cartManager.addToCart();

    expect(showAddToCartConfirmation).toHaveBeenCalledOnce();
    expect(cartManager.confirmPendingAdd()).toBe(false);
    expect(cartManager.rollbackPendingAdd()).toBe(false);
    expect(cartManager.getTotalItemCount()).toBe(1);
  });

  it("rolls back an add whose host callback throws", () => {
    SessionManager.removeCartProductAddedCallback(onAdded);
    SessionManager.addCartProductAddedCallback(() => {
      throw new Error("host failed");
    });
    const showErrorPanel = vi.fn();
    cartManager.uiManager = {
      showErrorPanel,
      updateCartBadge: vi.fn(),
    } as unknown as UIManager;

    cartManager.addToCart();

    expect(cartManager.getCartData().products).toEqual({});
    expect(showErrorPanel).toHaveBeenCalledWith(
      expect.stringContaining("Could not add"),
    );
    expect(cartManager.rollbackPendingAdd()).toBe(false);
  });

  it("rolls back an add whose host callback rejects", async () => {
    SessionManager.removeCartProductAddedCallback(onAdded);
    SessionManager.addCartProductAddedCallback(async () => {
      throw new Error("host failed");
    });

    cartManager.addToCart();
    cartManager.addToCart();
    expect(cartManager.getTotalItemCount()).toBe(2);

    await vi.waitFor(() =>
      expect(cartManager.getCartData().products).toEqual({}),
    );
  });

  it("does not roll back an add the host confirmed before throwing", () => {
    SessionManager.removeCartProductAddedCallback(onAdded);
    SessionManager.addCartProductAddedCallback(({ addId }) => {
      cartManager.confirmPendingAdd(addId);
      throw new Error("logging failed");
    });

    cartManager.addToCart();

    expect(cartManager.getTotalItemCount()).toBe(1);
  });

  it("resolves each add at most once when several callbacks confirm it", () => {
    SessionManager.removeCartProductAddedCallback(onAdded);
    const confirmations: boolean[] = [];
    const confirm = ({ addId }: { addId: string }) => {
      confirmations.push(cartManager.confirmPendingAdd(addId));
    };
    SessionManager.addCartProductAddedCallback(confirm);
    SessionManager.addCartProductAddedCallback((data) => confirm(data));

    cartManager.addToCart();

    expect(confirmations).toEqual([true, false]);
    expect(cartManager.rollbackPendingAdd(undefined)).toBe(false);
  });

  it("targets a specific add by addId, out of order", () => {
    const first = cartManager.addToCart();
    const second = cartManager.addToCart();

    expect(cartManager.rollbackPendingAdd(second)).toBe(true);
    expect(cartManager.rollbackPendingAdd(second)).toBe(false);
    expect(cartManager.confirmPendingAdd(second)).toBe(false);
    expect(cartManager.getTotalItemCount()).toBe(1);

    expect(cartManager.confirmPendingAdd(first)).toBe(true);
    expect(cartManager.rollbackPendingAdd(first)).toBe(false);
    expect(cartManager.getTotalItemCount()).toBe(1);
  });

  it("rolls back one unit when an earlier pending add of a new product fails", () => {
    const first = cartManager.addToCart();
    cartManager.addToCart();

    cartManager.rollbackPendingAdd(first);

    expect(cartManager.getTotalItemCount()).toBe(1);
  });
});
