/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { Group as TweenGroup } from "@tweenjs/tween.js";
import { TooltipManager } from "../../managers/ui/TooltipManager";
import { MessageHandler } from "../../utils/MessageHandler.js";

const DISABLED_BUTTON_CLASS = "control-button--disabled";
const ACTIVE_BUTTON_CLASS = "control-button--active";
const DISABLED_MOVE_BUTTON_ICON_SRC = "imgs/move-button-disabled.png";
const ENABLED_MOVE_BUTTON_ICON_SRC = "imgs/move-button.png";
const SHOW_DIMENSIONS_BUTTON_ICON_SRC = "imgs/show-dimensions-button.png";
const OCCLUSION_BUTTON_ICON_SRC = "imgs/occlusion-button.png";

/** Element and visual state adapter for the unified product control bar. */
export class BottomControlPanelUIUpdater {
  private readonly tooltipManager: TooltipManager;
  private backButton: UIKit.Container | null = null;
  private maxMinButton: UIKit.Container | null = null;
  private maxMinIcon: UIKit.Image | null = null;
  private variantsButton: UIKit.Container | null = null;
  private adjustPositionButton: UIKit.Container | null = null;
  private showDimensionsButton: UIKit.Container | null = null;
  private occlusionButton: UIKit.Container | null = null;
  private addToCartButton: UIKit.Container | null = null;
  private cartDataButton: UIKit.Container | null = null;
  private cartBadge: UIKit.Container | null = null;
  private cartBadgeText: UIKit.Text | null = null;
  private adjustPositionButtonEnabled = false;
  private isDimensionsActive = false;
  private isOcclusionActive = false;
  private occlusionButtonEnabled = false;
  private isMaximized = false;

  constructor(
    private readonly document: UIKitDocument,
    tweenGroup?: TweenGroup,
  ) {
    this.tooltipManager = new TooltipManager(document, tweenGroup);
    this.initializeElements();
  }

  private initializeElements(): void {
    this.backButton = this.getContainer("back-button");
    this.maxMinButton = this.getContainer("max-min-button");
    this.maxMinIcon = this.document.getElementById(
      "max-min-icon",
    ) as UIKit.Image | null;
    this.variantsButton = this.getContainer("variants-button");
    this.adjustPositionButton = this.getContainer("adjust-position-button");
    this.showDimensionsButton = this.getContainer("show-dimensions-button");
    this.occlusionButton = this.getContainer("occlusion-button");
    this.addToCartButton = this.getContainer("add-to-cart-button");
    this.cartDataButton = this.getContainer("cart-data-button");
    this.cartBadge = this.getContainer("cart-badge");
    this.cartBadgeText = this.document.getElementById(
      "cart-badge-text",
    ) as UIKit.Text | null;
  }

  private getContainer(id: string): UIKit.Container | null {
    return this.document.getElementById(id) as UIKit.Container | null;
  }

  private applyButtonActiveVisuals(
    button: UIKit.Container,
    iconId: string,
    activeIconSrc: string,
    inactiveIconSrc: string,
    isActive: boolean,
  ): void {
    const icon = this.document.getElementById(iconId) as UIKit.Image | null;
    this.setButtonClass(button, ACTIVE_BUTTON_CLASS, isActive);
    icon?.setProperties({ src: isActive ? activeIconSrc : inactiveIconSrc });
  }

  /** Avoids UIKit warnings when adding or removing a class redundantly. */
  private setButtonClass(
    button: UIKit.Container,
    className: string,
    enabled: boolean,
  ): void {
    const hasClass = button.classList.contains(className);
    if (enabled && !hasClass) button.classList.add(className);
    else if (!enabled && hasClass) button.classList.remove(className);
  }

  setShowDimensionsActive(isActive: boolean): void {
    if (!this.showDimensionsButton) return;
    this.isDimensionsActive = isActive;
    this.applyButtonActiveVisuals(
      this.showDimensionsButton,
      "show-dimensions-icon",
      SHOW_DIMENSIONS_BUTTON_ICON_SRC,
      SHOW_DIMENSIONS_BUTTON_ICON_SRC,
      isActive,
    );
    this.tooltipManager.hideMultipleImmediate([
      "show-dimensions-tooltip-off",
      "show-dimensions-tooltip-on",
    ]);
  }

  setOcclusionActive(isActive: boolean): void {
    if (!this.occlusionButton || !this.occlusionButtonEnabled) return;
    this.isOcclusionActive = isActive;
    this.applyButtonActiveVisuals(
      this.occlusionButton,
      "occlusion-icon",
      OCCLUSION_BUTTON_ICON_SRC,
      OCCLUSION_BUTTON_ICON_SRC,
      isActive,
    );
    this.tooltipManager.hideMultipleImmediate([
      "occlusion-tooltip-off",
      "occlusion-tooltip-on",
    ]);
  }

  setAdjustPositionActive(isActive: boolean): void {
    if (!this.adjustPositionButton || !this.adjustPositionButtonEnabled) return;
    this.applyButtonActiveVisuals(
      this.adjustPositionButton,
      "adjust-position-icon",
      ENABLED_MOVE_BUTTON_ICON_SRC,
      ENABLED_MOVE_BUTTON_ICON_SRC,
      isActive,
    );
  }

