/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Vendor API Type Definitions
 *
 * TypeScript interfaces for the mock Product Advertisement API service.
 * Based on Amazon PA-API 5.0 data models with XR-specific extensions.
 *
 * @version 1.0
 * @author XR CoE
 */

// ========================================
// Core Data Structures (Section 6.1)
// ========================================

/**
 * Main item/product interface
 * Note: XR/AR 3D asset metadata is NOT included here - use get3DAsset() to retrieve it
 */
export interface Item {
  id: string;
  detailPageURL?: string;
  images?: Images;
  itemInfo?: ItemInfo;
  offers?: Offers;
  browseNodeInfo?: BrowseNodeInfo;
  customerReviews?: CustomerReviews;
  variationIds?: string[]; // Array of IDs for product variations (colors, sizes, etc.)
}

/**
 * Item information (title, features, etc.)
 */
export interface ItemInfo {
  title?: {
    displayValue: string;
  };
  features?: {
    displayValue: string[];
  };
  productInfo?: {
    dimensions?: Dimensions;
    color?: string;
    size?: string;
    manufacturer?: string;
  };
}

/**
 * Image resources
 */
export interface Images {
  primary?: {
    small?: ImageInfo;
    medium?: ImageInfo;
    large?: ImageInfo;
  };
  variants?: ImageInfo[];
}

/**
 * Image information
 */
export interface ImageInfo {
  url: string;
  width: number;
  height: number;
  altText?: string;
}

/**
 * Offer/pricing information
 */
export interface Offers {
  listings?: Listing[];
  summaries?: OfferSummary[];
}

/**
 * Individual listing/offer
 */
export interface Listing {
  id: string;
  price?: Price;
  availability?: Availability;
  merchantInfo?: {
    name: string;
  };
}

/**
 * Price information
 */
export interface Price {
  amount: number; // Price in cents (e.g., 129900 = $1,299.00)
  currency: string; // e.g., "USD"
  displayAmount: string; // e.g., "$1,299.00"
}

/**
 * Availability information
 */
export interface Availability {
  message: string; // e.g., "In Stock"
  type: string; // e.g., "NOW"
}

/**
 * Offer summary
 */
export interface OfferSummary {
  condition: string;
  highestPrice?: Price;
  lowestPrice?: Price;
  offerCount: number;
}

/**
 * Product dimensions
 */
export interface Dimensions {
  height?: Measurement;
  length?: Measurement;
  width?: Measurement;
  weight?: Measurement;
}

/**
 * Measurement value with unit
 */
export interface Measurement {
  displayValue: string; // e.g., "29.5\""
  unit: string; // e.g., "inches"
  value: number; // e.g., 29.5
}

/**
 * Browse node/category information
 */
export interface BrowseNodeInfo {
  browseNodes?: BrowseNode[];
}

/**
 * Browse node/category
 */
export interface BrowseNode {
  id: string;
  displayName: string;
  ancestor?: BrowseNode;
}

/**
 * Customer reviews information
 */
export interface CustomerReviews {
  starRating?: {
    value: number; // e.g., 4.5
  };
  count?: number;
}

/**
 * XR/AR metadata for 3D asset configuration
 */
export interface XRMetadata {
  assetUrl: string; // GLB file URL
  initialPosition?: [number, number, number]; // Starting position [x, y, z]
  initialRotation?: [number, number, number]; // Starting rotation [x, y, z] in radians
  initialScale?: number | [number, number, number]; // Uniform scale or [x, y, z]
  orientation?: "horizontal" | "vertical" | "inverted-horizontal"; // Product orientation
  preferredPlacement?: "floor" | "wall" | "table" | "ceiling" | "any"; // Placement surface hint
  materialAdjustments?: {
    roughness?: number;
    metalness?: number;
    [key: string]: unknown;
  };
}

// ========================================
// Request/Response Models (Section 6.2)
// ========================================

/**
 * Available resource types for selective field retrieval
 * Specify which data fields to include in API responses
 *
 * @example
 * // Minimal request for product listing
 * resources: ["ItemInfo.Title", "Images.Primary.Large", "Offers.Listings"]
 *
 * // Full product details request
 * resources: [
 *   "ItemInfo.Title",
 *   "ItemInfo.Features",
 *   "ItemInfo.ProductInfo",
 *   "Images.Primary",
 *   "Images.Variants",
 *   "Offers.Listings",
 *   "CustomerReviews",
 *   "BrowseNodeInfo"
 * ]
 *
 * // Note: For 3D/XR metadata, use get3DAsset(productId) instead
 */
export type ResourceType =
  // Item Info Resources
  | "ItemInfo.Title" // Product title
  | "ItemInfo.Features" // Bullet points/features list
  | "ItemInfo.ProductInfo" // Dimensions, color, size, manufacturer

  // Image Resources
  | "Images.Primary" // Primary product image (all sizes)
  | "Images.Primary.Small" // Primary image - small size only
  | "Images.Primary.Medium" // Primary image - medium size only
  | "Images.Primary.Large" // Primary image - large size only
  | "Images.Variants" // Additional product images

  // Offer Resources
  | "Offers.Listings" // Price, availability, merchant info
  | "Offers.Summaries" // Price range summaries

  // Additional Resources
  | "CustomerReviews" // Star rating and review count
  | "BrowseNodeInfo" // Category information

  // Convenience: Return all data
  | "All";

