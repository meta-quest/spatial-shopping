/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { MessageHandler } from "./MessageHandler.js";

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Accessing localStorage throws when storage is disabled for the origin.
    return null;
  }
}

/**
 * localStorage wrapper that never throws. Storage can be unavailable (private
 * browsing, disabled cookies, sandboxed iframes) or full; the viewer degrades to
 * in-memory state and reports a warning instead of breaking initialization.
 */
export const safeStorage = {
  /** Returns the stored value, or null if missing or storage is unavailable. */
  getItem(key: string): string | null {
    try {
      return getStorage()?.getItem(key) ?? null;
    } catch (error) {
      MessageHandler.raiseWarning(
        `Could not read "${key}" from localStorage: ${String(error)}`,
      );
      return null;
    }
  },

  /** Stores a value. Returns false if storage is unavailable or full. */
  setItem(key: string, value: string): boolean {
    try {
      const storage = getStorage();
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch (error) {
      MessageHandler.raiseWarning(
        `Could not write "${key}" to localStorage: ${String(error)}`,
      );
      return false;
    }
  },

  /** Removes a value. Failures are reported and otherwise ignored. */
  removeItem(key: string): void {
    try {
      getStorage()?.removeItem(key);
    } catch (error) {
      MessageHandler.raiseWarning(
        `Could not remove "${key}" from localStorage: ${String(error)}`,
      );
    }
  },
};
