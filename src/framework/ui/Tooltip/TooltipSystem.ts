/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createComponent,
  Types,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Entity,
} from "@iwsdk/core";
import { createBasePanelSystem } from "../BasePanelSystem";
import {
  TooltipPanel,
  TUTORIAL_SEQUENCE,
  SINGLE_PANEL_CONFIGS,
} from "./TooltipTypes";
import { InteractionGuidanceUIUpdater } from "./InteractionGuidanceUIUpdater";
import { UI_ASSET_URLS } from "../../../assets.js";
import { RENDER_ORDER } from "../../config/RenderOrder.js";

/**
 * Component that holds the state for the tooltip panel.
 */
export const TooltipState = createComponent("TooltipState", {
  currentStep: { type: Types.Int8, default: 0 },
  isVisible: { type: Types.Boolean, default: false },
});

/**
 * Query definitions for the tooltip panel.
 */
const TooltipQueries = {
  tooltipPanel: {
    required: [PanelUI, PanelDocument, TooltipState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.tooltip)],
  },
};

export class TooltipSystem extends createBasePanelSystem(
  TooltipQueries,
)<InteractionGuidanceUIUpdater> {
  private currentPanelKey: TooltipPanel | null = null;

  /**
   * Subscribes to tooltip panel qualification and initializes panel entity.
   */
  override init(): void {
    this.cleanupFuncs.push(
      this.queries.tooltipPanel.subscribe("qualify", (entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) return;

        this.initializePanelEntity(entity, document, {
          renderOrder: RENDER_ORDER.overlayPanel,
        });

        const currentStep = TooltipState.data.currentStep[entity.index];
        const config = TUTORIAL_SEQUENCE[currentStep];
        if (config) {
          this.uiUpdater!.showPanel(config, currentStep);
        }
      }),
    );
  }

  /**
   * Creates the tooltip UI updater for the given document.
   */
  createUIUpdater(document: UIKitDocument): InteractionGuidanceUIUpdater {
    return new InteractionGuidanceUIUpdater(
      document,
      this.uiManager!.uiTweenGroup,
    );
  }

  /**
   * Returns the tooltip panel state data.
   */
  override getPanelState() {
    return TooltipState.data;
  }

  /**
   * Binds click handlers to continue, close, and checkbox buttons.
   */
  setupButtonListeners(entity: Entity) {
    const bindClick = (btn: UIKit.Container | null, handler: () => void) =>
      btn?.addEventListener("click", handler);
    bindClick(this.uiUpdater!.getContinueButton(), () =>
      this.handleContinue(entity),
    );
    bindClick(this.uiUpdater!.getCloseButton(), () =>
      this.uiManager!.hideTooltip(),
    );
    bindClick(this.uiUpdater!.getCheckbox(), () => this.handleCheckboxToggle());
  }

  /**
   * Advances to next tutorial step or hides tooltip when complete.
   */
  private handleContinue(_entity: Entity) {
    const state = TooltipState.data;
    const idx = this.panelEntity!.index;
    const currentStep = state.currentStep[idx];

    if (currentStep < TUTORIAL_SEQUENCE.length - 1) {
      const nextStep = currentStep + 1;
      state.currentStep[idx] = nextStep;

      const config = TUTORIAL_SEQUENCE[nextStep];
      if (config) {
        this.uiUpdater!.showPanel(config, nextStep);
        this.uiUpdater!.playVideo(config);
      }
    } else {
      this.uiManager!.hideTooltip();
    }
  }

  /**
   * Toggles checkbox state and persists dismiss preference.
   */
  private handleCheckboxToggle() {
    if (!this.currentPanelKey) {
      return;
    }

    const isChecked = this.uiUpdater!.toggleCheckbox();
    if (isChecked) {
      this.uiManager!.saveTooltipDismissPreference(this.currentPanelKey);
    } else {
      this.uiManager!.clearTooltipDismissPreference(this.currentPanelKey);
    }
  }

  /**
   * Shows the stepped tutorial from the first step.
   */
  public showSteppedTutorial() {
    const state = TooltipState.data;
    state.currentStep[this.panelEntity!.index] = 0;
    this.currentPanelKey = null;

    const config = TUTORIAL_SEQUENCE[0];
    if (config) {
      this.uiUpdater!.showPanel(config, 0);
    }

    super.showPanel();
    if (config) {
      this.uiUpdater!.playVideo(config);
    }
  }

  /**
   * Shows a single tooltip panel by key.
   */
  public showSinglePanel(panelKey: TooltipPanel) {
    const config = SINGLE_PANEL_CONFIGS[panelKey];
    this.currentPanelKey = panelKey;

    this.uiUpdater!.showPanel(config, 0);
    super.showPanel();
    this.uiUpdater!.playVideo(config);
  }

  /**
   * Hides the tooltip panel.
   */
  public hide() {
    this.hidePanel();
  }

  /** Pauses tooltip videos so they do not keep decoding while hidden. */
  public override hidePanel() {
    this.uiUpdater?.pauseVideos();
    super.hidePanel();
  }
}
export { TooltipPanel };
