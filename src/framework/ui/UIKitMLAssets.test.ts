/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseUIKitMLSource } from "@iwsdk/core";
import { describe, expect, it } from "vitest";

const uiDirectory = resolve("public/ui");

describe("UIKitML assets", () => {
  for (const fileName of readdirSync(uiDirectory).filter((name) =>
    name.endsWith(".uikitml"),
  )) {
    it(`parses ${fileName} with the IWSDK Horizon kit`, () => {
      const sourceUrl = pathToFileURL(resolve(uiDirectory, fileName));
      const source = readFileSync(sourceUrl, "utf8");

      expect(() =>
        parseUIKitMLSource(source, sourceUrl.href, { kit: "horizon" }),
      ).not.toThrow();
    });
  }
});
