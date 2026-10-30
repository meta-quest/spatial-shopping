/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CartProductSummary } from "../managers/session/CartChangeData.js";

export interface CartTotals {
  totalItems: number;
  totalPrice: number;
  currencySymbol: string;
  formattedTotal: string;
}

/**
 * Calculates cart totals from products with price strings.
 * Parses price strings (e.g., "$1,299.00") and calculates total.
 *
 * @param products - Record of products with id, quantity, and price string
 * @returns Cart totals including formatted total price
 */
export function calculateCartTotals(
  products: Record<string, CartProductSummary>,
): CartTotals {
  const productIds = Object.keys(products);

  if (productIds.length === 0) {
    return {
      totalItems: 0,
      totalPrice: 0,
      currencySymbol: "$",
      formattedTotal: "$0.00",
    };
  }

  let totalItems = 0;
  let totalPrice = 0;
  let currencySymbol = "$";

  productIds.forEach((productId) => {
    const product = products[productId];
    totalItems += product.quantity;

    if (product.price) {
      const priceMatch = product.price.match(/[\d,.]+/);
      if (priceMatch) {
        const numericValue = parseFloat(priceMatch[0].replace(/,/g, ""));
        if (Number.isFinite(numericValue)) {
          totalPrice += numericValue * product.quantity;

          const symbolMatch = product.price.match(/[^\d,.\s]+/);
          if (symbolMatch) {
            currencySymbol = symbolMatch[0];
          }
        }
      }
    }
  });

  const formattedTotal = totalPrice.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    totalItems,
    totalPrice,
    currencySymbol,
    formattedTotal: `${currencySymbol}${formattedTotal}`,
  };
}

/**
 * Calculates cart totals from CartEntryData objects.
 * Compatible with CartManager's internal cart data structure.
 *
 * @param products - Record of CartEntryData products
 * @returns Cart totals including formatted total price
 */
export function calculateCartTotalsFromEntries(
  products: Record<string, { quantity: number; price: string }>,
): CartTotals {
  const mapped: Record<string, CartProductSummary> = Object.fromEntries(
    Object.entries(products).map(([key, entry]) => [
      key,
      { id: key, quantity: entry.quantity, price: entry.price },
    ]),
  );

  return calculateCartTotals(mapped);
}
