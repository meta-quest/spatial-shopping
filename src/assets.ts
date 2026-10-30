/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from "@iwsdk/core";

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/, "")}`;

export const UI_ASSET_URLS = {
  bottomControlPanel: publicAssetUrl("ui/xrBottomControlPanel.uikitml"),
  cartDataPanel: publicAssetUrl("ui/xrCartDataPanel.uikitml"),
  confirmationPanel: publicAssetUrl("ui/xrConfirmationPanel.uikitml"),
  logMessage: publicAssetUrl("ui/xrLogMessage.uikitml"),
  productPanel: publicAssetUrl("ui/xrProductPanel.uikitml"),
  tooltip: publicAssetUrl("ui/xrTooltip.uikitml"),
  variantSelector: publicAssetUrl("ui/xrVariantSelector.uikitml"),
  wrongSurfaceNotifier: publicAssetUrl("ui/xrWrongSurfaceNotifier.uikitml"),
} as const;

export default defineAssets({
  "3dUI/Arrow_basic.glb": {
    name: "Move Arrow",
    url: publicAssetUrl("3dUI/Arrow_basic.glb"),
    type: AssetType.GLTF,
    priority: "critical",
  },
  "3dUI/Arrow_Rotate_v3.glb": {
    name: "Rotation Arrow",
    url: publicAssetUrl("3dUI/Arrow_Rotate_v3.glb"),
    type: AssetType.GLTF,
    priority: "critical",
  },
  // Background priority keeps the 1K HDR off World.create's critical path.
  // The IBLTexture component resolves this key to the in-flight load, so
  // lighting switches to the HDR as soon as it finishes.
  poly_haven_studio_1k: {
    name: "Poly Haven Studio",
    url: publicAssetUrl("hdr/poly_haven_studio_1k.hdr"),
    type: AssetType.HDRTexture,
    priority: "background",
  },
  "ui/xrBottomControlPanel.uikitml": {
    name: "Bottom Control Panel",
    url: UI_ASSET_URLS.bottomControlPanel,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrCartDataPanel.uikitml": {
    name: "Cart Data Panel",
    url: UI_ASSET_URLS.cartDataPanel,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrConfirmationPanel.uikitml": {
    name: "Confirmation Panel",
    url: UI_ASSET_URLS.confirmationPanel,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrLogMessage.uikitml": {
    name: "Log Message",
    url: UI_ASSET_URLS.logMessage,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrProductPanel.uikitml": {
    name: "Product Panel",
    url: UI_ASSET_URLS.productPanel,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrTooltip.uikitml": {
    name: "Tooltip",
    url: UI_ASSET_URLS.tooltip,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrVariantSelector.uikitml": {
    name: "Variant Selector",
    url: UI_ASSET_URLS.variantSelector,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
  "ui/xrWrongSurfaceNotifier.uikitml": {
    name: "Wrong Surface Notifier",
    url: UI_ASSET_URLS.wrongSurfaceNotifier,
    type: AssetType.UIKitML,
    priority: "lazy",
  },
});
