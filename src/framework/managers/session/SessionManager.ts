/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { MessageHandler } from "../../utils/MessageHandler.js";
import { safeEmit } from "../../utils/SafeEmit.js";
import { safeStorage } from "../../utils/SafeStorage.js";
import { SessionStartEvent } from "./SessionStartEvent.js";
import { SessionEndEvent } from "./SessionEndEvent.js";
import { SessionEndReason } from "./SessionEndReason.js";
import { AddToCartData } from "./AddToCartData.js";
import { CartManager } from "./CartManager.js";
import type {
  CartChangeData,
  CartProductAddedData,
  CartProductSummary,
} from "./CartChangeData.js";

/** Host callbacks may be async; rejections are caught and reported. */
export type SessionStartCallback = (
  event: SessionStartEvent,
) => void | Promise<void>;
export type XRExperienceQuitCallback = (
  event: SessionEndEvent,
) => void | Promise<void>;
export type CartProductAddedCallback = (
  cartData: CartProductAddedData,
) => void | Promise<void>;
export type CartChangeCallback = (
  cartData: CartChangeData,
) => void | Promise<void>;

/** Builds a frozen product summary that hosts cannot use to mutate viewer state. */
function summarizeEntry(entry: {
  id: string;
  quantity: number;
  price: string;
}): CartProductSummary {
  return Object.freeze({
    id: entry.id,
    quantity: entry.quantity,
    price: entry.price,
  });
}

export class SessionManager {
  private static readonly STORAGE_KEY = "viyr_session";
  /** Session duration: 30 minutes in ms. */
  private static readonly SESSION_DURATION_MS = 30 * 60 * 1000;
  /** Session refresh interval: 1 minute in ms. */
  private static readonly SESSION_REFRESH_INTERVAL_MS = 60 * 1000;
  private sessionStartEvent: SessionStartEvent | null = null;
  private sessionRefreshTimer: number | null = null;
  private static sessionStartCallbacks: SessionStartCallback[] = [];
  private static xrExperienceQuitCallbacks: XRExperienceQuitCallback[] = [];
  private static cartProductAddedCallbacks: CartProductAddedCallback[] = [];
  private static cartChangeCallbacks: CartChangeCallback[] = [];

  private static isStoredSession(
    value: unknown,
  ): value is { sessionId: string; sessionEndTimestamp: number } {
    if (!value || typeof value !== "object") return false;
    const session = value as Record<string, unknown>;
    return (
      typeof session.sessionId === "string" &&
      session.sessionId.length > 0 &&
      typeof session.sessionEndTimestamp === "number" &&
      Number.isFinite(session.sessionEndTimestamp)
    );
  }

  /** Creates a new session or restores an existing one from storage. */
  public createOrRestoreSession(): void {
    const storedSession = safeStorage.getItem(SessionManager.STORAGE_KEY);
    if (storedSession) {
      try {
        const sessionData: unknown = JSON.parse(storedSession);
        if (!SessionManager.isStoredSession(sessionData)) {
          throw new Error("Stored session has an invalid shape.");
        }
        this.sessionStartEvent = this.checkSessionOutdated(
          sessionData,
          Date.now(),
        );
      } catch (error) {
        MessageHandler.raiseWarning(
          `Discarding invalid stored session: ${String(error)}`,
        );
        safeStorage.removeItem(SessionManager.STORAGE_KEY);
        safeStorage.removeItem(CartManager.CART_STORAGE_KEY);
        this.sessionStartEvent = this.createNewSession();
      }
    } else {
      this.sessionStartEvent = this.createNewSession();
    }

    safeStorage.setItem(
      SessionManager.STORAGE_KEY,
      JSON.stringify(this.sessionStartEvent),
    );
    this.raiseSessionStart(this.sessionStartEvent);
    this.startSessionRefreshTimer();
  }

