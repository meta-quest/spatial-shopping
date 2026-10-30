/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Tween, Group as TweenGroup, Easing } from "@tweenjs/tween.js";
import { type Material, type Mesh, Object3D, UIKit } from "@iwsdk/core";
import { CONFIG } from "../../config/ViewerConfig";
import { MessageHandler } from "../../utils/MessageHandler.js";

/** Optional fade animation config */
type FadeConfig = {
  duration?: number;
  easing?: (t: number) => number;
  delay?: number;
};
/** Full fade config with required duration and easing */
type FadeConfigFull = {
  duration: number;
  easing: (t: number) => number;
  delay?: number;
};

type OpacityTween = Tween<{ opacity: number }>;

/**
 * Manages fade animations for UI panels using Tween.js + THREE.js materials
 * Supports both full panel entities (via object3D) and individual UIKit elements
 * Optimized with material caching to avoid expensive traverse operations every frame
 */
export class PanelAnimationManager {
  private currentTween: OpacityTween | null = null;
  private tweenGroup: TweenGroup;
  private object3D: Object3D | null = null;
  /** Cached materials for performance */
  private cachedMaterials: Material[] = [];
  /** Only check for new materials once */
  private hasRecachedAfterInit: boolean = false;
  /** UIKit element for direct property animation */
  private uikitElement: UIKit.Container | null = null;
  private readonly opacityProperties = { opacity: 0 };

  /** @param tweenGroup - Optional shared tween group for external updates */
  constructor(tweenGroup?: TweenGroup) {
    this.tweenGroup = tweenGroup || new TweenGroup();
  }

  /**
   * Set the Object3D for material animations
   */
  public setObject3D(object3D: Object3D) {
    this.object3D = object3D;
    this.uikitElement = null;
    this.hasRecachedAfterInit = false;
    this.cacheMaterials(true);
  }

  /**
   * Set UIKit element for direct property animations
   */
  public setUIKitElement(element: UIKit.Container) {
    this.uikitElement = element;
    this.object3D = null;
    this.cachedMaterials = [];
  }

  /**
   * Set render order recursively on all children
   */
  public setRenderOrder(renderOrder: number) {
    if (!this.object3D) return;

    this.object3D.renderOrder = renderOrder;
    this.object3D.traverse((child) => {
      child.renderOrder = renderOrder;
    });
  }

  /**
   * Cache all materials in the Object3D hierarchy
   * Only called when forced (initial setup) or when new materials detected
   */
  private cacheMaterials(force: boolean = false) {
    if (!force) return;

    this.cachedMaterials = [];
    if (!this.object3D) return;

    this.object3D.traverse((child) => {
      const material = (child as Partial<Mesh>).material;
      if (Array.isArray(material)) {
        this.cachedMaterials.push(...material);
      } else if (material) {
        this.cachedMaterials.push(material);
      }
    });
  }

  /**
   * Get the tween group for external updates (call in system's update loop)
   */
  public getTweenGroup(): TweenGroup {
    return this.tweenGroup;
  }

  /**
   * Fade in animation (0 to 1 opacity)
   */
  public fadeIn(
    config: FadeConfig = {},
    onComplete?: () => void,
  ): OpacityTween {
    const fullConfig = {
      duration: config.duration ?? CONFIG.ui.panelTiming.fadeInDuration,
      easing: config.easing ?? Easing.Cubic.Out,
      delay: config.delay,
    };

    if (!this.uikitElement) {
      this.checkAndRecacheMaterials();
      this.setOpacity(0);
    }

    return this.animateFade(1, fullConfig, onComplete);
  }

  /**
   * Fade out animation (1 to 0 opacity)
   */
  public fadeOut(
    config: FadeConfig = {},
    onComplete?: () => void,
  ): OpacityTween {
    const fullConfig = {
      duration: config.duration ?? CONFIG.ui.panelTiming.fadeOutDuration,
      easing: config.easing ?? Easing.Cubic.In,
      delay: config.delay,
    };

    if (!this.uikitElement) {
      this.checkAndRecacheMaterials();
    }

    return this.animateFade(0, fullConfig, onComplete);
  }

