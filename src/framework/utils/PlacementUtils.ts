/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Placement surface recognition based on semantic labels from the immersive-web spec.
 * See: https://github.com/immersive-web/semantic-labels
 * Update labels: npm run update-semantic-labels
 * @module PlacementUtils
 */

import semanticLabels from "../data/semantic-labels.json";

/** Supported placement orientations for surfaces. */
export enum PreferredOrientation {
  horizontal = "horizontal",
  horizontalInverted = "horizontal-inverted",
  vertical = "vertical",
}

type OrientationFromSpec = "horizontal" | "vertical" | "unknown";

const ORIENTATION_TO_PREFERRED: Record<
  OrientationFromSpec,
  PreferredOrientation[]
> = {
  horizontal: [PreferredOrientation.horizontal],
  vertical: [PreferredOrientation.vertical],
  unknown: [
    PreferredOrientation.horizontal,
    PreferredOrientation.vertical,
    PreferredOrientation.horizontalInverted,
  ],
};

type SurfaceLabel = (typeof semanticLabels.labels)[number]["label"] | "any";

const ALLOWED_ORIENTATIONS_BY_SURFACE_LABEL: Record<
  SurfaceLabel,
  PreferredOrientation[]
> = Object.fromEntries(
  semanticLabels.labels.map(({ label, orientation }) => [
    label,
    ORIENTATION_TO_PREFERRED[orientation as OrientationFromSpec],
  ]),
) as Record<SurfaceLabel, PreferredOrientation[]>;

/** Ceiling uses horizontalInverted (objects placed upside-down on ceiling). */
ALLOWED_ORIENTATIONS_BY_SURFACE_LABEL.ceiling = [
  PreferredOrientation.horizontalInverted,
];

/** App-specific fallback for unlabeled surfaces. */
ALLOWED_ORIENTATIONS_BY_SURFACE_LABEL.any = [
  PreferredOrientation.horizontal,
  PreferredOrientation.vertical,
  PreferredOrientation.horizontalInverted,
];

/** Type guard for valid surface labels from the semantic spec. */
function isSurfaceLabel(label: string): label is SurfaceLabel {
  return label in ALLOWED_ORIENTATIONS_BY_SURFACE_LABEL;
}

/**
 * Checks whether a plane with the given orientation is allowed for placement on the given surface label.
 * @param orientation - Preferred orientation (horizontal, vertical, or horizontal-inverted).
 * @param surfaceLabel - Semantic surface label (e.g. desk, floor, wall, ceiling).
 * @returns True if placement is allowed.
 */
export function isPlaneAllowedForPlacement(
  orientation: PreferredOrientation | string | undefined,
  surfaceLabel: string | undefined,
): boolean {
  if (!orientation) return false;
  const normalizedLabel =
    surfaceLabel && isSurfaceLabel(surfaceLabel) ? surfaceLabel : "any";
  const allowedOrientations =
    ALLOWED_ORIENTATIONS_BY_SURFACE_LABEL[normalizedLabel];
  return (allowedOrientations as readonly string[]).includes(orientation);
}