  /** Returns a valid SessionStartEvent, creating a new session if the stored one is expired. */
  private checkSessionOutdated(
    sessionData: { sessionId: string; sessionEndTimestamp: number },
    now: number,
  ): SessionStartEvent {
    if (sessionData.sessionEndTimestamp < now) {
      safeStorage.removeItem(SessionManager.STORAGE_KEY);
      safeStorage.removeItem(CartManager.CART_STORAGE_KEY);
      return this.createNewSession();
    } else {
      MessageHandler.raiseLog("Restoring session");
      const restoredSession = new SessionStartEvent(
        sessionData.sessionId,
        now + SessionManager.SESSION_DURATION_MS,
      );
      return restoredSession;
    }
  }

  /** Creates a new session with a random UUID. */
  private createNewSession(): SessionStartEvent {
    MessageHandler.raiseLog("Creating new session");
    return new SessionStartEvent(
      crypto.randomUUID(),
      Date.now() + SessionManager.SESSION_DURATION_MS,
    );
  }

  /** Returns the current session start event. */
  public getSessionStartEvent(): SessionStartEvent {
    return this.sessionStartEvent!;
  }

  /** Extends the session duration and persists to storage. */
  public refreshSession(): void {
    MessageHandler.raiseLog("Refreshing session");
    this.sessionStartEvent!.sessionEndTimestamp =
      Date.now() + SessionManager.SESSION_DURATION_MS;
    safeStorage.setItem(
      SessionManager.STORAGE_KEY,
      JSON.stringify(this.sessionStartEvent),
    );
  }

  /** Starts the periodic session refresh timer. */
  private startSessionRefreshTimer(): void {
    if (this.sessionRefreshTimer === null) {
      this.sessionRefreshTimer = window.setInterval(() => {
        this.refreshSession();
      }, SessionManager.SESSION_REFRESH_INTERVAL_MS);
    }
  }

  /** Returns true if there is an active session, false otherwise. */
  public hasActiveSession(): boolean {
    return this.sessionStartEvent !== null;
  }

  /** Registers a callback for session start events. */
  public static addSessionStartCallback(
    callbackFn: SessionStartCallback,
  ): void {
    if (!SessionManager.sessionStartCallbacks.includes(callbackFn)) {
      SessionManager.sessionStartCallbacks.push(callbackFn);
    }
  }

  /** Unregisters a session start callback. */
  public static removeSessionStartCallback(
    callbackFn: SessionStartCallback,
  ): void {
    const index = SessionManager.sessionStartCallbacks.indexOf(callbackFn);
    if (index !== -1) {
      SessionManager.sessionStartCallbacks.splice(index, 1);
    }
  }

  /** Registers a callback for XR experience quit events. */
  public static addXRExperienceQuitCallback(
    callbackFn: XRExperienceQuitCallback,
  ): void {
    if (!SessionManager.xrExperienceQuitCallbacks.includes(callbackFn)) {
      SessionManager.xrExperienceQuitCallbacks.push(callbackFn);
    }
  }

  /** Unregisters an XR experience quit callback. */
  public static removeXRExperienceQuitCallback(
    callbackFn: XRExperienceQuitCallback,
  ): void {
    const index = SessionManager.xrExperienceQuitCallbacks.indexOf(callbackFn);
    if (index !== -1) {
      SessionManager.xrExperienceQuitCallbacks.splice(index, 1);
    }
  }

  /** Registers a callback for cart product added events. */
  public static addCartProductAddedCallback(
    callbackFn: CartProductAddedCallback,
  ): void {
    if (!SessionManager.cartProductAddedCallbacks.includes(callbackFn)) {
      SessionManager.cartProductAddedCallbacks.push(callbackFn);
    }
  }

  /** Unregisters a cart product added callback. */
  public static removeCartProductAddedCallback(
    callbackFn: CartProductAddedCallback,
  ): void {
    const index = SessionManager.cartProductAddedCallbacks.indexOf(callbackFn);
    if (index !== -1) {
      SessionManager.cartProductAddedCallbacks.splice(index, 1);
    }
  }

  /** Returns whether any cart product added callback is registered. */
  public static hasCartProductAddedCallbacks(): boolean {
    return SessionManager.cartProductAddedCallbacks.length > 0;
  }

