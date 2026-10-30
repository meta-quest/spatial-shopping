/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Dimensions } from "../types/ProductData.js";

/**
 * Formats structured dimensions to a display string.
 * Converts Dimensions object to a formatted string like "32.3\" x 25.6\" x 29.5\"".
 *
 * @param dimensions - The structured dimensions object
 * @returns Formatted dimensions string or "N/A" if dimensions are missing/invalid
 */
export function formatDimensionsForDisplay(
  dimensions: Dimensions | undefined,
): string {
  if (!dimensions) return "N/A";

  const parts: string[] = [];

  if (dimensions.length?.displayValue) {
    parts.push(dimensions.length.displayValue);
  }
  if (dimensions.width?.displayValue) {
    parts.push(dimensions.width.displayValue);
  }
  if (dimensions.height?.displayValue) {
    parts.push(dimensions.height.displayValue);
  }

  return parts.length > 0 ? parts.join(" x ") : "N/A";
}
