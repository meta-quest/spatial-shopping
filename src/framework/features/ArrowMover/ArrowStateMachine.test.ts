/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BoxGeometry,
  Entity,
  Group,
  Intersection,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "@iwsdk/core";
import { Group as TweenGroup } from "@tweenjs/tween.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XrInputManager, Hand } from "../../managers/input/xrInputManager.js";
import { ArrowState } from "./ArrowStateMachine.js";
import { ArrowStateMachine } from "./ArrowStateMachine.js";
import { installArrowPointerCapture } from "./ArrowFactory.js";

vi.hoisted(() => {
  const context = {
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
});

const disposableMeshes: Mesh[] = [];

function createArrowEntity(materialCount = 1): {
  entity: Entity;
  materials: MeshBasicMaterial[];
  hitObject: Mesh;
} {
  const root = new Group();
  const materials: MeshBasicMaterial[] = [];
  let hitObject: Mesh | null = null;
  for (let i = 0; i < materialCount; i++) {
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.5,
      transparent: true,
    });
    const mesh = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), material);
    root.add(mesh);
    disposableMeshes.push(mesh);
    materials.push(material);
    hitObject ??= mesh;
  }

  const values = new Map<string, unknown>([
    ["currentState", ArrowState.IDLE],
    ["previousState", ArrowState.IDLE],
    ["baseScale", 1],
  ]);
  const entity = {
    object3D: root,
    getValue: (_component: unknown, field: string) => values.get(field),
    setValue: (_component: unknown, field: string, value: unknown) => {
      values.set(field, value);
    },
  } as unknown as Entity;
  return { entity, materials, hitObject: hitObject! };
}

afterEach(() => {
  for (const mesh of disposableMeshes) {
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }
  disposableMeshes.length = 0;
});

describe("ArrowStateMachine", () => {
  it("emits a press once when duplicate systems report the same press", () => {
    const { entity, hitObject } = createArrowEntity();
    let selecting = true;
    const input = {
      isPinchingFromHand: () => selecting,
    } as unknown as XrInputManager;
    const stateMachine = new ArrowStateMachine(entity, new TweenGroup(), input);
    const onClick = vi.fn();
    const onPressed = vi.fn();
    stateMachine.onArrowClick(onClick);
    stateMachine.onArrowPressed(onPressed);
    const intersection = {
      distance: 1,
      point: new Vector3(),
      object: hitObject,
    } as Intersection;

    stateMachine.handlePressStart(Hand.Right, intersection);
    stateMachine.handlePressStart(Hand.Right, intersection);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(stateMachine.isPressed()).toBe(true);

    stateMachine.handlePressedContinuation();
    expect(onPressed).toHaveBeenCalledTimes(1);
    selecting = false;
    stateMachine.handlePressedContinuation();
    expect(stateMachine.isPressed()).toBe(true);
    stateMachine.handlePressedContinuation();
    expect(stateMachine.isPressed()).toBe(false);
  });

  it("retains a captured press when hover exits before release", () => {
    const { entity, hitObject } = createArrowEntity();
    const input = {
      isPinchingFromHand: () => true,
    } as unknown as XrInputManager;
    const stateMachine = new ArrowStateMachine(entity, new TweenGroup(), input);
    stateMachine.handlePressStart(Hand.Right, {
      distance: 1,
      point: new Vector3(),
      object: hitObject,
    } as Intersection);

    stateMachine.handleExit();

    expect(stateMachine.isPressed()).toBe(true);
    expect(stateMachine.isOwningInputActive()).toBe(true);
  });

  it("captures and releases the spatial pointer on the arrow root", () => {
    const root = new Group();
    const setCapture = vi
      .spyOn(root, "setPointerCapture")
      .mockImplementation(() => {});
    const hasCapture = vi
      .spyOn(root, "hasPointerCapture")
      .mockReturnValue(true);
    const releaseCapture = vi
      .spyOn(root, "releasePointerCapture")
      .mockImplementation(() => {});
    installArrowPointerCapture(root);

    root.dispatchEvent({ type: "pointerdown", pointerId: 7 } as never);
    root.dispatchEvent({ type: "pointercancel", pointerId: 7 } as never);

    expect(setCapture).toHaveBeenCalledWith(7);
    expect(hasCapture).toHaveBeenCalledWith(7);
    expect(releaseCapture).toHaveBeenCalledWith(7);
  });

  it("uses one cached visual tween for every child material", () => {
    const { entity, materials } = createArrowEntity(3);
    const tweenGroup = new TweenGroup();
    const stateMachine = new ArrowStateMachine(entity, tweenGroup, null);
    const versions = materials.map((material) => material.version);

    stateMachine.handleHoverStart();
    expect(tweenGroup.getAll()).toHaveLength(1);
    stateMachine.handleExit();
    expect(tweenGroup.getAll()).toHaveLength(1);
    tweenGroup.update(Number.MAX_SAFE_INTEGER);

    expect(materials.map((material) => material.version)).toEqual(versions);
  });
});
