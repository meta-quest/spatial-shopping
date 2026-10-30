/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ProductData } from "../../types/ProductData";
import { MessageHandler } from "../../utils/MessageHandler";
import { ErrorUtil } from "../../utils/ErrorUtil";
import { SceneManager } from "../scene/SceneManager";
import { XRSessionErrorCode } from "../session/ErrorCodes";
import { AssetManager, VisibilityState, World } from "@iwsdk/core";
import { CartManager } from "../session/CartManager";
import { PlaneProcessSystem } from "../../features/PlaneProcessSystem/PlaneProcessSystem";
import { UIManager } from "../ui/UIManager";
import { SpatialPanelSystem } from "../../ui/ProductPanel/SpatialPanelSystem";
import { ViewerProductManager } from "../product/ViewerProductManager";
import { SessionManager } from "../session/SessionManager";
import { SessionEndReason } from "../session/SessionEndReason";
import { PlacementReticleSystem } from "../../features/PlacementReticle/PlacementReticleSystem";
import { imagePreloader } from "../../utils/ImagePreloader";
import { VariantManager } from "../product/VariantManager";
import { CONFIG } from "../../config/ViewerConfig";

export class SceneOpener {
  public world!: World;
  public cartManager!: CartManager;
  public planeProcessSystem!: PlaneProcessSystem | null;
  public spatialPanelSystem!: SpatialPanelSystem | null;
  public placementReticleSystem!: PlacementReticleSystem | null;
  public uiManager!: UIManager;
  public sceneManager!: SceneManager;
  public viewerProductManager!: ViewerProductManager;
  public sessionManager!: SessionManager;
  public variantManager!: VariantManager;
  /** Set by Initializer: used to show/hide scene and loading overlay around open(). */
  public sceneContainerElement: HTMLDivElement | undefined = undefined;
  public loadingOverlayElement: HTMLDivElement | null = null;

  private static readonly CONTAINER_VISIBLE_STYLE =
    "display:block;position:fixed;top:0;left:0;width:100%;height:100%;";
  private static readonly CONTAINER_HIDDEN_STYLE =
    "display:none;position:fixed;top:0;left:0;width:100%;height:100%;";

  /** How often to check whether IWSDK finished adopting a requested session. */
  private static readonly SESSION_REQUEST_POLL_MS = 100;

  private _xrSceneInitialized: boolean = false;
  private _experienceActive: boolean = false;
  private _visibilitySubscription: (() => void) | null = null;
  private _loadProduct: ((sceneManager: SceneManager) => Promise<void>) | null =
    null;
  private _openPromise: Promise<void> | null = null;
  private _cancelOpenAttempt: ((error: Error) => void) | null = null;
  private _openGeneration: number = 0;
  private _closePromise: Promise<void> | null = null;

  /**
   * Handles the open flow for a product.
   * 1. Launch XR immediately (to preserve user activation)
   * 2. Show XR loading UI
   * 3. Load the asset
   * 4. Show product after loading is done
   * @param productData - The product data to open.
   */
  public async openProduct(productData: ProductData): Promise<void> {
    if (this._closePromise) {
      throw new Error("The XR experience is closing.");
    }
    if (this._openPromise) {
      throw new Error("An XR experience is already opening.");
    }
    if (this._experienceActive || this.world?.session) {
      throw new Error("An XR experience is already active.");
    }

    this.viewerProductManager.setProduct(productData);
    return this.open(productData);
  }

  /**
   * Closes the scene.
   * @param forceExit - Whether to force exit the XR session.
   * @param reason - The reason for ending the session.
   */
  public close(
    forceExit: boolean = true,
    reason: SessionEndReason = SessionEndReason.UserExit,
  ): Promise<void> {
    if (this._closePromise) return this._closePromise;

    const closePromise = this.performClose(forceExit, reason);
    this._closePromise = closePromise;
    const clearClosePromise = () => {
      if (this._closePromise === closePromise) this._closePromise = null;
    };
    void closePromise.then(clearClosePromise, clearClosePromise);
    return closePromise;
  }

