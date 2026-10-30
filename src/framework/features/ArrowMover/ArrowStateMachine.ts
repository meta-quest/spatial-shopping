/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from "@iwsdk/core";
import { Color, Intersection, Vector3 } from "@iwsdk/core";
import { Tween, Group as TweenGroup } from "@tweenjs/tween.js";
import { ArrowComponent, ArrowState } from "./ArrowComponent.js";
import { XrInputManager, Hand } from "../../managers/input/xrInputManager.js";
import { ArrowStateMachineConfig } from "../../config/InteractionConfig.js";
import { CONFIG } from "../../config/ViewerConfig.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

/**
 * Arrow state enum defining the possible states an arrow can be in
 */
export { ArrowState } from "./ArrowComponent.js";

/**
 * Easing function type for tweens
 */
export type EasingFunction = (amount: number) => number;

/**
 * Event data for arrow click events
 */
export interface ArrowClickEvent {
  entity: Entity;
  intersection: Intersection;
}

/**
 * Type for arrow click event callbacks
 */
export type ArrowClickCallback = (event: ArrowClickEvent) => void;

/**
 * Type for arrow state change callbacks
 */
export type ArrowStateChangeCallback = (
  newState: ArrowState,
  oldState: ArrowState,
) => void;

type ArrowVisualMaterial = {
  color: Color;
  opacity: number;
  transparent: boolean;
  needsUpdate: boolean;
};

/**
 * State machine for a single arrow entity
 * Each arrow has its own instance of this state machine
 */
export class ArrowStateMachine {
  private entity: Entity;
  private tweenGroup!: TweenGroup;
  private xrInputManager!: XrInputManager | null;
  private clickTween: Tween<{ x: number; y: number; z: number }> | null = null;
  private colorTween: Tween<{ amount: number }> | null = null;
  private onClickCallbacks: ArrowClickCallback[] = [];
  private onPressedCallbacks: ArrowClickCallback[] = [];
  private config: ArrowStateMachineConfig;
  private currentHand: Hand | null = null;
  private stateChangeCallback:
    ((newState: ArrowState, oldState: ArrowState) => void) | null = null;
  private lastIntersection: Intersection | null = null;
  private callbackEvent: ArrowClickEvent | null = null;
  private readonly visualMaterials: ArrowVisualMaterial[] = [];
  private readonly visualStartColors: Color[] = [];
  private readonly visualStartOpacities: number[] = [];
  private readonly visualTargetColor = new Color();
  private readonly visualTweenState = { amount: 0 };
  private readonly visualTweenTarget = { amount: 1 };
  private readonly dummyIntersection: Intersection;
  private readonly applyVisualTween = (): void => {
    const amount = this.visualTweenState.amount;
    for (let i = 0; i < this.visualMaterials.length; i++) {
      const material = this.visualMaterials[i];
      material.opacity =
        this.visualStartOpacities[i] +
        (this.visualTargetOpacity - this.visualStartOpacities[i]) * amount;
      material.color.lerpColors(
        this.visualStartColors[i],
        this.visualTargetColor,
        amount,
      );
    }
  };
  private visualTargetOpacity = 1;
  private inactiveInputFrames = 0;
  private static readonly RELEASE_CONFIRMATION_FRAMES = 2;

  /**
   * Creates an ArrowStateMachine for the given entity
   * @param entity - The arrow entity
   * @param tweenGroup - Tween group for animations
   * @param xrInputManager - XR input manager (or null)
   * @param config - Arrow state machine configuration
   */
  constructor(
    entity: Entity,
    tweenGroup: TweenGroup,
    xrInputManager: XrInputManager | null,
    config: ArrowStateMachineConfig = CONFIG.interaction.arrows.blue,
  ) {
    this.entity = entity;
    this.tweenGroup = tweenGroup;
    this.xrInputManager = xrInputManager;
    this.config = config;
    this.dummyIntersection = {
      distance: 0,
      point: new Vector3(),
      object: entity.object3D!,
    } as Intersection;
    this.cacheVisualMaterials();
  }

