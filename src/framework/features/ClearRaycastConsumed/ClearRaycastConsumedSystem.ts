/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem } from "@iwsdk/core";
import { RaycastUtils } from "../../utils/RaycastUtils.js";

export class ClearRaycastConsumedSystem extends createSystem({}) {
  override update() {
    RaycastUtils.WasRaycastConsumed = false;
  }
}
