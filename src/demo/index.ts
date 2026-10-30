/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ProductData } from "../framework/types/ProductData.js";
import type { ARViewer } from "../framework/ARViewer.js";
import { SessionEndReason } from "../framework/managers/session/SessionEndReason.js";
import { XRSessionErrorCode } from "../framework/managers/session/ErrorCodes.js";
import { createExampleAddToCartHandler } from "./services/AddToCartHandler.js";
import { ExampleConnectionService } from "./services/ExampleConnectionService.js";
import {
  ExampleProductSelectionUI,
  type ARAvailability,
} from "./ExampleProductSelectionUI.js";
import { HostHeaderUI } from "./HostHeaderUI.js";

// The catalog renders from this small entry chunk. The AR runtime (IWSDK,
// three.js, UIKit) is a separate chunk that starts downloading right after the
// first render and is fully initialized before any "View in AR" button is
// enabled, so `launchXR()` still runs inside the click's user activation.
// Production builds skip the runtime entirely when immersive AR is unsupported.

const AR_UNSUPPORTED_MESSAGE =
  "AR needs Meta Quest Browser on Meta Quest 3, 3S, or Pro. Developers: run npm run dev to try it in the built-in emulator.";

const hostHeaderUI = new HostHeaderUI();
let viewer: ARViewer | null = null;
let lastTrigger: HTMLElement | null = null;

const byId = (id: string): HTMLElement | null => document.getElementById(id);

const hideExperienceError = (): void => {
  const errorElement = byId("experience-error");
  if (errorElement) errorElement.hidden = true;
};

/** Shows an error above the catalog and moves focus to it. */
const showExperienceError = (message: string): void => {
  const errorElement = byId("experience-error");
  if (!errorElement) return;

  errorElement.textContent = message;
  errorElement.hidden = false;
  errorElement.focus({ preventScroll: true });
  errorElement.scrollIntoView({ block: "center" });
};

const showSupportNotice = (message: string): void => {
  const notice = byId("ar-support-notice");
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = false;
};

const setExperienceLoading = (loading: boolean): void => {
  byId("loading-experience")?.classList.toggle("active", loading);
  byId("page-content")?.toggleAttribute("inert", loading);
  if (loading) productSelectionUI.setStatus("Preparing your space...");
};

/**
 * Restores the 2D catalog after an AR session ends or fails to start. The
 * runtime does not touch host-page DOM, so the demo owns this.
 */
const restoreCatalogUI = (): void => {
  setExperienceLoading(false);
  byId("scene-container")?.classList.remove("active");
  productSelectionUI.setStatus("");
};

const restoreFocus = (): void => {
  const target = lastTrigger;
  if (!target?.isConnected) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center" });
};

const describeOpenError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(XRSessionErrorCode.XR_UNSUPPORTED)) {
    return `This browser or device can't start an AR session. ${AR_UNSUPPORTED_MESSAGE}`;
  }
  if (message.includes(XRSessionErrorCode.XR_PERMISSION_DENIED)) {
    return "The AR session was blocked or ended before it started. Allow camera and spatial tracking for this site, then try again.";
  }
  if (
    message.includes(XRSessionErrorCode.ASSET_FETCH_FAILED) ||
    message.includes(XRSessionErrorCode.ASSET_PARSE_FAILED)
  ) {
    return "This product's 3D model could not be loaded. Try again or choose another product.";
  }
  return "The AR view could not be started. Try again.";
};

const onProductSelected = (
  productData: ProductData,
  trigger: HTMLElement,
): void => {
  lastTrigger = trigger;
  if (!viewer) {
    restoreCatalogUI();
    return;
  }

  hideExperienceError();
  setExperienceLoading(true);

  void viewer
    .open(productData)
    .then(() => {
      setExperienceLoading(false);
      byId("scene-container")?.classList.add("active");
    })
    .catch((error: unknown) => {
      console.error("Failed to open the AR experience:", error);
      restoreCatalogUI();
      showExperienceError(describeOpenError(error));
    });
};

const productSelectionUI = new ExampleProductSelectionUI(
  onProductSelected,
  () => {
    lastTrigger = null;
    setExperienceLoading(true);
  },
  (message) => {
    setExperienceLoading(false);
    productSelectionUI.setStatus("");
    showExperienceError(message);
  },
);

/** Downloads and initializes the AR runtime in the background. */
const initViewer = async (): Promise<ARViewer> => {
  const [{ ARViewer }, { default: projectOptions }] = await Promise.all([
    import("../framework/ARViewer.js"),
    import("virtual:iwsdk-project"),
  ]);
  const instance = ARViewer.getInstance();

  instance.setLogCallback((message) => console.log("ARViewer Log:", message));
  instance.setWarningCallback((message) =>
    console.warn("ARViewer Warning:", message),
  );
  instance.setErrorCallback((message) =>
    console.error("ARViewer Error:", message),
  );
  instance.setSessionStartCallback((sessionData) => {
    console.log("ARViewer Session Start:", sessionData);
  });

  instance.setXRExperienceQuitCallback((event) => {
    console.log(
      "ARViewer XR Experience Quit:",
      event.sessionId,
      "Reason:",
      event.reason,
      "Cart:",
      event.cartData,
    );
    restoreCatalogUI();
    restoreFocus();

    if (event.reason === SessionEndReason.ProceedToCart) {
      console.log(
        "User wants to proceed to checkout with cart:",
        event.cartData,
      );
    }
  });

  const connectionService = new ExampleConnectionService();
  const addToCart = createExampleAddToCartHandler(instance, () =>
    connectionService.check(),
  );
  instance.setCartProductAddedCallback(async (cartData) => {
    await addToCart(cartData);
    console.log("Product added to cart:", cartData);
  });
  instance.setCartChangeCallback((cartData) => {
    hostHeaderUI.updateCart(cartData);
  });

  await instance.init(projectOptions);
  return instance;
};

const isImmersiveARSupported = async (): Promise<boolean> => {
  try {
    return (await navigator.xr?.isSessionSupported("immersive-ar")) ?? false;
  } catch {
    return false;
  }
};

const startViewer = async (): Promise<void> => {
  let availability: ARAvailability;
  try {
    if (import.meta.env.PROD && !(await isImmersiveARSupported())) {
      // Production has no emulator, so skip downloading and initializing the
      // AR runtime (its chunk, HDR, and WebGL world) on browsers without AR.
      availability = "unsupported";
    } else {
      viewer = await initViewer();
      // In development, checked after init so the dev-server emulator has had
      // a chance to install navigator.xr.
      availability = (await isImmersiveARSupported()) ? "ready" : "unsupported";
    }
  } catch (error) {
    console.error("Failed to initialize the AR viewer:", error);
    availability = "failed";
    showExperienceError(
      "The AR viewer could not be initialized. You can still browse the products.",
    );
  }

  if (availability === "unsupported") {
    showSupportNotice(
      `Viewing products in AR isn't supported in this browser. ${AR_UNSUPPORTED_MESSAGE}`,
    );
  }
  productSelectionUI.setARAvailability(availability);
};

hostHeaderUI.init();
void productSelectionUI.init();
void startViewer();
