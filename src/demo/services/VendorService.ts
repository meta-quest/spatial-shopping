/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * VendorService - Mock Product Advertisement API Service
 *
 * This service simulates a product advertisement API (similar to Amazon PA-API 5.0)
 * for the WebXR Quest application. It provides mock data without requiring actual
 * API credentials or network connectivity.
 *
 * @version 1.0
 * @author XR CoE
 */

import type {
  SearchItemsRequest,
  SearchItemsResponse,
  GetVariationsRequest,
  GetVariationsResponse,
  Item,
  Asset3DInfo,
  MockData,
  ApiError,
  ProductVariation,
  XRMetadata,
} from "./types";

import { VALID_RESOURCE_TYPES } from "./types";

/**
 * VendorService singleton class
 * Provides mock API operations for product data retrieval and management
 */
export class VendorService {
  private static instance: VendorService | null = null;
  private static initPromise: Promise<VendorService> | null = null;

  // Mock data storage - loaded from JSON files
  private mockData: MockData | null = null; // Will hold data from products.json

  // Configuration
  private readonly DEFAULT_ITEM_COUNT = 10;
  private readonly MAX_ITEM_COUNT = 50;
  private readonly MIN_LATENCY_MS = 50;
  private readonly MAX_LATENCY_MS = 200;

  /**
   * Private constructor to enforce singleton pattern
   * Note: Call init() after getting the instance to load mock data
   */
  private constructor() {
    this.mockData = null;
  }

  /**
   * Initializes the service by loading mock data
   * Must be called once before using any API methods
   *
   * **Race-Safe Initialization:**
   * - Multiple simultaneous calls will share the same initialization promise
   * - Prevents duplicate data loading and race conditions
   * - Returns immediately if already initialized or initializing
   *
   * **Current Mock Implementation:**
   * - Loads product data from local JSON file (vendor-products.json)
   * - Validates data structure
   * - Provides offline operation for development/testing
   *
   * **Real API Integration - Possibilities (depends on specific API):**
   * - Authenticate with API using credentials (API keys, OAuth tokens, etc.)
   * - Initialize request signing mechanism if required by the API
   * - Validate API connectivity with a health check or test request
   * - Load API configuration (base URL, region, endpoints, rate limits)
   * - Pre-fetch frequently accessed data (categories, featured products, etc.)
   * - Set up request rate limiter based on API tier/limits
   * - Initialize HTTP client with proper headers, timeouts, and retry logic
   * - Load feature flags or remote configuration from API
   * - Establish secure credential storage/retrieval mechanism
   *
   * @returns Promise that resolves when initialization is complete
   * @throws Error if data loading fails (mock) or authentication fails (real API)
   *
   * @example
   * ```typescript
   * // Initialize once at app startup
   * const service = VendorService.getInstance();
   * await service.init();
   *
   * // Safe to call multiple times - won't reload
   * await service.init(); // Returns immediately
   *
   * // Even safe if called simultaneously
   * await Promise.all([
   *   service.init(),
   *   service.init(),
   *   service.init()
   * ]); // Only loads once
   * ```
   */
  public static async init(): Promise<VendorService> {
    // If already initialized, return immediately

    if (VendorService.initPromise) return VendorService.initPromise;

    VendorService.initPromise = (async () => {
      if (!VendorService.instance) {
        const service = new VendorService();
        try {
          await service.loadMockData();
        } catch (error) {
          // Allow a later init() call to retry from scratch.
          VendorService.initPromise = null;
          throw new Error(
            "Failed to initialize VendorService: " + (error as Error).message,
          );
        }
        VendorService.instance = service;
      }
      return VendorService.instance;
    })();

    return VendorService.initPromise;
  }

  /**
   * Resets the singleton instance (useful for testing)
   * @internal
   */
  public static resetInstance(): void {
    VendorService.instance = null;
    VendorService.initPromise = null;
  }

