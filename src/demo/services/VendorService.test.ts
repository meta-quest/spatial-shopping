/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { VendorService } from "./VendorService";
import type {
  SearchItemsRequest,
  GetVariationsRequest,
  MockData,
  ResourceType,
} from "./types";
import { PreferredOrientation } from "../../framework/utils/PlacementUtils";

// Mock data for testing
const mockData: MockData = {
  products: {
    TEST001: {
      id: "TEST001",
      detailPageURL: "https://example.com/dp/TEST001",
      itemInfo: {
        title: { displayValue: "Modern Office Chair" },
        features: {
          displayValue: [
            "Ergonomic design",
            "Adjustable height",
            "Lumbar support",
          ],
        },
        productInfo: {
          color: "Black",
          size: "Standard",
        },
      },
      images: {
        primary: {
          small: {
            url: "https://example.com/chair-small.jpg",
            width: 100,
            height: 100,
          },
          medium: {
            url: "https://example.com/chair-medium.jpg",
            width: 300,
            height: 300,
          },
          large: {
            url: "https://example.com/chair-large.jpg",
            width: 800,
            height: 800,
          },
        },
      },
      offers: {
        listings: [
          {
            id: "offer1",
            price: { amount: 29900, currency: "USD", displayAmount: "$299.00" },
            availability: {
              type: "InStock",
              message: "In Stock",
            },
          },
        ],
      },
      browseNodeInfo: {
        browseNodes: [
          {
            id: "furniture-office",
            displayName: "Office Furniture",
          },
        ],
      },
      customerReviews: {
        starRating: { value: 4.5 },
      },
    },
    TEST002: {
      id: "TEST002",
      detailPageURL: "https://example.com/dp/TEST002",
      itemInfo: {
        title: { displayValue: "Executive Desk" },
        features: {
          displayValue: ["Solid wood", "Large workspace", "Modern design"],
        },
      },
      images: {
        primary: {
          large: {
            url: "https://example.com/desk-large.jpg",
            width: 800,
            height: 800,
          },
        },
      },
      offers: {
        listings: [
          {
            id: "offer2",
            price: {
              amount: 159900,
              currency: "USD",
              displayAmount: "$1,599.00",
            },
            availability: {
              type: "InStock",
              message: "In Stock",
            },
          },
        ],
      },
      browseNodeInfo: {
        browseNodes: [
          {
            id: "furniture-office",
            displayName: "Office Furniture",
          },
        ],
      },
      customerReviews: {
        starRating: { value: 4.8 },
      },
    },
    TEST003: {
      id: "TEST003",
      detailPageURL: "https://example.com/dp/TEST003",
      itemInfo: {
        title: { displayValue: "Wooden Dining Table" },
        features: {
          displayValue: ["Solid oak wood", "Seats 6 people", "Modern design"],
        },
      },
      offers: {
        listings: [
          {
            id: "offer3",
            price: { amount: 79900, currency: "USD", displayAmount: "$799.00" },
            availability: {
              type: "InStock",
              message: "In Stock",
            },
          },
        ],
      },
      browseNodeInfo: {
        browseNodes: [
          {
            id: "furniture-dining",
            displayName: "Dining Room Furniture",
          },
        ],
      },
      customerReviews: {
        starRating: { value: 4.2 },
      },
    },
    TEST004: {
      id: "TEST004",
      detailPageURL: "https://example.com/dp/TEST004",
      itemInfo: {
        title: { displayValue: "Mesh Office Chair" },
        features: {
          displayValue: [
            "Breathable mesh back",
            "Adjustable armrests",
            "Swivel base",
          ],
        },
      },
      images: {
        primary: {
          medium: {
            url: "https://example.com/mesh-chair-medium.jpg",
            width: 300,
            height: 300,
          },
          large: {
            url: "https://example.com/mesh-chair-large.jpg",
            width: 800,
            height: 800,
          },
        },
      },
      offers: {
        listings: [
          {
            id: "offer4",
            price: { amount: 24900, currency: "USD", displayAmount: "$249.00" },
            availability: {
              type: "InStock",
              message: "In Stock",
            },
          },
        ],
      },
      browseNodeInfo: {
        browseNodes: [
          {
            id: "furniture-office",
            displayName: "Office Furniture",
          },
        ],
      },
      customerReviews: {
        starRating: { value: 4.3 },
      },
    },
    TEST005: {
      id: "TEST005",
      detailPageURL: "https://example.com/dp/TEST005",
      itemInfo: {
        title: { displayValue: "Standing Desk Converter" },
        features: {
          displayValue: [
            "Height adjustable",
            "Fits dual monitors",
            "Gas spring lift",
          ],
        },
      },
      images: {
        primary: {
          large: {
            url: "https://example.com/standing-desk-large.jpg",
            width: 800,
            height: 800,
          },
        },
      },
      offers: {
        listings: [
          {
            id: "offer5",
            price: { amount: 34900, currency: "USD", displayAmount: "$349.00" },
            availability: {
              type: "InStock",
              message: "In Stock",
            },
          },
        ],
      },
      browseNodeInfo: {
        browseNodes: [
          {
            id: "furniture-office",
            displayName: "Office Furniture",
          },
        ],
      },
      customerReviews: {
        starRating: { value: 4.6 },
      },
    },
  },
  variations: {
    TEST001: [
      {
        id: "TEST001-BLACK-LEATHER",
        attributes: {
          color: "Black",
          material: "Leather",
        },
        thumbnail: {
          url: "https://example.com/chair-black-leather-thumb.jpg",
          width: 150,
          height: 150,
          altText: "Office Chair - Black Leather",
        },
        price: {
          amount: 29900,
          currency: "USD",
          displayAmount: "$299.00",
        },
        availability: {
          inStock: true,
          message: "In Stock",
          estimatedDelivery: "Ships in 1-2 days",
        },
        isDefault: true,
      },
      {
        id: "TEST001-BROWN-LEATHER",
        attributes: {
          color: "Brown",
          material: "Leather",
        },
        thumbnail: {
          url: "https://example.com/chair-brown-leather-thumb.jpg",
          width: 150,
          height: 150,
          altText: "Office Chair - Brown Leather",
        },
        price: {
          amount: 31900,
          currency: "USD",
          displayAmount: "$319.00",
        },
        availability: {
          inStock: true,
          message: "In Stock",
          estimatedDelivery: "Ships in 1-2 days",
        },
        isDefault: false,
      },
      {
        id: "TEST001-BLACK-FABRIC",
        attributes: {
          color: "Black",
          material: "Fabric",
        },
        thumbnail: {
          url: "https://example.com/chair-black-fabric-thumb.jpg",
          width: 150,
          height: 150,
          altText: "Office Chair - Black Fabric",
        },
        price: {
          amount: 24900,
          currency: "USD",
          displayAmount: "$249.00",
        },
        availability: {
          inStock: true,
          message: "In Stock",
        },
        isDefault: false,
      },
      {
        id: "TEST001-GRAY-FABRIC",
        attributes: {
          color: "Gray",
          material: "Fabric",
          size: "Large",
        },
        thumbnail: {
          url: "https://example.com/chair-gray-fabric-thumb.jpg",
          width: 150,
          height: 150,
          altText: "Office Chair - Gray Fabric Large",
        },
        price: {
          amount: 27900,
          currency: "USD",
          displayAmount: "$279.00",
        },
        availability: {
          inStock: false,
          message: "Out of Stock",
          estimatedDelivery: "Expected back in stock: Dec 20, 2025",
        },
        isDefault: false,
      },
    ],
  },
  xrMetadata: {
    TEST001: {
      assetUrl: "/gltf/chair.glb",
      initialPosition: [0, 0, 0],
      initialRotation: [0, 0, 0],
      initialScale: 1.0,
    },
  },
};

