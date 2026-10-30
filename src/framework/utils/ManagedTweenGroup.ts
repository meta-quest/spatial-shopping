/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, Tween } from "@tweenjs/tween.js";

/** Tween group that does no work or allocation while idle and removes completions. */
export class ManagedTweenGroup extends Group {
  private readonly activeTweens = new Set<Tween>();

  constructor() {
    super();
  }

  override add(...tweens: Tween[]): void {
    super.add(...tweens);
    for (const tween of tweens) this.activeTweens.add(tween);
  }

  override remove(...tweens: Tween[]): void {
    super.remove(...tweens);
    for (const tween of tweens) this.activeTweens.delete(tween);
  }

  override removeAll(): void {
    super.removeAll();
    this.activeTweens.clear();
  }

  public get hasActiveTweens(): boolean {
    return this.activeTweens.size > 0;
  }

  public updateActive(time = performance.now()): void {
    if (this.activeTweens.size === 0) return;
    super.update(time, false);
  }
}
