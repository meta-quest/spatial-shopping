/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity, Vector3, Quaternion, Mesh, Box3, UIKit } from "@iwsdk/core";
import { computeCompoundBoundingBox } from "./BoundingBoxUtils.js";
import { MessageHandler } from "./MessageHandler.js";

/** Represents the 3D world transform of a UI element. */
interface UIElementTransform {
  position: Vector3;
  rotation: Quaternion;
  /** Size in meters. */
  size: { width: number; height: number };
}

/**
 * Calculates the world-space transform of a UIKit image element.
 * @param panelEntity - The panel entity containing the image
 * @param imageElement - The UIKit image element (used for identification)
 * @returns Transform containing position, rotation, and size in world space
 */
export function getImageWorldTransform(
  panelEntity: Entity,
  imageElement: UIKit.Image,
): UIElementTransform | null {
  const foundMesh = panelEntity.object3D!.getObjectById(imageElement.id) as
    Mesh | undefined;
  if (!foundMesh) {
    MessageHandler.raiseWarning("Image mesh not found in panel hierarchy");
    return null;
  }
  const worldPosition = new Vector3();
  foundMesh.getWorldPosition(worldPosition);
  const worldRotation = new Quaternion();
  foundMesh.getWorldQuaternion(worldRotation);
  const bbox = new Box3().setFromObject(foundMesh);
  if (bbox.isEmpty() || !bbox.min || !bbox.max) {
    MessageHandler.raiseWarning("Image bounding box is invalid or empty");
    return null;
  }
  const size = bbox.getSize(new Vector3());
  return {
    position: worldPosition,
    rotation: worldRotation,
    size: { width: size.x, height: size.y },
  };
}

/**
 * Gets the world-space bounding box of the panel.
 * @param panelEntity - The panel entity
 * @returns Box3 representing the panel's bounds in world space
 */
export function getPanelWorldBoundingBox(panelEntity: Entity): Box3 | null {
  const bbox = computeCompoundBoundingBox(panelEntity.object3D!);
  if (!bbox) {
    MessageHandler.raiseWarning(
      "Panel bounding box could not be computed - UI might not be rendered yet",
    );
    return null;
  }
  if (bbox.isEmpty()) {
    MessageHandler.raiseWarning("Panel bounding box broken");
    return null;
  }
  return bbox;
}

/**
 * Returns the HTMLVideoElement backing a UIKit `<video>` component, or
 * undefined if the element has not loaded yet or `component` is not a video.
 */
export function getNativeVideoElement(
  component: unknown,
): HTMLVideoElement | undefined {
  const element = (component as Partial<UIKit.Video> | null)?.element?.peek();
  return typeof HTMLVideoElement !== "undefined" &&
    element instanceof HTMLVideoElement
    ? element
    : undefined;
}

/** Plays a UIKit video, ignoring autoplay-policy rejections. */
export function playUIKitVideo(component: unknown): void {
  getNativeVideoElement(component)
    ?.play()
    .catch(() => {
      // Playback can be denied until the user interacts with the XR session.
    });
}

/** Pauses a UIKit video if it is loaded. */
export function pauseUIKitVideo(component: unknown): void {
  getNativeVideoElement(component)?.pause();
}
