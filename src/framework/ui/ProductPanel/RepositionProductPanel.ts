/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from "@iwsdk/core";

/**
 * Component that marks an entity (product panel) for continuous repositioning
 * relative to the unified control rail. The RepositionProductPanelSystem keeps
 * the details card beside the rail as their independent scales change.
 */
export const RepositionProductPanel = createComponent(
  "RepositionProductPanel",
  {
    /** Reference to the unified control bar entity (parent). */
    controlBarEntity: { type: Types.Object, default: undefined },
  },
);
