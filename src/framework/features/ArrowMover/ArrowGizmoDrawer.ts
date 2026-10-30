/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3, Quaternion } from "@iwsdk/core";
import { Entity } from "@iwsdk/core";
import { ArrowComponent } from "./ArrowComponent.js";
import { ArrowState } from "./ArrowStateMachine.js";
import { DebugGizmos } from "../../utils/DebugGizmos.js";
import { StaticGlobalConfigs } from "../../config/debug.js";

const CARDINAL_NAMES = ["front", "right", "back", "left"] as const;
const CORNER_NAMES = [
  "frontLeft",
  "frontRight",
  "backRight",
  "backLeft",
] as const;

/**
 * Handles drawing debug gizmos for the arrow mover system
 */
export class ArrowGizmoDrawer {
  /**
   * Draws all debug gizmos for the arrow mover system.
   * Cardinals order: [front, right, back, left]. Corners order: [frontLeft, frontRight, backRight, backLeft].
   * @param cardinalsArray - Array of cardinal points [front, right, back, left]
   * @param bboxCenter - The center of the bounding box
   * @param bboxSize - The size of the bounding box
   * @param cornersArray - Array of corner positions [frontLeft, frontRight, backRight, backLeft]
   * @param closestCornerName - The name of the closest corner to the camera
   * @param rotation - Optional rotation quaternion for oriented bounding box
   */
  public drawGizmos(
    cardinalsArray: Vector3[],
    bboxCenter: Vector3,
    bboxSize: Vector3,
    cornersArray: Vector3[],
    closestCornerName: string,
    rotation?: Quaternion,
  ): void {
    if (!this.ensureDebugEnabled()) return;

    this.clearGizmos();

    CARDINAL_NAMES.forEach((name, i) =>
      DebugGizmos.drawSphere(
        `midpoint-${name}`,
        cardinalsArray[i],
        0.04,
        0x0000ff,
      ),
    );
    DebugGizmos.drawBox(
      "placed-object-bbox",
      bboxCenter,
      bboxSize,
      0x00ff00,
      rotation,
    );
    CORNER_NAMES.forEach((name, i) =>
      DebugGizmos.drawSphere(
        `corner-${name}`,
        cornersArray[i],
        0.03,
        closestCornerName === name ? 0xffa500 : 0xff0000,
      ),
    );
  }

  /**
   * Draws a debug sphere at the center of rotating arrows
   * @param position - The position to draw the sphere at
   */
  public drawRotateArrowCenter(position: Vector3): void {
    if (!this.ensureDebugEnabled()) return;
    DebugGizmos.drawSphere("rotateArrows-center", position, 0.05, 0xff69b4);
  }

  /**
   * Draws debug gizmos showing the arrow's orientation (forward, up, right vectors).
   * Only draws when arrow is not in IDLE state.
   * @param arrow - The arrow entity to draw orientation for
   * @param index - The index of the arrow (used for unique gizmo IDs)
   */
  public drawArrowOrientationDebug(arrow: Entity, index: number): void {
    if (!this.ensureDebugEnabled()) return;

    const currentState = arrow.getValue(
      ArrowComponent,
      "currentState",
    ) as string;
    if (currentState === ArrowState.IDLE) {
      this.clearArrowGizmos(index);
      return;
    }

    const arrowObject = arrow.object3D!;
    const arrowRight = new Vector3();
    const arrowUp = new Vector3();
    const arrowForward = new Vector3();
    arrowObject.matrixWorld.extractBasis(arrowRight, arrowUp, arrowForward);
    const arrowPos = new Vector3();
    arrowObject.getWorldPosition(arrowPos);

    DebugGizmos.remove(`ArrowMiddlePoint-${index}`);
    DebugGizmos.drawSphere(
      `ArrowMiddlePoint-${index}`,
      arrowPos.clone(),
      0.05,
      0x0000ff,
    );

    this.drawAxisArrow(index, "Forward", arrowPos, arrowForward, 0x0000ff);
    this.drawAxisArrow(index, "Up", arrowPos, arrowUp, 0x00ff00);
    this.drawAxisArrow(index, "Right", arrowPos, arrowRight, 0xff0000);
  }

  /**
   * Clears all gizmos drawn by this drawer
   */
  private clearGizmos(): void {
    CORNER_NAMES.forEach((name) => DebugGizmos.remove(`corner-${name}`));
    CARDINAL_NAMES.forEach((name) => DebugGizmos.remove(`midpoint-${name}`));
    DebugGizmos.remove("placed-object-bbox");
  }

  /**
   * Returns whether debug gizmos are enabled.
   */
  private ensureDebugEnabled(): boolean {
    return StaticGlobalConfigs.ENABLE_DEBUG_GIZMOS;
  }

  /**
   * Clears arrow-specific orientation gizmos for the given index.
   * @param index - Arrow index
   */
  private clearArrowGizmos(index: number): void {
    DebugGizmos.remove(`ArrowMiddlePoint-${index}`);
    DebugGizmos.remove(`ArrowForward-${index}`);
    DebugGizmos.remove(`ArrowUp-${index}`);
    DebugGizmos.remove(`ArrowRight-${index}`);
  }

  /**
   * Draws an axis arrow for debug visualization.
   * @param index - Arrow index for unique ID
   * @param axis - Axis name (Forward, Up, Right)
   * @param pos - Position to draw from
   * @param dir - Direction vector
   * @param color - Hex color
   */
  private drawAxisArrow(
    index: number,
    axis: string,
    pos: Vector3,
    dir: Vector3,
    color: number,
  ): void {
    const id = `Arrow${axis}-${index}`;
    DebugGizmos.remove(id);
    DebugGizmos.drawArrow(id, pos, dir, 1.0, color);
  }
}