  /** Registers a callback for any cart quantity, add, or remove change. */
  public static addCartChangeCallback(callbackFn: CartChangeCallback): void {
    if (!SessionManager.cartChangeCallbacks.includes(callbackFn)) {
      SessionManager.cartChangeCallbacks.push(callbackFn);
    }
  }

  /** Unregisters a cart change callback. */
  public static removeCartChangeCallback(callbackFn: CartChangeCallback): void {
    const index = SessionManager.cartChangeCallbacks.indexOf(callbackFn);
    if (index !== -1) SessionManager.cartChangeCallbacks.splice(index, 1);
  }

  /** Reports a failing host callback without interrupting the viewer. */
  private static reportCallbackError(name: string): (error: unknown) => void {
    return (error) => {
      MessageHandler.raiseError(
        `Host ${name} callback failed: ${String(error)}`,
      );
    };
  }

  /** Invokes all session start callbacks. */
  private raiseSessionStart(event: SessionStartEvent): void {
    safeEmit(
      SessionManager.sessionStartCallbacks,
      [event],
      SessionManager.reportCallbackError("session start"),
    );
  }

  private createCartChangeData(cartData: AddToCartData): CartChangeData {
    const sessionId = this.sessionStartEvent!.sessionId;
    const products = Object.fromEntries(
      Object.entries(cartData.products).map(([key, entry]) => [
        key,
        summarizeEntry(entry),
      ]),
    );
    return Object.freeze({ sessionId, products: Object.freeze(products) });
  }

  /**
   * Notifies listeners after an explicit add-to-cart action.
   * @param addId - Token identifying this add, exposed to hosts as `addId`.
   * @param onHostError - Invoked (after the error is reported) for each host
   *   callback that throws or rejects.
   */
  public onProductAdded(
    cartData: AddToCartData,
    addedProductId: string,
    addId: string,
    onHostError?: (error: unknown) => void,
  ): void {
    const addedEntry = cartData.products[addedProductId];
    if (!addedEntry) {
      MessageHandler.raiseWarning(
        `onProductAdded: product ${addedProductId} is not in the cart`,
      );
      return;
    }
    const payload: CartProductAddedData = Object.freeze({
      ...this.createCartChangeData(cartData),
      addedProduct: summarizeEntry(addedEntry),
      addId,
    });
    const report = SessionManager.reportCallbackError("cart product added");
    safeEmit(SessionManager.cartProductAddedCallbacks, [payload], (error) => {
      report(error);
      onHostError?.(error);
    });
  }

  /** Notifies listeners after any cart mutation. */
  public onCartChange(cartData: AddToCartData): void {
    safeEmit(
      SessionManager.cartChangeCallbacks,
      [this.createCartChangeData(cartData)],
      SessionManager.reportCallbackError("cart change"),
    );
  }

  /** Notifies listeners when the XR experience is quit with a specific reason. */
  public onXRExperienceQuit(
    reason: SessionEndReason,
    cartData: AddToCartData,
  ): void {
    const sessionId = this.sessionStartEvent!.sessionId;
    const event = new SessionEndEvent(
      sessionId,
      reason,
      this.createCartChangeData(cartData),
    );
    safeEmit(
      SessionManager.xrExperienceQuitCallbacks,
      [event],
      SessionManager.reportCallbackError("XR experience quit"),
    );
  }

  /**
   * Stops the session refresh timer. Host callbacks are static and survive
   * this, so a failed `ARViewer.init()` can be retried without the host
   * re-registering them; see {@link SessionManager.clearHostCallbacks}.
   */
  public dispose(): void {
    if (this.sessionRefreshTimer !== null) {
      clearInterval(this.sessionRefreshTimer);
      this.sessionRefreshTimer = null;
    }
  }

  /** Unregisters every host callback. Called by an explicit `ARViewer.dispose()`. */
  public static clearHostCallbacks(): void {
    SessionManager.sessionStartCallbacks = [];
    SessionManager.xrExperienceQuitCallbacks = [];
    SessionManager.cartProductAddedCallbacks = [];
    SessionManager.cartChangeCallbacks = [];
  }
}
