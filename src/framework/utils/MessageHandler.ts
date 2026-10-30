/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { safeEmit } from "./SafeEmit.js";

/** Callback invoked with a viewer warning, error, or log message. */
export type RaiseCallback = (message: string) => void | Promise<void>;

/** Reports host callback failures without re-entering MessageHandler. */
function reportCallbackFailure(error: unknown): void {
  console.error("[ARViewer] Message callback failed:", error);
}

export class MessageHandler {
  private static warningCallbacks: RaiseCallback[] = [];
  private static errorCallbacks: RaiseCallback[] = [];
  private static logCallbacks: RaiseCallback[] = [];

  /** Registers a callback for warning messages. */
  static addWarningCallback(callbackFn: RaiseCallback): void {
    if (!this.warningCallbacks.includes(callbackFn)) {
      this.warningCallbacks.push(callbackFn);
    }
  }

  /** Unregisters a warning callback. */
  static removeWarningCallback(callbackFn: RaiseCallback): void {
    const index = this.warningCallbacks.indexOf(callbackFn);
    if (index !== -1) {
      this.warningCallbacks.splice(index, 1);
    }
  }

  /** Registers a callback for error messages. */
  static addErrorCallback(callbackFn: RaiseCallback): void {
    if (!this.errorCallbacks.includes(callbackFn)) {
      this.errorCallbacks.push(callbackFn);
    }
  }

  /** Unregisters an error callback. */
  static removeErrorCallback(callbackFn: RaiseCallback): void {
    const index = this.errorCallbacks.indexOf(callbackFn);
    if (index !== -1) {
      this.errorCallbacks.splice(index, 1);
    }
  }

  /** Registers a callback for log messages. */
  static addLogCallback(callbackFn: RaiseCallback): void {
    if (!this.logCallbacks.includes(callbackFn)) {
      this.logCallbacks.push(callbackFn);
    }
  }

  /** Unregisters a log callback. */
  static removeLogCallback(callbackFn: RaiseCallback): void {
    const index = this.logCallbacks.indexOf(callbackFn);
    if (index !== -1) {
      this.logCallbacks.splice(index, 1);
    }
  }

  /** @internal */
  private static shouldRaise(forceRaise?: boolean): boolean {
    if (forceRaise === true) return true;
    const isProd = typeof __PRODUCTION__ !== "undefined" && __PRODUCTION__;
    return !isProd;
  }

  /** Raises a warning message. */
  static raiseWarning(message: string, forceRaise?: boolean): void {
    if (!this.shouldRaise(forceRaise)) return;
    safeEmit(this.warningCallbacks, [message], reportCallbackFailure);
  }

  /** Raises an error message and returns an Error. */
  static raiseError(message: string): Error {
    safeEmit(this.errorCallbacks, [message], reportCallbackFailure);
    return new Error(message);
  }

  /** Raises a log message. */
  static raiseLog(message: string, forceRaise?: boolean): void {
    if (!this.shouldRaise(forceRaise)) return;
    safeEmit(this.logCallbacks, [message], reportCallbackFailure);
  }

  /**
   * Returns a rejection handler that reports the failure as an error, for
   * fire-and-forget promises such as UI event handlers:
   * `void doWork().catch(MessageHandler.reportRejection("Restart"))`.
   */
  static reportRejection(context: string): (error: unknown) => void {
    return (error) => {
      this.raiseError(`${context} failed: ${String(error)}`);
    };
  }

  /** Clears all registered callbacks. */
  static dispose(): void {
    this.warningCallbacks = [];
    this.errorCallbacks = [];
    this.logCallbacks = [];
  }
}
