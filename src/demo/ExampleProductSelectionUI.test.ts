/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from "vitest";

import type { ProductData } from "../framework/types/ProductData";
import {
  ExampleProductSelectionUI,
  type ARAvailability,
} from "./ExampleProductSelectionUI";

type ProductCardFactory = {
  createProductCard(product: ProductData): HTMLElement;
};

const createProduct = (
  title: string,
  thumbnailUrl = "https://example.com/product.png",
): ProductData => ({
  id: "product-1",
  metadata: {
    title,
    price: "$49.00",
    rating: { score: 4.5, count: 12 },
  },
  assets: { thumbnailUrl },
  xr: { assetUrl: "" },
});

const renderCard = (
  product: ProductData,
  availability: ARAvailability = "ready",
): HTMLElement => {
  const ui = new ExampleProductSelectionUI(vi.fn());
  ui.setARAvailability(availability);
  return (ui as unknown as ProductCardFactory).createProductCard(product);
};

describe("ExampleProductSelectionUI product cards", () => {
  it("treats vendor titles as text when building accessible labels", () => {
    const title = '"><img data-injected="true">';
    const card = renderCard(createProduct(title));

    expect(card.querySelector("[data-injected]")).toBeNull();
    expect(card.querySelector("h2")?.textContent).toBe(title);
    expect(card.querySelector(".view-ar-btn")?.getAttribute("aria-label")).toBe(
      `View ${title} in AR`,
    );
  });

  it("uses the bundled fallback when a thumbnail cannot load", () => {
    const card = renderCard(createProduct("Chair"));
    const thumbnail =
      card.querySelector<HTMLImageElement>(".product-thumbnail")!;

    thumbnail.dispatchEvent(new Event("error"));

    expect(thumbnail.getAttribute("src")).toBe("imgs/cube-3d-icon.png");
  });

  it("uses the bundled fallback when no thumbnail URL is provided", () => {
    const card = renderCard(createProduct("Chair", ""));

    expect(
      card
        .querySelector<HTMLImageElement>(".product-thumbnail")
        ?.getAttribute("src"),
    ).toBe("imgs/cube-3d-icon.png");
  });

  it("inherits the dark button's light foreground for its AR icon", () => {
    const card = renderCard(createProduct("Chair"));
    const icon = card.querySelector(".view-ar-btn .ar-btn-icon");

    expect(icon?.tagName.toLowerCase()).toBe("svg");
    expect(icon?.getAttribute("stroke")).toBe("currentColor");
    expect(icon?.querySelector("path")).not.toBeNull();
  });

  it("keeps the AR button disabled until the viewer is ready", () => {
    const card = renderCard(createProduct("Chair"), "loading");
    const button = card.querySelector<HTMLButtonElement>(".view-ar-btn")!;

    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe("Preparing AR...");
  });

  it("exposes the rating as a single labelled image", () => {
    const card = renderCard(createProduct("Chair"));
    const rating = card.querySelector(".rating-section");

    expect(rating?.getAttribute("role")).toBe("img");
    expect(rating?.getAttribute("aria-label")).toBe(
      "Rated 4.5 out of 5, 12 reviews",
    );
    expect(
      card.querySelector(".rating-stars")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("omits the rating and price rows when data is missing", () => {
    const product = createProduct("Chair");
    product.metadata.rating = undefined;
    product.metadata.price = "";
    const card = renderCard(product);

    expect(card.querySelector(".rating-section")).toBeNull();
    expect(card.querySelector(".price")).toBeNull();
  });

  it("keeps the decorative AR badge out of the tab order", () => {
    const card = renderCard(createProduct("Chair"));

    expect(card.querySelectorAll("button")).toHaveLength(1);
    expect(card.querySelector(".ar-icon")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