  private async performClose(
    forceExit: boolean,
    reason: SessionEndReason,
  ): Promise<void> {
    const shouldNotifyQuit = forceExit && this._experienceActive;
    this._experienceActive = false;

    const pendingOpen = this._openPromise;
    if (pendingOpen) {
      this._openGeneration += 1;
      this._cancelOpenAttempt?.(new Error("XR open was cancelled."));
      await pendingOpen.catch(() => {});
    }

    // The host restores its own page UI from the XR experience quit callback.
    this.sceneContainerElement?.setAttribute(
      "style",
      SceneOpener.CONTAINER_HIDDEN_STYLE,
    );
    if (this.loadingOverlayElement)
      this.loadingOverlayElement.style.display = "none";

    this.uiManager?.resetUIState();
    this.placementReticleSystem?.hideReticle();
    this.destroyEntities();
    imagePreloader.clear();

    this._visibilitySubscription?.();
    this._visibilitySubscription = null;

    this._xrSceneInitialized = false;

    let sessionEndError: unknown = null;
    if (forceExit) {
      const session = this.world?.session;
      if (session) {
        try {
          await session.end();
        } catch (error) {
          if (!(
            error instanceof DOMException && error.name === "InvalidStateError"
          )) {
            sessionEndError = error;
          }
        }
      }
      if (shouldNotifyQuit) {
        const cartData = this.cartManager.getCartData();
        this.sessionManager.onXRExperienceQuit(reason, cartData);
      }
    }

    if (sessionEndError) throw sessionEndError;
  }

  /** Opens the scene by loading product from URL. */
  private async open(productData: ProductData): Promise<void> {
    return this.executeOpenFlow(productData, () =>
      this.sceneManager!.addProduct(productData),
    );
  }

  /** Executes one exclusive open flow and clears its state when it settles. */
  private executeOpenFlow(
    productData: ProductData,
    loadProduct: (sceneManager: SceneManager) => Promise<void>,
  ): Promise<void> {
    if (this._openPromise) {
      return Promise.reject(new Error("An XR experience is already opening."));
    }

    const generation = ++this._openGeneration;
    const openPromise = this.runOpenFlow(productData, loadProduct, generation);
    this._openPromise = openPromise;
    const clearOpenPromise = () => {
      if (this._openPromise === openPromise) this._openPromise = null;
    };
    void openPromise.then(clearOpenPromise, clearOpenPromise);
    return openPromise;
  }

