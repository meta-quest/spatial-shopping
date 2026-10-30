/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BufferAttribute,
  BufferGeometry,
  ShapeUtils,
  Vector2,
} from "@iwsdk/core";

export interface PlanePolygonPoint {
  readonly x: number;
  readonly z: number;
}

const POINT_EPSILON_SQUARED = 1e-12;
const AREA_EPSILON = 1e-10;
const EDGE_EPSILON = 1e-8;
const SNAPSHOT_EPSILON = 0.0005;

function coordinatesMatch(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz <= POINT_EPSILON_SQUARED;
}

/** Builds an exact, plane-local XZ mesh from a WebXR tracked-plane polygon. */
export function createTrackedPlaneGeometry(
  polygon: readonly PlanePolygonPoint[],
): BufferGeometry | null {
  const contour: Vector2[] = [];
  for (const point of polygon) {
    const previous = contour[contour.length - 1];
    if (
      !previous ||
      !coordinatesMatch(previous.x, previous.y, point.x, point.z)
    ) {
      contour.push(new Vector2(point.x, point.z));
    }
  }

  if (
    contour.length > 2 &&
    coordinatesMatch(
      contour[0].x,
      contour[0].y,
      contour[contour.length - 1].x,
      contour[contour.length - 1].y,
    )
  ) {
    contour.pop();
  }
  if (contour.length < 3) return null;

  let twiceSignedArea = 0;
  for (let i = 0; i < contour.length; i++) {
    const current = contour[i];
    const next = contour[(i + 1) % contour.length];
    twiceSignedArea += current.x * next.y - next.x * current.y;
  }
  if (Math.abs(twiceSignedArea) <= AREA_EPSILON) return null;

  const faces = ShapeUtils.triangulateShape(contour, []);
  if (faces.length === 0) return null;

  const positions = new Float32Array(contour.length * 3);
  for (let i = 0; i < contour.length; i++) {
    const point = contour[i];
    const offset = i * 3;
    positions[offset] = point.x;
    positions[offset + 1] = 0;
    positions[offset + 2] = point.y;
  }

  const IndexArray = contour.length <= 65_535 ? Uint16Array : Uint32Array;
  const indices = new IndexArray(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const offset = i * 3;
    indices[offset] = face[0];
    indices[offset + 1] = face[1];
    indices[offset + 2] = face[2];
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function trackedPlanePolygonMatchesSnapshot(
  polygon: readonly PlanePolygonPoint[],
  snapshot: Float64Array | undefined,
): boolean {
  if (!snapshot || snapshot.length !== polygon.length * 2) return false;
  for (let i = 0; i < polygon.length; i++) {
    const point = polygon[i];
    const offset = i * 2;
    if (
      Math.abs(snapshot[offset] - point.x) > SNAPSHOT_EPSILON ||
      Math.abs(snapshot[offset + 1] - point.z) > SNAPSHOT_EPSILON
    ) {
      return false;
    }
  }
  return true;
}

export function writeTrackedPlanePolygonSnapshot(
  polygon: readonly PlanePolygonPoint[],
  target?: Float64Array,
): Float64Array {
  const requiredLength = polygon.length * 2;
  const snapshot =
    target?.length === requiredLength
      ? target
      : new Float64Array(requiredLength);
  for (let i = 0; i < polygon.length; i++) {
    const offset = i * 2;
    snapshot[offset] = polygon[i].x;
    snapshot[offset + 1] = polygon[i].z;
  }
  return snapshot;
}

/** Tests a plane-local XZ point against a tracked plane, including its edge. */
export function isPointInTrackedPlanePolygon(
  x: number,
  z: number,
  polygon: readonly PlanePolygonPoint[],
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  let previous = polygon[polygon.length - 1];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const edgeX = current.x - previous.x;
    const edgeZ = current.z - previous.z;
    const pointX = x - previous.x;
    const pointZ = z - previous.z;
    const cross = edgeX * pointZ - edgeZ * pointX;
    const dot = pointX * edgeX + pointZ * edgeZ;
    const edgeLengthSquared = edgeX * edgeX + edgeZ * edgeZ;
    if (edgeLengthSquared <= EDGE_EPSILON) {
      previous = current;
      continue;
    }
    if (
      Math.abs(cross) <= EDGE_EPSILON &&
      dot >= -EDGE_EPSILON &&
      dot <= edgeLengthSquared + EDGE_EPSILON
    ) {
      return true;
    }

    if (
      current.z > z !== previous.z > z &&
      x <
        ((previous.x - current.x) * (z - current.z)) /
          (previous.z - current.z) +
          current.x
    ) {
      inside = !inside;
    }
    previous = current;
  }
  return inside;
}
