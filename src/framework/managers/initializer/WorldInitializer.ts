/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  CacheManager,
  DirectionalLight,
  HemisphereLight,
  IBLTexture,
  SessionMode,
  World,
  type WorldOptions,
} from "@iwsdk/core";
import assets from "../../../assets.js";
import { CONFIG } from "../../config/ViewerConfig";
import { isRealQuestDevice } from "../../utils/DeviceDetection";

const SCENE_CONTAINER_HIDDEN_STYLE =
  "display:none;position:fixed;top:0;left:0;width:100%;height:100%;";
const LOADING_OVERLAY_STYLE =
  "display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:24px 40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:9999;";

/**
 * Tears down an IWSDK world: stops the render loop, unregisters systems in
 * reverse order, releases input and renderer resources, and clears asset caches.
 */
export function disposeWorld(world: World): void {
  world.renderer.setAnimationLoop(null);
  for (const system of [...world.getSystems()].reverse()) {
    world.unregisterSystem(system.constructor as never);
  }
  world.input.destroy();
  world.renderer.dispose();
  world.renderer.forceContextLoss();
  world.renderer.domElement.remove();
  CacheManager.clear();
  (AssetManager as unknown as { world?: World }).world = undefined;

  const runtimeWindow = window as Window & { FRAMEWORK_MCP_RUNTIME?: unknown };
  if (runtimeWindow.FRAMEWORK_MCP_RUNTIME === world.mcpRuntime) {
    delete runtimeWindow.FRAMEWORK_MCP_RUNTIME;
  }
}

export class WorldInitializer {
  public world!: World;
  /** Set when the viewer creates the container; used so we can remove it on dispose. */
  public sceneContainerElement!: HTMLDivElement;
  /** True when the viewer created the container (so dispose should remove it). */
  public sceneContainerOwnedBySdk: boolean = false;
  /** Loading overlay shown during open(); only set when the viewer created the container. */
  public loadingOverlayElement: HTMLDivElement | null = null;

  /** Initializes the world, scene container, assets, lighting, and XR options. */
  public async initialize(projectOptions?: WorldOptions): Promise<void> {
    let container = document.getElementById(
      "scene-container",
    ) as HTMLDivElement | null;
    if (!container) {
      container = document.createElement("div");
      container.id = "scene-container";
      container.setAttribute("style", SCENE_CONTAINER_HIDDEN_STYLE);
      document.body.appendChild(container);
      this.sceneContainerElement = container;
      this.sceneContainerOwnedBySdk = true;
      const loading = document.createElement("div");
      loading.id = "sdk-loading-experience";
      loading.textContent = "Loading experience...";
      loading.setAttribute("style", LOADING_OVERLAY_STYLE);
      document.body.appendChild(loading);
      this.loadingOverlayElement = loading;
    } else {
      this.sceneContainerElement = container;
      container.setAttribute("style", SCENE_CONTAINER_HIDDEN_STYLE);
    }

    try {
      const worldOptions = projectOptions
        ? this.withRuntimeDepthSensing(projectOptions)
        : this.getDefaultWorldOptions();
      this.world = await World.create(this.sceneContainerElement, worldOptions);

      this.world.renderer.localClippingEnabled = true;

      const levelRoot = this.world.activeLevel.value;
      levelRoot.addComponent(IBLTexture, {
        src: CONFIG.lighting.ibl.resource,
        intensity: CONFIG.lighting.ibl.intensity,
      });

      this.createLights();
    } catch (error) {
      this.cleanupFailedInitialization();
      throw error;
    }
  }

  private cleanupFailedInitialization(): void {
    if (this.world) disposeWorld(this.world);

    this.loadingOverlayElement?.remove();
    this.loadingOverlayElement = null;
    if (this.sceneContainerOwnedBySdk) {
      this.sceneContainerElement?.remove();
      this.sceneContainerOwnedBySdk = false;
    }
  }

  /** Creates hemisphere and directional lights for the scene. */
  private createLights(): void {
    const directionalIntensity = CONFIG.lighting.directional.intensity;

    const hemiLight = new HemisphereLight(
      0xffffff,
      0x444444,
      0.385 * directionalIntensity,
    );
    hemiLight.name = "HemiLight";
    this.world.createTransformEntity(hemiLight);

    const keyLight = new DirectionalLight(
      0xffffff,
      1.15 * directionalIntensity,
    );
    keyLight.position.set(2, 4, 3);
    keyLight.name = "KeyLight";
    this.world.createTransformEntity(keyLight);
  }

  private getDefaultWorldOptions(): WorldOptions {
    return {
      assets,
      xr: this.getXrOptions(),
      input: { canvasPointerEvents: true },
      render: {
        near: 0.001,
        far: 200,
        camera: { position: [0, 1, 0.5] },
      },
      features: this.getFeatures(),
    };
  }

  private getDepthSensingConfig() {
    return isRealQuestDevice()
      ? ({
          usage: "gpu-optimized",
          format: "float32",
          required: false,
        } as const)
      : false;
  }

  private getXrOptions() {
    return {
      sessionMode: SessionMode.ImmersiveAR,
      offer: "none" as const,
      features: {
        handTracking: true,
        anchors: { required: true },
        hitTest: false,
        planeDetection: { required: true },
        meshDetection: false,
        layers: false,
        depthSensing: this.getDepthSensingConfig(),
      },
    };
  }

  /** Adds the device-only depth request that cannot be represented statically. */
  private withRuntimeDepthSensing(options: WorldOptions): WorldOptions {
    if (!options.xr) return options;

    return {
      ...options,
      xr: {
        ...options.xr,
        features: {
          ...options.xr.features,
          depthSensing: this.getDepthSensingConfig(),
        },
      },
    };
  }

  private getFeatures() {
    return {
      locomotion: false,
      grabbing: false,
      physics: false,
      sceneUnderstanding: true,
      environmentRaycast: false,
      spatialUI: { kit: "horizon" as const },
    };
  }
}
