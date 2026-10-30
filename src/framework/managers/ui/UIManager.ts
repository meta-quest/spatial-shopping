/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  World,
  Entity,
  PanelUI,
  RayInteractable,
  Transform,
  Vector3,
  Object3D,
  Quaternion,
} from "@iwsdk/core";
import { ManagedTweenGroup } from "../../utils/ManagedTweenGroup.js";
import { SpatialPanelSystem } from "../../ui/ProductPanel/SpatialPanelSystem.js";
import {
  TooltipSystem,
  TooltipState,
  TooltipPanel,
} from "../../ui/Tooltip/TooltipSystem.js";
import {
  ConfirmationPanelSystem,
  ConfirmationPanelState,
  ConfirmationPanelType,
} from "../../ui/ConfirmationPanel/ConfirmationPanelSystem.js";
import {
  BottomControlPanelSystem,
  BottomControlPanelState,
} from "../../ui/BottomControlPanel/BottomControlPanelSystem.js";
import {
  VariantSelectorSystem,
  VariantSelectorState,
} from "../../ui/VariantSelector/VariantSelectorSystem.js";
import {
  NotifierPanelSystem,
  NotifierPanelState,
} from "../../ui/NotifierPanel/NotifierPanelSystem.js";
import {
  CartDataSystem,
  CartDataPanelState,
} from "../../ui/CartDataPanel/CartDataSystem.js";
import {
  CustomFollower,
  CustomFollowBehavior,
} from "../../features/CustomFollower/CustomFollowerSystem.js";
import { PanelDistanceScale } from "../../features/DynamicScaleUI/PanelDistanceScale.js";
import { PanelSize } from "../../features/DynamicScaleUI/PanelSize.js";
import { RepositionProductPanel } from "../../ui/ProductPanel/RepositionProductPanel.js";
import {
  computePlacementRelativeToCamera,
  faceTarget,
} from "../../utils/MathUtils.js";
import { getPanelWorldBoundingBox } from "../../utils/UIUtils.js";
import { ProductVariation } from "../../types/ProductData.js";
import { SceneManager } from "../scene/SceneManager.js";
import { CONFIG } from "../../config/ViewerConfig.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { safeStorage } from "../../utils/SafeStorage.js";
import { UI_ASSET_URLS } from "../../../assets.js";
import { RENDER_ORDER } from "../../config/RenderOrder.js";

/** Dismiss keys for single panel tooltips */
const TOOLTIP_DISMISS_KEYS: Partial<Record<TooltipPanel, string>> = {
  [TooltipPanel.GRAB_AND_PLACE]: "tooltip_grabAndPlace_dismissed",
  [TooltipPanel.TWIST_OBJECT]: "tooltip_twistObject_dismissed",
  [TooltipPanel.EXPLORE_VARIANTS]: "tooltip_exploreVariants_dismissed",
};

/** Timer ID for control panels show */
const TIMER_CONTROL_PANELS_SHOW = "control-panels-show";
const TIMER_NOTIFIER_PANEL_SHOW = "notifier-panel-show";

/**
 * UIManager handles the orchestration and coordination of UI elements.
 * Manages panels visibility, completion states, panel entity creation, and timer-based interactions.
 */
export class UIManager {
  private static readonly PANEL_READY_TIMEOUT_MS = 10_000;

  public sceneManager!: SceneManager | null;

  private world: World | null = null;
  private spatialPanelSystem: SpatialPanelSystem | null = null;
  private tooltipSystem: TooltipSystem | null = null;
  private confirmationPanelSystem: ConfirmationPanelSystem | null = null;
  private bottomControlPanelSystem: BottomControlPanelSystem | null = null;
  private variantSelectorSystem: VariantSelectorSystem | null = null;
  private notifierPanelSystem: NotifierPanelSystem | null = null;
  private cartDataSystem: CartDataSystem | null = null;

  /** Panel entities managed by UIManager */
  private productPanelEntity: Entity | null = null;
  private tooltipPanelEntity: Entity | null = null;
  private confirmationPanelEntity: Entity | null = null;
  private bottomControlPanelEntity: Entity | null = null;
  private variantSelectorEntity: Entity | null = null;
  private notifierPanelEntity: Entity | null = null;
  private cartDataPanelEntity: Entity | null = null;

  /** Timer coordination state */
  private timers = new Map<string, number>();

  /** Hover state tracking */
  private isProductHovered: boolean = false;
  private isBottomPanelHovered: boolean = false;
  private isVariantPanelHovered: boolean = false;

  /** Visibility state tracking */
  private isVariantPanelVisible: boolean = false;
  private isConfirmationPanelVisible: boolean = false;
  private isTooltipVisible: boolean = false;
  private isProductInfoPanelVisible: boolean = false;
  private isCartDataPanelVisible: boolean = false;
  private forcePanelHide: boolean = false;

  /** Currently open panel tracking */
  private currentlyOpenPanel: string | null = null;

  private isFirstPlacement: boolean = true;
  private isProductPlaced: boolean = false;
  private panelsReady: boolean = false;
  private readonly viewerWorldPosition = new Vector3();

  /** Shared TweenGroup for all UI panel animations */
  public uiTweenGroup = new ManagedTweenGroup();

  constructor() {}

