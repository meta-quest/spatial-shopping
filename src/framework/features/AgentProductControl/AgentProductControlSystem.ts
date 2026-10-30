/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, createSystem, Types } from "@iwsdk/core";
import type { SceneManager } from "../../managers/scene/SceneManager.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

/** Commands exposed to local automation through the ECS inspection tools. */
export enum AgentProductCommand {
  NONE = "none",
  PLACE = "place",
  RESET = "reset",
}

/**
 * Dev-only control surface for deterministic product setup.
 *
 * Agents can set the product Transform directly, then set `command` to
 * `place` without replaying the shopper-facing onboarding gesture.
 */
export const AgentProductControl = createComponent("AgentProductControl", {
  command: {
    type: Types.Enum,
    enum: AgentProductCommand,
    default: AgentProductCommand.NONE,
  },
  snappedToPlane: { type: Types.Boolean, default: true },
  isBusy: { type: Types.Boolean, default: false },
  lastError: { type: Types.String, default: "" },
});

/** Executes one validated automation command outside the ECS frame loop. */
export async function executeAgentProductCommand(
  sceneManager: SceneManager | null,
  command: AgentProductCommand,
  snappedToPlane: boolean,
): Promise<void> {
  if (!sceneManager) {
    throw new Error("SceneManager is not initialized");
  }

  switch (command) {
    case AgentProductCommand.PLACE:
      await sceneManager.activateCurrentProduct({ snappedToPlane });
      return;
    case AgentProductCommand.RESET:
      sceneManager.resetProductPlacement();
      return;
    case AgentProductCommand.NONE:
      return;
    default:
      throw new Error(`Unsupported agent product command: ${String(command)}`);
  }
}

export class AgentProductControlSystem extends createSystem({
  controls: { required: [AgentProductControl] },
}) {
  public sceneManager!: SceneManager | null;
  private commandInFlight = false;

  override init(): void {
    if (!import.meta.env.DEV) return;

    const control = this.world
      .createTransformEntity()
      .addComponent(AgentProductControl);
    control.object3D!.name = "AgentProductControl";
  }

  override update(): void {
    if (!import.meta.env.DEV || this.commandInFlight) return;

    const control = this.queries.controls.entities.values().next().value;
    if (!control) return;

    const command = control.getValue(
      AgentProductControl,
      "command",
    ) as AgentProductCommand;
    if (command === AgentProductCommand.NONE) return;

    control.setValue(AgentProductControl, "command", AgentProductCommand.NONE);
    control.setValue(AgentProductControl, "isBusy", true);
    control.setValue(AgentProductControl, "lastError", "");
    this.commandInFlight = true;

    const operation = Promise.resolve().then(() =>
      executeAgentProductCommand(
        this.sceneManager,
        command,
        Boolean(control.getValue(AgentProductControl, "snappedToPlane")),
      ),
    );

    void operation
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        control.setValue(AgentProductControl, "lastError", message);
        MessageHandler.raiseWarning(
          `AgentProductControl: ${command} failed: ${message}`,
        );
      })
      .finally(() => {
        control.setValue(AgentProductControl, "isBusy", false);
        this.commandInFlight = false;
      });
  }
}
