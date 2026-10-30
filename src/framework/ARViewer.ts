/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Initializer } from "./managers/initializer/Initializer";
import {
  ADD_TO_CART_FAILURE_MESSAGES,
  AddToCartFailureReason,
} from "./managers/session/AddToCartFailureReason";
import { SessionEndReason } from "./managers/session/SessionEndReason";
import {
  SessionStartCallback,
  SessionManager,
  CartProductAddedCallback,
  CartChangeCallback,
  XRExperienceQuitCallback,
} from "./managers/session/SessionManager";
import { ProductData } from "./types/ProductData";
import { RaiseCallback, MessageHandler } from "./utils/MessageHandler";
import type { CartManager } from "./managers/session/CartManager";
import type { UIManager } from "./managers/ui/UIManager";
import type { WorldOptions } from "@iwsdk/core";

/** Facade the host page uses to initialize, open, and dispose the AR viewer. */
export class ARViewer {
  private static instance: ARViewer | null = null;
  private initializer: Initializer | null = null;
  private initPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;

  /** Use {@link ARViewer.getInstance}. */
  private constructor() {}

  /** Returns the singleton instance of ARViewer. */
  public static getInstance(): ARViewer {
    if (!ARViewer.instance) {
      ARViewer.instance = new ARViewer();
    }
    return ARViewer.instance;
  }

