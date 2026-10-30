/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Build-time debug flags.
 *
 * Values come from the Vite `define` blocks in `vite.config.ts` and
 * `vite.sdk.config.ts`, driven by the `DEBUG_MODE` environment variable:
 * - unset: logs off, gizmos off
 * - `LOGS`: 3D logs on
 * - `GIZMOS`: debug gizmos on
 * - `FULL`: both on
 *
 * Production builds always disable both flags.
 */
export class StaticGlobalConfigs {
  /** Master switch for 3D viewer logs (spatial logger, hierarchy logs, etc.). */
  static readonly ENABLE_LOGS_3D: boolean =
    typeof __ENABLE_LOGS_3D__ !== "undefined" && __ENABLE_LOGS_3D__;

  /** Enables debug gizmos (spheres, boxes, lines, arrows for visual debugging). */
  static readonly ENABLE_DEBUG_GIZMOS: boolean =
    typeof __ENABLE_DEBUG_GIZMOS__ !== "undefined" && __ENABLE_DEBUG_GIZMOS__;
}
