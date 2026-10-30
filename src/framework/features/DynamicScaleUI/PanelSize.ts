/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from "@iwsdk/core";

/** Target world-space bounds used to size an intrinsic UIKitML document. */
export const PanelSize = createComponent("PanelSize", {
  maxWidth: { type: Types.Float32, default: 1 },
  maxHeight: { type: Types.Float32, default: 1 },
});