  /**
   * Re-cache materials on first animation to catch UIKit's dynamically added panel background
   * After first re-cache, uses cached materials for all subsequent animations
   */
  private checkAndRecacheMaterials() {
    if (!this.object3D || this.cachedMaterials.length === 0) {
      this.cacheMaterials(true);
      return;
    }

    if (!this.hasRecachedAfterInit) {
      this.cacheMaterials(true);
      this.hasRecachedAfterInit = true;
    }
  }

  /**
   * Animate fade to a target opacity value
   * Uses THREE.js materials if object3D available, otherwise UIKit element properties
   */
  private animateFade(
    targetOpacity: number,
    config: FadeConfigFull,
    onComplete?: () => void,
  ): OpacityTween {
    this.cancelAnimation();

    if (this.uikitElement) {
      return this.animateFadeUIKit(targetOpacity, config, onComplete);
    }

    if (!this.object3D || this.cachedMaterials.length === 0) {
      MessageHandler.raiseWarning(
        "PanelAnimationManager: Cannot animate - no object3D or UIKit element set",
      );
      return new Tween({ opacity: targetOpacity });
    }

    const currentOpacity =
      this.cachedMaterials[0]?.opacity !== undefined
        ? this.cachedMaterials[0].opacity
        : 1;
    const startValue = { opacity: currentOpacity };
    const endValue = { opacity: targetOpacity };

    const tween = new Tween(startValue)
      .to(endValue, config.duration)
      .easing(config.easing || Easing.Cubic.Out)
      .group(this.tweenGroup)
      .onStart(() => {
        if (currentOpacity === 0 && targetOpacity > 0) {
          for (const mat of this.cachedMaterials) {
            mat.transparent = true;
            mat.opacity = 0;
          }
        }
      })
      .onUpdate((obj) => {
        for (const mat of this.cachedMaterials) {
          mat.opacity = obj.opacity;
        }
      })
      .onComplete(() => {
        this.currentTween = null;
        onComplete?.();
      });

    if (config.delay) {
      tween.delay(config.delay);
    }

    this.currentTween = tween;
    tween.start();

    return tween;
  }

  /**
   * Animate fade for UIKit elements using setProperties
   */
  private animateFadeUIKit(
    targetOpacity: number,
    config: FadeConfigFull,
    onComplete?: () => void,
  ): OpacityTween {
    const startValue = { opacity: targetOpacity === 1 ? 0 : 1 };
    const endValue = { opacity: targetOpacity };

    const tween = new Tween(startValue)
      .to(endValue, config.duration)
      .easing(config.easing || Easing.Cubic.Out)
      .group(this.tweenGroup)
      .onUpdate((obj) => {
        this.opacityProperties.opacity = obj.opacity;
        this.uikitElement!.setProperties(this.opacityProperties);
      })
      .onComplete(() => {
        this.currentTween = null;
        onComplete?.();
      });

    if (config.delay) {
      tween.delay(config.delay);
    }

    this.currentTween = tween;
    tween.start();

    return tween;
  }

  /**
   * Cancel ongoing animation
   */
  public cancelAnimation() {
    if (this.currentTween) {
      this.currentTween.stop().remove();
      this.currentTween = null;
    }
  }

  /**
   * Set opacity immediately without animation
   */
  public setOpacity(opacity: number) {
    this.cancelAnimation();

    if (this.cachedMaterials.length === 0) {
      MessageHandler.raiseWarning(
        "PanelAnimationManager: Cannot set opacity - no materials cached",
      );
      return;
    }

    for (const mat of this.cachedMaterials) {
      mat.transparent = true;
      mat.opacity = opacity;
    }
  }

  /**
   * Get current opacity value
   */
  public getOpacity(): number {
    if (this.cachedMaterials.length === 0) return 0;

    const firstMat = this.cachedMaterials[0];
    return firstMat?.opacity !== undefined ? firstMat.opacity : 1;
  }

  /**
   * Check if animation is currently running
   */
  public isRunning(): boolean {
    return this.currentTween !== null;
  }

  /**
   * Cleanup
   */
  public dispose() {
    this.cancelAnimation();
    this.object3D = null;
    this.cachedMaterials = [];
  }
}