  setAdjustPositionEnabled(isEnabled: boolean): void {
    if (!this.adjustPositionButton) return;
    const icon = this.document.getElementById(
      "adjust-position-icon",
    ) as UIKit.Image | null;
    this.adjustPositionButtonEnabled = isEnabled;
    if (isEnabled) {
      this.setButtonClass(
        this.adjustPositionButton,
        DISABLED_BUTTON_CLASS,
        false,
      );
      icon?.setProperties({ src: ENABLED_MOVE_BUTTON_ICON_SRC });
    } else {
      this.setButtonClass(
        this.adjustPositionButton,
        ACTIVE_BUTTON_CLASS,
        false,
      );
      this.setButtonClass(
        this.adjustPositionButton,
        DISABLED_BUTTON_CLASS,
        true,
      );
      icon?.setProperties({ src: DISABLED_MOVE_BUTTON_ICON_SRC });
    }
  }

  setOcclusionEnabled(isEnabled: boolean): void {
    if (!this.occlusionButton) return;
    this.occlusionButtonEnabled = isEnabled;
    this.occlusionButton.setProperties({
      display: isEnabled ? "flex" : "none",
      pointerEvents: isEnabled ? "auto" : "none",
    });
  }

  isOcclusionDisabled(): boolean {
    return !this.occlusionButtonEnabled;
  }

  isAdjustPositionDisabled(): boolean {
    return !this.adjustPositionButtonEnabled;
  }

  setMaxMinButtonState(isMaximized: boolean): void {
    if (!this.maxMinIcon) {
      MessageHandler.raiseWarning(
        "BottomControlPanelUIUpdater: max-min icon not found",
      );
      return;
    }
    this.isMaximized = isMaximized;
    this.maxMinIcon.setProperties({
      src: isMaximized ? "imgs/minimize-button.png" : "imgs/max-min-button.png",
    });
    this.tooltipManager.hideMultipleImmediate([
      "max-min-tooltip-left",
      "max-min-tooltip-right",
    ]);
  }

  setVariantsButtonEnabled(enabled: boolean): void {
    this.variantsButton?.setProperties({
      opacity: enabled ? 1 : 0.3,
      pointerEvents: enabled ? "auto" : "none",
    });
  }

  setCartDataButtonEnabled(enabled: boolean): void {
    this.cartDataButton?.setProperties({
      opacity: enabled ? 1 : 0.3,
      pointerEvents: enabled ? "auto" : "none",
    });
  }

  updateCartBadge(itemCount: number): void {
    const showBadge = itemCount > 0;
    this.cartBadge?.setProperties({ display: showBadge ? "flex" : "none" });
    if (showBadge) {
      this.cartBadgeText?.setProperties({ text: itemCount.toString() });
    }
  }

  getBackButton(): UIKit.Container | null {
    return this.backButton;
  }

  getMaxMinButton(): UIKit.Container | null {
    return this.maxMinButton;
  }

  getVariantsButton(): UIKit.Container | null {
    return this.variantsButton;
  }

  getAdjustPositionButton(): UIKit.Container | null {
    return this.adjustPositionButton;
  }

  getShowDimensionsButton(): UIKit.Container | null {
    return this.showDimensionsButton;
  }

  getOcclusionButton(): UIKit.Container | null {
    return this.occlusionButton;
  }

  getAddToCartButton(): UIKit.Container | null {
    return this.addToCartButton;
  }

  getCartDataButton(): UIKit.Container | null {
    return this.cartDataButton;
  }

  setupAllTooltips(): void {
    this.tooltipManager.setupSimpleTooltip(this.backButton, "back-tooltip");
    this.tooltipManager.setupMultiStateTooltip(
      this.maxMinButton,
      ["max-min-tooltip-left", "max-min-tooltip-right"],
      () => (this.isMaximized ? 1 : 0),
    );
    this.tooltipManager.setupSimpleTooltip(
      this.variantsButton,
      "variants-tooltip",
    );
    this.tooltipManager.setupSimpleTooltip(
      this.adjustPositionButton,
      "adjust-position-tooltip",
    );
    this.tooltipManager.setupMultiStateTooltip(
      this.showDimensionsButton,
      ["show-dimensions-tooltip-off", "show-dimensions-tooltip-on"],
      () => (this.isDimensionsActive ? 1 : 0),
    );
    if (this.occlusionButtonEnabled) {
      this.tooltipManager.setupMultiStateTooltip(
        this.occlusionButton,
        ["occlusion-tooltip-off", "occlusion-tooltip-on"],
        () => (this.isOcclusionActive ? 1 : 0),
      );
    }
    this.tooltipManager.setupSimpleTooltip(
      this.addToCartButton,
      "add-to-cart-tooltip",
    );
    this.tooltipManager.setupSimpleTooltip(
      this.cartDataButton,
      "cart-data-tooltip",
    );
  }
}
