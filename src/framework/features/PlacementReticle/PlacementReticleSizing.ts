/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ReticleConfig } from "../../config/PlacementConfig.js";
import { PreferredOrientation } from "../../utils/PlacementUtils.js";

interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

type ReticleSizingConfig = Pick<
  ReticleConfig,
  "minimumRadius" | "maximumRadius" | "fallbackRadius" | "fadeDistance"
>;

/**
 * Returns a circular field radius that contains the model's placement
 * footprint plus its fading outer margin.
 */
export function calculatePlacementReticleRadius(
  localSize: Vector3Like | undefined,
  scale: Vector3Like,
  orientation: string | undefined,
  config: ReticleSizingConfig,
): number {
  const fallback = clampRadius(config.fallbackRadius, config);
  if (!localSize) return fallback;

  const width = Math.abs(localSize.x * scale.x);
  const secondAxis = Math.abs(
    orientation === PreferredOrientation.vertical
      ? localSize.y * scale.y
      : localSize.z * scale.z,
  );
  if (!Number.isFinite(width) || !Number.isFinite(secondAxis)) return fallback;

  const footprintRadius = Math.hypot(width, secondAxis) * 0.5;
  if (footprintRadius <= 0) return fallback;

  return clampRadius(footprintRadius + config.fadeDistance, config);
}

function clampRadius(radius: number, config: ReticleSizingConfig): number {
  return Math.min(config.maximumRadius, Math.max(config.minimumRadius, radius));
}
