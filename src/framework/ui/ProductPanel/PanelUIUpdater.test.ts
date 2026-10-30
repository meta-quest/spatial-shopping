/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { UIKitDocument } from "@iwsdk/core";
import { describe, expect, it, vi } from "vitest";
import type { ProductData } from "../../types/ProductData.js";
import { clampProductTitle, PanelUIUpdater } from "./PanelUIUpdater.js";

describe("PanelUIUpdater", () => {
  it("keeps portrait product images inside the fixed image frame", () => {
    const image = { setProperties: vi.fn() };
    const textElement = { setProperties: vi.fn() };
    const document = {
      getElementById: vi.fn((id: string) =>
        id === "product-image" ? image : textElement,
      ),
    } as unknown as UIKitDocument;
    const product = {
      id: "plant",
      metadata: { title: "Plant", price: "$10" },
      assets: { thumbnailUrl: "plant-portrait.png" },
      xr: { assetUrl: "plant.glb" },
    } satisfies ProductData;

    new PanelUIUpdater(document).updateProductInfo(product);

    expect(image.setProperties).toHaveBeenCalledWith({
      src: "plant-portrait.png",
      width: "auto",
      height: "100%",
      keepAspectRatio: true,
    });
  });
});

describe("clampProductTitle", () => {
  it("normalizes whitespace without changing short titles", () => {
    expect(clampProductTitle("  Modern\n  lounge   chair ")).toBe(
      "Modern lounge chair",
    );
  });

  it("clamps long titles on a word boundary", () => {
    const title = clampProductTitle(
      "Rivet Black and White Abstract Canvas Print Wall Art for the Living Room",
    );

    expect(title.length).toBeLessThanOrEqual(42);
    expect(title).toMatch(/\.\.\.$/);
  });
});
