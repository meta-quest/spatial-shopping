/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  Entity,
  UIKitDocument,
  RayInteractable,
  type System,
  type World,
} from "@iwsdk/core";
import type { SystemConstructor, SystemQueries, SystemSchema } from "elics";
import { PanelAnimationManager } from "../managers/ui/PanelAnimationManager.js";
import { UIManager } from "../managers/ui/UIManager.js";

const NOOP_UIKIT_UPDATE = (): void => {};

/** Per-entity visibility flags backing a panel state component. */
export interface PanelVisibilityState {
  isVisible: { [entityIndex: number]: number };
}

/** Options for panel initialization */
export interface PanelInitOptions {
  renderOrder?: number;
}

/**
 * Factory function to create a panel system base class with the given queries.
 * Subclasses define their own ECS queries while inheriting common panel functionality.
 */
export function createBasePanelSystem<Q extends SystemQueries>(queries: Q) {
  /**
   * Abstract base class for panel systems.
   * Provides: show/hide animations, state management, dependency injection.
   */
  abstract class BasePanelSystem<TUIUpdater> extends createSystem(queries) {
    protected panelEntity: Entity | null = null;
    protected uiUpdater: TUIUpdater | null = null;
    protected animator: PanelAnimationManager | null = null;
    public uiManager!: UIManager | null;
    protected onVisibilityChangedCallback:
      ((isVisible: boolean) => void) | null = null;
    private resolveReady: (() => void) | null = null;
    private readonly readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    private panelDocument: UIKitDocument | null = null;
    private panelRootUpdate: ((deltaMilliseconds: number) => void) | null =
      null;

    /** Abstract methods - must be implemented by subclasses */
    abstract override init(): void;
    abstract createUIUpdater(document: UIKitDocument): TUIUpdater;
    abstract setupButtonListeners(entity: Entity): void;
    abstract getPanelState(): PanelVisibilityState;

    /** Set callback for visibility changes */
    public setOnVisibilityChanged(callback: (isVisible: boolean) => void) {
      this.onVisibilityChangedCallback = callback;
    }

    /** Initialize panel entity. Call in query "qualify" subscription. */
    protected initializePanelEntity(
      entity: Entity,
      document: UIKitDocument,
      options?: PanelInitOptions,
    ) {
      this.panelEntity = entity;
      this.panelDocument = document;
      const root = document.rootElement as {
        update?: (deltaMilliseconds: number) => void;
      };
      this.panelRootUpdate = root.update ?? null;
      this.uiUpdater = this.createUIUpdater(document);
      this.initializeAnimator(entity, options?.renderOrder);
      this.setupButtonListeners(entity);
      this.suspendPanelDocument();
      this.resolveReady?.();
      this.resolveReady = null;
    }

    /** Resolves once the PanelDocument has loaded and the system is usable. */
    public whenReady(): Promise<void> {
      return this.readyPromise;
    }

    /** Initialize animator with entity's object3D and optional render order */
    protected initializeAnimator(entity: Entity, renderOrder?: number) {
      this.animator = new PanelAnimationManager(this.uiManager!.uiTweenGroup);

      if (entity.object3D) {
        this.animator.setObject3D(entity.object3D);
        this.animator.setOpacity(0);
        if (renderOrder !== undefined) {
          this.animator.setRenderOrder(renderOrder);
        }
        entity.object3D.visible = false;
        entity.removeComponent(RayInteractable);
      }
    }

    /** Show panel with fade in animation */
    public showPanel() {
      if (!this.panelEntity || !this.animator) return;
      if (this.isPanelVisible()) {
        return;
      }

      const state = this.getPanelState();
      state.isVisible[this.panelEntity!.index] = 1;

      this.resumePanelDocument();
      this.panelEntity!.object3D!.visible = true;
      this.panelEntity!.addComponent(RayInteractable);
      this.animator!.fadeIn();
      this.onVisibilityChangedCallback?.(true);
    }

    /** Hide panel with fade out animation */
    public hidePanel() {
      if (!this.panelEntity || !this.animator) return;
      if (!this.isPanelVisible()) return;
      const state = this.getPanelState();
      state.isVisible[this.panelEntity!.index] = 0;
      this.animator!.fadeOut({}, () => this.applyHiddenStateToEntity());
    }

    /** Force hide panel without animation */
    public forceHidePanel() {
      if (!this.panelEntity) return;
      const state = this.getPanelState();
      state.isVisible[this.panelEntity!.index] = 0;
      this.applyHiddenStateToEntity();
    }

    /** Apply hidden state: hide object3D, remove RayInteractable, notify callback */
    private applyHiddenStateToEntity() {
      if (!this.panelEntity?.object3D) return;
      this.panelEntity.object3D.visible = false;
      this.panelEntity.removeComponent(RayInteractable);
      this.suspendPanelDocument();
      this.onVisibilityChangedCallback?.(false);
    }

    private suspendPanelDocument(): void {
      const entityObject = this.panelEntity?.object3D;
      const document = this.panelDocument;
      if (!entityObject || !document) return;
      const root = document.rootElement as {
        update?: (deltaMilliseconds: number) => void;
      };
      if (this.panelRootUpdate) root.update = NOOP_UIKIT_UPDATE;
      if (document.parent === entityObject) entityObject.remove(document);
    }

    private resumePanelDocument(): void {
      const entityObject = this.panelEntity?.object3D;
      const document = this.panelDocument;
      if (!entityObject || !document) return;
      const root = document.rootElement as {
        update?: (deltaMilliseconds: number) => void;
      };
      if (this.panelRootUpdate) root.update = this.panelRootUpdate;
      if (document.parent !== entityObject) entityObject.add(document);
    }

    /** Check if panel is visible */
    public isPanelVisible(): boolean {
      if (!this.panelEntity) return false;
      const state = this.getPanelState();
      return state.isVisible[this.panelEntity.index] === 1;
    }

    /** Get the panel entity */
    public getPanelEntity(): Entity | null {
      return this.panelEntity;
    }
  }

  /** Instance type so subclasses preserve members in .d.ts */
  type PanelSystemInstance<T> = System<SystemSchema, Q> & {
    panelEntity: Entity | null;
    uiUpdater: T | null;
    animator: PanelAnimationManager | null;
    uiManager: UIManager | null;
    onVisibilityChangedCallback: ((isVisible: boolean) => void) | null;
    getPanelState(): PanelVisibilityState;
    whenReady(): Promise<void>;
    setOnVisibilityChanged(callback: (isVisible: boolean) => void): void;
    initializePanelEntity(
      entity: Entity,
      document: UIKitDocument,
      options?: PanelInitOptions,
    ): void;
    showPanel(): void;
    hidePanel(): void;
    forceHidePanel(): void;
    isPanelVisible(): boolean;
    getPanelEntity(): Entity | null;
  };
  /** Abstract constructor for panel systems */
  type PanelSystemConstructor = abstract new <TUIUpdater = unknown>(
    ...args: ConstructorParameters<ElicsSystemCtor>
  ) => PanelSystemInstance<TUIUpdater>;
  /** Elics SystemConstructor cast for World.registerSystem() compatibility */
  type ElicsSystemCtor = SystemConstructor<
    SystemSchema,
    SystemQueries,
    World,
    PanelSystemInstance<unknown>
  >;
  return BasePanelSystem as unknown as PanelSystemConstructor & ElicsSystemCtor;
}

/** Base panel system class type with uiUpdater typed */
export type BasePanelSystemClass<
  Q extends SystemQueries,
  TUIUpdater,
> = InstanceType<ReturnType<typeof createBasePanelSystem<Q>>> & {
  uiUpdater: TUIUpdater;
};