  /**
   * Subscribe to click events on this arrow
   * @param callback - Function to call when arrow is clicked
   * @returns Function to unsubscribe from the event
   */
  public onArrowClick(callback: ArrowClickCallback): () => void {
    this.onClickCallbacks.push(callback);
    return this.createUnsubscribe(this.onClickCallbacks, callback);
  }

  /**
   * Subscribe to pressed/held events on this arrow
   * @param callback - Function to call continuously while arrow is pressed
   * @returns Function to unsubscribe from the event
   */
  public onArrowPressed(callback: ArrowClickCallback): () => void {
    this.onPressedCallbacks.push(callback);
    return this.createUnsubscribe(this.onPressedCallbacks, callback);
  }

  /**
   * Creates an unsubscribe function that removes a callback from the given array
   * @param callbacks - Array of callbacks to remove from
   * @param callback - Callback to remove
   * @returns Unsubscribe function
   */
  private createUnsubscribe(
    callbacks: ArrowClickCallback[],
    callback: ArrowClickCallback,
  ): () => void {
    return () => {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to state changes for this arrow
   * @param callback - Function to call when state changes
   */
  public onStateChange(
    callback: (newState: ArrowState, oldState: ArrowState) => void,
  ) {
    this.stateChangeCallback = callback;
  }

  /**
   * Emits an event to the given callbacks with error handling
   * @param callbacks - Array of callbacks to invoke
   * @param intersection - Raycast intersection data
   * @param errorContext - Context string for error messages (e.g. 'click', 'pressed')
   */
  private emitEvent(
    callbacks: ArrowClickCallback[],
    intersection: Intersection,
    errorContext: string,
  ) {
    if (this.callbackEvent) this.callbackEvent.intersection = intersection;
    else this.callbackEvent = { entity: this.entity, intersection };
    for (const callback of callbacks) {
      try {
        callback(this.callbackEvent);
      } catch (error) {
        throw MessageHandler.raiseError(
          `Error in arrow ${errorContext} callback: ${error}`,
        );
      }
    }
  }

  public handleHoverStart(): void {
    if (this.getCurrentState() === ArrowState.IDLE) {
      this.setState(ArrowState.HOVERED);
    }
  }

  public handlePressStart(hand: Hand, intersection: Intersection): void {
    if (this.getCurrentState() === ArrowState.PRESSED) return;
    this.currentHand = hand;
    this.inactiveInputFrames = 0;
    this.lastIntersection = intersection;
    this.animateArrowClick();
    this.emitClickEvent(intersection);
    this.setState(ArrowState.PRESSED);
  }

  public handlePressEnd(isHovered: boolean): void {
    this.currentHand = null;
    this.inactiveInputFrames = 0;
    this.lastIntersection = null;
    this.setState(isHovered ? ArrowState.HOVERED : ArrowState.IDLE);
  }

  public isPressed(): boolean {
    return this.getCurrentState() === ArrowState.PRESSED;
  }

  /** True while the input source that began this drag still owns select. */
  public isOwningInputActive(): boolean {
    return Boolean(
      this.currentHand &&
      this.xrInputManager?.isPinchingFromHand(this.currentHand),
    );
  }

  /**
   * Emit click event to all subscribers
   */
  private emitClickEvent(intersection: Intersection) {
    this.emitEvent(this.onClickCallbacks, intersection, "click");
  }

  /**
   * Emit pressed/held event to all subscribers
   */
  private emitPressedEvent(intersection: Intersection) {
    this.emitEvent(this.onPressedCallbacks, intersection, "pressed");
  }

  /**
   * Handle raycast hit on this arrow
   */
  handleHit(hand: Hand, intersection: Intersection) {
    try {
      const currentState = this.getCurrentState();
      this.lastIntersection = intersection;

      switch (currentState) {
        case ArrowState.IDLE:
          this.setState(ArrowState.HOVERED);
          break;

        case ArrowState.HOVERED:
          if (this.xrInputManager!.isPinchThisFrame(hand)) {
            this.currentHand = hand;
            this.animateArrowClick();
            this.emitClickEvent(intersection);
            this.setState(ArrowState.PRESSED);
          }
          break;

        case ArrowState.PRESSED:
          this.continueCapturedPress(intersection, ArrowState.HOVERED);
          break;
      }
    } catch (error) {
      throw MessageHandler.raiseError(
        `ArrowStateMachine.handleHit (${this.entity.object3D?.name}): ${error}`,
      );
    }
  }

  /**
   * Handle continuation of pressed state without raycasting
   * Called every frame when this arrow is in PRESSED state
   */
  handlePressedContinuation() {
    const currentState = this.getCurrentState();

    if (currentState !== ArrowState.PRESSED) {
      return;
    }

    const intersection =
      this.lastIntersection ?? this.createDummyIntersection();
    this.continueCapturedPress(intersection, ArrowState.IDLE);
  }

  /**
   * Handle when this arrow is no longer being hit by raycast
   */
  handleExit() {
    const currentState = this.getCurrentState();

    if (currentState === ArrowState.PRESSED) return;

    if (currentState !== ArrowState.IDLE) {
      this.currentHand = null;
      this.lastIntersection = null;
      this.setState(ArrowState.IDLE);
    }
  }

  /** Keeps logical capture through hover loss and tolerates one missing input frame. */
  private continueCapturedPress(
    intersection: Intersection,
    releasedState: ArrowState,
  ): void {
    if (this.isOwningInputActive()) {
      this.inactiveInputFrames = 0;
      this.lastIntersection = intersection;
      this.emitPressedEvent(intersection);
      return;
    }

    this.inactiveInputFrames++;
    if (
      this.inactiveInputFrames < ArrowStateMachine.RELEASE_CONFIRMATION_FRAMES
    ) {
      return;
    }
    this.currentHand = null;
    this.lastIntersection = null;
    this.inactiveInputFrames = 0;
    this.setState(releasedState);
  }

  /**
   * Get the current state of this arrow
   */
  private getCurrentState(): ArrowState {
    return this.entity.getValue(ArrowComponent, "currentState") as ArrowState;
  }

  /**
   * Notifies the state change callback when state changes
   * @param newState - The new state
   * @param oldState - The previous state
   */
  private notifyStateChange(newState: ArrowState, oldState: ArrowState) {
    if (this.stateChangeCallback) {
      this.stateChangeCallback(newState, oldState);
    }
  }

  /**
   * Creates a dummy intersection at the arrow's world position for pressed continuation
   * @returns A minimal Intersection object
   */
  private createDummyIntersection(): Intersection {
    const object = this.entity.object3D!;
    object.getWorldPosition(this.dummyIntersection.point);
    this.dummyIntersection.object = object;
    return this.dummyIntersection;
  }

  private cacheVisualMaterials(): void {
    this.visualMaterials.length = 0;
    this.visualStartColors.length = 0;
    this.visualStartOpacities.length = 0;
    this.entity.object3D?.traverse((child) => {
      const childMaterial = (child as { material?: unknown }).material as
        ArrowVisualMaterial | ArrowVisualMaterial[] | undefined;
      if (!childMaterial) return;
      const materials = Array.isArray(childMaterial)
        ? childMaterial
        : [childMaterial];
      for (const material of materials) {
        if (!material.color || typeof material.opacity !== "number") continue;
        this.visualMaterials.push(material as ArrowVisualMaterial);
        this.visualStartColors.push(new Color());
        this.visualStartOpacities.push(material.opacity);
      }
    });
  }

  /**
   * Transition arrow visual state with color and opacity animation
   * @param transitionType - Type of transition ('idleToHover' or 'hoverToIdle')
   */
  private transitionArrowVisuals(
    transitionType: "idleToHover" | "hoverToIdle",
  ) {
    const {
      color: targetColor,
      opacity: targetOpacity,
      duration,
      easing,
    } = this.config[transitionType];
    this.colorTween?.stop().remove();
    if (this.visualMaterials.length === 0) this.cacheVisualMaterials();
    this.visualTargetColor.set(targetColor);
    this.visualTargetOpacity = targetOpacity;
    this.visualTweenState.amount = 0;
    for (let i = 0; i < this.visualMaterials.length; i++) {
      const material = this.visualMaterials[i];
      this.visualStartColors[i].copy(material.color);
      this.visualStartOpacities[i] = material.opacity;
      if (!material.transparent) {
        material.transparent = true;
        material.needsUpdate = true;
      }
    }

    this.colorTween = new Tween(this.visualTweenState, this.tweenGroup)
      .to(this.visualTweenTarget, duration)
      .easing(easing)
      .onUpdate(this.applyVisualTween)
      .onComplete(() => {
        this.colorTween = null;
      })
      .start();
  }

  /**
   * Scale up the arrow and then scale it back down in sequence.
   * Uses current scale as base so click animation works with dynamic arrow scaling
   * (upScale is a multiplier, e.g. 1.2 = 20% bigger; scale-down returns to base).
   */
  private scaleUpAndDown() {
    const { upScale, upDuration, downDuration, upEasing, downEasing } =
      this.config.clickAnimation;
    const arrow = this.entity.object3D;

    if (!arrow) return;

    this.stopScaleTween();

    const baseScale =
      (this.entity.getValue(ArrowComponent, "baseScale") as number) ?? 1.0;
    const targetScaleUp = baseScale * upScale;

    const scaleUpValues = {
      x: arrow.scale.x,
      y: arrow.scale.y,
      z: arrow.scale.z,
    };

    this.clickTween = new Tween(scaleUpValues, this.tweenGroup)
      .to(
        {
          x: targetScaleUp,
          y: targetScaleUp,
          z: targetScaleUp,
        },
        upDuration,
      )
      .easing(upEasing)
      .onUpdate(() => {
        arrow.scale.set(scaleUpValues.x, scaleUpValues.y, scaleUpValues.z);
      })
      .onComplete(() => {
        const scaleDownValues = {
          x: arrow.scale.x,
          y: arrow.scale.y,
          z: arrow.scale.z,
        };

        this.clickTween = new Tween(scaleDownValues, this.tweenGroup)
          .to(
            {
              x: baseScale,
              y: baseScale,
              z: baseScale,
            },
            downDuration,
          )
          .easing(downEasing)
          .onUpdate(() => {
            arrow.scale.set(
              scaleDownValues.x,
              scaleDownValues.y,
              scaleDownValues.z,
            );
          })
          .onComplete(() => {
            this.clickTween = null;
          })
          .start();
      })
      .start();
  }

  /**
   * Transitions arrow visuals from idle to hover state
   */
  private transitionIdleToHover() {
    this.transitionArrowVisuals("idleToHover");
  }

  /**
   * Transitions arrow visuals from hover to idle state
   */
  private transitionHoverToIdle() {
    this.transitionArrowVisuals("hoverToIdle");
  }

  /**
   * Triggers the click scale animation
   */
  private animateArrowClick() {
    this.scaleUpAndDown();
  }

  /**
   * Stops the click scale tween if active
   */
  private stopScaleTween() {
    if (this.clickTween && this.clickTween.stop) {
      this.clickTween.stop().remove();
      this.clickTween = null;
    }
  }

  /**
   * Sets the state of this arrow and triggers visual transitions.
   * @param newState - The new state to transition to
   */
  private setState(newState: ArrowState) {
    const previousState = this.getCurrentState();
    if (previousState !== newState) {
      this.entity.setValue(ArrowComponent, "previousState", previousState);
      this.entity.setValue(ArrowComponent, "currentState", newState);

      this.notifyStateChange(newState, previousState);

      if (newState === ArrowState.HOVERED) {
        if (previousState === ArrowState.IDLE) {
          this.transitionIdleToHover();
        }
      }

      if (newState === ArrowState.IDLE) {
        if (
          previousState === ArrowState.HOVERED ||
          previousState === ArrowState.PRESSED
        ) {
          this.transitionHoverToIdle();
        }
      }
    }
  }
}
