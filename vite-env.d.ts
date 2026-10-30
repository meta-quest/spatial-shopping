/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_AUTO_LAUNCH_PRODUCT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __ENABLE_LOGS_3D__: boolean;
declare const __ENABLE_DEBUG_GIZMOS__: boolean;
declare const __PRODUCTION__: boolean;

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

declare module "*.vert.glsl?raw" {
  const src: string;
  export default src;
}

declare module "*.frag.glsl?raw" {
  const src: string;
  export default src;
}