  /**
   * Initialize the manager, get references to UI systems, and create panel entities
   *
   * @param world - The World instance
   */
  async init(world: World | null): Promise<void> {
    this.world = world;

    this.spatialPanelSystem = this.world!.getSystem(
      SpatialPanelSystem,
    ) as SpatialPanelSystem | null;
    this.tooltipSystem = this.world!.getSystem(
      TooltipSystem,
    ) as TooltipSystem | null;
    this.confirmationPanelSystem = this.world!.getSystem(
      ConfirmationPanelSystem,
    ) as ConfirmationPanelSystem | null;
    this.bottomControlPanelSystem = this.world!.getSystem(
      BottomControlPanelSystem,
    ) as BottomControlPanelSystem | null;
    this.variantSelectorSystem = this.world!.getSystem(
      VariantSelectorSystem,
    ) as VariantSelectorSystem | null;
    this.notifierPanelSystem = this.world!.getSystem(
      NotifierPanelSystem,
    ) as NotifierPanelSystem | null;
    this.cartDataSystem = this.world!.getSystem(
      CartDataSystem,
    ) as CartDataSystem | null;

    this.createProductPanel();
    this.createTooltipPanel();
    this.createConfirmationPanel();
    this.createBottomControlPanel();
    this.createVariantSelectorPanel();
    this.createNotifierPanel();
    this.createCartDataPanel();

    await this.waitForPanelSystems();
    this.panelsReady = true;
    this.registerPanelVisibilityCallbacks();
  }

