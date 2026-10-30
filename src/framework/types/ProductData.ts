/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CartEntryData } from "../managers/session/AddToCartData";

/**
 * Measurement value with unit
 * Matches vendor API structure
 */
export interface Measurement {
  /** Formatted display string (e.g., "29.5\"", "48 lbs") */
  displayValue: string;
  /** Unit identifier (e.g., "inches", "centimeters", "pounds", "kilograms") */
  unit: string;
  /** Numeric value for calculations (e.g., 29.5, 48) */
  value: number;
}

/**
 * Product dimensions structure
 */
export interface Dimensions {
  /** Length dimension (depth/front-to-back) */
  length?: Measurement;
  /** Width dimension (left-to-right) */
  width?: Measurement;
  /** Height dimension (top-to-bottom) */
  height?: Measurement;
  /** Weight measurement */
  weight?: Measurement;
}

/** Product data structure for viewer display and XR placement */
export interface ProductData {
  /** Unique identifier for the product */
  id: string;

  /** Product Metadata for UI display */
  metadata: {
    title: string;
    description?: string;
    features?: string[];
    price: string;
    /** Structured dimensions with numeric values and units */
    dimensions?: Dimensions;
    rating?: { score: number; count: number };
    manufacturer?: string;
  };

  /** Visual assets for the 2D UI */
  assets: {
    thumbnailUrl: string;
    imageUrls?: string[];
  };

  /** 3D Asset Configuration (maps to XRMetadata) */
  xr: XRData;

  /** Available variations */
  variations?: ProductVariation[];

  /** Currently selected variation ID */
  selectedVariationId?: string;
}

/** 3D asset configuration for XR placement and rendering */
export interface XRData {
  /** URL to the GLB/GLTF asset */
  assetUrl: string;
  /** Uniform scale or [x, y, z] per-axis scale */
  initialScale?: number | [number, number, number];
  /** [x, y, z] position offset */
  initialPosition?: [number, number, number];
  /** [x, y, z] Euler rotation in radians */
  initialRotation?: [number, number, number];
  /** Preferred placement surface */
  preferredPlacement?: "floor" | "wall" | "table" | "ceiling" | "any";
  /** Surface orientation for snapping (e.g. horizontal for floor/table placement) */
  orientation?: "horizontal" | "vertical" | "inverted-horizontal";
  /** Per-material property overrides (e.g. color, roughness) */
  materialAdjustments?: Record<string, unknown>;
}

/** Product variation (e.g. color, size) with optional overrides */
export interface ProductVariation {
  id: string;
  /** Attribute key-value pairs (e.g. { color: "Red" }) */
  attributes: Record<string, string | undefined>;
  thumbnailUrl?: string;
  price?: string;
  /** Override 3D config when this variation differs from base */
  xr?: Partial<XRData>;
  materialSet?: MaterialSet[];
  inStock?: boolean;
  /** Whether this is the default/primary variation */
  isDefault?: boolean;
}

/**
 * Texture pack configuration for material swaps
 */
export interface TexturePack {
  /** Diffuse/base color texture URL */
  diffuse: string;
  /** Combined metallic-roughness texture URL (glTF standard) */
  metallicRoughness: string;
  /** Ambient occlusion texture URL (red channel) */
  occlusion?: string;
  /** Normal map texture URL */
  normal: string;
  /** Texture tiling values [u, v] */
  repeat: [number, number];
}

/**
 * Material swap configuration for scene objects
 * We use materialSwap to achieve visual variety without re-downloading the entire 3D mesh.
 */
export interface MaterialSet {
  /** Name of the material to swap (e.g. "Leather"). All meshes using this material are updated. */
  materialName: string;
  /** Texture pack configuration for the material */
  texturePack: TexturePack;
}

/** Map of resource URLs or filenames to preloaded buffer/blob data (e.g. for glTF external buffers/textures). */
export type ResourceMap = Record<string, ArrayBuffer | Blob>;

/**
 * Returns display information for a product, taking into account the selected variation.
 * If a variation is selected, returns the variant-specific data (id, price, assetUrl)
 * while preserving the main product's title and rating.
 * @param product - The product data
 * @returns Display information object with id, title, price, rating, and assetUrl
 */
export function getProductDisplayInfo(product: ProductData): CartEntryData {
  const selectedVariation = product.selectedVariationId
    ? product.variations?.find((v) => v.id === product.selectedVariationId)
    : undefined;

  const subtitle = selectedVariation?.attributes
    ? Object.values(selectedVariation.attributes).find((v) => v !== undefined)
    : undefined;

  return new CartEntryData({
    id: selectedVariation?.id ?? product.id,
    title: product.metadata.title,
    subtitle: subtitle,
    price: selectedVariation?.price ?? product.metadata.price,
    rating: product.metadata.rating,
    assetUrl: selectedVariation?.thumbnailUrl ?? product.assets.thumbnailUrl,
    quantity: 1,
  });
}
