/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CartChangeData } from "./CartChangeData.js";
import { SessionEndReason } from "./SessionEndReason.js";

/** Event emitted when an XR session ends. */
export class SessionEndEvent {
  constructor(
    public readonly sessionId: string,
    public readonly reason: SessionEndReason,
    /** Immutable snapshot of the cart when the session ended. */
    public readonly cartData: CartChangeData,
  ) {}

  /** Returns a string representation of the session end event. */
  toString(): string {
    const productCount = Object.keys(this.cartData.products).length;
    return `SessionEndEvent { sessionId: ${this.sessionId}, reason: ${this.reason}, cartProducts: ${productCount} }`;
  }
}
