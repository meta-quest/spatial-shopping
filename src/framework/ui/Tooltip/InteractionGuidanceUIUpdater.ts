/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitDocument, UIKit } from "@iwsdk/core";
import { PanelConfig } from "./TooltipTypes.js";
import { Group as TweenGroup } from "@tweenjs/tween.js";
import { AnimatedStepContainer } from "./AnimatedStepContainer.js";

/** Delay before playing a tooltip video, giving UIKit a frame to attach it. */
const VIDEO_START_DELAY_MS = 300;

/**
 * Handles updating the tooltip UI elements
 * Follows Single Responsibility Principle - only responsible for UI updates
 */
export class InteractionGuidanceUIUpdater {
  private document: UIKitDocument;
  private animatedContainer: AnimatedStepContainer;
  private secondaryAnimatedContainer: AnimatedStepContainer;
  private currentContainer: AnimatedStepContainer | null = null;

  /** UI Element references */
  private illustrationWrapper: UIKit.Container | null = null;
  private tooltipTitle: UIKit.Text | null = null;
  private tooltipDescription: UIKit.Text | null = null;
  private continueButton: UIKit.Container | null = null;
  private closeButton: UIKit.Container | null = null;
  private stepIndicators: UIKit.Container[] = [];
  private stepperContainer: UIKit.Container | null = null;
  private checkboxContainer: UIKit.Container | null = null;
  private checkbox: UIKit.Container | null = null;
  private checkboxIndicator: UIKit.Container | null = null;
  private isCheckboxChecked: boolean = false;
  private videoStartTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param document - The UIKit document containing tooltip elements
   * @param tweenGroup - Shared tween group for animations
   */
  constructor(document: UIKitDocument, tweenGroup: TweenGroup) {
    this.document = document;
    this.animatedContainer = new AnimatedStepContainer(
      document,
      "illustration-container",
      "illustration-video",
      "illustration-image",
      tweenGroup,
    );
    this.secondaryAnimatedContainer = new AnimatedStepContainer(
      document,
      "secondary-container",
      "secondary-video",
      "secondary-image",
      tweenGroup,
    );
    this.cacheUIElements();
  }

  /**
   * Cache UI element references for efficient updates
   */
  private cacheUIElements(): void {
    this.illustrationWrapper = this.document.getElementById(
      "illustration-wrapper",
    ) as UIKit.Container | null;
    this.tooltipTitle = this.document.getElementById(
      "tooltip-title",
    ) as UIKit.Text;
    this.tooltipDescription = this.document.getElementById(
      "tooltip-description",
    ) as UIKit.Text;
    this.continueButton = this.document.getElementById(
      "continue-button",
    ) as UIKit.Container | null;
    this.closeButton = this.document.getElementById(
      "close-button",
    ) as UIKit.Container | null;
    this.stepperContainer = this.document.getElementById(
      "stepper-container",
    ) as UIKit.Container | null;
    this.checkboxContainer = this.document.getElementById(
      "checkbox-container",
    ) as UIKit.Container | null;
    this.checkbox = this.document.getElementById(
      "checkbox",
    ) as UIKit.Container | null;
    this.checkboxIndicator = this.document.getElementById(
      "checkbox-indicator",
    ) as UIKit.Container | null;

    for (let i = 1; i <= 4; i++) {
      const indicator = this.document.getElementById(
        `step-${i}`,
      ) as UIKit.Container | null;
      if (indicator) this.stepIndicators.push(indicator);
    }
  }

  /**
   * Unified method to display any panel configuration
   * @param config - Panel configuration
   * @param currentStep - Optional current step index (for stepper display)
   */
  public showPanel(config: PanelConfig, currentStep?: number): void {
    if (config.title) this.updateTitle(config.title);
    if (config.description) this.updateDescription(config.description);
    this.updateIllustration(config.imageSrc ?? "", currentStep);
    this.setStandardContentVisibility(true, config.title, config.imageSrc);

    if (this.stepperContainer) {
      this.stepperContainer.setProperties({
        display: config.showStepper ? "flex" : "none",
      });
    }
    if (config.showStepper && currentStep !== undefined)
      this.updateStepIndicators(currentStep);

    if (this.checkboxContainer) {
      this.checkboxContainer.setProperties({
        display: config.showCheckbox ? "flex" : "none",
      });
    }
    if (config.showCheckbox) this.resetCheckbox();

    if (this.continueButton) {
      this.continueButton.setProperties({
        display: config.showContinueButton ? "flex" : "none",
      });
    }
    if (this.closeButton) {
      const isSolidButton = !config.showContinueButton;
      this.closeButton.setProperties({
        display: "flex",
        backgroundColor: isSolidButton ? "#272727" : "transparent",
        color: isSolidButton ? "#ffffff" : "#272727",
      });
    }
  }

