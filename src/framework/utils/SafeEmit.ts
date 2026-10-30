/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** A host-supplied callback. Returned promises are observed for rejection. */
export type HostCallback<Args extends unknown[]> = (
  ...args: Args
) => void | Promise<void>;

/**
 * Invokes every callback with `args`, isolating the viewer from host failures.
 * Synchronous throws and rejected promises are passed to `onError`; one failing
 * callback never prevents the remaining callbacks from running.
 */
export function safeEmit<Args extends unknown[]>(
  callbacks: readonly HostCallback<Args>[],
  args: Args,
  onError: (error: unknown) => void,
): void {
  for (const callback of [...callbacks]) {
    try {
      const result = callback(...args);
      if (isPromiseLike(result)) {
        result.then(undefined, onError);
      }
    } catch (error) {
      onError(error);
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
