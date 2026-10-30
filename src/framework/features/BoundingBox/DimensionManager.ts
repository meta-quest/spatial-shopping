/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Box3,
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
  Vector3,
} from "@iwsdk/core";
import { CONFIG } from "../../config/ViewerConfig";
import { MessageHandler } from "../../utils/MessageHandler";
import type { ProductDimensions } from "./BoundingBoxManager.js";

/**
 * DimensionManager
 *
 * Handles creation of dimension meshes (X, Y, Z) with SVG text textures.
 * Encapsulates all dimension-related mesh creation logic.
 */
export class DimensionManager {
  /**
   * Creates a canvas-based text texture for dimension labels.
   * @param text - The text to display on the texture
   * @param height - Height of the texture in pixels (uses config default)
   * @param fontSize - Font size for the text (uses config default)
   * @returns A Three.js Texture with the rendered SVG text
   */
  static createSvgTextTexture(
    text: string,
    height?: number,
    fontSize?: number,
  ): Texture {
    const actualHeight = height ?? CONFIG.ui.dimensions.textureHeight;
    const actualFontSize = fontSize ?? CONFIG.ui.dimensions.fontSize;
    const charWidth = actualFontSize * 0.6;
    const textWidth = text.length * charWidth;
    const horizontalPadding = actualFontSize * 1.2;
    const width = Math.ceil(textWidth + horizontalPadding);
    const borderRadius = actualHeight / 2;
    const padding = 8;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = actualHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("DimensionManager: Canvas 2D context is unavailable");
    }

    const x = padding;
    const y = padding;
    const rectWidth = width - padding * 2;
    const rectHeight = actualHeight - padding * 2;
    const radius = Math.max(0, borderRadius - padding);

    context.beginPath();
    context.roundRect(x, y, rectWidth, rectHeight, radius);
    context.shadowColor = "rgba(0, 0, 0, 0.2)";
    context.shadowBlur = 4;
    context.shadowOffsetY = 1;
    context.fillStyle = "#ffffff";
    context.fill();
    context.shadowColor = "transparent";
    context.strokeStyle = "#e8e8e8";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "#000000";
    context.font = `bold ${actualFontSize}px Arial, Helvetica, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, actualHeight / 2);

    const texture = new CanvasTexture(canvas);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Creates dimension label meshes for X, Y, and Z axes.
   * Each label is a plane mesh with an SVG text texture displaying the dimension value.
   * @param bbox - The bounding box to create dimension labels for
   * @param bboxSize - The size of the bounding box (pre-calculated for efficiency)
   * @param productDimensions - Optional product dimensions from JSON data (primary source)
   * @returns An object containing X, Y, and Z dimension label meshes, or undefined if creation fails
   */
  static createDimensionLabels(
    bbox: Box3,
    bboxSize: Vector3,
    productDimensions?: ProductDimensions,
  ): { x: Mesh; y: Mesh; z: Mesh } | undefined {
    if (!bbox || !bboxSize) {
      return undefined;
    }

    const dimensions = {
      x: bbox.max.x - bbox.min.x,
      y: bbox.max.y - bbox.min.y,
      z: bbox.max.z - bbox.min.z,
    };

    if (dimensions.x <= 0 || dimensions.y <= 0 || dimensions.z <= 0) {
      return undefined;
    }

    if (bboxSize.x <= 0 || bboxSize.y <= 0 || bboxSize.z <= 0) {
      return undefined;
    }

    let xDimText: string;
    let yDimText: string;
    let zDimText: string;

    if (
      productDimensions?.width &&
      productDimensions?.height &&
      productDimensions?.length
    ) {
      xDimText = productDimensions.width.displayValue;
      yDimText = productDimensions.height.displayValue;
      zDimText = productDimensions.length.displayValue;
    } else {
      const metersToUnit = CONFIG.ui.dimensions.metersToDisplayUnit;
      const unitSuffix = CONFIG.ui.dimensions.displayUnitSuffix;
      xDimText = `${(dimensions.x * metersToUnit).toFixed(2)}${unitSuffix}`;
      yDimText = `${(dimensions.y * metersToUnit).toFixed(2)}${unitSuffix}`;
      zDimText = `${(dimensions.z * metersToUnit).toFixed(2)}${unitSuffix}`;
    }

    if (!xDimText || !yDimText || !zDimText) {
      return undefined;
    }

    try {
      const xDimTexture = DimensionManager.createSvgTextTexture(xDimText);
      const yDimTexture = DimensionManager.createSvgTextTexture(yDimText);
      const zDimTexture = DimensionManager.createSvgTextTexture(zDimText);

      const xDimMaterial =
        DimensionManager.createDimensionMaterial(xDimTexture);
      const yDimMaterial =
        DimensionManager.createDimensionMaterial(yDimTexture);
      const zDimMaterial =
        DimensionManager.createDimensionMaterial(zDimTexture);

      const planeWidth = CONFIG.ui.dimensions.planeWidth;
      const planeHeight = CONFIG.ui.dimensions.planeHeight;
      const dimensionXGeometry = new PlaneGeometry(planeWidth, planeHeight);
      const dimensionYGeometry = new PlaneGeometry(planeWidth, planeHeight);
      const dimensionZGeometry = new PlaneGeometry(planeWidth, planeHeight);

      const XDimensionMesh = new Mesh(dimensionXGeometry, xDimMaterial);
      const YDimensionMesh = new Mesh(dimensionYGeometry, yDimMaterial);
      const ZDimensionMesh = new Mesh(dimensionZGeometry, zDimMaterial);

      const renderOrder = CONFIG.ui.dimensions.renderOrder;
      XDimensionMesh.renderOrder = renderOrder;
      YDimensionMesh.renderOrder = renderOrder;
      ZDimensionMesh.renderOrder = renderOrder;

      XDimensionMesh.name = "XDimension";
      YDimensionMesh.name = "YDimension";
      ZDimensionMesh.name = "ZDimension";

      XDimensionMesh.userData.baseScale = 1;
      YDimensionMesh.userData.baseScale = 1;
      ZDimensionMesh.userData.baseScale = 1;

      XDimensionMesh.scale.setScalar(1);
      YDimensionMesh.scale.setScalar(1);
      ZDimensionMesh.scale.setScalar(1);

      XDimensionMesh.position.set(bboxSize.x / 2, 0, 0);
      YDimensionMesh.position.set(
        bboxSize.x / 2,
        bboxSize.y / 2,
        bboxSize.z / 2,
      );
      ZDimensionMesh.position.set(0, 0, bboxSize.z / 2);

      return {
        x: XDimensionMesh,
        y: YDimensionMesh,
        z: ZDimensionMesh,
      };
    } catch (error) {
      throw MessageHandler.raiseError(
        "DimensionManager: Failed to create dimension labels: " +
          (error instanceof Error ? error.message : String(error)),
      );
      return undefined;
    }
  }

  /**
   * Creates a MeshBasicMaterial for dimension plane with the given texture.
   * @param texture - The texture to apply to the material
   * @returns A configured MeshBasicMaterial for dimension display
   */
  private static createDimensionMaterial(texture: Texture): MeshBasicMaterial {
    return new MeshBasicMaterial({
      map: texture,
      transparent: true,
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    });
  }
}