  /**
   * Set visibility of standard content (title, illustration, description)
   * @param visible - Whether to show standard content
   * @param hasTitle - Optional title presence (for single-section layout)
   * @param hasImage - Optional image presence (for single-section layout)
   */
  private setStandardContentVisibility(
    visible: boolean,
    hasTitle?: string,
    hasImage?: string,
  ): void {
    const display = visible ? "flex" : "none";
    if (this.tooltipTitle) {
      this.tooltipTitle.setProperties({
        display: visible && hasTitle ? "flex" : "none",
      });
    }
    if (this.illustrationWrapper) {
      this.illustrationWrapper.setProperties({
        display: visible && hasImage ? "flex" : "none",
      });
    }
    if (this.tooltipDescription) {
      this.tooltipDescription.setProperties({ display });
    }
  }

  /**
   * Get the next container to display based on current step
   * @param currentStep - Current step index
   * @returns The container to use for this step
   */
  private getNextContainer(currentStep: number): AnimatedStepContainer {
    if (currentStep === 0) {
      return this.animatedContainer;
    }
    return this.currentContainer === this.animatedContainer
      ? this.secondaryAnimatedContainer
      : this.animatedContainer;
  }

  /**
   * Updates the tooltip title
   * @param title - The title text
   */
  private updateTitle(title: string): void {
    if (this.tooltipTitle) this.tooltipTitle.setProperties({ text: title });
  }

  /**
   * Updates the tooltip description
   * @param description - The description text
   */
  private updateDescription(description: string): void {
    if (this.tooltipDescription)
      this.tooltipDescription.setProperties({ text: description });
  }

  /**
   * Updates the illustration image or video
   * @param imageSrc - Path to the image/video, empty string to hide
   * @param currentStep - Current step index (if on step 0, show immediately without animation)
   */
  private updateIllustration(imageSrc: string, currentStep?: number): void {
    if (imageSrc) {
      if (currentStep === 0) {
        this.currentContainer = this.animatedContainer;
        this.currentContainer.setContent(imageSrc);
        this.currentContainer.setOpacity(1);
        this.currentContainer.show();
        this.secondaryAnimatedContainer.hide();
      } else {
        const nextContainer = this.getNextContainer(currentStep!);
        const previousContainer =
          this.currentContainer || this.animatedContainer;

        nextContainer.setContent(imageSrc);
        nextContainer.setOpacity(0);
        nextContainer.show();

        previousContainer.fadeOut(500);
        nextContainer.fadeIn(500);

        this.currentContainer = nextContainer;
      }
    } else {
      if (this.currentContainer) {
        this.currentContainer.hide();
      }
    }
  }

  /**
   * Update step indicator styling
   * @param currentStep - The current step index
   */
  private updateStepIndicators(currentStep: number): void {
    this.stepIndicators.forEach((indicator, index) => {
      if (!indicator) return;
      indicator.setProperties({
        backgroundColor: index <= currentStep ? "#272727" : "#e0e0e0",
      });
    });
  }

  /** Get the continue button element for event binding */
  public getContinueButton(): UIKit.Container | null {
    return this.continueButton;
  }

  /** Get the close button element for event binding */
  public getCloseButton(): UIKit.Container | null {
    return this.closeButton;
  }

  /** Gets the document instance */
  public getDocument(): UIKitDocument {
    return this.document;
  }

  /** Get the checkbox element for event binding */
  public getCheckbox(): UIKit.Container | null {
    return this.checkbox;
  }

  /**
   * Toggle checkbox state and update visual appearance
   * @returns true if checked, false if unchecked
   */
  public toggleCheckbox(): boolean {
    this.isCheckboxChecked = !this.isCheckboxChecked;
    if (this.checkboxIndicator) {
      this.checkboxIndicator.setProperties({
        display: this.isCheckboxChecked ? "flex" : "none",
      });
    }
    return this.isCheckboxChecked;
  }

  /** Reset checkbox to unchecked state */
  public resetCheckbox(): void {
    this.isCheckboxChecked = false;
    if (this.checkboxIndicator)
      this.checkboxIndicator.setProperties({ display: "none" });
  }

  /**
   * Plays the tooltip video if the config contains a webm file.
   * @param config - Panel configuration
   */
  public playVideo(config: PanelConfig): void {
    const isWebm = config.imageSrc?.toLowerCase().endsWith(".webm");
    if (!isWebm) {
      this.pauseVideos();
      return;
    }

    this.cancelVideoStart();
    // UIKit attaches the video element after the next render.
    this.videoStartTimer = setTimeout(() => {
      this.videoStartTimer = null;
      const container = this.currentContainer;
      for (const other of [
        this.animatedContainer,
        this.secondaryAnimatedContainer,
      ]) {
        if (other !== container) other.pauseVideo();
      }
      container?.playVideo();
    }, VIDEO_START_DELAY_MS);
  }

  /** Cancels a pending video start and pauses both illustration videos. */
  public pauseVideos(): void {
    this.cancelVideoStart();
    this.animatedContainer.pauseVideo();
    this.secondaryAnimatedContainer.pauseVideo();
  }

  private cancelVideoStart(): void {
    if (this.videoStartTimer !== null) {
      clearTimeout(this.videoStartTimer);
      this.videoStartTimer = null;
    }
  }
}
