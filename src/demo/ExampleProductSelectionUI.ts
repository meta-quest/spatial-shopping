/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  MaterialSet,
  ProductData,
  ProductVariation,
  XRData,
} from "../framework/types/ProductData";
import { VendorService } from "./services/VendorService";
import type {
  Item,
  Measurement,
  ProductVariation as VendorProductVariation,
} from "./services/types";
import { formatDimensionsForDisplay } from "../framework/utils/ProductDataUtils.js";

// =============================================================================
// AGENT AUTO-LAUNCH (DEV ONLY)
// -----------------------------------------------------------------------------
// Workaround: the iwsdk-runtime MCP cannot click 2D DOM buttons (only XR
// devices and screenshots). To let coding agents auto-enter the AR experience
// for debugging, we programmatically click "View in AR" for the product ID
// configured in VITE_AGENT_AUTO_LAUNCH_PRODUCT_ID once the AR viewer is ready.
// Production builds are unaffected, and normal local development does not
// auto-launch by default.
//
// Product IDs live in `public/demo/data/vendor-products.json`.
// =============================================================================
const AGENT_AUTO_LAUNCH_PRODUCT_ID =
  import.meta.env.VITE_AGENT_AUTO_LAUNCH_PRODUCT_ID || null;
const PRODUCT_IMAGE_FALLBACK = "imgs/cube-3d-icon.png";

/** Whether the AR viewer can be launched from the catalog. */
export type ARAvailability = "loading" | "ready" | "unsupported" | "failed";

const AR_BUTTON_LABELS: Record<ARAvailability, string> = {
  loading: "Preparing AR...",
  ready: "View in AR",
  unsupported: "AR not available here",
  failed: "AR unavailable",
};

/** Vendor variation as loaded from JSON, which may also carry material swaps. */
type VendorVariation = VendorProductVariation & { materialSet?: MaterialSet[] };

/** Maps a vendor API variation onto the viewer's variation shape. */
function toProductVariation(variation: VendorVariation): ProductVariation {
  // Mock JSON may supply either a structured price or a display string.
  const price: unknown = variation.price;
  return {
    ...variation,
    price:
      typeof price === "string"
        ? price
        : (variation.price?.displayAmount ?? ""),
    thumbnailUrl: variation.thumbnail?.url,
  };
}

type SelectProductCallback = (
  productData: ProductData,
  trigger: HTMLElement,
) => void;

/**
 * Manages the Host Application's Product Selection UI.
 * Responsible for fetching the product list and rendering the HTML grid.
 */
export class ExampleProductSelectionUI {
  private products: Map<string, ProductData> = new Map();
  private vendorService: VendorService | null = null;
  private arAvailability: ARAvailability = "loading";
  private agentAutoLaunchDone = false;

  /**
   * @param onSelectProduct - Called with the product (including XR data) and the clicked button.
   * @param onSelectionStart - Called when product XR data starts loading after a click.
   * @param onSelectionError - Called with a user-facing message if XR data could not be loaded.
   */
  constructor(
    private readonly onSelectProduct: SelectProductCallback,
    private readonly onSelectionStart: () => void = () => {},
    private readonly onSelectionError: (message: string) => void = () => {},
  ) {}

  /**
   * Fetches products and renders them. Safe to call again after a failure.
   */
  async init(): Promise<void> {
    const grid = document.getElementById("product-selection-grid");
    grid?.setAttribute("aria-busy", "true");
    this.setStatus("Loading products...");

    try {
      this.vendorService = await VendorService.init();
      await this.loadProducts();
      this.renderProductGrid();
      this.setStatus("");
      this.maybeAgentAutoLaunch();
    } catch (error) {
      console.error(
        "ProductSelectionUI: Failed to load products:",
        (error as Error).message,
      );
      this.setStatus("");
      this.renderErrorState();
    } finally {
      grid?.removeAttribute("aria-busy");
    }
  }

  /** Updates the page's single polite live region. */
  setStatus(message: string): void {
    const status = document.getElementById("catalog-status");
    if (status) status.textContent = message;
  }

  /** Enables or disables the "View in AR" buttons. */
  setARAvailability(availability: ARAvailability): void {
    this.arAvailability = availability;
    document
      .querySelectorAll<HTMLElement>(".product-card")
      .forEach((card) => this.applyARAvailability(card));
    this.maybeAgentAutoLaunch();
  }

