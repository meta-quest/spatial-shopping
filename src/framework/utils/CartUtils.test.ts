/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from "vitest";

import type { CartProductSummary } from "../managers/session/CartChangeData";
import {
  calculateCartTotals,
  calculateCartTotalsFromEntries,
} from "./CartUtils";

function product(
  id: string,
  quantity: number,
  price: string,
): CartProductSummary {
  return { id, quantity, price };
}

describe("calculateCartTotals", () => {
  it("returns dollar-denominated zero totals for an empty cart", () => {
    expect(calculateCartTotals({})).toEqual({
      totalItems: 0,
      totalPrice: 0,
      currencySymbol: "$",
      formattedTotal: "$0.00",
    });
  });

  it("applies quantities and parses comma-separated prices", () => {
    const totals = calculateCartTotals({
      chair: product("chair", 2, "$1,299.50"),
      lamp: product("lamp", 3, "$10.00"),
    });

    expect(totals).toEqual({
      totalItems: 5,
      totalPrice: 2629,
      currencySymbol: "$",
      formattedTotal: "$2,629.00",
    });
  });

  it("preserves an alternate currency symbol", () => {
    expect(calculateCartTotals({ lamp: product("lamp", 2, "€12.50") })).toEqual(
      {
        totalItems: 2,
        totalPrice: 25,
        currencySymbol: "€",
        formattedTotal: "€25.00",
      },
    );
  });

  it("counts products but ignores malformed and missing prices", () => {
    const products = {
      valid: product("valid", 1, "$10.00"),
      malformed: product("malformed", 2, "not available"),
      missing: {
        id: "missing",
        quantity: 3,
        price: undefined,
      } as unknown as CartProductSummary,
    };

    expect(calculateCartTotals(products)).toEqual({
      totalItems: 6,
      totalPrice: 10,
      currencySymbol: "$",
      formattedTotal: "$10.00",
    });
  });
});

describe("calculateCartTotalsFromEntries", () => {
  it("adapts entry records before calculating totals", () => {
    expect(
      calculateCartTotalsFromEntries({
        desk: { quantity: 2, price: "$250.00" },
        shelf: { quantity: 1, price: "$49.95" },
      }),
    ).toEqual({
      totalItems: 3,
      totalPrice: 549.95,
      currencySymbol: "$",
      formattedTotal: "$549.95",
    });
  });
});
