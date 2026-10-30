/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Object3D, Mesh } from "@iwsdk/core";

/**
 * Recursively sets material properties on a mesh and its descendants.
 * @param obj3D - The root object to traverse
 * @param options - Material overrides (transparent, opacity, depthTest, depthWrite)
 */
export function setMaterialProperties(
  obj3D: Object3D,
  options: {
    transparent?: boolean;
    opacity?: number;
    depthTest?: boolean;
    depthWrite?: boolean;
  },
): void {
  if (obj3D instanceof Mesh) {
    obj3D.material.transparent =
      options.transparent != undefined
        ? options.transparent
        : obj3D.material.transparent;
    obj3D.material.opacity =
      options.opacity != undefined ? options.opacity : obj3D.material.opacity;
    obj3D.material.depthTest =
      options.depthTest != undefined
        ? options.depthTest
        : obj3D.material.depthTest;
    obj3D.material.depthWrite =
      options.depthWrite != undefined
        ? options.depthWrite
        : obj3D.material.depthWrite;
    return;
  }
  for (const child of obj3D.children) {
    setMaterialProperties(child, options);
  }
}
