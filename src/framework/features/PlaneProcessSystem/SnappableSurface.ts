/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from "@iwsdk/core";

/** Component marking an XR plane as snappable for placement. intersectionDistance defaults to 10000 to avoid false positives. */
export const SnappableSurface = createComponent("SnappableSurface", {
  intersected: { type: Types.Boolean, default: false },
  intersectionPoint: { type: Types.Vec3, default: [0, 0, 0] },
  intersectionDistance: { type: Types.Float32, default: 10000.0 },
});