// Note: XRMetadata is NOT a resource type for getItems/searchItems
// Use get3DAsset(productId) to retrieve 3D asset metadata

/**
 * SearchItems Operation Request
 */
export interface SearchItemsRequest {
  keywords?: string;
  searchIndex?: string; // e.g., "All", "Furniture"
  itemCount?: number; // Number of items (1-50, default: 10)
  itemPage?: number; // Page number for pagination
  sortBy?: string; // e.g., "Price:LowToHigh", "Featured"
  minPrice?: number; // Minimum price in cents
  maxPrice?: number; // Maximum price in cents
  resources?: ResourceType[]; // Optional: Specify which fields to return (default: minimal set)
}

/**
 * SearchItems Operation Response
 */
export interface SearchItemsResponse {
  searchResult: {
    totalResultCount: number;
    items: Item[];
    searchRefinements?: SearchRefinements;
  };
  errors?: ApiError[];
}

/**
 * Search refinements/facets
 */
export interface SearchRefinements {
  categories?: CategoryRefinement[];
  priceRanges?: PriceRangeRefinement[];
}

/**
 * Category refinement
 */
export interface CategoryRefinement {
  id: string;
  displayName: string;
  count: number;
}

/**
 * Price range refinement
 */
export interface PriceRangeRefinement {
  min: number;
  max: number;
  count: number;
  displayValue: string;
}

/**
 * GetVariations Operation Request
 */
export interface GetVariationsRequest {
  id: string; // Parent product ID
  variationTypes?: string[]; // Optional filter: ["Color", "Size", "Material"]
}

/**
 * GetVariations Operation Response
 */
export interface GetVariationsResponse {
  parentId: string;
  variationDimensions: string[]; // e.g., ["Color", "Size"]
  variations: ProductVariation[];
  errors?: ApiError[];
}

/**
 * Product variation (color, size, material, etc.)
 */
export interface ProductVariation {
  id: string; // Unique ID for this variation
  attributes: {
    color?: string; // e.g., "Black", "Walnut Brown"
    size?: string; // e.g., "Small", "Large", "Queen"
    material?: string; // e.g., "Leather", "Fabric", "Metal"
    style?: string; // e.g., "Modern", "Classic"
    [key: string]: string | undefined; // Allow custom attributes
  };
  thumbnail: {
    url: string;
    width: number;
    height: number;
    altText?: string;
  };
  price: Price;
  availability: {
    inStock: boolean;
    message: string; // e.g., "In Stock", "Out of Stock", "Only 2 left"
    estimatedDelivery?: string; // e.g., "Ships in 1-2 days"
  };
  isDefault?: boolean; // Whether this is the default/primary variation
}

/**
 * API Error
 */
export interface ApiError {
  code: string;
  message: string;
}

// ========================================
// Additional Types for Helper Methods
// ========================================

/**
 * 3D Asset information
 */
export interface Asset3DInfo {
  id: string;
  url: string;
  metadata: XRMetadata;
  fileSize: number;
  format: "glb" | "gltf";
}

/**
 * Mock data structure (as loaded from products.json)
 */
export interface MockData {
  products: {
    [productId: string]: Item; // Product data (without XR metadata or variations)
  };
  variations?: {
    [productId: string]: ProductVariation[]; // Product variations indexed by parent product ID
  };
  xrMetadata?: {
    [productId: string]: XRMetadata; // XR/3D asset metadata indexed by product ID
  };
  categories?: {
    [categoryId: string]: unknown;
  };
}

// ========================================
// Helper Constants
// ========================================

/**
 * Set of all valid resource types for validation
 * Used to validate resource requests in API operations
 */
export const VALID_RESOURCE_TYPES = new Set<string>([
  "ItemInfo.Title",
  "ItemInfo.Features",
  "ItemInfo.ProductInfo",
  "Images.Primary",
  "Images.Primary.Small",
  "Images.Primary.Medium",
  "Images.Primary.Large",
  "Images.Variants",
  "Offers.Listings",
  "Offers.Summaries",
  "CustomerReviews",
  "BrowseNodeInfo",
  "All",
]);

/**
 * Common resource combinations for different use cases
 */
export const ResourcePresets = {
  /**
   * Minimal data for product listing/grid view
   * Returns: ID, title, primary image (large), price
   */
  LISTING: [
    "ItemInfo.Title",
    "Images.Primary.Large",
    "Offers.Listings",
  ] as ResourceType[],

  /**
   * Standard product card data
   * Returns: Title, image, price, rating
   */
  CARD: [
    "ItemInfo.Title",
    "Images.Primary",
    "Offers.Listings",
    "CustomerReviews",
  ] as ResourceType[],

  /**
   * Detailed product view
   * Returns: All product information except XR data
   */
  DETAIL: [
    "ItemInfo.Title",
    "ItemInfo.Features",
    "ItemInfo.ProductInfo",
    "Images.Primary",
    "Images.Variants",
    "Offers.Listings",
    "CustomerReviews",
    "BrowseNodeInfo",
  ] as ResourceType[],

  /**
   * XR/AR view product information
   * Returns: Product data for XR display (use get3DAsset separately for 3D metadata)
   */
  XR_VIEW: [
    "ItemInfo.Title",
    "ItemInfo.Features",
    "ItemInfo.ProductInfo",
    "Images.Primary",
    "Offers.Listings",
    "CustomerReviews",
  ] as ResourceType[],

  /**
   * All available data
   */
  ALL: ["All"] as ResourceType[],
} as const;
