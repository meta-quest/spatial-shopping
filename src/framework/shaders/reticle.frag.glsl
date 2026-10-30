/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

uniform vec2 uCenterLocal;
uniform float uOpacity;
uniform float uIsValid;
uniform float uRadius;
uniform float uFadeDistance;
uniform float uSpacing;
uniform float uDotRadius;
uniform vec3 uPatternRight;
uniform vec3 uPatternUp;

varying vec2 vPlanePosition;
varying vec3 vWorldPosition;

const vec3 VALID_COLOR = vec3(1.0);
const vec3 INVALID_COLOR = vec3(1.0, 0.27, 0.27);
const float CROSS_ARM_LENGTH = 0.025;
const float CROSS_THICKNESS = 0.006;

float circle(vec2 point, float radius) {
    float distanceToCenter = length(point);
    float antialias = fwidth(distanceToCenter) * 1.5;
    return 1.0 - smoothstep(radius - antialias, radius + antialias, distanceToCenter);
}

float segmentDistance(vec2 point, vec2 start, vec2 end) {
    vec2 toPoint = point - start;
    vec2 segment = end - start;
    float amount = clamp(dot(toPoint, segment) / dot(segment, segment), 0.0, 1.0);
    return length(toPoint - segment * amount);
}

float crossMark(vec2 point) {
    float first = segmentDistance(
        point,
        vec2(-CROSS_ARM_LENGTH),
        vec2(CROSS_ARM_LENGTH)
    );
    float second = segmentDistance(
        point,
        vec2(-CROSS_ARM_LENGTH, CROSS_ARM_LENGTH),
        vec2(CROSS_ARM_LENGTH, -CROSS_ARM_LENGTH)
    );
    float distanceToCross = min(first, second) - CROSS_THICKNESS;
    float antialias = fwidth(distanceToCross) * 1.5;
    return 1.0 - smoothstep(-antialias, antialias, distanceToCross);
}

void main() {
    vec2 radialOffset = vPlanePosition - uCenterLocal;
    float distanceSquared = dot(radialOffset, radialOffset);
    float radiusSquared = uRadius * uRadius;
    if (distanceSquared >= radiusSquared || uOpacity <= 0.001) discard;

    float fadeDistance = clamp(uFadeDistance, 0.001, uRadius);
    float fieldMask = 1.0 - smoothstep(
        uRadius - fadeDistance,
        uRadius,
        sqrt(distanceSquared)
    );
    if (fieldMask <= 0.001) discard;

    // The phase is anchored in reference-space meters. Plane-origin refinement
    // can move local coordinates without sliding this lattice in the room.
    vec2 patternPosition = vec2(
        dot(vWorldPosition, uPatternRight),
        dot(vWorldPosition, uPatternUp)
    );
    vec2 cell = (fract(patternPosition / uSpacing + 0.5) - 0.5) * uSpacing;
    float pattern = uIsValid > 0.5
        ? circle(cell, uDotRadius)
        : crossMark(cell);

    float alpha = pattern * fieldMask * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(mix(INVALID_COLOR, VALID_COLOR, uIsValid), alpha);
}
