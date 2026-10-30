/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { InternalHolder } from "./InternalHolder.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { SessionManager } from "../session/SessionManager.js";
import { WorldInitializer } from "./WorldInitializer.js";
import {
  DepthSensingSystem,
  XRAnchor,
  XRPlane,
  type WorldOptions,
} from "@iwsdk/core";
import { isRealQuestDevice } from "../../utils/DeviceDetection.js";
import { SystemsHolder } from "./SystemsHolder.js";
import { ArrowMoverSystemFloor } from "../../features/ArrowMover/ArrowMoverSystemFloor.js";
import { ArrowMoverSystemWall } from "../../features/ArrowMover/ArrowMoverSystemWall.js";
import { ClearRaycastConsumedSystem } from "../../features/ClearRaycastConsumed/ClearRaycastConsumedSystem.js";
import { CustomFollowerSystem } from "../../features/CustomFollower/CustomFollowerSystem.js";
import {
  CustomGrab,
  CustomGrabSystem,
} from "../../features/CustomGrab/CustomGrabSystem.js";
import { PlacementReticleSystem } from "../../features/PlacementReticle/PlacementReticleSystem.js";
import { PlaneProcessSystem } from "../../features/PlaneProcessSystem/PlaneProcessSystem.js";
import { TrackedPlaneSystem } from "../../features/PlaneProcessSystem/TrackedPlaneSystem.js";
import { RepositionProductPanel } from "../../ui/ProductPanel/RepositionProductPanel.js";
import { RepositionProductPanelSystem } from "../../ui/ProductPanel/RepositionProductPanelSystem.js";
import { SpatialPanelSystem } from "../../ui/ProductPanel/SpatialPanelSystem.js";
import { UIInteractionSystem } from "../../ui/UIInteraction/UIInteractionSystem.js";
import { XrInputManager } from "../input/xrInputManager.js";
import { DebugGizmos } from "../../utils/DebugGizmos.js";
import { SceneManager } from "../scene/SceneManager.js";
import { UIManager } from "../ui/UIManager.js";
import { CartManager } from "../session/CartManager.js";
import { SceneOpener } from "./SceneOpener.js";
import { ViewerProductManager } from "../product/ViewerProductManager.js";
import { VariantManager } from "../product/VariantManager.js";
import { TimedUILogger } from "../../utils/TimedUILogger.js";
import {
  BottomControlPanelState,
  BottomControlPanelSystem,
} from "../../ui/BottomControlPanel/BottomControlPanelSystem.js";
import {
  ConfirmationPanelState,
  ConfirmationPanelSystem,
} from "../../ui/ConfirmationPanel/ConfirmationPanelSystem.js";
import { TooltipState, TooltipSystem } from "../../ui/Tooltip/TooltipSystem.js";
import {
  VariantSelectorState,
  VariantSelectorSystem,
} from "../../ui/VariantSelector/VariantSelectorSystem.js";
import { DynamicScaleUISystem } from "../../features/DynamicScaleUI/DynamicScaleUISystem.js";
import { PanelDistanceScale } from "../../features/DynamicScaleUI/PanelDistanceScale.js";
import { PanelSize } from "../../features/DynamicScaleUI/PanelSize.js";
import { PanelUISizeSystem } from "../../features/DynamicScaleUI/PanelUISizeSystem.js";
import {
  InterpolationDestination,
  InterpolateSystem,
} from "../../features/Interpolate/InterpolateSystem.js";
import {
  NotifierPanelState,
  NotifierPanelSystem,
} from "../../ui/NotifierPanel/NotifierPanelSystem.js";
import {
  CartDataPanelState,
  CartDataSystem,
} from "../../ui/CartDataPanel/CartDataSystem.js";
import { UIRaycastBlockerSystem } from "../../ui/UIRaycastBlocker/UIRaycastBlockerSystem.js";

/**
 * Initializes the AR viewer: world, systems, managers, and UI.
 */
export class Initializer {
  public internalHolder!: InternalHolder;
  public systemsHolder!: SystemsHolder;

  private isInitialized: boolean = false;

