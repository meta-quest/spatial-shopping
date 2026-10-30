/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CartEntryData } from "./AddToCartData";
import { MessageHandler } from "../../utils/MessageHandler";
import { CartManager } from "./CartManager";
import { SessionEndReason } from "./SessionEndReason";
import { SessionManager } from "./SessionManager";

function chairCart(quantity = 1) {
  return {
    sessionId: "",
    products: {
      chair: new CartEntryData({
        id: "chair",
        title: "Chair",
        price: "$10.00",
        assetUrl: "/chair.png",
        quantity,
      }),
    },
  };
}

afterEach(() => {
  SessionManager.clearHostCallbacks();
});

describe("host callback lifetime", () => {
  it("keeps host callbacks across dispose() until clearHostCallbacks()", () => {
    const onStart = vi.fn();
    SessionManager.addSessionStartCallback(onStart);
    SessionManager.addCartProductAddedCallback(vi.fn());
    new SessionManager().dispose();

    expect(SessionManager.hasCartProductAddedCallbacks()).toBe(true);
    const manager = new SessionManager();
    manager.createOrRestoreSession();
    expect(onStart).toHaveBeenCalledOnce();
    manager.dispose();

    SessionManager.clearHostCallbacks();
    expect(SessionManager.hasCartProductAddedCallbacks()).toBe(false);
  });
});

describe("session and cart persistence", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    localStorage.clear();
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.dispose();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("replaces malformed session and cart storage with a new session", () => {
    localStorage.setItem("viyr_session", "{not-json");
    localStorage.setItem(CartManager.CART_STORAGE_KEY, "stale-cart");

    expect(() => sessionManager.createOrRestoreSession()).not.toThrow();

    expect(sessionManager.getSessionStartEvent().sessionId).toBeTruthy();
    expect(localStorage.getItem(CartManager.CART_STORAGE_KEY)).toBeNull();
    expect(() =>
      JSON.parse(localStorage.getItem("viyr_session")!),
    ).not.toThrow();
  });

  it("discards cart entries with invalid persisted quantities", () => {
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
            quantity: 0,
          },
        },
      }),
    );
    const cartManager = new CartManager();

    expect(() => cartManager.initialize()).not.toThrow();
    expect(cartManager.getCartData().products).toEqual({});
    expect(localStorage.getItem(CartManager.CART_STORAGE_KEY)).toBeNull();
  });
});

describe("cart event contracts", () => {
  it("keeps general mutations separate from explicit product adds", () => {
    const manager = new SessionManager();
    manager.createOrRestoreSession();
    const onChange = vi.fn();
    const onAdded = vi.fn();
    SessionManager.addCartChangeCallback(onChange);
    SessionManager.addCartProductAddedCallback(onAdded);
    const cart = {
      sessionId: "",
      products: {
        chair: new CartEntryData({
          id: "chair",
          title: "Chair",
          price: "$10.00",
          assetUrl: "/chair.png",
        }),
      },
    };

    manager.onCartChange(cart);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onAdded).not.toHaveBeenCalled();

    manager.onProductAdded(cart, "chair", "add-1");
    expect(onAdded).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    manager.dispose();
  });
});

describe("cart payloads", () => {
  let manager: SessionManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new SessionManager();
    manager.createOrRestoreSession();
  });

  afterEach(() => {
    manager.dispose();
    MessageHandler.dispose();
    vi.restoreAllMocks();
  });

  it("includes the added product in the product-added payload", () => {
    const onAdded = vi.fn();
    SessionManager.addCartProductAddedCallback(onAdded);

    manager.onProductAdded(chairCart(2), "chair", "add-1");

    expect(onAdded).toHaveBeenCalledWith({
      sessionId: manager.getSessionStartEvent().sessionId,
      products: { chair: { id: "chair", quantity: 2, price: "$10.00" } },
      addedProduct: { id: "chair", quantity: 2, price: "$10.00" },
      addId: "add-1",
    });
  });

  it("sends a frozen snapshot that is detached from live cart entries", () => {
    const onQuit = vi.fn();
    SessionManager.addXRExperienceQuitCallback(onQuit);
    const cart = chairCart();

    manager.onXRExperienceQuit(SessionEndReason.UserExit, cart);
    cart.products.chair.setQuantity(5);

    const event = onQuit.mock.calls[0][0];
    expect(event.cartData.products.chair.quantity).toBe(1);
    expect(Object.isFrozen(event.cartData)).toBe(true);
    expect(Object.isFrozen(event.cartData.products.chair)).toBe(true);
    expect(event.cartData.products.chair).not.toBeInstanceOf(CartEntryData);
  });
});

describe("host callback isolation", () => {
  afterEach(() => {
    MessageHandler.dispose();
    vi.restoreAllMocks();
  });

  it("keeps initializing when a session start callback throws", () => {
    const onError = vi.fn();
    MessageHandler.addErrorCallback(onError);
    const next = vi.fn();
    SessionManager.addSessionStartCallback(() => {
      throw new Error("host bug");
    });
    SessionManager.addSessionStartCallback(next);
    const manager = new SessionManager();

    expect(() => manager.createOrRestoreSession()).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("session start callback failed: Error: host bug"),
    );
    manager.dispose();
  });

  it("reports a rejected async cart callback instead of leaving it unhandled", async () => {
    const onError = vi.fn();
    MessageHandler.addErrorCallback(onError);
    const manager = new SessionManager();
    manager.createOrRestoreSession();
    SessionManager.addCartProductAddedCallback(async () => {
      throw new Error("network down");
    });

    const onHostError = vi.fn();
    expect(() =>
      manager.onProductAdded(chairCart(), "chair", "add-1", onHostError),
    ).not.toThrow();
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("cart product added callback failed"),
      ),
    );
    expect(onHostError).toHaveBeenCalledOnce();
    manager.dispose();
  });
});

describe("storage failures", () => {
  afterEach(() => {
    MessageHandler.dispose();
    vi.restoreAllMocks();
  });

  it("creates an in-memory session when localStorage throws", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const onWarning = vi.fn();
    MessageHandler.addWarningCallback(onWarning);
    const manager = new SessionManager();

    expect(() => manager.createOrRestoreSession()).not.toThrow();
    expect(manager.getSessionStartEvent().sessionId).toBeTruthy();
    expect(onWarning).toHaveBeenCalled();
    manager.dispose();
  });
});
