/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializerMock = vi.hoisted(() => {
  const state = {
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(),
    cartManager: {
      confirmPendingAdd: vi.fn((_addId?: string) => true),
      rollbackPendingAdd: vi.fn((_addId?: string) => true),
    },
    uiManager: {
      showAddToCartConfirmation: vi.fn(),
      showErrorPanel: vi.fn(),
    },
    sceneOpener: {
      openProduct: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
  };
  return state;
});

vi.mock("./managers/initializer/Initializer", () => ({
  Initializer: class {
    public internalHolder = {
      cartManager: initializerMock.cartManager,
      uiManager: initializerMock.uiManager,
      sceneOpener: initializerMock.sceneOpener,
    };
    initialize = initializerMock.initialize;
    dispose = initializerMock.dispose;
  },
}));

import { ARViewer } from "./ARViewer";
import { AddToCartFailureReason } from "./managers/session/AddToCartFailureReason";
import { SessionManager } from "./managers/session/SessionManager";
import type { ProductData } from "./types/ProductData";
import { MessageHandler } from "./utils/MessageHandler";

const product: ProductData = {
  id: "chair",
  metadata: { title: "Chair", price: "$10.00" },
  assets: { thumbnailUrl: "/chair.png" },
  xr: { assetUrl: "/chair.glb" },
};

describe("ARViewer lifecycle guards", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ARViewer.getInstance().dispose();
    MessageHandler.dispose();
  });

  it("returns one shared instance", () => {
    expect(ARViewer.getInstance()).toBe(ARViewer.getInstance());
  });

  it("rejects open() before init() completes", async () => {
    await expect(ARViewer.getInstance().open(product)).rejects.toThrow(
      "init() must complete before open()",
    );
  });

  it("warns instead of throwing when cart results arrive before init()", () => {
    const onWarning = vi.fn();
    const viewer = ARViewer.getInstance();
    viewer.setWarningCallback(onWarning);

    expect(() => viewer.onAddToCartSuccess()).not.toThrow();
    expect(() =>
      viewer.onAddToCartFailure(AddToCartFailureReason.OutOfStock),
    ).not.toThrow();

    expect(onWarning).toHaveBeenCalledTimes(2);
    expect(initializerMock.uiManager.showErrorPanel).not.toHaveBeenCalled();
  });

  it("shares one in-flight init() and opens after it", async () => {
    const viewer = ARViewer.getInstance();

    await Promise.all([viewer.init(), viewer.init()]);
    await viewer.open(product);

    expect(initializerMock.initialize).toHaveBeenCalledOnce();
    expect(initializerMock.sceneOpener.openProduct).toHaveBeenCalledWith(
      product,
    );
  });

  it("confirms or rolls back the pending cart add after init()", async () => {
    const viewer = ARViewer.getInstance();
    await viewer.init();

    viewer.onAddToCartSuccess();
    expect(
      initializerMock.cartManager.confirmPendingAdd,
    ).toHaveBeenCalledOnce();
    expect(
      initializerMock.uiManager.showAddToCartConfirmation,
    ).toHaveBeenCalledOnce();

    viewer.onAddToCartFailure(AddToCartFailureReason.NetworkConnection);
    expect(
      initializerMock.cartManager.rollbackPendingAdd,
    ).toHaveBeenCalledOnce();
    expect(initializerMock.uiManager.showErrorPanel).toHaveBeenCalledWith(
      expect.stringContaining("internet connection"),
    );
  });

  it("forwards addId and skips the panel when the add is already resolved", async () => {
    const viewer = ARViewer.getInstance();
    const onWarning = vi.fn();
    viewer.setWarningCallback(onWarning);
    await viewer.init();
    initializerMock.cartManager.confirmPendingAdd.mockReturnValueOnce(false);
    initializerMock.cartManager.rollbackPendingAdd.mockReturnValueOnce(false);

    viewer.onAddToCartSuccess("add-1");
    viewer.onAddToCartFailure(AddToCartFailureReason.Other, "add-1");

    expect(initializerMock.cartManager.confirmPendingAdd).toHaveBeenCalledWith(
      "add-1",
    );
    expect(initializerMock.cartManager.rollbackPendingAdd).toHaveBeenCalledWith(
      "add-1",
    );
    expect(
      initializerMock.uiManager.showAddToCartConfirmation,
    ).not.toHaveBeenCalled();
    expect(initializerMock.uiManager.showErrorPanel).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it("keeps host callbacks when init() fails so a retry still uses them", async () => {
    const viewer = ARViewer.getInstance();
    const onStart = vi.fn();
    const onAdded = vi.fn();
    viewer.setSessionStartCallback(onStart);
    viewer.setCartProductAddedCallback(onAdded);
    initializerMock.initialize.mockRejectedValueOnce(new Error("no WebGL"));

    await expect(viewer.init()).rejects.toThrow("no WebGL");
    expect(SessionManager.hasCartProductAddedCallbacks()).toBe(true);

    await viewer.init();
    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it("clears host callbacks on an explicit dispose()", async () => {
    const viewer = ARViewer.getInstance();
    viewer.setCartProductAddedCallback(vi.fn());

    await viewer.dispose();

    expect(SessionManager.hasCartProductAddedCallbacks()).toBe(false);
  });

  it("creates a fresh instance after dispose()", async () => {
    const viewer = ARViewer.getInstance();
    await viewer.init();

    await viewer.dispose();

    expect(initializerMock.sceneOpener.close).toHaveBeenCalledOnce();
    expect(initializerMock.dispose).toHaveBeenCalledOnce();
    expect(ARViewer.getInstance()).not.toBe(viewer);
  });

  it("ignores cart results after dispose()", async () => {
    const viewer = ARViewer.getInstance();
    await viewer.init();
    await viewer.dispose();

    viewer.onAddToCartSuccess();

    expect(
      initializerMock.cartManager.confirmPendingAdd,
    ).not.toHaveBeenCalled();
  });
});