  /**
   * Initializes the viewer with the given session manager.
   * @param sessionManager - The session manager instance.
   */
  public async initialize(
    sessionManager: SessionManager,
    projectOptions?: WorldOptions,
  ): Promise<void> {
    try {
      if (this.isInitialized) {
        MessageHandler.raiseWarning("Already initialized");
        return;
      }

      this.internalHolder = new InternalHolder();
      this.systemsHolder = new SystemsHolder();
      this.internalHolder.sceneOpener = new SceneOpener();
      this.internalHolder.sessionManager = sessionManager;
      this.internalHolder.sceneManager = new SceneManager();
      this.internalHolder.XrInputManager = new XrInputManager();
      this.internalHolder.uiManager = new UIManager();
      this.internalHolder.cartManager = new CartManager();
      this.internalHolder.variantManager = new VariantManager();
      this.internalHolder.viewerProductManager = new ViewerProductManager();

      const worldInitializer = new WorldInitializer();
      await worldInitializer.initialize(projectOptions);
      this.internalHolder.world = worldInitializer.world;
      this.internalHolder.sceneContainerElement =
        worldInitializer.sceneContainerElement;
      this.internalHolder.sceneContainerOwnedBySdk =
        worldInitializer.sceneContainerOwnedBySdk;
      this.internalHolder.loadingOverlayElement =
        worldInitializer.loadingOverlayElement;

      this.internalHolder.XrInputManager.world = this.internalHolder.world;

      await this.RegisterSystemsAndComponents();
      this.systemsHolder.init(this.internalHolder.world);

      this.internalHolder.uiManager.sceneManager =
        this.internalHolder.sceneManager;
      this.internalHolder.sceneManager.uiManager =
        this.internalHolder.uiManager;

      this.internalHolder.cartManager.uiManager = this.internalHolder.uiManager;
      this.internalHolder.cartManager.sessionManager =
        this.internalHolder.sessionManager;
      this.internalHolder.cartManager.viewerProductManager =
        this.internalHolder.viewerProductManager;

      await this.initializeSystemDependencies();
      this.internalHolder.sceneManager.arrowMoverSystemFloor =
        this.systemsHolder.arrowMoverSystemFloor;
      this.internalHolder.sceneManager.arrowMoverSystemWall =
        this.systemsHolder.arrowMoverSystemWall;

      await this.internalHolder.uiManager.init(this.internalHolder.world);
      await this.internalHolder.sceneManager.init(this.internalHolder.world);

      this.internalHolder.variantManager.viewerProductManager =
        this.internalHolder.viewerProductManager;
      this.internalHolder.variantManager.sceneManager =
        this.internalHolder.sceneManager;
      this.internalHolder.variantManager.uiManager =
        this.internalHolder.uiManager;

      const sceneOpener = this.internalHolder.sceneOpener;
      sceneOpener.world = this.internalHolder.world;
      sceneOpener.cartManager = this.internalHolder.cartManager;
      sceneOpener.planeProcessSystem = this.systemsHolder.planeProcessSystem;
      sceneOpener.spatialPanelSystem = this.systemsHolder.spatialPanelSystem;
      sceneOpener.uiManager = this.internalHolder.uiManager;
      sceneOpener.sceneManager = this.internalHolder.sceneManager;
      sceneOpener.viewerProductManager =
        this.internalHolder.viewerProductManager;
      sceneOpener.sessionManager = this.internalHolder.sessionManager;
      sceneOpener.placementReticleSystem =
        this.systemsHolder.placementReticleSystem;
      sceneOpener.variantManager = this.internalHolder.variantManager;
      sceneOpener.sceneContainerElement =
        this.internalHolder.sceneContainerElement;
      sceneOpener.loadingOverlayElement =
        this.internalHolder.loadingOverlayElement;

      DebugGizmos.init(this.internalHolder.world);
      TimedUILogger.getInstance().init(this.internalHolder.world);
      this.internalHolder.cartManager.initialize();
      MessageHandler.raiseLog("Initialization fully complete");

      this.isInitialized = true;
    } catch (error) {
      try {
        this.internalHolder?.dispose();
      } catch (cleanupError) {
        MessageHandler.raiseWarning(
          `Initialization cleanup failed: ${String(cleanupError)}`,
        );
      }
      this.isInitialized = false;
      MessageHandler.raiseError(`Initialization failed: ${String(error)}`);
      throw new Error("Initialization failed.", { cause: error });
    }
  }

