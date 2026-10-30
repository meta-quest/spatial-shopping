/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { World } from "@iwsdk/core";
import { disposeWorld } from "./WorldInitializer.js";
import type { SessionManager } from "../session/SessionManager.js";
import type { XrInputManager } from "../input/xrInputManager.js";
import type { SceneManager } from "../scene/SceneManager.js";
import type { UIManager } from "../ui/UIManager.js";
import type { CartManager } from "../session/CartManager.js";
import type { SceneOpener } from "./SceneOpener.js";
import type { ViewerProductManager } from "../product/ViewerProductManager.js";
import type { VariantManager } from "../product/VariantManager.js";

export class InternalHolder {
  public sessionManager!: SessionManager;
  public world!: World;
  public sceneContainerElement?: HTMLDivElement;
  public sceneContainerOwnedBySdk: boolean = false;
  public loadingOverlayElement: HTMLDivElement | null = null;
  public XrInputManager!: XrInputManager;
  public sceneManager!: SceneManager;
  public uiManager!: UIManager;
  public cartManager!: CartManager;
  public sceneOpener!: SceneOpener;
  public viewerProductManager!: ViewerProductManager;
  public variantManager!: VariantManager;

  /** Disposes resources: removes loading overlay and scene container from DOM, then disposes session manager. */
  public dispose(): void {
    if (this.world) disposeWorld(this.world);

    if (this.loadingOverlayElement?.parentNode) {
      this.loadingOverlayElement.remove();
    }
    if (
      this.sceneContainerOwnedBySdk &&
      this.sceneContainerElement?.parentNode
    ) {
      this.sceneContainerElement.remove();
    }
    this.sessionManager?.dispose();
  }
}