  /**
   * Initializes the viewer. Repeated calls share the same in-flight operation.
   * If initialization fails it is rolled back, but registered host callbacks
   * (session, cart, quit, and message callbacks) are kept, so `init()` can be
   * retried without registering them again.
   */
  public async init(projectOptions?: WorldOptions): Promise<void> {
    if (this.disposePromise) {
      throw new Error("ARViewer.dispose() is in progress.");
    }
    if (this.initializer) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initialize(projectOptions);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initialize(projectOptions?: WorldOptions): Promise<void> {
    const sessionManager = new SessionManager();
    const initializer = new Initializer();

    try {
      sessionManager.createOrRestoreSession();
      await initializer.initialize(sessionManager, projectOptions);
      this.initializer = initializer;
    } catch (error) {
      sessionManager.dispose();
      throw error;
    }
  }

  /** Opens the AR experience for the given product. */
  public async open(productData: ProductData): Promise<void> {
    if (this.disposePromise) {
      throw new Error("ARViewer.dispose() is in progress.");
    }
    if (!this.initializer) {
      throw new Error("ARViewer.init() must complete before open().");
    }
    await this.initializer.internalHolder.sceneOpener.openProduct(productData);
  }

  /** Registers a callback for warning messages. */
  public setWarningCallback(callback: RaiseCallback): void {
    MessageHandler.addWarningCallback(callback);
  }

  /** Registers a callback for error messages. */
  public setErrorCallback(callback: RaiseCallback): void {
    MessageHandler.addErrorCallback(callback);
  }

  /** Registers a callback for log messages. */
  public setLogCallback(callback: RaiseCallback): void {
    MessageHandler.addLogCallback(callback);
  }

  /** Unregisters a warning callback. */
  public removeWarningCallback(callback: RaiseCallback): void {
    MessageHandler.removeWarningCallback(callback);
  }

  /** Unregisters an error callback. */
  public removeErrorCallback(callback: RaiseCallback): void {
    MessageHandler.removeErrorCallback(callback);
  }

  /** Unregisters a log callback. */
  public removeLogCallback(callback: RaiseCallback): void {
    MessageHandler.removeLogCallback(callback);
  }

  /** Registers a callback invoked when the session starts. */
  public setSessionStartCallback(callback: SessionStartCallback): void {
    SessionManager.addSessionStartCallback(callback);
  }

  /** Unregisters the session start callback. */
  public removeSessionStartCallback(callback: SessionStartCallback): void {
    SessionManager.removeSessionStartCallback(callback);
  }

  /** Registers a callback invoked when a product is added to cart. */
  public setCartProductAddedCallback(callback: CartProductAddedCallback): void {
    SessionManager.addCartProductAddedCallback(callback);
  }

  /** Unregisters the cart product added callback. */
  public removeCartProductAddedCallback(
    callback: CartProductAddedCallback,
  ): void {
    SessionManager.removeCartProductAddedCallback(callback);
  }

  /** Registers a callback invoked after any cart mutation. */
  public setCartChangeCallback(callback: CartChangeCallback): void {
    SessionManager.addCartChangeCallback(callback);
  }

  /** Unregisters a cart change callback. */
  public removeCartChangeCallback(callback: CartChangeCallback): void {
    SessionManager.removeCartChangeCallback(callback);
  }

  /** Registers a callback invoked when the XR experience is quit. */
  public setXRExperienceQuitCallback(callback: XRExperienceQuitCallback): void {
    SessionManager.addXRExperienceQuitCallback(callback);
  }

  /** Unregisters the XR experience quit callback. */
  public removeXRExperienceQuitCallback(
    callback: XRExperienceQuitCallback,
  ): void {
    SessionManager.removeXRExperienceQuitCallback(callback);
  }

  /**
   * Call after the host successfully adds to cart in setCartProductAddedCallback
   * to confirm the add and show the in-AR success panel.
   *
   * Each add resolves at most once; repeated calls for the same add are
   * ignored with a warning. Not needed when no cart-product-added callback is
   * registered (adds then commit immediately).
   * @param addId - `CartProductAddedData.addId` of the add to confirm. Defaults
   *   to the oldest pending add; pass it when several callbacks or concurrent
   *   adds may resolve out of order.
   */
  public onAddToCartSuccess(addId?: string): void {
    const managers = this.getCartManagers("onAddToCartSuccess");
    if (!managers) return;
    if (!managers.cartManager.confirmPendingAdd(addId)) {
      this.warnNoPendingAdd("onAddToCartSuccess", addId);
      return;
    }
    managers.uiManager.showAddToCartConfirmation();
  }

  /**
   * Call when add-to-cart fails in setCartProductAddedCallback. Reverts the
   * tentative cart change and shows the in-AR error panel for the given reason.
   * A callback that throws or rejects is treated as an
   * {@link AddToCartFailureReason.Other} failure automatically.
   * @param addId - `CartProductAddedData.addId` of the add to revert. Defaults
   *   to the oldest pending add.
   */
  public onAddToCartFailure(
    reason: AddToCartFailureReason,
    addId?: string,
  ): void {
    const managers = this.getCartManagers("onAddToCartFailure");
    if (!managers) return;
    if (!managers.cartManager.rollbackPendingAdd(addId)) {
      this.warnNoPendingAdd("onAddToCartFailure", addId);
      return;
    }
    managers.uiManager.showErrorPanel(ADD_TO_CART_FAILURE_MESSAGES[reason]);
  }

  private warnNoPendingAdd(caller: string, addId?: string): void {
    MessageHandler.raiseWarning(
      `ARViewer.${caller}() ignored: ${
        addId === undefined
          ? "no add is pending"
          : `add ${addId} is not pending (already resolved or unknown)`
      }.`,
      true,
    );
  }

  /** Returns cart/UI managers, or warns and returns null if not initialized. */
  private getCartManagers(
    caller: string,
  ): { cartManager: CartManager; uiManager: UIManager } | null {
    const holder = this.disposePromise
      ? null
      : this.initializer?.internalHolder;
    if (!holder?.cartManager || !holder.uiManager) {
      MessageHandler.raiseWarning(
        `ARViewer.${caller}() ignored: the viewer is not initialized.`,
        true,
      );
      return null;
    }
    return { cartManager: holder.cartManager, uiManager: holder.uiManager };
  }

  /**
   * Disposes the viewer and releases resources. Unregisters every host
   * callback; register them again on the next instance.
   */
  public dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;

    const disposePromise = this.performDispose();
    this.disposePromise = disposePromise;
    const clearDisposePromise = () => {
      if (this.disposePromise === disposePromise) this.disposePromise = null;
    };
    void disposePromise.then(clearDisposePromise, clearDisposePromise);
    return disposePromise;
  }

  private async performDispose(): Promise<void> {
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        // Failed initialization already performs its own partial cleanup.
      }
    }

    const initializer = this.initializer;
    if (!initializer) {
      SessionManager.clearHostCallbacks();
      MessageHandler.dispose();
      ARViewer.instance = null;
      return;
    }

    try {
      await initializer.internalHolder.sceneOpener.close(
        true,
        SessionEndReason.SystemExit,
      );
    } finally {
      initializer.dispose();
      SessionManager.clearHostCallbacks();
      MessageHandler.dispose();
      this.initializer = null;
      ARViewer.instance = null;
    }
  }
}
