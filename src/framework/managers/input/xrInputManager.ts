/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World, StatefulGamepad, Group, Object3DEventMap } from "@iwsdk/core";

/** Hand identifier for left/right controller. */
export enum Hand {
  Left = "left",
  Right = "right",
}

/** Manages XR input state for hand controllers and gamepad buttons. */
export class XrInputManager {
  public world!: World;

  /** Returns true if pinch/select started this frame for the given hand. */
  public isPinchThisFrame(hand: Hand): boolean {
    const gamepad =
      hand === Hand.Left ? this.leftStatefulGamepad : this.rightStatefulGamepad;
    return gamepad?.getSelectStart() ?? false;
  }

  /** Returns true if the given hand is currently pinching/selecting. */
  public isPinchingFromHand(hand: Hand): boolean {
    return hand === Hand.Left
      ? this.isLeftHandPinching()
      : this.isRightHandPinching();
  }

  /** Returns true if both hands are currently pinching. */
  public areBothHandsPinching(): boolean {
    return this.isRightHandPinching() && this.isLeftHandPinching();
  }

  /** Returns true if the right hand is currently pinching. */
  public isRightHandPinching(): boolean {
    return this.rightStatefulGamepad?.getSelecting() ?? false;
  }

  /** Returns true if the left hand is currently pinching. */
  public isLeftHandPinching(): boolean {
    return this.leftStatefulGamepad?.getSelecting() ?? false;
  }

  /** Returns true if either hand is currently pinching. */
  public isAnyHandPinching(): boolean {
    return this.isLeftHandPinching() || this.isRightHandPinching();
  }

  /** Returns the rayspace Group for the given hand, or undefined if not available. */
  public getHand(hand: Hand): Group<Object3DEventMap> | undefined {
    return hand === Hand.Right
      ? this.world.player.raySpaces.right
      : this.world.player.raySpaces.left;
  }

  /** Returns the rayspace of the hand that is pinching (when exactly one hand is pinching), or undefined. */
  get getPinchingRayspace(): Group<Object3DEventMap> | undefined {
    const xrInput = this.world.input.xr;
    if (!xrInput) return undefined;

    const right = this.world.player.raySpaces.right;
    const left = this.world.player.raySpaces.left;
    if (this.isRightHandPinching() && !this.isLeftHandPinching() && right) {
      right.userData.usingHand = xrInput.isPrimary("hand", Hand.Right);
      return right;
    }
    if (this.isLeftHandPinching() && !this.isRightHandPinching() && left) {
      left.userData.usingHand = xrInput.isPrimary("hand", Hand.Left);
      return left;
    }
    return undefined;
  }

  /** Returns the right hand gamepad state, or undefined if not available. */
  get rightStatefulGamepad(): StatefulGamepad | undefined {
    return this.world.input.xr?.gamepads?.right;
  }

  /** Returns the left hand gamepad state, or undefined if not available. */
  get leftStatefulGamepad(): StatefulGamepad | undefined {
    return this.world.input.xr?.gamepads?.left;
  }
}
