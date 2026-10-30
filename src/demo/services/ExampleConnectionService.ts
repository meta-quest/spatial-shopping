/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ConnectionService - checks network connectivity (e.g. before add-to-cart).
 * Uses navigator.onLine and a minimal HEAD request with timeout.
 */

const DEFAULT_TIMEOUT_MS = 5000;
// The app's own base URL (same-origin, minimal); works under sub-path deploys.
const DEFAULT_CHECK_URL = import.meta.env.BASE_URL;

export class ExampleConnectionService {
  private readonly timeoutMs: number;
  private readonly checkUrl: string;

  constructor(options?: { timeoutMs?: number; checkUrl?: string }) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.checkUrl = options?.checkUrl ?? DEFAULT_CHECK_URL;
  }

  /**
   * Returns true if the app appears to have internet connectivity.
   */
  public async check(): Promise<boolean> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return false;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.checkUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  }
}