describe("VendorService", () => {
  let service: VendorService;

  beforeEach(async () => {
    // Reset singleton instance before each test
    VendorService.resetInstance();

    // Mock fetch to return our test data
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
        status: 200,
        statusText: "OK",
      } as Response),
    );

    service = await VendorService.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================
  // Singleton Pattern Tests
  // ========================================

  describe("Singleton Pattern", () => {
    it("should return the same instance when getInstance is called multiple times", async () => {
      const instance1 = await VendorService.init();
      const instance2 = await VendorService.init();
      expect(instance1).toBe(instance2);
    });

    it("should reset instance when resetInstance is called", async () => {
      const instance1 = await VendorService.init();
      VendorService.resetInstance();
      const instance2 = await VendorService.init();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ========================================
  // Initialization Tests
  // ========================================

  describe("Initialization", () => {
    it("should successfully initialize and load mock data", async () => {
      const newService = await VendorService.init();

      expect(newService).toBeDefined();
      expect(newService).toBeInstanceOf(VendorService);

      // Verify service is usable after initialization
      const response = await newService.searchItems({ searchIndex: "All" });
      expect(response.searchResult.items.length).toBeGreaterThan(0);
    });

    it("should throw error when fetch fails", async () => {
      VendorService.resetInstance();
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        } as Response),
      );

      await expect(VendorService.init()).rejects.toThrow(
        "Failed to fetch mock data",
      );
    });

    it("should throw error when mock data structure is invalid", async () => {
      VendorService.resetInstance();
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invalid: "data" }),
        } as Response),
      );

      await expect(VendorService.init()).rejects.toThrow(
        "Invalid mock data structure",
      );
    });

    it("should throw error if mockData is corrupted after initialization", async () => {
      const service = await VendorService.init();

      // Manually corrupt internal state (simulates memory corruption or internal bug)
      (service as unknown as { mockData: unknown }).mockData = null;

      await expect(service.get3DAsset("TEST001")).rejects.toThrow(
        "VendorService not initialized",
      );
    });

    it("should handle simultaneous init() calls without race conditions", async () => {
      VendorService.resetInstance();

      // Track how many times fetch is called
      let fetchCallCount = 0;
      globalThis.fetch = vi.fn(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockData),
        } as Response);
      });

      // Call init() multiple times simultaneously
      const results = await Promise.all([
        VendorService.init(),
        VendorService.init(),
        VendorService.init(),
        VendorService.init(),
        VendorService.init(),
      ]);

      // All should succeed
      expect(results).toHaveLength(5);

      // But fetch should only be called ONCE (race-safe!)
      expect(fetchCallCount).toBe(1);

      // Service should be properly initialized
      const asset = await service.get3DAsset("TEST001");
      expect(asset.id).toBe("TEST001");
    });

    it("should return immediately on subsequent init() calls", async () => {
      VendorService.resetInstance();

      let fetchCallCount = 0;
      globalThis.fetch = vi.fn(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockData),
        } as Response);
      });

      // First init
      await VendorService.init();
      expect(fetchCallCount).toBe(1);

      // Second init should return immediately without fetching
      await VendorService.init();
      expect(fetchCallCount).toBe(1); // Still 1, not 2!

      // Third init
      await VendorService.init();
      expect(fetchCallCount).toBe(1); // Still 1!
    });
  });

  // ========================================
  // Resource Filtering Tests
  // ========================================

  describe("Resource Filtering", () => {
    const searchTest001 = async (resources: ResourceType[]) => {
      const response = await service.searchItems({
        searchIndex: "All",
        resources,
      });
      return response.searchResult.items.find((item) => item.id === "TEST001")!;
    };

    it("should filter item to not include any resources", async () => {
      const item = await searchTest001([]);

      expect(item.id).toBe("TEST001");
      expect(item.itemInfo?.title).toBeUndefined();
      expect(item.itemInfo?.features).toBeUndefined();
      expect(item.images).toBeUndefined();
      expect(item.offers).toBeUndefined();
      expect(Object.keys(item).length).toBe(2);
    });

    it("should filter item to only include requested title resource", async () => {
      const item = await searchTest001(["ItemInfo.Title"]);

      expect(item.id).toBe("TEST001");
      expect(item.itemInfo?.title).toBeDefined();
      expect(item.itemInfo?.features).toBeUndefined();
      expect(item.images).toBeUndefined();
      expect(item.offers).toBeUndefined();
      expect(Object.keys(item).length).toBe(3);
    });

    it("should filter item to include multiple resources", async () => {
      const item = await searchTest001([
        "ItemInfo.Title",
        "Images.Primary.Large",
        "Offers.Listings",
      ]);

      expect(item.itemInfo?.title).toBeDefined();
      expect(item.images?.primary?.large).toBeDefined();
      expect(item.images?.primary?.small).toBeUndefined();
      expect(item.offers?.listings).toBeDefined();
      expect(item.customerReviews).toBeUndefined();
      expect(Object.keys(item).length).toBe(5);
    });

    it('should return full item data when "All" resource is requested', async () => {
      const item = await searchTest001(["All"]);

      expect(item.itemInfo).toBeDefined();
      expect(item.images).toBeDefined();
      expect(item.offers).toBeDefined();
      expect(item.customerReviews).toBeDefined();
      expect(item.browseNodeInfo).toBeDefined();
      expect(item).not.toHaveProperty("xrMetadata");
      expect(Object.keys(item).length).toBe(7);
    });

    it("should ignore unknown resource types in search results", async () => {
      const item = await searchTest001([
        "ItemInfo.Title",
        "UnknownResource" as ResourceType,
      ]);
      expect(item.itemInfo?.title).toBeDefined();
      expect(item.images).toBeUndefined();
    });
  });

  // ========================================
  // searchItems() Tests
  // ========================================

  describe("searchItems()", () => {
    it("should search items by keyword in title", async () => {
      const request: SearchItemsRequest = {
        keywords: "chair",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(2);
      expect(response.searchResult.items).toHaveLength(2);
      // Both TEST001 (Modern Office Chair) and TEST004 (Mesh Office Chair) contain "chair"
      const itemIds = response.searchResult.items.map((item) => item.id);
      expect(itemIds).toContain("TEST001");
      expect(itemIds).toContain("TEST004");
    });

    it("should search items by keyword in features", async () => {
      const request: SearchItemsRequest = {
        keywords: "wood",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBeGreaterThanOrEqual(1);
      // TEST002 has "Solid wood" and TEST003 has "Solid oak wood"
      expect(
        response.searchResult.items.some(
          (item) => item.id === "TEST002" || item.id === "TEST003",
        ),
      ).toBe(true);
    });

    it("should be case-insensitive when searching", async () => {
      const request: SearchItemsRequest = {
        keywords: "CHAIR",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(2);
      // Both TEST001 (Modern Office Chair) and TEST004 (Mesh Office Chair) contain "chair"
      const itemIds = response.searchResult.items.map((item) => item.id);
      expect(itemIds).toContain("TEST001");
      expect(itemIds).toContain("TEST004");
    });

    it("should search items by category (searchIndex)", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "Office",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(4);
      // All 4 office furniture items: TEST001, TEST002, TEST004, TEST005
      const officeIds = response.searchResult.items.map((item) => item.id);
      expect(officeIds).toContain("TEST001");
      expect(officeIds).toContain("TEST002");
      expect(officeIds).toContain("TEST004");
      expect(officeIds).toContain("TEST005");
    });

    it("should search items by category (searchIndex) and find all items in that category", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "furniture",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(5);
      expect(response.searchResult.items).toHaveLength(5);
      // All items should have furniture in their category
      response.searchResult.items.forEach((item) => {
        expect(item.browseNodeInfo?.browseNodes?.[0]?.displayName).toContain(
          "Furniture",
        );
      });
    });

    it('should return all items when searchIndex is "All"', async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(5);
    });

    it("should throw error when neither keywords nor searchIndex provided", async () => {
      const request: SearchItemsRequest = {};

      await expect(service.searchItems(request)).rejects.toThrow(
        "SearchItems requires either keywords or searchIndex parameter",
      );
    });

    it("should not expose xrMetadata in search results", async () => {
      const request: SearchItemsRequest = {
        keywords: "chair",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.items[0]).not.toHaveProperty("xrMetadata");
    });
  });

  // ========================================
  // Price Filtering Tests
  // ========================================

  describe("Price Filtering", () => {
    it("should filter items by minimum price", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        minPrice: 100000, // $1000.00 in cents
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(1);
      expect(response.searchResult.items[0].id).toBe("TEST002");
    });

    it("should filter items by maximum price", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        maxPrice: 50000, // $500.00 in cents
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(3);
      // TEST004 ($249), TEST001 ($299), TEST005 ($349) are all under $500
      const itemIds = response.searchResult.items.map((item) => item.id);
      expect(itemIds).toContain("TEST001");
      expect(itemIds).toContain("TEST004");
      expect(itemIds).toContain("TEST005");
    });

    it("should filter items by price range", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        minPrice: 50000, // $500.00
        maxPrice: 100000, // $1000.00
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(1);
      expect(response.searchResult.items[0].id).toBe("TEST003");
    });
    it("should filter items by price range and find all items in that price range", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        minPrice: 50000, // $500.00
        maxPrice: 200000, // $2000.00
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(2);
      expect(response.searchResult.items[0].id).toBe("TEST002");
      expect(response.searchResult.items[1].id).toBe("TEST003");
    });
  });

  // ========================================
  // Sorting Tests
  // ========================================

  describe("Sorting", () => {
    it("should sort items by price low to high", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        sortBy: "Price:LowToHigh",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.items[0].id).toBe("TEST004"); // $249
      expect(response.searchResult.items[1].id).toBe("TEST001"); // $299
      expect(response.searchResult.items[2].id).toBe("TEST005"); // $349
      expect(response.searchResult.items[3].id).toBe("TEST003"); // $799
      expect(response.searchResult.items[4].id).toBe("TEST002"); // $1599
    });

    it("should sort items by price high to low", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        sortBy: "Price:HighToLow",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.items[0].id).toBe("TEST002"); // $1599
      expect(response.searchResult.items[1].id).toBe("TEST003"); // $799
      expect(response.searchResult.items[2].id).toBe("TEST005"); // $349
      expect(response.searchResult.items[3].id).toBe("TEST001"); // $299
      expect(response.searchResult.items[4].id).toBe("TEST004"); // $249
    });

    it("should sort items by customer reviews", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        sortBy: "CustomerReview",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.items[0].id).toBe("TEST002"); // 4.8 stars
      expect(response.searchResult.items[1].id).toBe("TEST005"); // 4.6 stars
      expect(response.searchResult.items[2].id).toBe("TEST001"); // 4.5 stars
      expect(response.searchResult.items[3].id).toBe("TEST004"); // 4.3 stars
      expect(response.searchResult.items[4].id).toBe("TEST003"); // 4.2 stars
    });
  });

  // ========================================
  // Pagination Tests
  // ========================================

  describe("Pagination", () => {
    it("should return first page with default item count", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(5);
      expect(response.searchResult.items).toHaveLength(5);
    });

    it("should limit results to specified item count", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        itemCount: 2,
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(5);
      expect(response.searchResult.items).toHaveLength(2);
    });

    it("should return correct page of results", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        itemCount: 2,
        itemPage: 2,
        sortBy: "Price:LowToHigh",
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBe(5);
      expect(response.searchResult.items).toHaveLength(2);
      // Page 2 with itemCount 2 should show items 3-4 (0-indexed: items at positions 2-3)
      expect(response.searchResult.items[0].id).toBe("TEST005"); // $349
      expect(response.searchResult.items[1].id).toBe("TEST003"); // $799
    });

    it("should respect maximum item count limit", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        itemCount: 100, // Exceeds MAX_ITEM_COUNT (50)
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.items.length).toBeLessThanOrEqual(50);
    });
  });

  // ========================================
  // Combined Search Features Tests
  // ========================================

  describe("Combined Search Features", () => {
    it("should combine keyword search with category filter", async () => {
      const request: SearchItemsRequest = {
        keywords: "furniture",
        searchIndex: "Office",
      };

      const response = await service.searchItems(request);

      expect(
        response.searchResult.items.every(
          (item) =>
            item.itemInfo?.title?.displayValue
              .toLowerCase()
              .includes("furniture") ||
            item.itemInfo?.features?.displayValue?.some((f) =>
              f.toLowerCase().includes("furniture"),
            ),
        ),
      ).toBe(true);
    });

    it("should combine filtering with sorting and pagination", async () => {
      const request: SearchItemsRequest = {
        searchIndex: "All",
        minPrice: 10000,
        sortBy: "Price:LowToHigh",
        itemCount: 2,
        itemPage: 1,
      };

      const response = await service.searchItems(request);

      expect(response.searchResult.totalResultCount).toBeGreaterThan(0);
      expect(response.searchResult.items.length).toBeLessThanOrEqual(2);
    });

    it("should apply resource filtering to search results", async () => {
      const request: SearchItemsRequest = {
        keywords: "chair",
        resources: ["ItemInfo.Title", "Offers.Listings"],
      };

      const response = await service.searchItems(request);
      const item = response.searchResult.items[0];

      expect(item.itemInfo?.title).toBeDefined();
      expect(item.offers?.listings).toBeDefined();
      expect(item.images).toBeUndefined();
      expect(item.customerReviews).toBeUndefined();
    });
  });

  describe("getVariations()", () => {
    it("should return all variations for a valid product", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001", // Modern Office Chair - has 4 variations
      };

      const response = await service.getVariations(request);

      expect(response.parentId).toBe("TEST001");
      expect(response.variations).toBeDefined();
      expect(Array.isArray(response.variations)).toBe(true);
      expect(response.variationDimensions).toBeDefined();
      expect(Array.isArray(response.variationDimensions)).toBe(true);
      expect(response.errors).toBeUndefined();
    });

    it("should return variations with complete data structure", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
      };

      const response = await service.getVariations(request);

      if (response.variations.length > 0) {
        const variation = response.variations[0];

        // Validate variation structure
        expect(variation.id).toBeDefined();
        expect(typeof variation.id).toBe("string");

        // Validate attributes
        expect(variation.attributes).toBeDefined();
        expect(typeof variation.attributes).toBe("object");

        // Validate thumbnail
        expect(variation.thumbnail).toBeDefined();
        expect(variation.thumbnail.url).toBeDefined();
        expect(typeof variation.thumbnail.width).toBe("number");
        expect(typeof variation.thumbnail.height).toBe("number");

        // Validate price
        expect(variation.price).toBeDefined();
        expect(typeof variation.price.amount).toBe("number");
        expect(variation.price.currency).toBeDefined();
        expect(variation.price.displayAmount).toBeDefined();

        // Validate availability
        expect(variation.availability).toBeDefined();
        expect(typeof variation.availability.inStock).toBe("boolean");
        expect(variation.availability.message).toBeDefined();
      }
    });

    it("should filter variations by type - Color only", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
        variationTypes: ["Color"],
      };

      const response = await service.getVariations(request);

      // All returned variations should have a color attribute
      response.variations.forEach((variation) => {
        expect(variation.attributes.color).toBeDefined();
      });
    });

    it("should filter variations by type - Size only", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
        variationTypes: ["Size"],
      };

      const response = await service.getVariations(request);

      // All returned variations should have a size attribute
      response.variations.forEach((variation) => {
        expect(variation.attributes.size).toBeDefined();
      });
    });

    it("should filter variations by multiple types", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
        variationTypes: ["Color", "Material"],
      };

      const response = await service.getVariations(request);

      // All returned variations should have at least one of the requested attributes
      response.variations.forEach((variation) => {
        const hasColor = variation.attributes.color !== undefined;
        const hasMaterial = variation.attributes.material !== undefined;
        expect(hasColor || hasMaterial).toBe(true);
      });
    });

    it("should return empty variations array for product without variations", async () => {
      const request: GetVariationsRequest = {
        id: "TEST002", // Luxury Sofa - no variations
      };

      const response = await service.getVariations(request);

      expect(response.parentId).toBe("TEST002");
      expect(response.variations).toEqual([]);
      expect(response.variationDimensions).toEqual([]);
      expect(response.errors).toBeUndefined();
    });

    it("should return error for non-existent product ID", async () => {
      const request: GetVariationsRequest = {
        id: "INVALID_ID",
      };

      const response = await service.getVariations(request);

      expect(response.parentId).toBe("INVALID_ID");
      expect(response.variations).toEqual([]);
      expect(response.variationDimensions).toEqual([]);
      expect(response.errors).toBeDefined();
      expect(response.errors!.length).toBeGreaterThan(0);
      expect(response.errors![0].code).toBe("ItemNotFound");
      expect(response.errors![0].message).toContain("INVALID_ID");
    });

    it("should throw error if ID is missing", async () => {
      const request: GetVariationsRequest = {
        id: "",
      };

      await expect(service.getVariations(request)).rejects.toThrow(
        "GetVariations requires a product ID",
      );
    });

    it("should identify default variation with isDefault flag", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
      };

      const response = await service.getVariations(request);

      if (response.variations.length > 0) {
        // At least one variation should have isDefault property
        const defaultVariations = response.variations.filter(
          (v) => v.isDefault === true,
        );

        // Should have at most one default variation
        expect(defaultVariations.length).toEqual(1);
      }
    });

    it("should return correct variation dimensions", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
      };

      const response = await service.getVariations(request);

      if (response.variations.length > 0) {
        // Variation dimensions should match attributes in variations
        const attributeKeys = new Set<string>();
        response.variations.forEach((v) => {
          Object.keys(v.attributes).forEach((key) => {
            if (v.attributes[key] !== undefined) {
              // Capitalize first letter to match expected dimension format
              const dimension = key.charAt(0).toUpperCase() + key.slice(1);
              attributeKeys.add(dimension);
            }
          });
        });

        const expectedDimensions = Array.from(attributeKeys).sort();
        const actualDimensions = [...response.variationDimensions].sort();

        expect(actualDimensions).toEqual(expectedDimensions);
      }
    });

    it("should handle case-insensitive variation type filtering", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
        variationTypes: ["color", "MATeRIaL", "Size"], // Mixed case
      };

      const response = await service.getVariations(request);

      // Should handle mixed case gracefully
      expect(response.variations).toBeDefined();
      expect(response.errors).toBeUndefined();
    });

    it("should return empty array when filtering by non-existent variation type", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
        variationTypes: ["Flavor", "Scent"], // Non-existent types
      };

      const response = await service.getVariations(request);

      // Should return empty variations if none match the filter
      expect(response.variations).toEqual([]);
      expect(response.variationDimensions).toBeDefined();
    });

    it("should include stock status and delivery information", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
      };

      const response = await service.getVariations(request);

      if (response.variations.length > 0) {
        response.variations.forEach((variation) => {
          expect(variation.availability.inStock).toBeDefined();
          expect(typeof variation.availability.inStock).toBe("boolean");
          expect(variation.availability.message).toBeDefined();

          // If out of stock, might have estimated delivery
          if (
            !variation.availability.inStock &&
            variation.availability.estimatedDelivery
          ) {
            expect(typeof variation.availability.estimatedDelivery).toBe(
              "string",
            );
          }
        });
      }
    });

    it("should return unique variation IDs", async () => {
      const request: GetVariationsRequest = {
        id: "TEST001",
      };

      const response = await service.getVariations(request);

      if (response.variations.length > 1) {
        const ids = response.variations.map((v) => v.id);
        const uniqueIds = new Set(ids);

        expect(ids.length).toBe(uniqueIds.size);
      }
    });
  });

  // ========================================
  // get3DAsset() Tests
  // ========================================

  describe("get3DAsset()", () => {
    it("should return 3D asset info for product with complete XRMetadata structure", async () => {
      const productId = "TEST001";
      const result = await service.get3DAsset(productId);

      expect(result).toBeDefined();
      expect(result.id).toBe(productId);
      expect(result.url).toBeDefined();
      expect(result.metadata.assetUrl).toBeDefined();
      expect(typeof result.metadata.assetUrl).toBe("string");

      // Check optional fields if present
      if (result.metadata.initialPosition) {
        expect(Array.isArray(result.metadata.initialPosition)).toBe(true);
        expect(result.metadata.initialPosition).toHaveLength(3);
      }

      if (result.metadata.initialRotation) {
        expect(Array.isArray(result.metadata.initialRotation)).toBe(true);
        expect(result.metadata.initialRotation).toHaveLength(3);
      }
      expect(result.fileSize).toBeGreaterThanOrEqual(0);
      expect(result.format).toMatch(/^(glb|gltf)$/);
    });

    it("should determine format from asset URL extension", async () => {
      const productId = "TEST001";
      const result = await service.get3DAsset(productId);

      const expectedFormat = result.url.endsWith(".gltf") ? "gltf" : "glb";
      expect(result.format).toBe(expectedFormat);
    });

    it("should throw error for non-existent product", async () => {
      const productId = "NONEXISTENT";

      await expect(service.get3DAsset(productId)).rejects.toThrow(
        "Product NONEXISTENT not found",
      );
    });

    it("should throw error for product without xrMetadata", async () => {
      const productId = "TEST002"; // Luxury Sofa has no xrMetadata

      await expect(service.get3DAsset(productId)).rejects.toThrow(
        "No 3D asset found for product",
      );
    });

    it("should throw error if product ID is empty", async () => {
      await expect(service.get3DAsset("")).rejects.toThrow(
        "get3DAsset requires a product ID",
      );
    });

    it("should include placement and orientation hints when available", async () => {
      const productId = "TEST001";
      const result = await service.get3DAsset(productId);

      // These are optional but TEST001 should have them
      if (result.metadata.preferredPlacement) {
        expect(["floor", "wall", "table", "ceiling", "any"]).toContain(
          result.metadata.preferredPlacement,
        );
      }

      if (result.metadata.orientation) {
        expect([
          PreferredOrientation.horizontal,
          PreferredOrientation.vertical,
          PreferredOrientation.horizontalInverted,
        ]).toContain(result.metadata.orientation);
      }
    });

    it("should include material adjustments when available", async () => {
      const productId = "TEST001";
      const result = await service.get3DAsset(productId);

      if (result.metadata.materialAdjustments) {
        expect(typeof result.metadata.materialAdjustments).toBe("object");

        // Check common material properties if present
        if (result.metadata.materialAdjustments.roughness !== undefined) {
          expect(
            result.metadata.materialAdjustments.roughness,
          ).toBeGreaterThanOrEqual(0);
          expect(
            result.metadata.materialAdjustments.roughness,
          ).toBeLessThanOrEqual(1);
        }

        if (result.metadata.materialAdjustments.metalness !== undefined) {
          expect(
            result.metadata.materialAdjustments.metalness,
          ).toBeGreaterThanOrEqual(0);
          expect(
            result.metadata.materialAdjustments.metalness,
          ).toBeLessThanOrEqual(1);
        }
      }
    });

    it("should return fileSize as 0 when not available in metadata", async () => {
      const productId = "TEST001";
      const result = await service.get3DAsset(productId);

      // Since our mock data doesn't have fileSize, it should default to 0
      expect(result.fileSize).toBe(0);
    });
  });
});
