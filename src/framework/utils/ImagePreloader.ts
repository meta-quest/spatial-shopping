/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ProductVariation } from "../types/ProductData.js";
import { MessageHandler } from "./MessageHandler.js";

/**
 * ImagePreloader manages image preloading with caching and priority levels.
 * It ensures images are loaded into browser cache before they're needed,
 * improving perceived performance on slow networks.
 *
 * Errors are reported only via rejected promises (no synchronous throws).
 * Callers should use MessageHandler.raiseError / raiseWarning in .catch() so
 * the demo app receives errors through the app's error handling system.
 *
 * Uses Blob URLs (Object URLs) for optimal performance with UIKit.
 */
export class ImagePreloader {
  /** In-progress loads. */
  private cache: Map<string, Promise<void>> = new Map();
  /** Original URL → blob URL mapping (this IS our cache). */
  private blobUrls: Map<string, string> = new Map();
  /** Keep Blob references to prevent GC. */
  private blobs: Map<string, Blob> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private generation = 0;
  private readonly VARIANTS_PER_PAGE = 4;

  /**
   * Whether the response content-type is acceptable for <img> (png, jpg, webp, gif, svg, etc.).
   * Rejects known non-image types (e.g. HTML error pages) so we don't create invalid blob URLs.
   */
  private isAcceptableImageContentType(contentType: string): boolean {
    return (
      contentType.startsWith("image/") ||
      contentType === "application/octet-stream"
    );
  }

  /**
   * Preload a single image URL as a Blob and create an Object URL.
   * Returns a promise that resolves when the image is loaded.
   * If the image is already cached, returns immediately.
   */
  preload(url: string): Promise<void> {
    if (!url) return Promise.resolve();
    if (this.blobUrls.has(url)) return Promise.resolve();
    if (this.cache.has(url)) return this.cache.get(url)!;

    const controller = new AbortController();
    const generation = this.generation;
    this.abortControllers.set(url, controller);

    const loadPromise = new Promise<void>((resolve, reject) => {
      fetch(url, { signal: controller.signal })
        .then((response) => {
          if (!response.ok)
            throw MessageHandler.raiseError(
              `HTTP ${response.status}: ${response.statusText}`,
            );
          const contentType = (response.headers.get("content-type") ?? "")
            .toLowerCase()
            .split(";")[0]
            .trim();
          if (contentType && !this.isAcceptableImageContentType(contentType)) {
            throw MessageHandler.raiseError(
              `Not an image (content-type: ${contentType})`,
            );
          }
          return response.blob();
        })
        .then((blob) => {
          if (controller.signal.aborted || generation !== this.generation) {
            resolve();
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          this.blobUrls.set(url, blobUrl);
          this.blobs.set(url, blob);
          this.cache.delete(url);
          this.abortControllers.delete(url);
          resolve();
        })
        .catch((error) => {
          this.cache.delete(url);
          this.abortControllers.delete(url);
          if (controller.signal.aborted) {
            resolve();
            return;
          }
          reject(error);
        });
    });

    this.cache.set(url, loadPromise);
    return loadPromise;
  }

  /**
   * Preload multiple images in batch.
   * Returns a promise that resolves when all images are loaded (or fail).
   *
   * @param urls - Array of image URLs to preload
   * @param priority - 'high' waits for all images, 'low' doesn't block on failures
   */
  async preloadBatch(
    urls: string[],
    priority: "high" | "low" = "low",
  ): Promise<void[]> {
    const validUrls = urls.filter((url) => url && url.trim() !== "");
    if (validUrls.length === 0) {
      return Promise.resolve([]);
    }

    const promises = validUrls.map((url) => this.preload(url));

    if (priority === "high") return Promise.all(promises);

    return Promise.allSettled(promises).then((results) => {
      const fulfilled = results
        .filter((r) => r.status === "fulfilled")
        .map(() => undefined as void);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        MessageHandler.raiseLog(
          `ImagePreloader: ${failed} of ${validUrls.length} images failed to load`,
          true,
        );
      }
      return fulfilled;
    });
  }

  /**
   * Check if an image URL has been successfully loaded.
   * Returns true if a Blob URL exists for this original URL.
   */
  isLoaded(url: string): boolean {
    return this.blobUrls.has(url);
  }

  /**
   * Check if an image URL is currently loading.
   */
  isLoading(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Clear all cached image load states and revoke Object URLs.
   * Useful when switching products or contexts.
   */
  clear(): void {
    this.generation++;
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    for (const blobUrl of this.blobUrls.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    this.cache.clear();
    this.abortControllers.clear();
    this.blobUrls.clear();
    this.blobs.clear();
  }

  /**
   * Get stats about the current cache state.
   */
  getStats(): { loaded: number; loading: number } {
    return { loaded: this.blobUrls.size, loading: this.cache.size };
  }

  /**
   * Get the Blob URL for an original image URL (if preloaded as Blob).
   * Returns null if the image hasn't been preloaded or no Blob URL exists.
   */
  getBlobUrl(originalUrl: string): string | null {
    return this.blobUrls.get(originalUrl) || null;
  }

  /**
   * Get the URL to use for displaying the image.
   * Returns Blob URL if available, otherwise the original URL.
   * This is the primary method to use when setting image sources.
   */
  getUrlToUse(originalUrl: string): string {
    const blobUrl = this.blobUrls.get(originalUrl);
    if (blobUrl) {
      return blobUrl;
    }
    return originalUrl;
  }

  /**
   * Revoke a specific Blob URL (when image is no longer needed).
   * Useful for freeing memory when paginating away from certain images.
   */
  revokeUrl(originalUrl: string): void {
    const blobUrl = this.blobUrls.get(originalUrl);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobUrls.delete(originalUrl);
      this.blobs.delete(originalUrl);
    }
  }

  /**
   * Preload variant images for specific page(s).
   * Convenience method for variant pagination preloading.
   *
   * @param variants - Array of product variants
   * @param startPage - Starting page number (0-indexed)
   * @param pageCount - Number of pages to preload (default: 1)
   * @param priority - 'high' waits for all images, 'low' doesn't block on failures
   * @param _logSource - Optional source identifier reserved for caller diagnostics
   * @returns Promise that resolves when images are preloaded
   */
  preloadVariantPages(
    variants: ProductVariation[],
    startPage: number,
    pageCount = 1,
    priority: "high" | "low" = "low",
    _logSource?: string,
  ): Promise<void[]> {
    const startIndex = startPage * this.VARIANTS_PER_PAGE;
    const endIndex = Math.min(
      startIndex + pageCount * this.VARIANTS_PER_PAGE,
      variants.length,
    );

    if (startIndex >= variants.length) {
      return Promise.resolve([]);
    }

    const variantsToPreload = variants.slice(startIndex, endIndex);
    const imageUrls = variantsToPreload
      .map((v) => v.thumbnailUrl)
      .filter((url): url is string => !!url);

    return this.preloadBatch(imageUrls, priority);
  }

  /**
   * Preload first page of variants (convenience method).
   *
   * @param variants - Array of product variants
   * @param priority - 'high' waits for all images, 'low' doesn't block on failures (default: 'high')
   * @param logSource - Optional source identifier for logging
   * @returns Promise that resolves when images are preloaded
   */
  preloadVariantFirstPage(
    variants: ProductVariation[],
    priority: "high" | "low" = "high",
    logSource?: string,
  ): Promise<void[]> {
    return this.preloadVariantPages(variants, 0, 1, priority, logSource);
  }
}

/** Singleton instance for global use. */
export const imagePreloader = new ImagePreloader();
