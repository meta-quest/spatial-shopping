/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Reason for add-to-cart failure. Used when notifying the viewer via onAddToCartFailure().
 */
export enum AddToCartFailureReason {
  NetworkConnection = "networkConnection",
  OutOfStock = "outOfStock",
  AssetUnavailable = "assetUnavailable",
  Other = "other",
}

/** User-facing in-AR error message for each add-to-cart failure reason. */
export const ADD_TO_CART_FAILURE_MESSAGES: Readonly<
  Record<AddToCartFailureReason, string>
> = Object.freeze({
  [AddToCartFailureReason.NetworkConnection]:
    "Can't add product to cart. Please check your internet connection.",
  [AddToCartFailureReason.OutOfStock]:
    "This item is out of stock and can't be added to cart.",
  [AddToCartFailureReason.AssetUnavailable]:
    "Product is temporarily unavailable. Please try again later.",
  [AddToCartFailureReason.Other]:
    "Could not add product to cart. Please try again.",
});
