/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type Material, type Mesh, UIKit, UIKitDocument } from "@iwsdk/core";
import { Tween, Group as TweenGroup, Easing } from "@tweenjs/tween.js";
import { MessageHandler } from "../../utils/MessageHandler.js";
import { pauseUIKitVideo, playUIKitVideo } from "../../utils/UIUtils.js";

/**
 * Handles animation and content management for a UI container
 * Supports fade in/out animations and dynamic content switching
 */
export class AnimatedStepContainer {
  private container: UIKit.Container | null = null;
  private image: UIKit.Image | null = null;
  private video: UIKit.Video | null = null;
  private tweenGroup: TweenGroup;
  private currentTween: Tween<{ opacity: number }> | null = null;

  /**
   * @param document - The UIKit document
   * @param containerId - ID of the container element to animate
   * @param videoId - ID of the video element within the container
   * @param imageId - ID of the image element within the container
   * @param tweenGroup - Shared tween group for animations
   */
  constructor(
    document: UIKitDocument,
    containerId: string,
    videoId: string,
    imageId: string,
    tweenGroup: TweenGroup,
  ) {
    this.tweenGroup = tweenGroup;
    this.container = document.getElementById(
      containerId,
    ) as UIKit.Container | null;
    this.video = document.getElementById(videoId) as UIKit.Video | null;
    this.image = document.getElementById(imageId) as UIKit.Image | null;
  }

  /**
   * Get all materials in the container hierarchy
   */
  private getContainerMaterials(): Material[] {
    const materials: Material[] = [];
    if (this.container) {
      this.container.traverse((child) => {
        const material = (child as Partial<Mesh>).material;
        if (Array.isArray(material)) {
          materials.push(...material);
        } else if (material) {
          materials.push(material);
        }
      });
    }
    return materials;
  }

  /**
   * Set container opacity immediately without animation
   * @param opacity - Opacity value (0 to 1)
   */
  public setOpacity(opacity: number): void {
    const materials = this.getContainerMaterials();
    for (const mat of materials) {
      mat.transparent = true;
      mat.opacity = opacity;
    }
  }

  /**
   * Animate container opacity fade in (0 to 1)
   * @param duration - Animation duration in milliseconds
   */
  public fadeIn(duration: number): void {
    if (this.currentTween) {
      this.currentTween.stop().remove();
    }

    const materials = this.getContainerMaterials();
    if (materials.length === 0) {
      MessageHandler.raiseWarning(
        "AnimatedStepContainer: Cannot animate - no materials found",
      );
      return;
    }

    for (const mat of materials) {
      mat.transparent = true;
      mat.opacity = 0;
    }

    const startValue = { opacity: 0 };
    const endValue = { opacity: 1 };

    this.currentTween = new Tween(startValue)
      .to(endValue, duration)
      .easing(Easing.Cubic.Out)
      .group(this.tweenGroup)
      .onUpdate((obj) => {
        for (const mat of materials) mat.opacity = obj.opacity;
      })
      .onComplete(() => {
        this.currentTween = null;
      })
      .start();
  }

  /**
   * Animate container opacity fade out (1 to 0)
   * @param duration - Animation duration in milliseconds
   * @param onComplete - Callback when fade out completes
   */
  public fadeOut(duration: number, onComplete?: () => void): void {
    if (this.currentTween) {
      this.currentTween.stop().remove();
    }

    const materials = this.getContainerMaterials();
    if (materials.length === 0) {
      MessageHandler.raiseWarning(
        "AnimatedStepContainer: Cannot animate - no materials found",
      );
      onComplete?.();
      return;
    }

    const currentOpacity = materials[0]?.opacity ?? 1;

    for (const mat of materials) mat.transparent = true;

    const startValue = { opacity: currentOpacity };
    const endValue = { opacity: 0 };

    this.currentTween = new Tween(startValue)
      .to(endValue, duration)
      .easing(Easing.Cubic.In)
      .group(this.tweenGroup)
      .onUpdate((obj) => {
        for (const mat of materials) mat.opacity = obj.opacity;
      })
      .onComplete(() => {
        this.currentTween = null;
        onComplete?.();
      })
      .start();
  }

  /**
   * Show the container
   */
  public show(): void {
    if (this.container) {
      this.container.setProperties({ display: "flex" });
    }
  }

  /**
   * Hide the container
   */
  public hide(): void {
    if (this.container) {
      this.container.setProperties({ display: "none" });
    }
  }

  /**
   * Get the container element
   */
  public getContainer(): UIKit.Container | null {
    return this.container;
  }

  /**
   * Change the content (image or video) in the container
   * @param src - Path to the image/video
   */
  public setContent(src: string): void {
    const isWebm = src.toLowerCase().endsWith(".webm");

    if (isWebm) {
      if (this.video) {
        this.video.setProperties({ src: src, display: "flex" });
      }
      if (this.image) {
        this.image.setProperties({ display: "none" });
      }
    } else {
      if (this.image) {
        this.image.setProperties({ src: src, display: "flex" });
      }
      if (this.video) {
        this.video.setProperties({ display: "none" });
      }
    }
  }

  /** Plays the container's video, if it has one. */
  public playVideo(): void {
    playUIKitVideo(this.video);
  }

  /** Pauses the container's video, if it has one. */
  public pauseVideo(): void {
    pauseUIKitVideo(this.video);
  }

  /** Get the image element */
  public getImage(): UIKit.Image | null {
    return this.image;
  }
}
