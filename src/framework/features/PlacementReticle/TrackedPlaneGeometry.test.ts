/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "@iwsdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlanePolygonPoint,
  createTrackedPlaneGeometry,
  isPointInTrackedPlanePolygon,
  trackedPlanePolygonMatchesSnapshot,
  writeTrackedPlanePolygonSnapshot,
} from "./TrackedPlaneGeometry.js";

vi.hoisted(() => {
  const context = {
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
});

const geometries: ReturnType<typeof createTrackedPlaneGeometry>[] = [];

function build(polygon: PlanePolygonPoint[]) {
  const geometry = createTrackedPlaneGeometry(polygon);
  geometries.push(geometry);
  return geometry;
}

function rayHits(mesh: Mesh, x: number, z: number): boolean {
  const raycaster = new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0));
  return raycaster.intersectObject(mesh, false).length > 0;
}

afterEach(() => {
  for (const geometry of geometries) geometry?.dispose();
  geometries.length = 0;
});

describe("createTrackedPlaneGeometry", () => {
  it("preserves offset plane-local coordinates", () => {
    const geometry = build([
      { x: 2, z: -3 },
      { x: 4, z: -3 },
      { x: 4, z: -1 },
      { x: 2, z: -1 },
    ]);

    expect(geometry).not.toBeNull();
    expect(geometry!.boundingBox!.min.toArray()).toEqual([2, 0, -3]);
    expect(geometry!.boundingBox!.max.toArray()).toEqual([4, 0, -1]);
  });

  it("clips raycasts to a concave tracked-plane polygon", () => {
    const geometry = build([
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 0, z: 2 },
    ]);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry!, material);
    mesh.updateMatrixWorld(true);

    expect(rayHits(mesh, 0.5, 1.5)).toBe(true);
    expect(rayHits(mesh, 1.5, 1.5)).toBe(false);
    material.dispose();
  });

  it("supports reversed winding and removes repeated boundary points", () => {
    const geometry = build([
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
      { x: 1, z: 1 },
      { x: 1, z: 0 },
      { x: 0, z: 0 },
    ]);

    expect(geometry).not.toBeNull();
    expect(geometry!.getAttribute("position").count).toBe(4);
    expect(geometry!.getIndex()!.count).toBe(6);
  });

  it("rejects polygons without a usable area", () => {
    expect(
      build([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ]),
    ).toBeNull();
  });
});

describe("tracked plane polygon helpers", () => {
  const concavePolygon = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 1 },
    { x: 1, z: 1 },
    { x: 1, z: 2 },
    { x: 0, z: 2 },
  ];

  it("reuses a coordinate snapshot and detects actual polygon changes", () => {
    const snapshot = writeTrackedPlanePolygonSnapshot(concavePolygon);
    expect(writeTrackedPlanePolygonSnapshot(concavePolygon, snapshot)).toBe(
      snapshot,
    );
    expect(trackedPlanePolygonMatchesSnapshot(concavePolygon, snapshot)).toBe(
      true,
    );

    const jittered = concavePolygon.map((point) => ({ ...point }));
    jittered[2].x += 0.0001;
    expect(trackedPlanePolygonMatchesSnapshot(jittered, snapshot)).toBe(true);

    const changed = concavePolygon.map((point) => ({ ...point }));
    changed[2].x += 0.01;
    expect(trackedPlanePolygonMatchesSnapshot(changed, snapshot)).toBe(false);
  });

  it("tests concave interiors, notches, and boundary points", () => {
    expect(isPointInTrackedPlanePolygon(0.5, 1.5, concavePolygon)).toBe(true);
    expect(isPointInTrackedPlanePolygon(1.5, 1.5, concavePolygon)).toBe(false);
    expect(isPointInTrackedPlanePolygon(1, 1.5, concavePolygon)).toBe(true);
  });

  it("ignores closing and consecutive duplicate vertices", () => {
    const closed = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 0, z: 1 },
      { x: 0, z: 0 },
    ];
    const withDuplicate = [
      ...closed.slice(0, 2),
      closed[1],
      ...closed.slice(2),
    ];

    expect(isPointInTrackedPlanePolygon(2, 2, closed)).toBe(false);
    expect(isPointInTrackedPlanePolygon(2, 2, withDuplicate)).toBe(false);
  });
});
