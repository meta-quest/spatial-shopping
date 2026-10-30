/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Box3,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  Mesh,
} from "@iwsdk/core";
import { DimensionManager } from "./DimensionManager.js";

/** Single dimension entry (width, height, or length) from product metadata. */
export interface ProductDimensionEntry {
  displayValue: string;
  value: number;
  unit: string;
}

/** Product dimensions from JSON metadata (primary source for dimension labels). */
export interface ProductDimensions {
  width: ProductDimensionEntry;
  height: ProductDimensionEntry;
  length: ProductDimensionEntry;
}

/**
 * CustomBbox interface
 * Represents a bounding box visualization with optional dimension meshes
 */
export interface CustomBbox {
  mesh: LineSegments;
  bbox: Box3;
  dimensions?: {
    x: Mesh | undefined;
    y: Mesh | undefined;
    z: Mesh | undefined;
  };
}

/**
 * BoundingBoxManager
 *
 * Manages creation of bounding box visualizations.
 * Provides factory methods for creating bounding box meshes and dimension labels.
 */
export class BoundingBoxManager {
  /**
   * Creates a bounding box visualization from a Box3
   * @param bbox - The bounding box to visualize
   * @param createDimensions - If true, creates dimension meshes (X, Y, Z) with labels
   * @param productDimensions - Optional product dimensions from JSON (primary source)
   * @returns A CustomBbox object containing the mesh, bbox, and optional dimensions
   */
  static createBoundingBox(
    bbox: Box3,
    createDimensions = false,
    productDimensions?: ProductDimensions,
  ): CustomBbox {
    const bboxCenter = bbox.getCenter(new Vector3());
    const bboxSize = bbox.getSize(new Vector3());
    const min = bbox.min.clone().sub(bboxCenter);
    const max = bbox.max.clone().sub(bboxCenter);
    const vertices = [
      min.x,
      min.y,
      min.z,
      max.x,
      min.y,
      min.z,
      max.x,
      min.y,
      min.z,
      max.x,
      min.y,
      max.z,
      max.x,
      min.y,
      max.z,
      min.x,
      min.y,
      max.z,
      min.x,
      min.y,
      max.z,
      min.x,
      min.y,
      min.z,
      min.x,
      max.y,
      min.z,
      max.x,
      max.y,
      min.z,
      max.x,
      max.y,
      min.z,
      max.x,
      max.y,
      max.z,
      max.x,
      max.y,
      max.z,
      min.x,
      max.y,
      max.z,
      min.x,
      max.y,
      max.z,
      min.x,
      max.y,
      min.z,
      min.x,
      min.y,
      min.z,
      min.x,
      max.y,
      min.z,
      max.x,
      min.y,
      min.z,
      max.x,
      max.y,
      min.z,
      max.x,
      min.y,
      max.z,
      max.x,
      max.y,
      max.z,
      min.x,
      min.y,
      max.z,
      min.x,
      max.y,
      max.z,
    ];

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    const lineMaterial = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      linewidth: 2,
    });

    const mesh = new LineSegments(geometry, lineMaterial);
    mesh.name = "BoundingBox";
    mesh.position.copy(bboxCenter);

    let dimensions: { x: Mesh; y: Mesh; z: Mesh } | undefined;
    if (createDimensions) {
      dimensions = DimensionManager.createDimensionLabels(
        bbox,
        bboxSize,
        productDimensions,
      );
    }

    return {
      mesh,
      bbox,
      dimensions: dimensions
        ? { x: dimensions.x, y: dimensions.y, z: dimensions.z }
        : undefined,
    };
  }
}