  /**
   * Loads mock data from vendor-products.json
   *
   * NOTE: This only loads the products section to minimize memory footprint.
   * Variations are loaded on-demand via loadVariationsForProduct() when needed.
   *
   * @private
   * @returns Promise that resolves when data is loaded
   * @throws Error if fetch fails or JSON is invalid
   */
  private async loadMockData(): Promise<void> {
    const response = await fetch("./demo/data/vendor-products.json");

    if (!response.ok) {
      throw new Error(
        `Failed to fetch mock data: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Validate data structure
    if (!data || !data.products || typeof data.products !== "object") {
      throw new Error("Invalid mock data structure: missing products object");
    }

    // Only store products in memory - variations loaded on-demand
    this.mockData = {
      products: data.products,
      // Explicitly NOT loading variations here to save memory
      // They will be fetched on-demand when getVariations() is called
    };
  }

  /**
   * Loads variations for a specific product on-demand
   *
   * This method fetches the JSON file and extracts only the variations for the
   * requested product, avoiding loading all variations into memory.
   *
   * **Real API Implementation:**
   * This would become a separate HTTP request to a variations endpoint like:
   * GET /products/{productId}/variations
   *
   * @param productId - Product ID to load variations for
   * @returns Promise resolving to array of variations for the product
   * @private
   */
  private async loadVariationsForProduct(
    productId: string,
  ): Promise<ProductVariation[]> {
    const response = await fetch("./demo/data/vendor-products.json");

    if (!response.ok) {
      throw new Error(
        `Failed to fetch variations data: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Extract only the variations for this specific product
    const variations = data.variations?.[productId] || [];

    return variations;
  }

  /**
   * Loads XR metadata for a specific product on-demand
   *
   * This method fetches the JSON file and extracts only the XR metadata for the
   * requested product, avoiding loading all XR data into memory during initialization.
   *
   * **Real API Implementation:**
   * This would become a separate HTTP request to a 3D assets endpoint like:
   * GET /products/{productId}/3d-asset or GET /assets/3d/{productId}
   * It could be the case that the 3D asset and Metadata would be different endpoints.
   *
   * @param productId - Product ID to load XR metadata for
   * @returns Promise resolving to XR metadata for the product, or null if not available
   * @private
   */
  private async loadXRMetadataForProduct(
    productId: string,
  ): Promise<XRMetadata | null> {
    const response = await fetch("./demo/data/vendor-products.json");

    if (!response.ok) {
      throw new Error(
        `Failed to fetch XR metadata: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Extract only the XR metadata for this specific product
    const xrMetadata = data.xrMetadata?.[productId] || null;

    return xrMetadata;
  }

  // ========================================
  // API Operations (Section 5)
  // ========================================

  /**
   * Search for products using keywords or categories
   * @param request - Search parameters
   * @returns Promise resolving to search results
   * @throws Error if service not initialized or invalid request
   */
  public async searchItems(
    request: SearchItemsRequest,
  ): Promise<SearchItemsResponse> {
    this.ensureInitialized();

    // Validate request
    if (!request.keywords && !request.searchIndex) {
      throw new Error(
        "SearchItems requires either keywords or searchIndex parameter",
      );
    }

    // Mock implementation. All of this logic will be replaced with the actual API implementation.

    await this.simulateLatency();

    // Get all products as starting point
    let results = this.getAllProducts();

    // Filter by keywords if provided
    if (request.keywords) {
      results = this.filterByKeywords(results, request.keywords);
    }

    // Filter by searchIndex (category) if provided
    if (request.searchIndex && request.searchIndex !== "All") {
      results = this.filterByCategory(results, request.searchIndex);
    }

    // Filter by price range if provided
    if (request.minPrice !== undefined || request.maxPrice !== undefined) {
      results = this.filterByPriceRange(
        results,
        request.minPrice,
        request.maxPrice,
      );
    }

    const totalResultCount = results.length;

    // Apply sorting if specified
    if (request.sortBy) {
      results = this.sortProducts(results, request.sortBy);
    }

    // Apply pagination
    const itemCount = Math.min(
      request.itemCount || this.DEFAULT_ITEM_COUNT,
      this.MAX_ITEM_COUNT,
    );
    const itemPage = request.itemPage || 1;
    const startIndex = (itemPage - 1) * itemCount;
    const endIndex = startIndex + itemCount;
    const paginatedResults = results.slice(startIndex, endIndex);

    // Apply resource filtering if requested
    const items: Item[] = paginatedResults.map((product) => {
      if (request.resources) {
        const { item } = this.filterItemByResources(product, request.resources);
        // Note: In searchItems, we silently ignore resource validation errors
        // to maintain search result consistency
        return item;
      }
      return product;
    });

    return {
      searchResult: {
        totalResultCount,
        items,
      },
    };
  }

  /**
   * Get product variations (colors, sizes, materials, etc.)
   *
   * This method retrieves variations for a given product via ON-DEMAND loading,
   * mimicking real-world APIs where variations are fetched via separate endpoints.
   *
   * **Performance Benefit:** Variations are NOT loaded into memory during init().
   * They are only fetched when this method is called, reducing memory footprint.
   *
   * @param request - Request with parent product ID and optional filters
   * @returns Promise resolving to product variations with dimensions and filtered variations
   * @throws Error if service not initialized or invalid request
   *
   * @example
   * ```typescript
   * const response = await service.getVariations({
   *   id: 'B001234567',
   *   variationTypes: ['Color', 'Material']
   * });
   * ```
   */
  public async getVariations(
    request: GetVariationsRequest,
  ): Promise<GetVariationsResponse> {
    this.ensureInitialized();

    // Validate request
    if (!request.id) {
      throw new Error("GetVariations requires a product ID");
    }

    await this.simulateLatency(200, 500);

    // Validate product exists
    const product = this.getProduct(request.id);
    if (!product) {
      return {
        parentId: request.id,
        variationDimensions: [],
        variations: [],
        errors: [
          {
            code: "ItemNotFound",
            message: `Product with id ${request.id} not found`,
          },
        ],
      };
    }

    // Load variations ON-DEMAND for this specific product only
    // This mimics real APIs where variations are a separate endpoint/request
    const variations = await this.loadVariationsForProduct(request.id);

    // Filter by variationType if specified
    let filteredVariations = variations;
    if (request.variationTypes && request.variationTypes.length > 0) {
      filteredVariations = variations.filter((v) =>
        request.variationTypes!.some(
          (type) => v.attributes[type.toLowerCase()] !== undefined,
        ),
      );
    }

    return {
      parentId: request.id,
      variationDimensions: this.extractVariationDimensions(variations),
      variations: filteredVariations,
    };
  }

  // ========================================
  // Additional API Operations (Section 4.3.7)
  // ========================================

  /**
   * Fetches 3D asset information and metadata for a product
   *
   * This method retrieves XR-specific metadata (asset URL, positioning, orientation, etc.)
   * needed to display the product in AR/VR environments. This data is stored separately
   * from the main product info and only exposed through this dedicated endpoint.
   *
   * **Real API Implementation:**
   * This would typically be a separate endpoint like GET /products/{id}/3d-asset
   * or part of a CDN asset management system.
   *
   * @param productId - Product ID
   * @returns Promise resolving to 3D asset info with XR metadata
   * @throws Error if service not initialized, product not found, or no 3D asset available
   *
   * @example
   * ```typescript
   * const asset = await service.get3DAsset('B001234567');
   * // Load the 3D model
   * const model = await loadGLTFFromURL(asset.url);
   * // Apply XR metadata
   * model.position.set(...asset.metadata.initialPosition);
   * ```
   */
  public async get3DAsset(productId: string): Promise<Asset3DInfo> {
    this.ensureInitialized();

    // Validate request
    if (!productId) {
      throw new Error("get3DAsset requires a product ID");
    }

    await this.simulateLatency(100, 300);

    // Validate product exists
    const product = this.getProduct(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Load XR metadata on-demand
    const xrMetadata = await this.loadXRMetadataForProduct(productId);

    // Validate 3D asset data exists
    if (!xrMetadata) {
      throw new Error(`No 3D asset found for product ${productId}`);
    }

    // Determine file format from URL extension
    const assetUrl = xrMetadata.assetUrl;
    const format: "glb" | "gltf" = assetUrl.endsWith(".gltf") ? "gltf" : "glb";

    // Return asset info with XR metadata
    return {
      id: productId,
      url: assetUrl,
      metadata: xrMetadata,
      fileSize: 0, // Mock service doesn't track file sizes - would come from CDN in real API
      format,
    };
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Validates that mock data is loaded before operations
   * @throws Error if mock data is not initialized
   * @private
   */
  private ensureInitialized(): void {
    if (!this.mockData) {
      throw new Error(
        "VendorService not initialized. Call init() before using API methods.",
      );
    }
  }

  /**
   * Simulates network latency for realistic mock behavior
   * Requirement NFR-001: Response Time < 50ms for mock responses
   * @param minMs - Minimum latency in milliseconds
   * @param maxMs - Maximum latency in milliseconds
   * @returns Promise that resolves after the simulated delay
   */
  private async simulateLatency(
    minMs: number = this.MIN_LATENCY_MS,
    maxMs: number = this.MAX_LATENCY_MS,
  ): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Gets a product from the mock data
   * @param productId - Product ID
   * @returns Product item or undefined
   * @private
   */
  private getProduct(productId: string): Item | undefined {
    if (!this.mockData || !this.mockData.products) {
      return undefined;
    }
    return this.mockData.products[productId];
  }

  /**
   * Gets all products from the mock data
   * @returns Array of all products
   * @private
   */
  private getAllProducts(): Item[] {
    if (!this.mockData || !this.mockData.products) {
      return [];
    }
    return Object.values(this.mockData.products);
  }

  /**
   * Filters products by keyword search
   * Searches in title and features
   * @param products - Array of products to filter
   * @param keywords - Search keywords
   * @returns Filtered products matching keywords
   * @private
   */
  // Note: This method will probably already be implemented in the actual API. So, no need for us to do it here. It will be done in the backend.
  private filterByKeywords(products: Item[], keywords: string): Item[] {
    const lowercaseKeywords = keywords.toLowerCase();

    return products.filter((item) => {
      const title = item.itemInfo?.title?.displayValue?.toLowerCase() || "";
      const features =
        item.itemInfo?.features?.displayValue?.join(" ").toLowerCase() || "";
      return (
        title.includes(lowercaseKeywords) ||
        features.includes(lowercaseKeywords)
      );
    });
  }

  /**
   * Filters products by category (searchIndex)
   * @param products - Array of products to filter
   * @param category - Category name or ID
   * @returns Filtered products in category
   * @private
   */
  // Note: This method will probably already be implemented in the actual API. So, no need for us to do it here. It will be done in the backend.
  private filterByCategory(products: Item[], category: string): Item[] {
    const lowerCategory = category.toLowerCase();

    return products.filter((item) => {
      const browseNodes = item.browseNodeInfo?.browseNodes || [];
      return browseNodes.some(
        (node) =>
          node.id.toLowerCase().includes(lowerCategory) ||
          node.displayName.toLowerCase().includes(lowerCategory),
      );
    });
  }

  /**
   * Filters products by price range
   * @param products - Array of products to filter
   * @param minPrice - Minimum price in cents (optional)
   * @param maxPrice - Maximum price in cents (optional)
   * @returns Filtered products within price range
   * @private
   */
  // Note: This method will probably already be implemented in the actual API. So, no need for us to do it here. It will be done in the backend.
  private filterByPriceRange(
    products: Item[],
    minPrice?: number,
    maxPrice?: number,
  ): Item[] {
    return products.filter((item) => {
      const price = item.offers?.listings?.[0]?.price?.amount;
      if (price === undefined) return false;

      if (minPrice !== undefined && price < minPrice) return false;
      if (maxPrice !== undefined && price > maxPrice) return false;

      return true;
    });
  }

  /**
   * Sorts products based on sort criteria
   * @param products - Array of products to sort
   * @param sortBy - Sort criteria (e.g., "Price:LowToHigh", "Price:HighToLow")
   * @returns Sorted products
   * @private
   */
  // Note: This method will probably already be implemented in the actual API. So, no need for us to do it here. It will be done in the backend.
  private sortProducts(products: Item[], sortBy: string): Item[] {
    const sorted = [...products]; // Create copy to avoid mutating original

    switch (sortBy) {
      case "Price:LowToHigh":
        sorted.sort((a, b) => {
          const priceA = a.offers?.listings?.[0]?.price?.amount || 0;
          const priceB = b.offers?.listings?.[0]?.price?.amount || 0;
          return priceA - priceB;
        });
        break;

      case "Price:HighToLow":
        sorted.sort((a, b) => {
          const priceA = a.offers?.listings?.[0]?.price?.amount || 0;
          const priceB = b.offers?.listings?.[0]?.price?.amount || 0;
          return priceB - priceA;
        });
        break;

      case "CustomerReview":
      case "AvgCustomerReviews":
        sorted.sort((a, b) => {
          const ratingA = a.customerReviews?.starRating?.value || 0;
          const ratingB = b.customerReviews?.starRating?.value || 0;
          return ratingB - ratingA; // Highest rating first
        });
        break;

      case "Relevance":
      case "Featured":
      default:
        // Keep original order (already sorted by relevance in mock)
        break;
    }

    return sorted;
  }

  /**
   * Extract unique variation dimensions from variations array
   *
   * This analyzes all variation attributes to determine what dimensions
   * (Color, Material, Size, etc.) are available for the product.
   *
   * @param variations - Array of product variations
   * @returns Array of dimension names (capitalized and sorted)
   *
   * @example
   * ```typescript
   * // If variations have attributes: { color: 'Black', material: 'Leather' }
   * // Returns: ['Color', 'Material']
   * ```
   */
  private extractVariationDimensions(variations: ProductVariation[]): string[] {
    const dimensions = new Set<string>();
    variations.forEach((v) => {
      Object.keys(v.attributes).forEach((key) => {
        // Capitalize first letter of dimension name
        dimensions.add(key.charAt(0).toUpperCase() + key.slice(1));
      });
    });
    return Array.from(dimensions).sort();
  }

  /**
   * Filters an item based on requested resources
   * @param item - Full internal item data (may include xrMetadata)
   * @param resources - Array of resource types to include
   * @returns Object containing filtered item and any validation errors
   * @private
   */
  // Note: This method will probably already be implemented in the actual API. So, no need for us to do it here. It will be done in the backend.
  private filterItemByResources(
    item: Item,
    resources: string[],
  ): { item: Item; errors: ApiError[] } {
    const errors: ApiError[] = [];

    // If "All" is requested, return complete item
    if (resources.includes("All")) {
      return {
        item,
        errors,
      };
    }

    // Start with base item structure (always include ID)
    const filtered: Item = {
      id: item.id,
    };

    // Always include detailPageURL if it exists
    if (item.detailPageURL) {
      filtered.detailPageURL = item.detailPageURL;
    }

    // Process each requested resource
    for (const resource of resources) {
      // Validate resource type first
      if (!VALID_RESOURCE_TYPES.has(resource)) {
        errors.push({
          code: "InvalidResource",
          message: `Invalid resource type: ${resource}`,
        });
        continue; // Skip processing this invalid resource
      }

      switch (resource) {
        // ItemInfo Resources
        case "ItemInfo.Title":
          if (item.itemInfo?.title) {
            filtered.itemInfo = filtered.itemInfo || {};
            filtered.itemInfo.title = item.itemInfo.title;
          }
          break;

        case "ItemInfo.Features":
          if (item.itemInfo?.features) {
            filtered.itemInfo = filtered.itemInfo || {};
            filtered.itemInfo.features = item.itemInfo.features;
          }
          break;

        case "ItemInfo.ProductInfo":
          if (item.itemInfo?.productInfo) {
            filtered.itemInfo = filtered.itemInfo || {};
            filtered.itemInfo.productInfo = item.itemInfo.productInfo;
          }
          break;

        // Image Resources
        case "Images.Primary":
          if (item.images?.primary) {
            filtered.images = filtered.images || {};
            filtered.images.primary = item.images.primary;
          }
          break;

        case "Images.Primary.Small":
          if (item.images?.primary?.small) {
            filtered.images = filtered.images || {};
            filtered.images.primary = filtered.images.primary || {};
            filtered.images.primary.small = item.images.primary.small;
          }
          break;

        case "Images.Primary.Medium":
          if (item.images?.primary?.medium) {
            filtered.images = filtered.images || {};
            filtered.images.primary = filtered.images.primary || {};
            filtered.images.primary.medium = item.images.primary.medium;
          }
          break;

        case "Images.Primary.Large":
          if (item.images?.primary?.large) {
            filtered.images = filtered.images || {};
            filtered.images.primary = filtered.images.primary || {};
            filtered.images.primary.large = item.images.primary.large;
          }
          break;

        case "Images.Variants":
          if (item.images?.variants) {
            filtered.images = filtered.images || {};
            filtered.images.variants = item.images.variants;
          }
          break;

        // Offer Resources
        case "Offers.Listings":
          if (item.offers?.listings) {
            filtered.offers = filtered.offers || {};
            filtered.offers.listings = item.offers.listings;
          }
          break;

        case "Offers.Summaries":
          if (item.offers?.summaries) {
            filtered.offers = filtered.offers || {};
            filtered.offers.summaries = item.offers.summaries;
          }
          break;

        // Additional Resources
        case "CustomerReviews":
          if (item.customerReviews) {
            filtered.customerReviews = item.customerReviews;
          }
          break;

        case "BrowseNodeInfo":
          if (item.browseNodeInfo) {
            filtered.browseNodeInfo = item.browseNodeInfo;
          }
          break;

        // Note: No default case needed since we validate above
      }
    }

    return { item: filtered, errors };
  }
}
