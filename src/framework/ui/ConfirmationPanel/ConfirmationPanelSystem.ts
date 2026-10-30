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
  Entity,
} from "@iwsdk/core";
import {
  ConfirmationPanelUIUpdater,
  ConfirmationPanelType,
} from "./ConfirmationPanelUIUpdater.js";
import { createBasePanelSystem } from "../BasePanelSystem.js";
import { SceneOpener } from "../../managers/initializer/SceneOpener.js";
import { SessionEndReason } from "../../managers/session/SessionEndReason.js";
import { UI_ASSET_URLS } from "../../../assets.js";
import { RENDER_ORDER } from "../../config/RenderOrder.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

/** Re-export for convenience */
export { ConfirmationPanelType } from "./ConfirmationPanelUIUpdater.js";

/**
 * Component storing state for confirmation panels
 */
export const ConfirmationPanelState = createComponent(
  "ConfirmationPanelState",
  {
    panelType: { type: Types.String, default: "" },
    isVisible: { type: Types.Boolean, default: false },
    errorMessage: { type: Types.String, default: "" },
  },
);

/**
 * Query definitions for the confirmation panel
 */
const ConfirmationPanelQueries = {
  confirmationPanel: {
    required: [PanelUI, PanelDocument, ConfirmationPanelState],
    where: [eq(PanelUI, "config", UI_ASSET_URLS.confirmationPanel)],
  },
};

export class ConfirmationPanelSystem extends createBasePanelSystem(
  ConfirmationPanelQueries,
)<ConfirmationPanelUIUpdater> {
  public sceneOpener!: SceneOpener | null;

  /** Subscribe to confirmation panel entity qualification and initialize panel */
  override init(): void {
    this.cleanupFuncs.push(
      this.queries.confirmationPanel.subscribe("qualify", (entity) => {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) return;

        this.initializePanelEntity(entity, document, {
          renderOrder: RENDER_ORDER.modalPanel,
        });
      }),
    );
  }

  /**
   * Create the UI updater instance (required by BasePanelSystem)
   */
  createUIUpdater(document: UIKitDocument): ConfirmationPanelUIUpdater {
    return new ConfirmationPanelUIUpdater(document);
  }

  /**
   * Get the panel state component (required by BasePanelSystem)
   */
  override getPanelState() {
    return ConfirmationPanelState.data;
  }

  /**
   * Setup event listeners for buttons (required by BasePanelSystem)
   */
  setupButtonListeners(entity: Entity) {
    const primaryButton = this.uiUpdater!.getPrimaryButton();
    if (primaryButton) {
      primaryButton.addEventListener("click", () => {
        this.handlePrimaryAction(entity).catch(
          MessageHandler.reportRejection("Confirmation panel action"),
        );
      });
    }

    const secondaryButton = this.uiUpdater!.getSecondaryButton();
    if (secondaryButton) {
      secondaryButton.addEventListener("click", () => this.hidePanel());
    }
  }

  /**
   * Handles the primary button. The panel hides even if the action fails so a
   * rejected restart or close cannot leave a stuck modal.
   */
  private async handlePrimaryAction(entity: Entity): Promise<void> {
    const state = ConfirmationPanelState.data;
    const panelType = state.panelType[entity.index] as ConfirmationPanelType;

    try {
      switch (panelType) {
        case ConfirmationPanelType.RESTART:
          await this.sceneOpener!.handleRestartConfirmed();
          break;
        case ConfirmationPanelType.ADD_TO_CART:
          this.uiManager!.showCartDataPanel();
          break;
        case ConfirmationPanelType.LEAVE:
          await this.sceneOpener!.close(true, SessionEndReason.UserExit);
          break;
        case ConfirmationPanelType.ERROR:
          break;
      }
    } finally {
      this.hidePanel();
    }
  }

  /**
   * Show confirmation panel with given type and optional error message override
   * @param panelType - Type of confirmation panel to display
   * @param options - Optional overrides (e.g. errorMessage for ERROR type)
   */
  public showPanelWithType(
    panelType: ConfirmationPanelType,
    options?: { errorMessage?: string },
  ) {
    ConfirmationPanelState.data.panelType[this.panelEntity!.index] = panelType;
    if (panelType === ConfirmationPanelType.ERROR) {
      ConfirmationPanelState.data.errorMessage[this.panelEntity!.index] =
        options?.errorMessage ?? "";
    }
    this.uiUpdater!.updatePanelUI(panelType, options);
    super.showPanel();
  }
}