  /** Wait until every async UIKit document has qualified its panel query. */
  private async waitForPanelSystems(): Promise<void> {
    const systems = [
      this.spatialPanelSystem,
      this.tooltipSystem,
      this.confirmationPanelSystem,
      this.bottomControlPanelSystem,
      this.variantSelectorSystem,
      this.notifierPanelSystem,
      this.cartDataSystem,
    ] as Array<{ whenReady(): Promise<void> } | null>;

    if (systems.some((system) => system === null)) {
      throw new Error("One or more UIKit panel systems are not registered.");
    }

    let timeoutId: number | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error("Timed out while loading UIKit panel documents."));
      }, UIManager.PANEL_READY_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        Promise.all(systems.map((system) => system!.whenReady())),
        timeout,
      ]);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  /**
   * Register callbacks for panel visibility changes
   * Wires up the event-driven communication between panels
   */
  private registerPanelVisibilityCallbacks() {
    this.variantSelectorSystem!.setOnVisibilityChanged((isVisible: boolean) => {
      this.isVariantPanelVisible = isVisible;
      if (isVisible) {
        this.cancelTimer("control-panels-hide");
      }
    });

    this.confirmationPanelSystem!.setOnVisibilityChanged(
      (isVisible: boolean) => {
        this.isConfirmationPanelVisible = isVisible;
        if (isVisible) {
          this.cancelTimer("control-panels-hide");
        } else {
          if (this.canHideControlPanels()) {
            this.hideControlPanels();
          }
        }
      },
    );

    this.tooltipSystem!.setOnVisibilityChanged((isVisible: boolean) => {
      this.isTooltipVisible = isVisible;
      if (isVisible) {
        this.cancelTimer("control-panels-hide");
      } else {
        if (this.canHideControlPanels()) {
          this.hideControlPanels();
        }
      }
    });

    this.spatialPanelSystem!.setOnVisibilityChanged((isVisible: boolean) => {
      if (isVisible) {
        return;
      }
      if (this.productPanelEntity!.hasComponent(RepositionProductPanel)) {
        this.productPanelEntity!.removeComponent(RepositionProductPanel);
      }
    });

    this.cartDataSystem!.setOnVisibilityChanged((isVisible: boolean) => {
      this.isCartDataPanelVisible = isVisible;
    });
  }

  /**
   * Create the product panel entity
   */
  private createProductPanel() {
    this.productPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.productPanel,
      })
      .addComponent(PanelSize, {
        maxWidth: 0.3,
      })
      .addComponent(RayInteractable);

    this.productPanelEntity.object3D!.name = "xrProductPanel";
    this.productPanelEntity.object3D!.renderOrder = RENDER_ORDER.panel;
  }

  /**
   * Create the tooltip panel entity
   */
  private createTooltipPanel() {
    this.tooltipPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.tooltip,
      })
      .addComponent(PanelSize, {
        maxWidth: 0.384,
      })
      .addComponent(RayInteractable)
      .addComponent(TooltipState);

    this.tooltipPanelEntity.object3D!.renderOrder = RENDER_ORDER.overlayPanel;
  }

  /**
   * Create the confirmation panel entity
   */
  private createConfirmationPanel() {
    this.confirmationPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.confirmationPanel,
      })
      .addComponent(PanelSize, {
        maxWidth: 0.384,
      })
      .addComponent(RayInteractable)
      .addComponent(ConfirmationPanelState)
      .addComponent(CustomFollower, {
        target: this.world!.player.head,
        behavior: CustomFollowBehavior.FACE_TARGET_RESPECTING_VERTICAL_AXIS,
      });

    this.confirmationPanelEntity.object3D!.renderOrder =
      RENDER_ORDER.modalPanel;
  }

  /**
   * Parent product panel to the unified control rail.
   * RepositionProductPanelSystem runs every frame to keep the product panel
   * beside the independently scaled rail.
   */
  private setupProductPanelFollower() {
    const productPanel = this.productPanelEntity!.object3D!;

    this.productPanelEntity!.setValue(
      Transform,
      "parent",
      this.bottomControlPanelEntity,
    );
    productPanel.quaternion.copy(new Quaternion());

    if (this.productPanelEntity!.hasComponent(RepositionProductPanel)) {
      this.productPanelEntity!.removeComponent(RepositionProductPanel);
    }
    this.productPanelEntity!.addComponent(RepositionProductPanel, {
      controlBarEntity: this.bottomControlPanelEntity,
    });
  }

  /**
   * Create the bottom control panel entity
   */
  private createBottomControlPanel() {
    this.bottomControlPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.bottomControlPanel,
      })
      .addComponent(PanelSize, {
        maxWidth: 0.09,
        maxHeight: 0.5,
      })
      .addComponent(RayInteractable)
      .addComponent(BottomControlPanelState)
      .addComponent(PanelDistanceScale, CONFIG.ui.controlBarDistanceScale);

    this.bottomControlPanelEntity.object3D!.renderOrder = RENDER_ORDER.panel;
  }

  /**
   * Create the variant selector panel entity
   */
  private createVariantSelectorPanel() {
    this.variantSelectorEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.variantSelector,
      })
      .addComponent(PanelSize)
      .addComponent(RayInteractable)
      .addComponent(VariantSelectorState)
      .addComponent(PanelDistanceScale, CONFIG.ui.variantPanelDistanceScale);

    this.variantSelectorEntity.object3D!.renderOrder = RENDER_ORDER.panel;
  }

  /**
   * Create the notifier panel entity
   */
  private createNotifierPanel() {
    this.notifierPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.wrongSurfaceNotifier,
      })
      .addComponent(PanelSize, {
        maxWidth: 0.6,
      })
      .addComponent(RayInteractable)
      .addComponent(NotifierPanelState);

    this.notifierPanelEntity.object3D!.renderOrder = RENDER_ORDER.overlayPanel;
  }

  /**
   * Create the cart data panel entity
   */
  private createCartDataPanel() {
    this.cartDataPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.cartDataPanel,
      })
      .addComponent(PanelSize, {
        maxWidth: 0.5,
      })
      .addComponent(RayInteractable)
      .addComponent(CartDataPanelState);

    this.cartDataPanelEntity.object3D!.renderOrder = RENDER_ORDER.overlayPanel;
  }

  /** Timer Coordination Methods */

  /**
   * Schedule a timer with the given id, replacing any existing timer with same id
   * @param id - Timer identifier
   * @param callback - Function to call when timer fires
   * @param delayMs - Delay in milliseconds
   */
  private scheduleTimer(id: string, callback: () => void, delayMs: number) {
    this.cancelTimer(id);
    const timerId = window.setTimeout(() => {
      callback();
      this.timers.delete(id);
    }, delayMs);
    this.timers.set(id, timerId);
  }

  /**
   * Cancel a scheduled timer by id
   * @param id - Timer identifier
   */
  private cancelTimer(id: string) {
    const timerId = this.timers.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      this.timers.delete(id);
    }
  }

  /**
   * Cancel the control panels show timer
   */
  public cancelControlPanelsShowTimer() {
    this.cancelTimer(TIMER_CONTROL_PANELS_SHOW);
  }

  /**
   * Close the currently open panel if any
   */
  private closeCurrentlyOpenPanel() {
    if (!this.currentlyOpenPanel) {
      return;
    }

    MessageHandler.raiseLog(
      `UIManager: Closing currently open panel: ${this.currentlyOpenPanel}`,
    );

    switch (this.currentlyOpenPanel) {
      case "tooltip":
        this.hideTooltip();
        break;
      case "confirmation":
        this.hideConfirmationPanel();
        break;
      case "variant-selector":
        this.hideVariantSelector();
        break;
      case "notifier":
        this.hideNotifierPanel();
        break;
      case "cart-data":
        this.hideCartDataPanel();
        break;
      case "product-info":
        this.hideProductInfoPanel();
        break;
    }

    this.currentlyOpenPanel = null;
  }

  /**
   * Set the currently open panel and close any previously open panel
   * @param panelName - Name of the panel being opened
   */
  private setCurrentlyOpenPanel(panelName: string) {
    if (this.currentlyOpenPanel === panelName) {
      return;
    }

    if (this.currentlyOpenPanel) {
      this.closeCurrentlyOpenPanel();
    }

    this.currentlyOpenPanel = panelName;
    MessageHandler.raiseLog(
      `UIManager: Currently open panel set to: ${panelName}`,
    );
  }

  /** Layout Methods */

  /**
   * Show initial UI state: positions panels, shows product panel and tutorial tooltip
   *
   * @param distance - Distance from camera (default: 1m)
   */
  public showInitialUI(distance: number = 1) {
    this.isProductPlaced = false;

    const viewerWorldPosition = this.getViewerWorldPosition();

    if (this.isSinglePanelDismissed(TooltipPanel.GRAB_AND_PLACE)) {
      const productPanelPosition = computePlacementRelativeToCamera(
        this.world!.player.head,
        new Vector3(0, 0, -distance),
        true,
      );
      this.productPanelEntity!.object3D!.position.copy(productPanelPosition);
      faceTarget(this.productPanelEntity!.object3D!, viewerWorldPosition);

      this.showProductPanel();

      return;
    }

    this.setCurrentlyOpenPanel("tooltip");

    const tooltipPanelPosition = computePlacementRelativeToCamera(
      this.world!.player.head,
      new Vector3(0, 0, -distance),
      true,
    );
    this.tooltipPanelEntity!.object3D!.position.copy(tooltipPanelPosition);
    this.tooltipSystem!.showSinglePanel(TooltipPanel.GRAB_AND_PLACE);
    faceTarget(this.tooltipPanelEntity!.object3D!, viewerWorldPosition);

    const tooltipWorldQuat = new Quaternion();
    this.tooltipPanelEntity!.object3D!.getWorldQuaternion(tooltipWorldQuat);
    this.productPanelEntity!.object3D!.quaternion.copy(tooltipWorldQuat);

    const tooltipWorldPosition = new Vector3();
    this.tooltipPanelEntity!.object3D!.getWorldPosition(tooltipWorldPosition);

    const tooltipLeft = new Vector3(-0.4, 0, 0).applyQuaternion(
      tooltipWorldQuat,
    );
    this.productPanelEntity!.object3D!.position.copy(tooltipWorldPosition).add(
      tooltipLeft,
    );
  }

  /** Product Panel Methods */

  /**
   * Show the product panel with fade-in animation
   */
  public showProductPanel() {
    this.spatialPanelSystem!.showPanel();
  }

  /**
   * Hide the product panel with fade-out animation
   */
  public hideProductPanel() {
    this.spatialPanelSystem!.hide();
  }

  /**
   * Get the product panel entity
   */
  public getProductPanelEntity(): Entity | null {
    return this.productPanelEntity;
  }

  /**
   * Get the spatial panel system
   */
  public getSpatialPanelSystem(): SpatialPanelSystem | null {
    return this.spatialPanelSystem;
  }

  /** Tooltip Methods */

  /**
   * Compute panel position relative to product (when not placed) or camera (when placed).
   * @param productDirection - Direction from product (e.g. Vector3(4,0,0) for right, Vector3(-4,0,0) for left)
   * @param offsetConfig - Offset distance from config (e.g. leftPanelOffset, rightPanelOffset)
   * @param cameraRelativeOffset - Offset when product is placed (e.g. Vector3(0, 0, -1))
   */
  private ComputePosWithProductPanel(
    productDirection: Vector3,
    offsetConfig: number,
    cameraRelativeOffset: Vector3,
  ): Vector3 {
    if (!this.isProductPlaced) {
      const productQuat = new Quaternion();
      this.productPanelEntity!.object3D!.getWorldQuaternion(productQuat);
      const dir = productDirection.clone().applyQuaternion(productQuat);
      return this.productPanelEntity!.object3D!.position.clone().add(
        dir.multiplyScalar(offsetConfig),
      );
    }
    return computePlacementRelativeToCamera(
      this.world!.player.head,
      cameraRelativeOffset,
      true,
    );
  }

  private getViewerWorldPosition(): Vector3 {
    return this.world!.player.head.getWorldPosition(this.viewerWorldPosition);
  }

  /**
   * Show the tooltip in stepped tutorial mode
   */
  showTooltipSteppedTutorial() {
    this.setCurrentlyOpenPanel("tooltip");

    const rightOffset = CONFIG.ui.panelToProductOffsets.rightPanelOffset;
    const panelPosition = this.ComputePosWithProductPanel(
      new Vector3(4, 0, 0),
      rightOffset,
      new Vector3(0, 0, -1),
    );
    this.tooltipPanelEntity!.object3D!.position.copy(panelPosition);

    if (this.tooltipPanelEntity!.hasComponent(CustomFollower)) {
      this.tooltipPanelEntity!.removeComponent(CustomFollower);
    }
    this.tooltipPanelEntity!.addComponent(CustomFollower, {
      target: this.world!.player.head,
      behavior: CustomFollowBehavior.FACE_TARGET_RESPECTING_VERTICAL_AXIS,
    });

    this.isTooltipVisible = true;
    this.cancelTimer("control-panels-hide");

    this.tooltipSystem!.showSteppedTutorial();
  }

  /**
   * Show a single panel tooltip (non-stepped mode)
   * @param panelKey - Key of the single panel to show
   */
  showTooltipSinglePanel(panelKey: TooltipPanel) {
    if (this.isSinglePanelDismissed(panelKey)) {
      MessageHandler.raiseLog(
        `UIManager: User has dismissed ${panelKey} tooltip permanently`,
      );
      return;
    }

    this.setCurrentlyOpenPanel("tooltip");

    const panelPosition = computePlacementRelativeToCamera(
      this.world!.player.head,
      new Vector3(0, 0, -1),
      true,
    );
    this.tooltipPanelEntity!.object3D!.position.copy(panelPosition);
    faceTarget(
      this.tooltipPanelEntity!.object3D!,
      this.getViewerWorldPosition(),
    );
    this.tooltipSystem!.showSinglePanel(panelKey);
  }

  /**
   * Show "Grab and Place" tooltip
   */
  showGrabAndPlaceTooltip() {
    this.showTooltipSinglePanel(TooltipPanel.GRAB_AND_PLACE);
  }

  /**
   * Show "Twist Object" tooltip
   */
  showTwistObjectTooltip() {
    this.showTooltipSinglePanel(TooltipPanel.TWIST_OBJECT);
  }

  /**
   * Show "Explore Variants" tooltip
   */
  showExploreVariantsTooltip() {
    this.showTooltipSinglePanel(TooltipPanel.EXPLORE_VARIANTS);
  }

  /**
   * Hide the tooltip
   */
  hideTooltip() {
    if (this.currentlyOpenPanel === "tooltip") {
      this.currentlyOpenPanel = null;
    }
    this.isTooltipVisible = false;
    this.tooltipSystem!.hide();
  }

  /**
   * Save preference to not show a specific single panel tooltip again
   * @param panelKey - Key for specific single panel
   */
  saveTooltipDismissPreference(panelKey: TooltipPanel) {
    const dismissKey = TOOLTIP_DISMISS_KEYS[panelKey];
    if (!dismissKey) return;
    safeStorage.setItem(dismissKey, "true");
  }

  /**
   * Clear the dismiss preference for a specific single panel tooltip
   * @param panelKey - Key for specific single panel
   */
  clearTooltipDismissPreference(panelKey: TooltipPanel) {
    const dismissKey = TOOLTIP_DISMISS_KEYS[panelKey];
    if (!dismissKey) {
      MessageHandler.raiseLog(
        `UIManager: No dismiss preference for ${panelKey}`,
      );
      return;
    }
    safeStorage.removeItem(dismissKey);
  }

  /**
   * Reset all tooltip dismiss preferences
   * Called when restarting to ensure all tooltips can show again
   */
  resetPlacementTooltipDismissPreference() {
    this.clearTooltipDismissPreference(TooltipPanel.GRAB_AND_PLACE);
    this.clearTooltipDismissPreference(TooltipPanel.TWIST_OBJECT);
    this.clearTooltipDismissPreference(TooltipPanel.EXPLORE_VARIANTS);
  }

  /**
   * Check if a specific single panel has been dismissed
   * @param panelKey - Key of the single panel to check
   */
  isSinglePanelDismissed(panelKey: TooltipPanel): boolean {
    const dismissKey = TOOLTIP_DISMISS_KEYS[panelKey];
    if (!dismissKey) return false;
    return safeStorage.getItem(dismissKey) === "true";
  }

  /** Confirmation Panel Methods */

  /**
   * Show restart confirmation panel
   */
  showRestartConfirmation() {
    this.showConfirmationPanel(ConfirmationPanelType.RESTART);
  }

  /**
   * Show add to cart confirmation panel
   */
  showAddToCartConfirmation() {
    if (this.isCartDataPanelVisible) {
      return;
    }
    this.showConfirmationPanel(ConfirmationPanelType.ADD_TO_CART);
  }

  /**
   * Show leave confirmation panel
   */
  showLeaveConfirmation() {
    this.showConfirmationPanel(ConfirmationPanelType.LEAVE);
  }

  /**
   * Show a confirmation panel of the specified type
   */
  private showConfirmationPanel(panelType: ConfirmationPanelType) {
    this.setCurrentlyOpenPanel("confirmation");

    const leftOffset = CONFIG.ui.panelToProductOffsets.leftPanelOffset;
    const panelPosition = this.ComputePosWithProductPanel(
      new Vector3(-4, 0, 0),
      leftOffset,
      new Vector3(0, 0, -0.8),
    );
    this.confirmationPanelEntity!.object3D!.position.copy(panelPosition);
    faceTarget(
      this.confirmationPanelEntity!.object3D!,
      this.getViewerWorldPosition(),
    );
    this.confirmationPanelSystem!.showPanelWithType(panelType);
  }

  /**
   * Hide the confirmation panel
   */
  hideConfirmationPanel() {
    if (this.currentlyOpenPanel === "confirmation") {
      this.currentlyOpenPanel = null;
    }
    this.confirmationPanelSystem!.hidePanel();
  }

  /** Notifier Panel Methods */

  hideNotifierPanel() {
    if (this.currentlyOpenPanel === "notifier") {
      this.currentlyOpenPanel = null;
    }
    this.cancelTimer(TIMER_NOTIFIER_PANEL_SHOW);
    this.notifierPanelSystem!.hidePanel();
  }

  /**
   * Schedule showing the notifier panel after a debounce delay.
   */
  private scheduleNotifierPanelShow() {
    if (this.timers.has(TIMER_NOTIFIER_PANEL_SHOW)) return;

    this.scheduleTimer(
      TIMER_NOTIFIER_PANEL_SHOW,
      () => {
        this.setCurrentlyOpenPanel("notifier");
        this.notifierPanelSystem!.showPanel();
      },
      CONFIG.ui.panelTiming.wrongSurfaceNotifierShowDelay,
    );
  }

  /**
   * Show the confirmation panel with a connection error message and Close button
   */
  showErrorPanel(message: string) {
    this.setCurrentlyOpenPanel("confirmation");

    const panelPosition = computePlacementRelativeToCamera(
      this.world!.player.head,
      new Vector3(0, 0, -0.8),
      true,
    );
    this.confirmationPanelEntity!.object3D!.position.copy(panelPosition);

    this.confirmationPanelSystem!.showPanelWithType(
      ConfirmationPanelType.ERROR,
      { errorMessage: message },
    );
  }

  /** Cart Data Panel Methods */

  /**
   * Show the cart data panel in front of the camera
   */
  public showCartDataPanel() {
    this.setCurrentlyOpenPanel("cart-data");

    const panelPosition = computePlacementRelativeToCamera(
      this.world!.player.head,
      new Vector3(0, 0, -1),
      true,
    );
    this.cartDataPanelEntity!.object3D!.position.copy(panelPosition);
    faceTarget(
      this.cartDataPanelEntity!.object3D!,
      this.getViewerWorldPosition(),
    );

    this.cartDataSystem!.showPanel();
  }

  /**
   * Hide the cart data panel
   */
  public hideCartDataPanel() {
    if (this.currentlyOpenPanel === "cart-data") {
      this.currentlyOpenPanel = null;
    }
    this.cartDataSystem!.hidePanel();
  }

  /**
   * Get the cart data panel entity
   */
  public getCartDataPanelEntity(): Entity | null {
    return this.cartDataPanelEntity;
  }

  /**
   * Check if the cart data panel is currently visible
   */
  public isCartPanelVisible(): boolean {
    return this.cartDataSystem!.isPanelVisible();
  }

  /** Control Panels Methods */

  /**
   * Update the cart badge counter
   */
  updateCartBadge() {
    this.bottomControlPanelSystem!.updateCartDataButtonState();
  }

  /**
   * Show the bottom control panel
   */
  showBottomPanel() {
    this.bottomControlPanelSystem!.showPanel();
    this.bottomControlPanelSystem!.updateVariantsButtonState();
    this.bottomControlPanelSystem!.updateCartDataButtonState();
  }

  /**
   * Hide the bottom control panel
   */
  hideBottomPanel() {
    this.bottomControlPanelSystem!.hidePanel();
  }

  /**
   * Show the unified control bar.
   */
  showControlPanels() {
    if (this.forcePanelHide) {
      return;
    }

    this.showBottomPanel();

    if (this.bottomControlPanelSystem!.areArrowsVisible) {
      this.cancelControlPanelsShowTimer();
    }
  }

  /**
   * Set force panel hide state; when true, hides all control panels
   * @param force - Whether to force hide panels
   */
  public changeForcePanelHide(force: boolean) {
    if (force == this.forcePanelHide) {
      return;
    }

    this.forcePanelHide = force;
    if (force || this.isFirstPlacement) {
      this.hideControlPanels();
      this.hideVariantSelector();
    } else if (this.isProductPlaced) {
      this.showControlPanels();
    }
  }
  /**
   * Force hide all control panels immediately
   */
  public forceHideControlPanels() {
    this.forcePanelHide = true;
    this.bottomControlPanelSystem!.forceHidePanel();
    this.variantSelectorSystem!.forceHidePanel();
    this.notifierPanelSystem!.forceHidePanel();
  }

  /**
   * Hide the unified control bar.
   */
  hideControlPanels() {
    this.cancelControlPanelsShowTimer();
    this.hideBottomPanel();
  }

  /**
   * Reset UI state, timers, panel visibility, and reposition to initial state
   */
  resetUIState() {
    for (const id of Array.from(this.timers.keys())) {
      this.cancelTimer(id);
    }

    if (!this.panelsReady) return;

    this.isProductHovered = false;
    this.isBottomPanelHovered = false;
    this.isVariantPanelHovered = false;

    this.isVariantPanelVisible = false;
    this.isConfirmationPanelVisible = false;
    this.isProductInfoPanelVisible = false;
    this.isCartDataPanelVisible = false;
    this.forcePanelHide = false;
    this.isFirstPlacement = true;

    this.currentlyOpenPanel = null;

    this.hideTooltip();
    this.hideConfirmationPanel();
    this.hideControlPanels();
    this.hideVariantSelector();
    this.hideProductPanel();
    this.hideNotifierPanel();
    this.hideCartDataPanel();

    this.bottomControlPanelSystem!.resetProductInfoPanelState();
    this.bottomControlPanelSystem!.resetDimensionButtonState();
    this.bottomControlPanelSystem!.resetAdjustPositionButtonState();
    this.bottomControlPanelSystem!.resetOcclusionButtonState();
    this.spatialPanelSystem!.restartDrag();

    const arrowMoverSystem =
      this.sceneManager!.getArrowMoverSystemForPlacedProduct();
    if (arrowMoverSystem && arrowMoverSystem.areArrowsVisible) {
      arrowMoverSystem.handleVisibilityToggle();
    }

    this.resetProductPanelToInitialState();
    this.showInitialUI();
  }

  /**
   * Check if control panels can be hidden based on current state
   */
  private canHideControlPanels(): boolean {
    return (
      !this.isProductHovered &&
      !this.isBottomPanelHovered &&
      !this.isVariantPanelVisible &&
      !this.isConfirmationPanelVisible &&
      !this.isTooltipVisible &&
      !this.isProductInfoPanelVisible &&
      !this.bottomControlPanelSystem!.areArrowsVisible
    );
  }

  /**
   * Check if control panels can be shown based on current state
   */
  private canShowControlPanels(): boolean {
    return this.isProductHovered || this.isBottomPanelHovered;
  }

  /** Control Panels Event Handlers */

  /**
   * Called when a product is spawned/appears in the scene
   * Hides all panels and sets up panel followers
   */
  public onProductSpawned(productObject: Object3D) {
    this.hideProductPanel();
    this.hideTooltip();
    this.setupControlPanelFollowers(productObject);
  }

  /**
   * Called when product is placed (enters IDLE state)
   */
  onProductPlaced(productObject: Object3D, isSnapped: boolean) {
    this.isProductPlaced = true;

    if (this.isFirstPlacement) {
      this.spatialPanelSystem!.hideBottomControlBar();
      this.spatialPanelSystem!.showProductImage();
      this.productPanelEntity!.setValue(PanelSize, "maxWidth", 0.5);
      this.productPanelEntity!.removeComponent(RayInteractable);

      this.isFirstPlacement = false;
    }
    this.productPanelEntity!.addComponent(
      PanelDistanceScale,
      CONFIG.ui.productPanelDistanceScale,
    );
    this.showControlPanels();

    if (!isSnapped) {
      this.scheduleNotifierPanelShow();
    }
  }

  /**
   * Called when product is grabbed (exits IDLE state)
   */
  onProductGrabbed() {
    this.isProductPlaced = false;
    this.hideNotifierPanel();
    this.hideControlPanels();
    this.hideProductInfoPanel();
  }

  /**
   * Called when product placement starts (object starts being placed)
   */
  onProductPlacementStarted() {
    this.hideProductPanel();
    this.isProductInfoPanelVisible = false;
    this.bottomControlPanelSystem!.resetProductInfoPanelState();
  }

  /**
   * Called when product is hovered
   */
  onProductHovered(_productId: string) {
    this.isProductHovered = true;
    this.cancelTimer("control-panels-hide");
    this.scheduleControlPanelsShow();
  }

  /**
   * Called when product hover ends
   */
  onProductUnhovered() {
    this.isProductHovered = false;
    this.scheduleControlPanelsHide();
  }

  /**
   * Called when bottom control panel is hovered
   */
  onBottomPanelHovered() {
    this.isBottomPanelHovered = true;
    this.cancelTimer("control-panels-hide");
  }

  /**
   * Called when bottom control panel hover ends
   */
  onBottomPanelUnhovered() {
    this.isBottomPanelHovered = false;
    this.scheduleControlPanelsHide();
  }

  /**
   * Schedule the unified control bar to show after delay.
   */
  private scheduleControlPanelsShow() {
    if (this.bottomControlPanelSystem!.isPanelVisible()) {
      return;
    }

    if (this.canShowControlPanels()) {
      this.scheduleTimer(
        TIMER_CONTROL_PANELS_SHOW,
        () => {
          if (this.canShowControlPanels()) {
            this.showControlPanels();
          }
        },
        CONFIG.ui.panelTiming.controlPanelsShowDelay,
      );
    }
  }

  /**
   * Schedule the unified control bar to hide after delay.
   */
  private scheduleControlPanelsHide() {
    if (!this.bottomControlPanelSystem!.isPanelVisible()) {
      return;
    }

    if (this.canHideControlPanels()) {
      this.isFirstPlacement = false;
      this.scheduleTimer(
        "control-panels-hide",
        () => {
          if (this.canHideControlPanels()) {
            this.hideControlPanels();
          }
        },
        CONFIG.ui.panelTiming.controlPanelsHideDelay,
      );
    }
  }

  /**
   * Get the bottom control panel entity
   */
  getBottomControlPanelEntity(): Entity | null {
    return this.bottomControlPanelEntity;
  }

  /** Variant Selector Panel Methods */

  /**
   * Show the variant selector panel with variants
   * @param variants - Array of product variants
   * @param productId - ID of the product
   * @param selectedVariantId - ID of the currently selected variant
   */
  showVariantSelectorPanel(
    variants: ProductVariation[],
    productId: string,
    selectedVariantId: string,
  ) {
    this.setCurrentlyOpenPanel("variant-selector");

    this.variantSelectorSystem!.showPanelWithVariants(
      variants,
      productId,
      selectedVariantId,
    );

    this.scheduleVariantPanelHide();
  }

  /**
   * Hide the variant selector panel (internal, no timer cancel)
   */
  hideVariantSelectorPanel() {
    this.variantSelectorSystem!.hidePanel();
  }

  /**
   * Hide the variant selector panel
   */
  hideVariantSelector() {
    if (this.currentlyOpenPanel === "variant-selector") {
      this.currentlyOpenPanel = null;
    }
    this.cancelTimer("variant-panel-hide");
    this.hideVariantSelectorPanel();
  }

  /**
   * Check if variant selector panel is currently visible
   */
  isVariantSelectorVisible(): boolean {
    return this.variantSelectorSystem!.isPanelVisible();
  }

  /** Variant Selector Panel Event Handlers */

  /**
   * Called when variant selector panel is hovered
   */
  onVariantPanelHovered() {
    this.isVariantPanelHovered = true;
    this.cancelTimer("variant-panel-hide");
  }

  /**
   * Called when variant selector panel hover ends
   */
  onVariantPanelUnhovered() {
    this.isVariantPanelHovered = false;
    this.scheduleVariantPanelHide();
  }

  /**
   * Schedule variant panel to hide after delay
   * Also allows the unified control bar to hide when the variant panel closes.
   */
  scheduleVariantPanelHide() {
    if (!this.isVariantPanelHovered) {
      this.scheduleTimer(
        "variant-panel-hide",
        () => {
          if (!this.isVariantPanelHovered) {
            this.hideVariantSelectorPanel();

            if (this.canHideControlPanels()) {
              this.hideControlPanels();
            }
          }
        },
        CONFIG.ui.panelTiming.variantPanelHideDelay,
      );
    }
  }

  /**
   * Get the variant selector entity
   */
  getVariantSelectorEntity(): Entity | null {
    return this.variantSelectorEntity;
  }

  /**
   * Set up followers for control panels to track the product
   */
  public setupControlPanelFollowers(productObject: Object3D) {
    this.setupStableControlBarFollower(productObject);
    this.setupControlPanelFollower(
      this.variantSelectorEntity,
      productObject,
      "right",
    );
    this.setupControlPanelFollower(
      this.notifierPanelEntity,
      productObject,
      "top",
    );
  }

  /** Attach the rail to a rotation-stable, viewer-relative product-side anchor. */
  private setupStableControlBarFollower(productObject: Object3D) {
    const panelEntity = this.bottomControlPanelEntity;
    if (!panelEntity?.object3D) return;
    if (panelEntity.hasComponent(CustomFollower)) {
      panelEntity.removeComponent(CustomFollower);
    }
    panelEntity.addComponent(CustomFollower, {
      target: productObject,
      behavior: CustomFollowBehavior.FOLLOW_TARGET_STABLE_CONTROL_ANCHOR,
    });
  }

  /**
   * Set up follower for an auxiliary panel to track the product
   * @param panelEntity - Panel entity to attach follower to
   * @param productObject - Product object to follow
   * @param position - Edge position: 'left' | 'right' | 'bottom' | 'top'
   * @param scaleOffsetWithDistance - Whether the product gap contracts at close range
   */
  private setupControlPanelFollower(
    panelEntity: Entity | null,
    productObject: Object3D,
    position: "left" | "right" | "bottom" | "top",
    scaleOffsetWithDistance: boolean = true,
  ) {
    if (!panelEntity || !panelEntity.object3D) return;

    const panelBounds = getPanelWorldBoundingBox(panelEntity);
    let offsetPosition: [number, number, number] = [0, 0, 0];

    const {
      leftPanelOffset,
      rightPanelOffset,
      bottomPanelOffset,
      topPanelOffset,
    } = CONFIG.ui.panelToProductOffsets;

    if (panelBounds) {
      const panelSize = panelBounds.getSize(new Vector3());

      if (position === "left") {
        offsetPosition = [-(leftPanelOffset + panelSize.x / 2), 0, 0];
      } else if (position === "right") {
        offsetPosition = [rightPanelOffset + panelSize.x / 2, 0, 0];
      } else if (position === "top") {
        offsetPosition = [0, topPanelOffset + panelSize.y / 2, 0];
      } else {
        offsetPosition = [0, -(bottomPanelOffset + panelSize.y / 2), 0];
      }
    }

    if (panelEntity.hasComponent(CustomFollower)) {
      panelEntity.removeComponent(CustomFollower);
    }

    panelEntity.addComponent(CustomFollower, {
      target: productObject,
      behavior: CustomFollowBehavior.FOLLOW_TARGET_BOUNDING_PLANE_EDGE,
      boundingPlaneEdge: position,
      offsetPosition: offsetPosition,
      scaleOffsetWithDistance,
    });
  }

  /**
   * Show the product info panel centered above the unified control bar.
   */
  showProductInfoPanel() {
    this.setCurrentlyOpenPanel("product-info");

    this.setupProductPanelFollower();
    this.isProductInfoPanelVisible = true;
    this.cancelTimer("control-panels-hide");
    this.spatialPanelSystem!.showPanelMinimized();
  }

  /**
   * Hide the product info panel and reset the details button state.
   */
  hideProductInfoPanel() {
    if (this.currentlyOpenPanel === "product-info") {
      this.currentlyOpenPanel = null;
    }
    this.isProductInfoPanelVisible = false;

    if (this.productPanelEntity!.hasComponent(RepositionProductPanel)) {
      this.productPanelEntity!.removeComponent(RepositionProductPanel);
    }

    this.bottomControlPanelSystem!.resetProductInfoPanelState();
    this.spatialPanelSystem!.hide();
  }

  /**
   * Reset product panel to initial state
   * Reverses changes made during first placement
   */
  private resetProductPanelToInitialState() {
    this.spatialPanelSystem!.showBottomControlBar();

    this.productPanelEntity!.setValue(PanelSize, "maxWidth", 0.3);
    this.productPanelEntity!.object3D!.renderOrder = RENDER_ORDER.panel;

    if (!this.productPanelEntity!.hasComponent(RayInteractable)) {
      this.productPanelEntity!.addComponent(RayInteractable);
    }

    if (this.productPanelEntity!.hasComponent(PanelDistanceScale)) {
      this.productPanelEntity!.removeComponent(PanelDistanceScale);
    }

    if (this.productPanelEntity!.hasComponent(RepositionProductPanel)) {
      this.productPanelEntity!.removeComponent(RepositionProductPanel);
    }

    this.productPanelEntity!.setValue(
      Transform,
      "parent",
      this.world!.activeLevel.peek(),
    );
  }
}
