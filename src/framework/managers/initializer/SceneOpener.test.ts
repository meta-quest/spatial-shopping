/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const context = {
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
});

import { VisibilityState, type World } from "@iwsdk/core";

import type { ProductData } from "../../types/ProductData";
import { SceneOpener } from "./SceneOpener";

const product: ProductData = {
  id: "chair",
  metadata: { title: "Chair", price: "$10.00" },
  assets: { thumbnailUrl: "/chair.png" },
  xr: { assetUrl: "/chair.glb" },
};

function createHarness() {
  let visibilityListener: ((state: VisibilityState) => void) | null = null;
  const unsubscribe = vi.fn();
  const world = {
    session: null as XRSession | null,
    // Stays pending until a test settles it, like IWSDK during a session request.
    sessionRequestPending: true,
    launchXR: vi.fn(),
    visibilityState: {
      subscribe: vi.fn((listener: (state: VisibilityState) => void) => {
        visibilityListener = listener;
        return unsubscribe;
      }),
    },
  };
  const session = new EventTarget() as XRSession & {
    end: ReturnType<typeof vi.fn>;
  };
  session.end = vi.fn(async () => {
    world.session = null;
  });

  const sceneManager = {
    currentProduct: null,
    addProduct: vi.fn().mockResolvedValue(undefined),
    setCurrentProduct: vi.fn(),
  };
  const uiManager = {
    showInitialUI: vi.fn(),
    resetUIState: vi.fn(),
    forceHideControlPanels: vi.fn(),
  };
  const spatialPanelSystem = {
    showPanel: vi.fn(),
    setAndDisplayProduct: vi.fn(),
    showLoadingProduct: vi.fn(),
    hideLoadingProduct: vi.fn(),
  };
  const sessionManager = { onXRExperienceQuit: vi.fn() };

  const opener = new SceneOpener();
  opener.world = world as unknown as World;
  opener.viewerProductManager = {
    setProduct: vi.fn(),
    getCurrentProduct: vi.fn(() => product),
  } as never;
  opener.sceneManager = sceneManager as never;
  opener.uiManager = uiManager as never;
  opener.spatialPanelSystem = spatialPanelSystem as never;
  opener.planeProcessSystem = {
    isUserInScannedRoom: vi.fn(() => true),
    hasDetectedPlanes: vi.fn(() => true),
  } as never;
  opener.placementReticleSystem = { hideReticle: vi.fn() } as never;
  opener.variantManager = {
    applyDefaultVariant: vi.fn().mockResolvedValue(true),
  } as never;
  opener.cartManager = {
    getCartData: vi.fn(() => ({ sessionId: "session", products: {} })),
  } as never;
  opener.sessionManager = sessionManager as never;

  return {
    opener,
    world,
    session,
    sceneManager,
    sessionManager,
    unsubscribe,
    emitVisibility(state: VisibilityState) {
      if (!visibilityListener) throw new Error("Visibility listener not ready");
      visibilityListener(state);
    },
  };
}

describe("SceneOpener lifecycle", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: vi.fn().mockResolvedValue(true) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an overlapping open and lets close cancel the first attempt", async () => {
    const { opener, sessionManager, unsubscribe } = createHarness();

    const firstOpen = opener.openProduct(product);
    await expect(opener.openProduct(product)).rejects.toThrow(
      "already opening",
    );

    await opener.close();
    await expect(firstOpen).rejects.toThrow("cancelled");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(sessionManager.onXRExperienceQuit).not.toHaveBeenCalled();
  });

  it("closes an active experience once and emits one quit event", async () => {
    const { opener, world, session, sessionManager, emitVisibility } =
      createHarness();

    const open = opener.openProduct(product);
    await vi.waitFor(() => expect(world.launchXR).toHaveBeenCalledOnce());
    world.session = session;
    emitVisibility(VisibilityState.Visible);
    await open;

    const firstClose = opener.close();
    const secondClose = opener.close();
    expect(secondClose).toBe(firstClose);
    await Promise.all([firstClose, secondClose]);

    expect(session.end).toHaveBeenCalledOnce();
    expect(sessionManager.onXRExperienceQuit).toHaveBeenCalledOnce();

    await opener.close();
    expect(sessionManager.onXRExperienceQuit).toHaveBeenCalledOnce();
  });

  it("rejects with XR_PERMISSION_DENIED when IWSDK swallows a denied session request", async () => {
    const { opener, world } = createHarness();
    const requestSession = vi.fn(() =>
      Promise.reject(new DOMException("User denied", "NotAllowedError")),
    );
    const xr = navigator.xr as unknown as Record<string, unknown>;
    xr.requestSession = requestSession;
    world.launchXR.mockImplementation(() => iwsdkLaunchXR(world));

    await expect(opener.openProduct(product)).rejects.toThrow(
      "XR_PERMISSION_DENIED",
    );
    expect(requestSession).toHaveBeenCalledOnce();
    expect(xr.requestSession).toBe(requestSession);
  });

  it("rejects with XR_UNSUPPORTED when a granted session is never adopted", async () => {
    const { opener, world } = createHarness();
    const xr = navigator.xr as unknown as Record<string, unknown>;
    xr.requestSession = vi.fn(() => Promise.resolve(new EventTarget()));
    world.launchXR.mockImplementation(() => iwsdkLaunchXR(world));

    await expect(opener.openProduct(product)).rejects.toThrow("XR_UNSUPPORTED");
  });

  it("rejects when an adopted session ends before XR becomes visible", async () => {
    const { opener, world, session } = createHarness();
    const xr = navigator.xr as unknown as Record<string, unknown>;
    xr.requestSession = vi.fn(() => Promise.resolve(session));
    world.launchXR.mockImplementation(() => {
      iwsdkLaunchXR(world);
      world.session = session;
    });

    const open = opener.openProduct(product);
    await vi.waitFor(() => expect(world.sessionRequestPending).toBe(false));
    // Let the adoption poll observe the settled request and attach its listener.
    await new Promise((resolve) => setTimeout(resolve, 250));
    session.dispatchEvent(new Event("end"));

    await expect(open).rejects.toThrow("XR launch failed");
  });
});

/**
 * Mirrors IWSDK's launchXR(): requestSession failures are caught and logged,
 * never rethrown, and sessionRequestPending clears once the request settles.
 */
function iwsdkLaunchXR(world: { sessionRequestPending: boolean }): void {
  const xr = navigator.xr as unknown as {
    requestSession: () => Promise<unknown>;
  };
  world.sessionRequestPending = true;
  xr.requestSession()
    .catch(() => {})
    .finally(() => {
      world.sessionRequestPending = false;
    });
}