  /**
   * Dev-only: programmatically click "View in AR" on a configured product so
   * coding agents (which cannot click 2D DOM via iwsdk-runtime MCP) can drive
   * the full AR flow. See AGENT_AUTO_LAUNCH_PRODUCT_ID at the top of this file.
   */
  private maybeAgentAutoLaunch(): void {
    if (!import.meta.env.DEV) return;
    if (!AGENT_AUTO_LAUNCH_PRODUCT_ID || this.agentAutoLaunchDone) return;
    if (this.arAvailability !== "ready" || this.products.size === 0) return;
    this.agentAutoLaunchDone = true;

    requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLElement>(
        `.product-card[data-product="${AGENT_AUTO_LAUNCH_PRODUCT_ID}"] .view-ar-btn`,
      );
      if (btn) {
        console.log(
          `[AGENT_AUTO_LAUNCH] Clicking 'View in AR' for ${AGENT_AUTO_LAUNCH_PRODUCT_ID}`,
        );
        btn.click();
      } else {
        console.warn(
          `[AGENT_AUTO_LAUNCH] Product card ${AGENT_AUTO_LAUNCH_PRODUCT_ID} not found in grid`,
        );
      }
    });
  }

  /**
   * Loads products from the VendorService.
   */
  private async loadProducts(): Promise<void> {
    if (!this.vendorService) return;

    try {
      const response = await this.vendorService.searchItems({
        searchIndex: "All",
        itemCount: 50,
        resources: [
          "ItemInfo.Title",
          "ItemInfo.ProductInfo",
          "Images.Primary",
          "Offers.Listings",
          "CustomerReviews",
          "BrowseNodeInfo",
        ],
      });

      this.products.clear();
      response.searchResult.items.forEach((item) => {
        // Initial transform only has partial data (no XR data yet)
        // We will fetch XR data on demand when "View in AR" is clicked
        const productData = this.transformApiItemToProductData(item);
        if (productData) {
          this.products.set(productData.id, productData);
        }
      });
    } catch (error) {
      throw new Error(`Failed to load products: ${(error as Error).message}`);
    }
  }

  /**
   * Renders the product cards into the DOM.
   */
  private renderProductGrid(): void {
    const grid = document.getElementById("product-selection-grid");
    if (!grid) return;

    grid.replaceChildren(
      ...Array.from(this.products.values(), (product) =>
        this.createProductCard(product),
      ),
    );
  }

  private renderErrorState(): void {
    const grid = document.getElementById("product-selection-grid");
    if (!grid) return;

    const error = document.createElement("div");
    error.className = "catalog-error catalog-load-error";
    error.setAttribute("role", "alert");

    const message = document.createElement("p");
    message.textContent = "Products could not be loaded.";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary-btn";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      void this.init();
    });

    error.append(message, retry);
    grid.replaceChildren(error);
  }

  /**
   * Creates a DOM element for a product card.
   */
  private createProductCard(product: ProductData): HTMLElement {
    const { id, metadata, assets } = product;

    const card = document.createElement("article");
    card.classList.add("product-card");
    card.dataset.product = id;
    card.innerHTML = `
        <div class="product-image">
            <span class="ar-icon" aria-hidden="true">
              <img src="imgs/cube-3d-icon.svg" alt="">
            </span>
            <img class="product-thumbnail" alt="" loading="lazy" decoding="async">
        </div>
        <h2 class="product-title"></h2>
        <div class="price"></div>
        <div class="product-details">
            <div class="detail-label">Product Dimensions</div>
            <div class="detail-value"></div>
        </div>
        <button class="view-ar-btn" type="button">
            <svg class="ar-btn-icon" viewBox="0 0 20 22" stroke="currentColor" aria-hidden="true">
              <path d="M8.5 11.8262V20.7393L0.825195 16.3682L0.816406 16.3633L0.746094 16.3184C0.591709 16.2055 0.500128 16.0274 0.5 15.8379V7.23438L8.5 11.8262ZM19.5 15.8379C19.4999 16.0546 19.38 16.256 19.1836 16.3623L19.1748 16.3682L11.5 20.7393V11.8203L19.5 7.15918V15.8379ZM9.70508 0.574219C9.86568 0.487195 10.0565 0.47663 10.2246 0.541992L10.2949 0.574219L17.835 4.65625L9.99414 9.22461L2.09766 4.69238L9.70508 0.574219Z" />
            </svg>
            <span class="view-ar-label"></span>
        </button>`;

    card.querySelector<HTMLElement>("h2")!.textContent = metadata.title;

    const rating = this.createRating(metadata.rating);
    if (rating) card.querySelector("h2")!.after(rating);

    const price = card.querySelector<HTMLElement>(".price")!;
    if (metadata.price) price.textContent = metadata.price;
    else price.remove();

    card.querySelector<HTMLElement>(".detail-value")!.textContent =
      formatDimensionsForDisplay(metadata.dimensions);

    const thumbnail =
      card.querySelector<HTMLImageElement>(".product-thumbnail")!;
    thumbnail.addEventListener(
      "error",
      () => {
        thumbnail.src = PRODUCT_IMAGE_FALLBACK;
      },
      { once: true },
    );
    thumbnail.alt = metadata.title;
    thumbnail.src = assets.thumbnailUrl || PRODUCT_IMAGE_FALLBACK;

    const button = card.querySelector<HTMLButtonElement>(".view-ar-btn")!;
    button.addEventListener("click", () => {
      void this.handleProductSelection(product, button);
    });

    this.applyARAvailability(card);
    return card;
  }

  private applyARAvailability(card: HTMLElement): void {
    const button = card.querySelector<HTMLButtonElement>(".view-ar-btn");
    const label = card.querySelector<HTMLElement>(".view-ar-label");
    const title = card.querySelector("h2")?.textContent ?? "";
    if (!button || !label) return;

    const ready = this.arAvailability === "ready";
    const text = AR_BUTTON_LABELS[this.arAvailability];
    button.disabled = !ready;
    label.textContent = text;
    button.setAttribute(
      "aria-label",
      ready ? `View ${title} in AR` : `${text}: ${title}`,
    );
  }

  /** Builds the star rating row, or returns null when there is no rating. */
  private createRating(
    rating: ProductData["metadata"]["rating"],
  ): HTMLElement | null {
    if (!rating || !Number.isFinite(rating.score) || rating.score <= 0) {
      return null;
    }

    const score = Math.min(5, rating.score);
    const reviews = `${rating.count.toLocaleString("en-US")} ${rating.count === 1 ? "review" : "reviews"}`;

    const row = document.createElement("div");
    row.className = "rating-section";
    row.setAttribute("role", "img");
    row.setAttribute("aria-label", `Rated ${score} out of 5, ${reviews}`);

    const value = document.createElement("span");
    value.className = "rating-value";
    value.textContent = String(score);

    const stars = document.createElement("span");
    stars.className = "rating-stars";
    stars.textContent = this.generateStars(score);

    const count = document.createElement("span");
    count.className = "rating-count";
    count.textContent = `(${rating.count.toLocaleString("en-US")})`;

    for (const child of [value, stars, count]) {
      child.setAttribute("aria-hidden", "true");
    }
    row.append(value, stars, count);
    return row;
  }

  private async handleProductSelection(
    product: ProductData,
    trigger: HTMLElement,
  ): Promise<void> {
    if (!this.vendorService || this.arAvailability !== "ready") return;

    this.onSelectionStart();
    try {
      const [assetInfo, variationsResponse] = await Promise.all([
        this.vendorService.get3DAsset(product.id),
        this.vendorService.getVariations({ id: product.id }),
      ]);

      //create product xr data
      const xrData: XRData = {
        assetUrl: assetInfo.url,
        initialScale: assetInfo.metadata.initialScale,
        initialPosition: assetInfo.metadata.initialPosition,
        initialRotation: assetInfo.metadata.initialRotation,
        preferredPlacement: assetInfo.metadata.preferredPlacement,
        orientation: assetInfo.metadata.orientation,
        materialAdjustments: assetInfo.metadata.materialAdjustments,
      };
      product.xr = xrData;

      //create variations
      if (Array.isArray(variationsResponse.variations)) {
        product.variations =
          variationsResponse.variations.map(toProductVariation);
      } else {
        product.variations = [];
      }
    } catch (e) {
      console.error("Failed to load 3D asset for product", product.id, e);
      this.onSelectionError(
        "This product's AR assets could not be loaded. Try again or choose another product.",
      );
      return;
    }

    this.onSelectProduct(product, trigger);
  }

  private transformApiItemToProductData(item: Item): ProductData | null {
    const mapMeasurement = (m: Measurement | undefined) =>
      m
        ? { displayValue: m.displayValue, unit: m.unit, value: m.value }
        : undefined;

    const vendorDims = item.itemInfo?.productInfo?.dimensions;
    const primary = item.images?.primary;
    const score = Number(item.customerReviews?.starRating?.value);
    const count = Math.trunc(Number(item.customerReviews?.count));

    return {
      id: item.id,
      metadata: {
        title: item.itemInfo?.title?.displayValue || "Unknown Product",
        price: item.offers?.listings?.[0]?.price?.displayAmount || "",
        dimensions: vendorDims
          ? {
              length: mapMeasurement(vendorDims.length),
              width: mapMeasurement(vendorDims.width),
              height: mapMeasurement(vendorDims.height),
              weight: mapMeasurement(vendorDims.weight),
            }
          : undefined,
        rating:
          Number.isFinite(score) && score > 0
            ? { score, count: Number.isFinite(count) ? count : 0 }
            : undefined,
        manufacturer: item.itemInfo?.productInfo?.manufacturer,
        features: item.itemInfo?.features?.displayValue,
        description: "",
      },
      assets: {
        thumbnailUrl:
          primary?.large?.url ??
          primary?.medium?.url ??
          primary?.small?.url ??
          PRODUCT_IMAGE_FALLBACK,
        imageUrls: [],
      },
      xr: { assetUrl: "" },
      variations: [],
    };
  }

  private generateStars(rating: number): string {
    const fullStars = Math.round(rating);
    return "★".repeat(fullStars) + "☆".repeat(5 - fullStars);
  }
}