  /**
   * Wires system dependencies (managers, inputs, etc.) after systems are registered.
   */
  private async initializeSystemDependencies(): Promise<void> {
    this.systemsHolder.spatialPanelSystem!.uiManager =
      this.internalHolder.uiManager;
    this.systemsHolder.spatialPanelSystem!.sceneManager =
      this.internalHolder.sceneManager;
    this.systemsHolder.spatialPanelSystem!.viewerProductManager =
      this.internalHolder.viewerProductManager;

    this.systemsHolder.customGrabSystem!.xrInputManager =
      this.internalHolder.XrInputManager;
    this.systemsHolder.customGrabSystem!.spatialPanelSystem =
      this.systemsHolder.spatialPanelSystem;

    this.systemsHolder.planeProcessSystem!.xrInputManager =
      this.internalHolder.XrInputManager;
    this.systemsHolder.planeProcessSystem!.sceneManager =
      this.internalHolder.sceneManager;

    this.systemsHolder.tooltipSystem!.uiManager = this.internalHolder.uiManager;

    this.systemsHolder.confirmationPanelSystem!.uiManager =
      this.internalHolder.uiManager;
    this.systemsHolder.confirmationPanelSystem!.sceneOpener =
      this.internalHolder.sceneOpener;

    this.systemsHolder.bottomControlPanelSystem!.sceneManager =
      this.internalHolder.sceneManager;
    this.systemsHolder.bottomControlPanelSystem!.uiManager =
      this.internalHolder.uiManager;
    this.systemsHolder.bottomControlPanelSystem!.cartManager =
      this.internalHolder.cartManager;
    this.systemsHolder.bottomControlPanelSystem!.variantManager =
      this.internalHolder.variantManager;

    this.systemsHolder.uiInteractionSystem!.uiManager =
      this.internalHolder.uiManager;

    this.systemsHolder.variantSelectorSystem!.variantManager =
      this.internalHolder.variantManager;
    this.systemsHolder.variantSelectorSystem!.uiManager =
      this.internalHolder.uiManager;

    this.systemsHolder.arrowMoverSystemFloor!.XrInputManager =
      this.internalHolder.XrInputManager;
    await this.systemsHolder.arrowMoverSystemFloor!.initializeArrows();
    this.systemsHolder.arrowMoverSystemWall!.XrInputManager =
      this.internalHolder.XrInputManager;
    await this.systemsHolder.arrowMoverSystemWall!.initializeArrows();

    this.systemsHolder.notifierPanelSystem!.uiManager =
      this.internalHolder.uiManager;

    this.systemsHolder.cartDataSystem!.uiManager =
      this.internalHolder.uiManager;
    this.systemsHolder.cartDataSystem!.cartManager =
      this.internalHolder.cartManager;
    this.systemsHolder.cartDataSystem!.sceneOpener =
      this.internalHolder.sceneOpener;

    this.systemsHolder.dynamicScaleUISystem!.uiManager =
      this.internalHolder.uiManager;
    this.systemsHolder.dynamicScaleUISystem!.sceneManager =
      this.internalHolder.sceneManager;
    if (import.meta.env.DEV) {
      const { AgentProductControlSystem } =
        await import("../../features/AgentProductControl/AgentProductControlSystem.js");
      const agentProductControlSystem = this.internalHolder.world.getSystem(
        AgentProductControlSystem,
      ) as InstanceType<typeof AgentProductControlSystem>;
      agentProductControlSystem.sceneManager = this.internalHolder.sceneManager;
    }
  }

  /**
   * Registers all ECS components and systems with the world.
   */
  private async RegisterSystemsAndComponents(): Promise<void> {
    if (isRealQuestDevice()) {
      this.internalHolder.world.registerSystem(DepthSensingSystem);
    }

    this.internalHolder.world
      .registerComponent(XRAnchor)
      .registerSystem(ClearRaycastConsumedSystem)
      .registerSystem(UIRaycastBlockerSystem)
      .registerSystem(SpatialPanelSystem)
      .registerComponent(TooltipState)
      .registerSystem(TooltipSystem)
      .registerComponent(ConfirmationPanelState)
      .registerSystem(ConfirmationPanelSystem)
      .registerComponent(BottomControlPanelState)
      .registerSystem(BottomControlPanelSystem)
      .registerComponent(VariantSelectorState)
      .registerSystem(VariantSelectorSystem)
      .registerComponent(NotifierPanelState)
      .registerSystem(NotifierPanelSystem)
      .registerComponent(CartDataPanelState)
      .registerSystem(CartDataSystem)
      .registerComponent(XRPlane)
      .registerSystem(TrackedPlaneSystem)
      .registerSystem(PlaneProcessSystem)
      .registerSystem(ArrowMoverSystemFloor)
      .registerSystem(ArrowMoverSystemWall)
      .registerComponent(CustomGrab)
      .registerSystem(CustomGrabSystem)
      .registerSystem(CustomFollowerSystem)
      .registerSystem(PlacementReticleSystem)
      .registerSystem(UIInteractionSystem)
      .registerComponent(PanelDistanceScale)
      .registerComponent(PanelSize)
      .registerSystem(PanelUISizeSystem)
      .registerComponent(RepositionProductPanel)
      .registerSystem(RepositionProductPanelSystem)
      .registerSystem(DynamicScaleUISystem)
      .registerComponent(InterpolationDestination)
      .registerSystem(InterpolateSystem);

    if (import.meta.env.DEV) {
      const { AgentProductControl, AgentProductControlSystem } =
        await import("../../features/AgentProductControl/AgentProductControlSystem.js");
      this.internalHolder.world
        .registerComponent(AgentProductControl)
        .registerSystem(AgentProductControlSystem);
    }
  }

  /**
   * Disposes the viewer and cleans up resources.
   */
  public dispose(): void {
    TimedUILogger.getInstance().destroy();
    DebugGizmos.dispose();
    if (this.internalHolder) {
      this.internalHolder.dispose();
    }
    this.isInitialized = false;
    MessageHandler.raiseLog("Disposed and cleaned up", true);
  }
}
