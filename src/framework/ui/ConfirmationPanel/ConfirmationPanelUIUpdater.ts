/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { MessageHandler } from "../../utils/MessageHandler.js";

/**
 * Enum for different confirmation panel types
 */
export enum ConfirmationPanelType {
  RESTART = "restart",
  ADD_TO_CART = "add_to_cart",
  LEAVE = "leave",
  ERROR = "error",
}

/**
 * Configuration for each confirmation panel type
 */
export interface ConfirmationPanelConfig {
  title: string;
  description: string;
  primaryButtonText: string;
  secondaryButtonText?: string;
  showSecondaryButton: boolean;
}

/**
 * Configuration map for all confirmation panel types
 */
export const CONFIRMATION_PANEL_CONFIGS: Record<
  ConfirmationPanelType,
  ConfirmationPanelConfig
> = {
  [ConfirmationPanelType.RESTART]: {
    title: "Restart Experience",
    description: "Your current progress will be reset.",
    primaryButtonText: "Start over",
    secondaryButtonText: "Go back",
    showSecondaryButton: true,
  },
  [ConfirmationPanelType.ADD_TO_CART]: {
    title: "Added to Cart",
    description: "This item is now in your cart and ready for checkout.",
    primaryButtonText: "Go to Cart",
    secondaryButtonText: "Continue",
    showSecondaryButton: true,
  },
  [ConfirmationPanelType.LEAVE]: {
    title: "Leave Experience?",
    description: "Your current session will end.",
    primaryButtonText: "Exit",
    secondaryButtonText: "Continue",
    showSecondaryButton: true,
  },
  [ConfirmationPanelType.ERROR]: {
    title: "Error",
    description: "Something went wrong.",
    primaryButtonText: "Close",
    showSecondaryButton: false,
  },
};

/**
 * Handles updating the confirmation panel UI elements
 * Follows Single Responsibility Principle - only responsible for UI updates
 */
export class ConfirmationPanelUIUpdater {
  private document: UIKitDocument;

  /** UI Element references */
  private panelTitle: UIKit.Text | null = null;
  private panelDescription: UIKit.Text | null = null;
  private primaryButton: UIKit.Text | null = null;
  private secondaryButton: UIKit.Text | null = null;

  /** Initialize with document and cache UI elements */
  constructor(document: UIKitDocument) {
    this.document = document;
    this.cacheUIElements();
  }

  /** Set element properties or warn if missing */
  private setElementProperties(
    element: UIKit.Text | null,
    props: Record<string, unknown>,
    warnMsg: string,
  ): void {
    if (element) {
      element.setProperties(props);
    } else {
      MessageHandler.raiseWarning(warnMsg);
    }
  }

  /** Cache UI element references for efficient updates */
  private cacheUIElements(): void {
    this.panelTitle = this.document.getElementById(
      "confirmation-title",
    ) as UIKit.Text;
    this.panelDescription = this.document.getElementById(
      "confirmation-description",
    ) as UIKit.Text;
    this.primaryButton = this.document.getElementById(
      "primary-button",
    ) as UIKit.Text;
    this.secondaryButton = this.document.getElementById(
      "secondary-button",
    ) as UIKit.Text;
  }

  /**
   * Update the UI to display a specific confirmation panel type
   * @param panelType - The type of confirmation panel to display
   * @param options - Optional overrides (e.g. errorMessage for ERROR type)
   */
  public updatePanelUI(
    panelType: ConfirmationPanelType,
    options?: { errorMessage?: string },
  ): void {
    const config = CONFIRMATION_PANEL_CONFIGS[panelType];
    if (!config) {
      MessageHandler.raiseWarning(
        `ConfirmationPanelUIUpdater: Unknown panel type: ${panelType}`,
      );
      return;
    }

    const description =
      panelType === ConfirmationPanelType.ERROR && options?.errorMessage
        ? options.errorMessage
        : config.description;

    this.updateTitle(config.title);
    this.updateDescription(description);
    this.updatePrimaryButton(config.primaryButtonText);
    this.updateSecondaryButton(
      config.secondaryButtonText || "",
      config.showSecondaryButton,
    );
  }

  /** Updates the panel title */
  private updateTitle(title: string): void {
    this.setElementProperties(
      this.panelTitle,
      { text: title },
      "ConfirmationPanelUIUpdater: Panel title element not found",
    );
  }

  /** Updates the panel description */
  private updateDescription(description: string): void {
    this.setElementProperties(
      this.panelDescription,
      { text: description },
      "ConfirmationPanelUIUpdater: Panel description element not found",
    );
  }

  /** Updates the primary button text */
  private updatePrimaryButton(text: string): void {
    this.setElementProperties(
      this.primaryButton,
      { text },
      "ConfirmationPanelUIUpdater: Primary button element not found",
    );
  }

  /** Updates the secondary button text and visibility */
  private updateSecondaryButton(text: string, visible: boolean): void {
    this.setElementProperties(
      this.secondaryButton,
      { text, display: visible ? "flex" : "none" },
      "ConfirmationPanelUIUpdater: Secondary button element not found",
    );
  }

  /**
   * Get the primary button element for event binding
   */
  public getPrimaryButton(): UIKit.Text | null {
    return this.primaryButton;
  }

  /**
   * Get the secondary button element for event binding
   */
  public getSecondaryButton(): UIKit.Text | null {
    return this.secondaryButton;
  }

  /**
   * Gets the document instance
   */
  public getDocument(): UIKitDocument {
    return this.document;
  }
}
