/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Entity } from "@iwsdk/core";
import { describe, expect, it, vi } from "vitest";

import type { ProductData, ProductVariation } from "../../types/ProductData";
import type { SceneManager } from "../scene/SceneManager";
import { VariantManager } from "./VariantManager";
import { ViewerProductManager } from "./ViewerProductManager";

function createProduct(): ProductData {
  return {
    id: "chair",
    metadata: { title: "Chair", price: "$10.00" },
    assets: { thumbnailUrl: "" },
    xr: {
      assetUrl: "/chair.glb",
      initialScale: 1,
      orientation: "horizontal",
      materialAdjustments: { roughness: 0.5 },
    },
  };
}

function createVariant(
  id: string,
  xr: ProductVariation["xr"],
  withMaterialSet = false,
): ProductVariation {
  return {
    id,
    attributes: { color: id },
    xr,
    materialSet: withMaterialSet
      ? [
          {
            materialName: "target",
            texturePack: {
              diffuse: `${id}.png`,
              metallicRoughness: `${id}-mr.png`,
              normal: `${id}-normal.png`,
              repeat: [1, 1],
            },
          },
        ]
      : undefined,
  };
}

function createManager(sceneManager: SceneManager): {
  manager: VariantManager;
  products: ViewerProductManager;
} {
  const products = new ViewerProductManager();
  products.setProduct(createProduct());
  const manager = new VariantManager();
  manager.viewerProductManager = products;
  manager.sceneManager = sceneManager;
  return { manager, products };
}

describe("VariantManager", () => {
  it("merges every variant against the immutable base XR configuration", async () => {
    const entity = { object3D: {} } as unknown as Entity;
    const applyMaterialAdjustments = vi.fn();
    const sceneManager = {
      currentProduct: { entity },
      applyMaterialSet: vi.fn(),
      applyMaterialAdjustments,
    } as unknown as SceneManager;
    const { manager, products } = createManager(sceneManager);

    await manager.handleVariantSelected(
      createVariant("large", {
        initialScale: 2,
        orientation: "vertical",
        materialAdjustments: { roughness: 1 },
      }),
    );
    await manager.handleVariantSelected(
      createVariant("base-size", { orientation: "horizontal" }),
    );

    expect(products.getCurrentProduct()?.xr).toEqual({
      assetUrl: "/chair.glb",
      initialScale: 1,
      orientation: "horizontal",
      materialAdjustments: { roughness: 0.5 },
    });
    expect(applyMaterialAdjustments).toHaveBeenLastCalledWith(entity.object3D, {
      roughness: 0.5,
    });
    expect(products.getCurrentProduct()?.selectedVariationId).toBe("base-size");
  });

  it("allows only the latest asynchronous selection to commit", async () => {
    const entity = { object3D: {} } as unknown as Entity;
    const pending: Array<{
      shouldCommit: () => boolean;
      resolve: (committed: boolean) => void;
    }> = [];
    const applyMaterialSet = vi.fn(
      (
        _entity: Entity,
        _materialSet: ProductVariation["materialSet"],
        _baseAssetUrl: string,
        shouldCommit: () => boolean,
      ) =>
        new Promise<boolean>((resolve) => {
          pending.push({ shouldCommit, resolve });
        }),
    );
    const sceneManager = {
      currentProduct: { entity },
      applyMaterialSet,
      applyMaterialAdjustments: vi.fn(),
    } as unknown as SceneManager;
    const { manager, products } = createManager(sceneManager);

    const first = manager.handleVariantSelected(
      createVariant("first", { initialScale: 2 }, true),
    );
    const second = manager.handleVariantSelected(
      createVariant("second", { initialScale: 3 }, true),
    );

    pending[1].resolve(pending[1].shouldCommit());
    await expect(second).resolves.toBe(true);
    pending[0].resolve(pending[0].shouldCommit());
    await expect(first).resolves.toBe(false);

    expect(products.getCurrentProduct()?.selectedVariationId).toBe("second");
    expect(products.getCurrentProduct()?.xr.initialScale).toBe(3);
  });
});
