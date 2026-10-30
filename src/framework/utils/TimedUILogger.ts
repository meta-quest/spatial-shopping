/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  World,
  Entity,
  PanelUI,
  PanelDocument,
  Vector3,
  UIKitDocument,
  Quaternion,
} from "@iwsdk/core";
import { StaticGlobalConfigs } from "../config/debug";
import { MessageHandler } from "./MessageHandler.js";
import { PanelSize } from "../features/DynamicScaleUI/PanelSize.js";
import { UI_ASSET_URLS } from "../../assets.js";
import { RENDER_ORDER } from "../config/RenderOrder.js";

/**
 * TimedUILogger class for displaying temporary UI messages in front of the user's view.
 * Messages are displayed for 2 seconds and then automatically hidden.
 */
export class TimedUILogger {
  private static instance: TimedUILogger | null = null;
  private world: World | null = null;
  private logPanelEntity: Entity | null = null;
  private logDocument: UIKitDocument | null = null;
  private hideTimeout: number | null = null;
  private documentRetryTimeout: number | null = null;
  private lastMessage: string = "";
  private messageCounter: number = 0;

  /**
   * Get the singleton instance of TimedUILogger.
   * @returns The singleton instance
   */
  static getInstance(): TimedUILogger {
    if (!TimedUILogger.instance) {
      TimedUILogger.instance = new TimedUILogger();
    }
    return TimedUILogger.instance;
  }

  /** Initializes the logger with the given world. */
  init(world: World | null): void {
    if (!StaticGlobalConfigs.ENABLE_LOGS_3D) return;
    this.world = world;
    this.logPanelEntity = this.world!.createTransformEntity()
      .addComponent(PanelUI, {
        config: UI_ASSET_URLS.logMessage,
      })
      .addComponent(PanelSize, {
        maxHeight: 0.3,
        maxWidth: 0.5,
      });

    if (this.logPanelEntity.object3D) {
      this.logPanelEntity.object3D.visible = false;
      this.logPanelEntity.object3D.renderOrder = RENDER_ORDER.debugLog;
    }

    this.tryGetDocument();
  }

  /** @internal Attempts to get the log document from the panel. */
  private tryGetDocument(): void {
    if (!this.logPanelEntity) return;

    try {
      const document = PanelDocument.data.document[
        this.logPanelEntity.index
      ] as UIKitDocument | undefined;
      if (document) {
        this.logDocument = document;
      } else {
        this.documentRetryTimeout = window.setTimeout(
          () => this.tryGetDocument(),
          100,
        );
      }
    } catch (_error) {
      this.documentRetryTimeout = window.setTimeout(
        () => this.tryGetDocument(),
        100,
      );
    }
  }

  /** Displays a log message in front of the user's view for 2 seconds. */
  LOG(message: string): void {
    if (!StaticGlobalConfigs.ENABLE_LOGS_3D) return;

    if (!this.world || !this.logPanelEntity) {
      MessageHandler.raiseLog(message);
      return;
    }

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    if (!this.logDocument) this.tryGetDocument();

    let displayMessage = message;
    if (message === this.lastMessage) {
      this.messageCounter++;
      displayMessage = `${message} (x${this.messageCounter})`;
    } else {
      this.lastMessage = message;
      this.messageCounter = 1;
    }

    if (this.logDocument) {
      const messageElement = this.logDocument.getElementById("log-message");
      if (messageElement) {
        messageElement.setProperties({ text: displayMessage });
      }
    }

    if (this.world.camera && this.logPanelEntity.object3D) {
      const cameraPosition = new Vector3();
      this.world.camera.getWorldPosition(cameraPosition);

      const cameraQuaternion = new Quaternion();
      this.world.camera.getWorldQuaternion(cameraQuaternion);

      const localOffset = new Vector3(0, 0.1, -0.7);
      const worldOffset = localOffset.applyQuaternion(cameraQuaternion);
      const newPosition = cameraPosition.clone().add(worldOffset);
      this.logPanelEntity.object3D.position.copy(newPosition);
      this.logPanelEntity.object3D.lookAt(cameraPosition);
    }

    if (this.logPanelEntity.object3D) {
      this.logPanelEntity.object3D.visible = true;
    }

    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, 2000);
  }

  /**
   * Hide the log panel.
   */
  private hide(): void {
    if (this.logPanelEntity?.object3D) {
      this.logPanelEntity.object3D.visible = false;
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.lastMessage = "";
    this.messageCounter = 0;
  }

  /**
   * Cleanup method to destroy the log panel entity.
   */
  destroy(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.documentRetryTimeout !== null) {
      window.clearTimeout(this.documentRetryTimeout);
      this.documentRetryTimeout = null;
    }
    if (this.logPanelEntity) {
      this.logPanelEntity.dispose();
      this.logPanelEntity = null;
    }
    this.logDocument = null;
    this.world = null;
    TimedUILogger.instance = null;
  }
}
