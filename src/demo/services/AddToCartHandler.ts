/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CartProductAddedData } from "../../framework/managers/session/CartChangeData.js";
import { AddToCartFailureReason } from "../../framework/managers/session/AddToCartFailureReason.js";
import type { ARViewer } from "../../framework/ARViewer.js";

/**
 * Creates a callback suitable for ARViewer.setCartProductAddedCallback.
 * Checks connection first; on failure reports onAddToCartFailure(reason, addId),
 * otherwise simulates the add and calls onAddToCartSuccess(addId).
 *
 * @param sdk - ARViewer instance (for onAddToCartFailure / onAddToCartSuccess)
 * @param checkConnection - async function that returns true if network is available
 */
export function createExampleAddToCartHandler(
  sdk: ARViewer,
  checkConnection: () => Promise<boolean>,
): (cartData: CartProductAddedData) => Promise<void> {
  return async (cartData: CartProductAddedData): Promise<void> => {
    const hasInternet = await checkConnection();
    if (!hasInternet) {
      sdk.onAddToCartFailure(
        AddToCartFailureReason.NetworkConnection,
        cartData.addId,
      );
      return;
    }

    sdk.onAddToCartSuccess(cartData.addId);
  };
}
