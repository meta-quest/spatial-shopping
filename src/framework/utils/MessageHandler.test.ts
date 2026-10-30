/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageHandler } from "./MessageHandler";
import { safeEmit } from "./SafeEmit";

afterEach(() => {
  MessageHandler.dispose();
  vi.restoreAllMocks();
});

describe("safeEmit", () => {
  it("runs every callback even when an earlier one throws", () => {
    const onError = vi.fn();
    const next = vi.fn();
    const failure = new Error("boom");

    safeEmit(
      [
        () => {
          throw failure;
        },
        next,
      ],
      ["payload"],
      onError,
    );

    expect(next).toHaveBeenCalledWith("payload");
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("catches rejections from async callbacks", async () => {
    const onError = vi.fn();
    const failure = new Error("async boom");

    safeEmit([async () => Promise.reject(failure)], [], onError);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  });

  it("tolerates a callback that unregisters itself while emitting", () => {
    const callbacks: Array<() => void> = [];
    const second = vi.fn();
    const first = () => callbacks.splice(callbacks.indexOf(first), 1);
    callbacks.push(first, second);

    safeEmit(callbacks, [], vi.fn());

    expect(second).toHaveBeenCalledOnce();
  });
});

describe("MessageHandler", () => {
  it("delivers errors to remaining callbacks when a host callback throws", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const received = vi.fn();
    MessageHandler.addErrorCallback(() => {
      throw new Error("host bug");
    });
    MessageHandler.addErrorCallback(received);

    const error = MessageHandler.raiseError("something failed");

    expect(error.message).toBe("something failed");
    expect(received).toHaveBeenCalledWith("something failed");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("reports rejected async host callbacks to the console", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    MessageHandler.addWarningCallback(async () => {
      throw new Error("async host bug");
    });

    MessageHandler.raiseWarning("careful");

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
  });

  it("formats rejection reports with their context", () => {
    const received = vi.fn();
    MessageHandler.addErrorCallback(received);

    MessageHandler.reportRejection("Restart")(new Error("no session"));

    expect(received).toHaveBeenCalledWith("Restart failed: Error: no session");
  });

  it("does not register the same callback twice", () => {
    const received = vi.fn();
    MessageHandler.addLogCallback(received);
    MessageHandler.addLogCallback(received);

    MessageHandler.raiseLog("hello");

    expect(received).toHaveBeenCalledOnce();
  });
});
