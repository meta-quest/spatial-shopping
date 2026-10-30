/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetManager, Entity, World } from "@iwsdk/core";
import { Object3D, Mesh } from "@iwsdk/core";
import { Group as TweenGroup } from "@tweenjs/tween.js";
import { ArrowComponent } from "./ArrowComponent.js";
import {
  ArrowStateMachine,
  ArrowClickCallback,
  ArrowState,
} from "./ArrowStateMachine.js";
import { ArrowStateMachineConfig } from "../../config/InteractionConfig.js";
import { XrInputManager } from "../../managers/input/xrInputManager.js";

export type ArrowStateChangeCallbackWithEntity = (
  entity: Entity,
  newState: ArrowState,
  oldState: ArrowState,
) => void;

type CapturablePointerEvent = { pointerId?: number };

/** Keeps an arrow as the pointer target until the initiating select is released. */
export function installArrowPointerCapture(object: Object3D): void {
  const capture = (event: CapturablePointerEvent): void => {
    if (typeof event.pointerId !== "number") return;
    object.setPointerCapture(event.pointerId);
  };
  const release = (event: CapturablePointerEvent): void => {
    if (
      typeof event.pointerId !== "number" ||
      !object.hasPointerCapture(event.pointerId)
    ) {
      return;
    }
    object.releasePointerCapture(event.pointerId);
  };
  object.addEventListener("pointerdown", capture);
  object.addEventListener("pointerup", release);
  object.addEventListener("pointercancel", release);
}

export class ArrowFactory {
  /**
   * Spawns an arrow entity with the specified model
   * @param world - The World instance
   * @param tweenGroup - The tween group for animations
   * @param xrInputManager - XR input manager instance
   * @param modelPath - Path to the arrow model (e.g., "3dUI/Arrow_basic.glb" or "3dUI/Arrow_Rotate_v3.glb")
   * @param name - Name for the arrow entity
   * @param onClickHandler - Callback for arrow clicks
   * @param onPressedHandler - Callback for arrow pressed/held
   * @param onStateChangeHandler - Callback for arrow state changes
   * @param config - State machine configuration for the arrow
   */
  static async spawnArrow(
    world: World,
    tweenGroup: TweenGroup,
    xrInputManager: XrInputManager | null,
    modelPath: string,
    name: string,
    onClickHandler: ArrowClickCallback,
    onPressedHandler: ArrowClickCallback,
    onStateChangeHandler: ArrowStateChangeCallbackWithEntity | null,
    config: ArrowStateMachineConfig,
  ): Promise<Entity> {
    const mesh = ArrowFactory.loadAndSetupMesh(modelPath, name);
    installArrowPointerCapture(mesh);
    ArrowFactory.setupTransparentMaterial(mesh, config.hoverToIdle.opacity);
    ArrowFactory.setInitialColor(mesh, config.hoverToIdle.color);
    return ArrowFactory.createArrowEntity(
      world,
      tweenGroup,
      xrInputManager,
      mesh,
      onClickHandler,
      onPressedHandler,
      onStateChangeHandler,
      config,
    );
  }

  /**
   * Loads a GLTF model and sets up basic mesh properties.
   * @param path - Path to the GLTF model
   * @param name - Name for the mesh
   * @returns Cloned scene object
   */
  private static loadAndSetupMesh(path: string, name: string): Object3D {
    const result = AssetManager.getGLTF(path);
    if (!result) {
      throw new Error(`Arrow asset was not preloaded: ${path}`);
    }
    const mesh = result.scene;
    mesh.name = name;
    mesh.visible = false;
    return mesh;
  }

  /**
   * Sets up transparent material for all children of a mesh.
   * @param mesh - Object3D to traverse
   * @param opacity - Opacity value (0-1)
   */
  private static setupTransparentMaterial(
    mesh: Object3D,
    opacity: number = 0.5,
  ): void {
    mesh.traverse((child: Object3D) => {
      const meshChild = child as Mesh;
      if (meshChild.material) {
        const materials = Array.isArray(meshChild.material)
          ? meshChild.material
          : [meshChild.material];
        const clonedMaterials = materials.map((material) => {
          const cloned = material.clone();
          cloned.transparent = true;
          cloned.opacity = opacity;
          cloned.needsUpdate = true;
          return cloned;
        });
        meshChild.material = Array.isArray(meshChild.material)
          ? clonedMaterials
          : clonedMaterials[0];
      }
    });
  }

  /**
   * Sets the initial color for all materials in a mesh.
   * @param mesh - Object3D to traverse
   * @param color - Hex color value
   */
  private static setInitialColor(mesh: Object3D, color: number): void {
    mesh.traverse((child: Object3D) => {
      const meshChild = child as Mesh;
      if (meshChild.material) {
        const mat = Array.isArray(meshChild.material)
          ? meshChild.material[0]
          : meshChild.material;
        const matWithColor = mat as { color?: { setHex: (n: number) => void } };
        if (matWithColor.color) {
          matWithColor.color.setHex(color);
        }
      }
    });
  }

  /**
   * Creates an arrow entity with ArrowComponent and state machine.
   * @param world - World instance
   * @param tweenGroup - Tween group for animations
   * @param xrInputManager - XR input manager
   * @param mesh - Arrow mesh
   * @param onClickHandler - Click callback
   * @param onPressedHandler - Pressed callback
   * @param onStateChangeHandler - State change callback
   * @param config - State machine config
   * @returns Created arrow entity
   */
  private static createArrowEntity(
    world: World,
    tweenGroup: TweenGroup,
    xrInputManager: XrInputManager | null,
    mesh: Object3D,
    onClickHandler: ArrowClickCallback,
    onPressedHandler: ArrowClickCallback,
    onStateChangeHandler: ArrowStateChangeCallbackWithEntity | null,
    config: ArrowStateMachineConfig,
  ): Entity {
    const entity = world.createTransformEntity(mesh);
    entity.addComponent(ArrowComponent);
    const stateMachine = new ArrowStateMachine(
      entity,
      tweenGroup,
      xrInputManager,
      config,
    );
    entity.setValue(ArrowComponent, "stateMachine", stateMachine);
    stateMachine.onArrowClick(onClickHandler);
    stateMachine.onArrowPressed(onPressedHandler);
    if (onStateChangeHandler) {
      stateMachine.onStateChange((newState, oldState) =>
        onStateChangeHandler(entity, newState, oldState),
      );
    }
    return entity;
  }
}