  /** Runs XR support, launch, room capture, and product loading. */
  private async runOpenFlow(
    productData: ProductData,
    loadProduct: (sceneManager: SceneManager) => Promise<void>,
    generation: number,
  ): Promise<void> {
    this._loadProduct = loadProduct;
    this.warmProductAssetCache(productData);

    await this.checkXRSupport();
    if (generation !== this._openGeneration) {
      throw new Error("XR open was cancelled.");
    }
    if (!this.world) {
      throw MessageHandler.raiseError(
        XRSessionErrorCode.INITIALIZATION_WAS_NOT_CALLED,
      );
    }
    if (this.loadingOverlayElement)
      this.loadingOverlayElement.style.display = "block";
    if (this.sceneContainerElement)
      this.sceneContainerElement.setAttribute(
        "style",
        SceneOpener.CONTAINER_HIDDEN_STYLE,
      );

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let activeSession: XRSession | null = null;
      let stopLaunchWatch = () => {};
      let visibilitySubscription: (() => void) | null = null;
      let cancelOpen: ((error: Error) => void) | null = null;

      const handleSessionEnd = () => {
        rejectOpen(
          MessageHandler.raiseError(
            `XR session ended prematurely: ${XRSessionErrorCode.XR_PERMISSION_DENIED}`,
          ),
          true,
        );
      };

      const cleanupAttempt = () => {
        stopLaunchWatch();
        activeSession?.removeEventListener("end", handleSessionEnd);
        activeSession = null;
        if (this._cancelOpenAttempt === cancelOpen) {
          this._cancelOpenAttempt = null;
        }
      };

      const rejectOpen = (error: Error, rollback: boolean) => {
        if (settled) return;
        settled = true;
        cleanupAttempt();
        visibilitySubscription?.();
        if (this._visibilitySubscription === visibilitySubscription) {
          this._visibilitySubscription = null;
        }
        this._xrSceneInitialized = false;
        if (this.loadingOverlayElement)
          this.loadingOverlayElement.style.display = "none";
        reject(error);

        if (rollback) {
          void this.close(true, SessionEndReason.SystemExit).catch(
            (cleanupError) => {
              MessageHandler.raiseWarning(
                `Failed to roll back XR open: ${String(cleanupError)}`,
              );
            },
          );
        }
      };

      const resolveOpen = () => {
        if (settled) return;
        settled = true;
        cleanupAttempt();
        resolve();
      };

      const afterXRSessionIsReady = async (xrSession: XRSession) => {
        activeSession = xrSession;
        xrSession.addEventListener("end", handleSessionEnd, { once: true });
        await this.checkRoomData(xrSession);
        if (settled || generation !== this._openGeneration) return;
        if (this.loadingOverlayElement)
          this.loadingOverlayElement.style.display = "none";
        if (this.sceneContainerElement)
          this.sceneContainerElement.setAttribute(
            "style",
            SceneOpener.CONTAINER_VISIBLE_STYLE,
          );
        this.uiManager!.showInitialUI();
        this.spatialPanelSystem!.setAndDisplayProduct();
        this.spatialPanelSystem!.showLoadingProduct();
        await loadProduct(this.sceneManager);
        if (settled || generation !== this._openGeneration) {
          this.destroyEntities();
          return;
        }
        await this.variantManager.applyDefaultVariant(productData);
        if (settled || generation !== this._openGeneration) return;
        this.spatialPanelSystem!.hideLoadingProduct();
        resolveOpen();
      };

      MessageHandler.raiseLog("Launching XR", true);

      cancelOpen = (error) => rejectOpen(error, false);
      this._cancelOpenAttempt = cancelOpen;

      try {
        stopLaunchWatch = this.launchXRSession(productData.id, (error) =>
          rejectOpen(error, false),
        );
        visibilitySubscription = this.world.visibilityState.subscribe(
          (visibilityState) => {
            MessageHandler.raiseLog("VisibilityState : " + visibilityState);
            if (
              this._xrSceneInitialized &&
              visibilityState === VisibilityState.NonImmersive
            ) {
              MessageHandler.raiseLog("User Pressed Quit Button, closing XR");
              void this.close(true, SessionEndReason.UserExit);
              return;
            } else if (visibilityState === VisibilityState.Visible) {
              if (this._xrSceneInitialized) {
                MessageHandler.raiseLog(
                  "Resuming from Quest menu - XR scene already active, skipping initialization",
                );
                return;
              }

              MessageHandler.raiseLog(
                "First time visible - initializing XR scene",
              );
              stopLaunchWatch();
              if (this.loadingOverlayElement)
                this.loadingOverlayElement.style.display = "none";
              const session = this.world.session;
              if (!session) {
                rejectOpen(
                  MessageHandler.raiseError(
                    "XR became visible without an active session",
                  ),
                  false,
                );
                return;
              }
              this._xrSceneInitialized = true;
              this._experienceActive = true;
              void afterXRSessionIsReady(session).catch((error: unknown) => {
                const reason =
                  error instanceof Error ? error : new Error(String(error));
                rejectOpen(reason, true);
              });
            } else {
              MessageHandler.raiseLog(
                `Visibility state changed to: ${visibilityState}`,
              );
            }
          },
        );
        this._visibilitySubscription = visibilitySubscription;
      } catch (error) {
        rejectOpen(
          MessageHandler.raiseError(
            `XR launch failed for product ${productData.id}: ${String(error)}`,
          ),
          false,
        );
      }
    });
  }

  /**
   * Handles the restart confirmed event.
   */
  public async handleRestartConfirmed() {
    const productData = this.viewerProductManager.getCurrentProduct();
    this.uiManager!.forceHideControlPanels();
    await this.close(false);
    await this.executeOpenFlow(
      productData!,
      this._loadProduct ??
        ((sceneManager) => sceneManager.addProduct(productData!)),
    );
  }

  /**
   * Starts fetching the product model while XR launches. The result lands in
   * AssetManager's cache under the same key SceneManager.addProduct uses;
   * failures are ignored here because the real load reports them.
   */
  private warmProductAssetCache(productData: ProductData): void {
    const assetUrl = productData.xr?.assetUrl;
    if (!this.world || !assetUrl?.trim()) return;
    try {
      AssetManager.loadGLTF(assetUrl, assetUrl).catch(() => {});
    } catch {
      // Cache warming is best-effort.
    }
  }

  /** Destroys current product entity and its custom bbox entities. */
  private destroyEntities() {
    const currentProduct = this.sceneManager.currentProduct;
    if (!currentProduct?.entity) {
      return;
    }

    try {
      currentProduct.entity.dispose();
      for (const entity of currentProduct.customBboxAndEntities.entities) {
        entity.dispose();
      }
    } finally {
      this.sceneManager.setCurrentProduct(null);
    }
  }

  /** Initiates room capture if supported and not already executed. */
  private async waitForRoomCapture(xrSession: XRSession | null) {
    const session = xrSession as
      (XRSession & { initiateRoomCapture?: () => Promise<void> }) | null;
    if (session?.initiateRoomCapture) {
      try {
        MessageHandler.raiseLog("Initiating room capture...");
        await session.initiateRoomCapture();
        MessageHandler.raiseLog("Room capture finished successfully.");
        await this.validateRoomCapture();
      } catch (caught: unknown) {
        const e = caught instanceof Error ? caught : new Error(String(caught));
        const errorCode = ErrorUtil.isRoomCaptureCancellation(e)
          ? XRSessionErrorCode.ROOM_CAPTURE_CANCELLED
          : XRSessionErrorCode.ROOM_CAPTURE_FAILED;

        MessageHandler.raiseWarning(
          errorCode + " - Operation can be continued without room capture",
        );
        this.spatialPanelSystem!.showPanel();
      }
    }
  }

  /** Checks if XR and immersive-ar session are supported. */
  async checkXRSupport(): Promise<void> {
    if (
      !navigator.xr ||
      !(await navigator.xr.isSessionSupported("immersive-ar"))
    ) {
      throw MessageHandler.raiseError(
        "XR no support: " + XRSessionErrorCode.XR_UNSUPPORTED,
      );
    }
  }

  /** Validates room capture by checking if user is in scanned room after plane detection delay. */
  private async validateRoomCapture() {
    await new Promise((resolve) =>
      setTimeout(resolve, ErrorUtil.ROOM_CAPTURE_PLANE_DETECTION_DELAY_MS),
    );
    const isInScannedRoom =
      this.planeProcessSystem!.isUserInScannedRoom() || false;
    MessageHandler.raiseLog(
      `User in scanned room after capture: ${isInScannedRoom}`,
    );

    if (!isInScannedRoom) {
      MessageHandler.raiseWarning(
        "Room capture completed but user not in scanned room - user likely cancelled",
      );
      MessageHandler.raiseWarning(XRSessionErrorCode.ROOM_CAPTURE_CANCELLED);
    } else {
      MessageHandler.raiseLog(
        "Room capture successful - user is in scanned room",
      );
    }
  }

  /** Polls for room data, initiates capture when planes found or max attempts reached. */
  private async checkRoomData(xrSession: XRSession): Promise<void> {
    const { pollAttempts, pollIntervalMs } = CONFIG.placement.roomDetection;

    for (let attempt = 0; attempt < pollAttempts; attempt++) {
      if (this.planeProcessSystem!.isUserInScannedRoom()) {
        MessageHandler.raiseLog(
          "User detected in scanned room. Skipping capture.",
        );
        this.spatialPanelSystem!.showPanel();
        return;
      }

      if (this.planeProcessSystem!.hasDetectedPlanes()) {
        MessageHandler.raiseLog(
          "Planes detected in a new room. Initiating capture.",
        );
        await this.waitForRoomCapture(xrSession);
        this.uiManager!.showInitialUI();
        return;
      }

      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, pollIntervalMs),
      );
    }

    MessageHandler.raiseLog(
      "No room data found after polling. Initiating capture.",
    );
    await this.waitForRoomCapture(xrSession);
    this.spatialPanelSystem!.showPanel();
  }

  /**
   * Calls `world.launchXR()` and reports a failed launch through `onFailure`.
   *
   * IWSDK catches `navigator.xr.requestSession()` rejections internally and
   * only logs them, so neither a rejection nor a visibility change reaches the
   * caller. The request promise is observed for its error (permission denied
   * vs. unsupported), and `world.sessionRequestPending` is watched so that a
   * request which resolves but is never adopted also fails instead of hanging.
   * Once adopted, a session that ends before the caller stops watching (that
   * is, before XR first becomes visible) is also reported as a failure.
   * @returns A function that stops watching.
   */
  private launchXRSession(
    productId: string,
    onFailure: (error: Error) => void,
  ): () => void {
    if (this.world.session) return () => {};

    let stopped = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let adoptedSession: XRSession | null = null;
    const handleEarlyEnd = () =>
      fail(new Error("The XR session ended before it became visible."));
    const fail = (cause: unknown) => {
      if (stopped) return;
      stopped = true;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      const errorCode = ErrorUtil.classifyXRError(error);
      onFailure(
        MessageHandler.raiseError(
          `XR launch failed: ${errorCode}; product: ${productId}; ${error.name}: ${error.message}`,
        ),
      );
    };
    const watchAdoption = () => {
      if (stopped) return;
      if (this.world.sessionRequestPending) {
        pollTimer = setTimeout(
          watchAdoption,
          SceneOpener.SESSION_REQUEST_POLL_MS,
        );
        return;
      }
      if (!this.world.session) {
        fail(new Error("The XR session could not be started."));
        return;
      }
      adoptedSession = this.world.session;
      adoptedSession.addEventListener("end", handleEarlyEnd, { once: true });
    };

    const request = this.captureSessionRequest(() => this.world.launchXR());
    if (request) {
      request.then(watchAdoption, fail);
    } else {
      watchAdoption();
    }

    return () => {
      stopped = true;
      if (pollTimer !== null) clearTimeout(pollTimer);
      adoptedSession?.removeEventListener("end", handleEarlyEnd);
    };
  }

  /**
   * Runs `launch` while recording the promise returned by
   * `navigator.xr.requestSession()`. IWSDK calls it synchronously inside
   * `launchXR()`, so the wrapper is in place only for that call and user
   * activation is preserved.
   */
  private captureSessionRequest(launch: () => void): Promise<XRSession> | null {
    const xr = navigator.xr;
    const captured: { request: Promise<XRSession> | null } = { request: null };
    if (!xr) {
      launch();
      return null;
    }

    const hadOwnProperty = Object.prototype.hasOwnProperty.call(
      xr,
      "requestSession",
    );
    const original = xr.requestSession;
    xr.requestSession = function (
      this: XRSystem,
      ...args: Parameters<XRSystem["requestSession"]>
    ) {
      captured.request = original.apply(this, args);
      return captured.request;
    };
    try {
      launch();
    } finally {
      if (hadOwnProperty) {
        xr.requestSession = original;
      } else {
        delete (xr as Partial<XRSystem>).requestSession;
      }
    }
    return captured.request;
  }
}
