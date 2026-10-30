/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, eq, Hovered, Entity } from "@iwsdk/core";
import {
  CustomGrab,
  GrabState,
} from "../../features/CustomGrab/CustomGrabSystem.js";
import type { UIManager } from "../../managers/ui/UIManager.js";

/**
 * UIInteractionSystem tracks all user interactions that affect UI state.
 *
 * This system is responsible for:
 * - Detecting when idle products are hovered
 * - Detecting when products enter/exit IDLE state (placed vs grabbed)
 * - Notifying UIManager of all product interaction state changes
 * - Updating all UI panel animations every frame
 */
export class UIInteractionSystem extends createSystem({
  /** Query for all product entities (to detect when spawned) */
  productEntities: { required: [CustomGrab] },
  /** Query for hovered IDLE entities (placed products being hovered) */
  hoveredIdleProducts: {
    required: [CustomGrab, Hovered],
    where: [eq(CustomGrab, "state", GrabState.IDLE)],
  },
  /** Query for entities in IDLE state (placed and not being moved) */
  idleEntities: {
    required: [CustomGrab],
    where: [eq(CustomGrab, "state", GrabState.IDLE)],
  },
}) {
  public uiManager!: UIManager | null;

  /**
   * Subscribes to product lifecycle and hover events, notifying UIManager of state changes.
   */
  override init(): void {
    this.cleanupFuncs.push(
      this.queries.productEntities.subscribe("qualify", ({ object3D }) => {
        this.uiManager!.onProductSpawned(object3D!);
      }),
    );

    this.cleanupFuncs.push(
      this.queries.hoveredIdleProducts.subscribe("qualify", ({ object3D }) => {
        this.uiManager!.onProductHovered(object3D!.userData!.productId || "");
      }),
    );

    this.cleanupFuncs.push(
      this.queries.hoveredIdleProducts.subscribe("disqualify", () => {
        this.uiManager!.onProductUnhovered();
      }),
    );

    this.cleanupFuncs.push(
      this.queries.idleEntities.subscribe("qualify", (entity: Entity) => {
        const isSnapped =
          entity.getValue(CustomGrab, "snappedToPlane") ?? false;
        this.uiManager!.onProductPlaced(entity.object3D!, isSnapped as boolean);
      }),
    );

    this.cleanupFuncs.push(
      this.queries.idleEntities.subscribe("disqualify", () => {
        this.uiManager!.onProductGrabbed();
      }),
    );
  }

  /**
   * Runs every frame. Updates all UI panel animations.
   */
  override update() {
    this.uiManager?.uiTweenGroup.updateActive();
  }
}
