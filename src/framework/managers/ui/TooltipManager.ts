/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { Group as TweenGroup } from "@tweenjs/tween.js";
import { PanelAnimationManager } from "./PanelAnimationManager";
import { CONFIG } from "../../config/ViewerConfig";

/**
 * Manages tooltip behavior and animations for UI panels.
 * Coordinates event handling, state management, and calls PanelAnimationManager for actual animations.
 */
export class TooltipManager {
  private document: UIKitDocument;
  private tweenGroup: TweenGroup;
  private tooltipAnimators: Map<string, PanelAnimationManager> = new Map();
  private activeTooltipId: string | null = null;
  private activeTooltipHoverCount: number = 0;

  /**
   * Creates a tooltip manager.
   * @param document - The UIKit document containing tooltip elements
   * @param tweenGroup - Tween group for coordinated animations
   */
  constructor(document: UIKitDocument, tweenGroup?: TweenGroup) {
    this.document = document;
    this.tweenGroup = tweenGroup!;
  }

  /**
   * Get or create animator for a specific tooltip.
   * Each tooltip gets its own animator to allow concurrent animations.
   */
  private getAnimator(
    tooltipId: string,
    tooltip: UIKit.Container,
  ): PanelAnimationManager {
    if (this.tooltipAnimators.has(tooltipId)) {
      return this.tooltipAnimators.get(tooltipId)!;
    }

    const animator = new PanelAnimationManager(this.tweenGroup);
    animator.setUIKitElement(tooltip);
    this.tooltipAnimators.set(tooltipId, animator);

    return animator;
  }

  /**
   * Hide the currently active tooltip if it's different from the one specified.
   * @param excludeTooltipId - Tooltip ID to exclude from hiding
   */
  private hideActiveTooltip(excludeTooltipId?: string) {
    if (this.activeTooltipId && this.activeTooltipId !== excludeTooltipId) {
      const tooltip = this.document.getElementById(
        this.activeTooltipId,
      ) as UIKit.Container | null;
      if (tooltip) {
        this.animateOut(tooltip, this.activeTooltipId);
      }
    }
  }

  /**
   * Increment hover count for the active tooltip.
   */
  private incrementHoverCount() {
    this.activeTooltipHoverCount++;
  }

  /**
   * Decrement hover count for the active tooltip.
   * @returns The new hover count
   */
  private decrementHoverCount(): number {
    this.activeTooltipHoverCount = Math.max(
      0,
      this.activeTooltipHoverCount - 1,
    );
    return this.activeTooltipHoverCount;
  }

  /**
   * Animate tooltip fade in.
   */
  private animateIn(tooltip: UIKit.Container, tooltipId: string) {
    if (this.activeTooltipId === tooltipId) {
      this.incrementHoverCount();
      return;
    }

    this.hideActiveTooltip(tooltipId);

    tooltip.setProperties({ display: "flex" });
    this.activeTooltipId = tooltipId;
    this.activeTooltipHoverCount = 1;

    const animator = this.getAnimator(tooltipId, tooltip);
    animator.fadeIn({ duration: CONFIG.ui.tooltipTiming.fadeInDuration });
  }

  /**
   * Animate tooltip fade out.
   */
  private animateOut(tooltip: UIKit.Container, tooltipId: string) {
    if (this.activeTooltipId !== tooltipId) {
      return;
    }

    const hoverCount = this.decrementHoverCount();

    if (hoverCount > 0) {
      return;
    }

    this.activeTooltipId = null;
    const animator = this.getAnimator(tooltipId, tooltip);

    animator.fadeOut(
      { duration: CONFIG.ui.tooltipTiming.fadeOutDuration },
      () => {
        tooltip.setProperties({ display: "none" });
      },
    );
  }

  /**
   * Setup a simple tooltip for a button.
   * Handles pointerenter (show), pointerleave (hide), and click (hide) events.
   *
   * @param button - The button element to attach tooltip to
   * @param tooltipId - The ID of the tooltip element in the document
   */
  setupSimpleTooltip(button: UIKit.Container | null, tooltipId: string) {
    const tooltip = this.document.getElementById(
      tooltipId,
    ) as UIKit.Container | null;
    if (!button || !tooltip) return;

    button.addEventListener("pointerenter", () => {
      this.animateIn(tooltip, tooltipId);
    });

    button.addEventListener("pointerleave", () => {
      this.animateOut(tooltip, tooltipId);
    });

    button.addEventListener("click", () => {
      this.animateOut(tooltip, tooltipId);
    });
  }

  /**
   * Setup a multi-state tooltip for a button (e.g., on/off states).
   * Only one tooltip variant is shown at a time based on the current state.
   *
   * @param button - The button element to attach tooltip to
   * @param tooltipIds - Array of tooltip element IDs for each state
   * @param getCurrentState - Function that returns the current state index
   */
  setupMultiStateTooltip(
    button: UIKit.Container | null,
    tooltipIds: string[],
    getCurrentState: () => number,
  ) {
    if (!button) return;

    const tooltips = tooltipIds
      .map((id) => this.document.getElementById(id) as UIKit.Container | null)
      .filter((t) => t !== null) as UIKit.Container[];

    if (tooltips.length === 0) return;

    button.addEventListener("pointerenter", () => {
      const currentState = getCurrentState();
      if (currentState >= 0 && currentState < tooltips.length) {
        const currentTooltip = tooltips[currentState];
        const currentTooltipId = tooltipIds[currentState];

        // Hide all other tooltips
        tooltips.forEach((tooltip, index) => {
          if (index !== currentState) {
            this.animateOut(tooltip, tooltipIds[index]);
          }
        });

        // Show current tooltip
        this.animateIn(currentTooltip, currentTooltipId);
      }
    });

    button.addEventListener("pointerleave", () => {
      tooltips.forEach((tooltip, index) => {
        this.animateOut(tooltip, tooltipIds[index]);
      });
    });

    button.addEventListener("click", () => {
      tooltips.forEach((tooltip, index) => {
        this.animateOut(tooltip, tooltipIds[index]);
      });
    });
  }

  /**
   * Immediately hide a tooltip without animation.
   *
   * @param tooltipId - The ID of the tooltip element to hide
   */
  hideImmediate(tooltipId: string) {
    if (this.activeTooltipId === tooltipId) {
      this.activeTooltipId = null;
    }
    const tooltip = this.document.getElementById(
      tooltipId,
    ) as UIKit.Container | null;
    if (tooltip) {
      tooltip.setProperties({ display: "none", opacity: 0 });
    }
  }

  /**
   * Immediately hide multiple tooltips without animation.
   *
   * @param tooltipIds - Array of tooltip element IDs to hide
   */
  hideMultipleImmediate(tooltipIds: string[]) {
    tooltipIds.forEach((id) => this.hideImmediate(id));
  }

  /**
   * Cleanup all tooltip animators.
   * Should be called when the UI updater is disposed.
   */
  dispose() {
    this.tooltipAnimators.forEach((animator) => animator.dispose());
    this.tooltipAnimators.clear();
  }
}
