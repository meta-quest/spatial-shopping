/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** Immutable cart product snapshot containing id, quantity, and price. */
export interface CartProductSummary {
  readonly id: string;
  readonly quantity: number;
  readonly price: string;
}

/** Immutable cart snapshot with the session id and per-product summaries. */
export interface CartChangeData {
  readonly sessionId: string;
  readonly products: Readonly<Record<string, CartProductSummary>>;
}

/** Cart snapshot sent after an explicit add-to-cart action. */
export interface CartProductAddedData extends CartChangeData {
  /** The product that was just added, with its updated cart quantity. */
  readonly addedProduct: CartProductSummary;
  /**
   * Token identifying this add. Pass it to `ARViewer.onAddToCartSuccess(addId)`
   * or `ARViewer.onAddToCartFailure(reason, addId)` to resolve exactly this add;
   * each add resolves at most once.
   */
  readonly addId: string;
}
