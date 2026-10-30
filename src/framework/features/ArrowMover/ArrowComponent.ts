/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from "@iwsdk/core";

export enum ArrowState {
  IDLE = "IDLE",
  HOVERED = "HOVERED",
  PRESSED = "PRESSED",
}

export const ArrowComponent = createComponent("ArrowComponent", {
  currentState: { type: Types.String, default: ArrowState.IDLE },
  previousState: { type: Types.String, default: ArrowState.IDLE },
  stateMachine: { type: Types.Object, default: null },
  baseScale: { type: Types.Float32, default: 1 },
});
