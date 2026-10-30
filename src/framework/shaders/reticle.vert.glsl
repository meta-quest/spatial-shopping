/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

uniform float uSurfaceOffset;
uniform float uSurfaceOffsetSign;

varying vec2 vPlanePosition;
varying vec3 vWorldPosition;

void main() {
    vPlanePosition = position.xz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 surfacePosition = position;
    surfacePosition.y += uSurfaceOffset * uSurfaceOffsetSign;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(surfacePosition, 1.0);
}
