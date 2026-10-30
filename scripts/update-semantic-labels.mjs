#!/usr/bin/env node

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Fetches semantic labels from immersive-web/semantic-labels and updates the local JSON.
 * Run: npm run update:semantic-labels
 * @see https://github.com/immersive-web/semantic-labels
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(
  __dirname,
  "../src/framework/data/semantic-labels.json",
);
const SOURCE_URL =
  "https://raw.githubusercontent.com/immersive-web/semantic-labels/master/labels.json";

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`Failed to fetch: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const json = await res.json();
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(json, null, 2) + "\n");
console.log(`Updated ${OUTPUT_PATH}`);
