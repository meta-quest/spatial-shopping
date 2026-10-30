/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from "vitest";
import type { SceneManager } from "../../managers/scene/SceneManager.js";
import {
  AgentProductCommand,
  executeAgentProductCommand,
} from "./AgentProductControlSystem.js";

function managerMock(): SceneManager {
  return {
    activateCurrentProduct: vi.fn().mockResolvedValue(undefined),
    resetProductPlacement: vi.fn(),
  } as unknown as SceneManager;
}

describe("executeAgentProductCommand", () => {
  it("places the loaded product with the requested snapped state", async () => {
    const manager = managerMock();

    await executeAgentProductCommand(manager, AgentProductCommand.PLACE, false);

    expect(manager.activateCurrentProduct).toHaveBeenCalledWith({
      snappedToPlane: false,
    });
  });

  it("resets only for the explicit reset command", async () => {
    const manager = managerMock();

    await executeAgentProductCommand(manager, AgentProductCommand.RESET, true);

    expect(manager.resetProductPlacement).toHaveBeenCalledOnce();
    expect(manager.activateCurrentProduct).not.toHaveBeenCalled();
  });

  it("rejects unsupported commands without mutating the scene", async () => {
    const manager = managerMock();

    await expect(
      executeAgentProductCommand(manager, "typo" as AgentProductCommand, true),
    ).rejects.toThrow("Unsupported agent product command: typo");

    expect(manager.resetProductPlacement).not.toHaveBeenCalled();
    expect(manager.activateCurrentProduct).not.toHaveBeenCalled();
  });

  it("reports an unwired scene manager as an ordinary command failure", async () => {
    await expect(
      executeAgentProductCommand(null, AgentProductCommand.PLACE, true),
    ).rejects.toThrow("SceneManager is not initialized");
  });
});
