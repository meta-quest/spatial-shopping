/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKit, Vector3 } from "@iwsdk/core";

/** Fields of a pointer event that the drag gesture reads. */
type DragPointerEvent = {
  pointerId?: number;
  point?: Vector3;
  distance?: number;
};
type DragPointerHandler = (event: DragPointerEvent) => void;

/**
 * Handles pointer events (down, up, move) with a hold timer for drag operations.
 */
export class PointerDragWrapper {
  private imageElement: UIKit.Image;
  private pointerDownTimer: ReturnType<typeof setTimeout> | null = null;
  private boundHandleImagePointerDown: DragPointerHandler | null = null;
  private boundHandleImagePointerUp: DragPointerHandler | null = null;
  private boundHandleImagePointerCancel: DragPointerHandler | null = null;
  private boundHandleImagePointerMove: DragPointerHandler | null = null;
  private onHoldComplete?: () => void;
  private dragStartPosition: Vector3 | null = null;
  private completedConditions: Set<string> = new Set();
  private isEnabled: boolean = true;
  private capturedPointerId: number | null = null;

  /** @param imageElement - The UIKit image to attach pointer handlers to. @param onHoldComplete - Callback when hold + drag conditions are met. */
  constructor(imageElement: UIKit.Image, onHoldComplete?: () => void) {
    this.imageElement = imageElement;
    this.onHoldComplete = onHoldComplete;
    this.setupEventListeners();
  }

  /** Binds and attaches pointer event listeners to the image element. */
  private setupEventListeners(): void {
    this.boundHandleImagePointerDown = this.handleImagePointerDown.bind(this);
    this.boundHandleImagePointerUp =
      this.handleImagePointerInterrupt.bind(this);
    this.boundHandleImagePointerCancel =
      this.handleImagePointerInterrupt.bind(this);
    this.boundHandleImagePointerMove = this.handleImagePointerMove.bind(this);
    this.imageElement.addEventListener(
      "pointerdown",
      this.boundHandleImagePointerDown,
    );
    this.imageElement.addEventListener(
      "pointerup",
      this.boundHandleImagePointerUp,
    );
    this.imageElement.addEventListener(
      "pointercancel",
      this.boundHandleImagePointerCancel,
    );
    this.imageElement.addEventListener(
      "pointermove",
      this.boundHandleImagePointerMove,
    );
  }

  /** Handles pointer down: stores start position and starts hold timer. */
  private handleImagePointerDown(event: DragPointerEvent): void {
    if (!this.isEnabled) return;
    if (typeof event.pointerId === "number") {
      this.capturedPointerId = event.pointerId;
      this.imageElement.setPointerCapture(event.pointerId);
    }
    this.completedConditions.clear();
    if (event.point) this.dragStartPosition = event.point.clone();
    if (this.pointerDownTimer) clearTimeout(this.pointerDownTimer);
    this.pointerDownTimer = setTimeout(() => {
      this.completedConditions.add("holdTimer");
      this.checkIfConditionsMet();
      this.pointerDownTimer = null;
    }, 120);
  }

  /** Handles pointer move: checks drag distance threshold and triggers callback when both hold and drag are met. */
  private handleImagePointerMove(event: DragPointerEvent): void {
    if (!this.isEnabled) return;
    if (this.dragStartPosition && event.point) {
      const currentPosition = event.point;
      const distance = this.dragStartPosition.distanceTo(currentPosition);

      //Empyrical value, min distance of drag or if close make it even smaller
      if (distance > Math.min(0.01, 0.01 * (event.distance ?? 1))) {
        this.completedConditions.add("dragDistance");
      }

      this.checkIfConditionsMet();
    }
  }

  /** Invokes onHoldComplete when both hold timer and drag distance conditions are met. */
  private checkIfConditionsMet(): void {
    if (this.completedConditions.size >= 2) {
      this.completedConditions.clear();
      this.onHoldComplete?.();
    }
  }

  /** Releases pointer ownership and clears the drag session on pointer up. */
  private handleImagePointerInterrupt(event: DragPointerEvent): void {
    const pointerId =
      typeof event.pointerId === "number"
        ? event.pointerId
        : this.capturedPointerId;
    this.capturedPointerId = null;
    if (pointerId !== null && this.imageElement.hasPointerCapture(pointerId)) {
      this.imageElement.releasePointerCapture(pointerId);
    }
    this.dragStartPosition = null;
    this.completedConditions.clear();
    if (this.pointerDownTimer) {
      clearTimeout(this.pointerDownTimer);
      this.pointerDownTimer = null;
    }
  }

  /** Disables drag and drop behavior without removing event listeners. */
  public disable(): void {
    this.isEnabled = false;
    this.handleImagePointerInterrupt({});
  }

  /** Enables drag and drop behavior. */
  public enable(): void {
    this.isEnabled = true;
  }

  /** Returns whether drag and drop is currently enabled. */
  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  /** Clears timer and removes all event listeners. */
  public dispose(): void {
    this.handleImagePointerInterrupt({});
    const listeners: [
      "pointerdown" | "pointerup" | "pointercancel" | "pointermove",
      DragPointerHandler | null,
    ][] = [
      ["pointerdown", this.boundHandleImagePointerDown],
      ["pointerup", this.boundHandleImagePointerUp],
      ["pointercancel", this.boundHandleImagePointerCancel],
      ["pointermove", this.boundHandleImagePointerMove],
    ];
    for (const [type, handler] of listeners) {
      if (handler) this.imageElement.removeEventListener(type, handler);
    }
  }
}
