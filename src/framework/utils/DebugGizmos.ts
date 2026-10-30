/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  SphereGeometry,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Color,
  Vector3,
  Quaternion,
  Line,
  ArrowHelper,
  Entity,
  World,
} from "@iwsdk/core";
import { StaticGlobalConfigs } from "../config/debug";
import { RENDER_ORDER } from "../config/RenderOrder.js";

/**
 * Debug visualization utilities for drawing gizmos in 3D space.
 * All gizmos are only visible when ENABLE_DEBUG_GIZMOS is true.
 */
export class DebugGizmos {
  private static debugObjects: Map<string, Entity> = new Map();
  private static world: World | null = null;

  /**
   * Initialize the debug gizmos system with a reference to the scene.
   * Call this during app initialization.
   */
  static init(world: World): void {
    this.world = world;
  }

  /** Check if debug mode is enabled. */
  private static isDebugEnabled(): boolean {
    return StaticGlobalConfigs.ENABLE_DEBUG_GIZMOS;
  }

  /**
   * Draw a debug sphere at the given position.
   * @param name - Unique identifier for this gizmo
   * @param position - Position vector
   * @param radius - Sphere radius (default: 0.05)
   * @param color - Color (default: red)
   */
  static drawSphere(
    name: string,
    position: Vector3,
    radius: number = 0.05,
    color: number | string = 0xff0000,
  ): void {
    if (!this.isDebugEnabled() || !this.world) return;

    this.remove(name);

    const geometry = new SphereGeometry(radius, 16, 16);
    const material = new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.8,
      depthTest: true,
      depthWrite: false,
    });
    const sphere = new Mesh(geometry, material);
    sphere.position.copy(position);
    sphere.name = `DebugGizmo_${name}`;
    sphere.renderOrder = RENDER_ORDER.debugGizmo;

    this.debugObjects.set(name, this.createDebugEntity(sphere));
  }

  /**
   * Draw a debug box at the given position.
   * @param name - Unique identifier for this gizmo
   * @param position - Position vector
   * @param size - Box size (width, height, depth)
   * @param color - Color (default: green)
   * @param rotation - Optional rotation quaternion
   */
  static drawBox(
    name: string,
    position: Vector3,
    size: Vector3 = new Vector3(0.1, 0.1, 0.1),
    color: number | string = 0x00ff00,
    rotation?: Quaternion,
  ): void {
    if (!this.isDebugEnabled() || !this.world) return;

    this.remove(name);

    const geometry = new BoxGeometry(size.x, size.y, size.z);
    const material = new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.7,
      depthTest: true,
      depthWrite: false,
      wireframe: true,
    });
    const box = new Mesh(geometry, material);
    box.position.copy(position);
    if (rotation) {
      box.quaternion.copy(rotation);
    }
    box.name = `DebugGizmo_${name}`;
    box.renderOrder = RENDER_ORDER.debugGizmo;

    this.debugObjects.set(name, this.createDebugEntity(box));
  }

  /**
   * Draw a debug arrow from a starting point in a direction.
   * @param name - Unique identifier for this gizmo
   * @param origin - Starting position
   * @param direction - Direction vector (will be normalized)
   * @param length - Arrow length (default: 1.0)
   * @param color - Color (default: yellow)
   */
  static drawArrow(
    name: string,
    origin: Vector3,
    direction: Vector3,
    length: number = 1.0,
    color: number | string = 0xffff00,
  ): void {
    if (!this.isDebugEnabled() || !this.world) return;

    this.remove(name);

    const arrow = new ArrowHelper(
      direction.clone().normalize(),
      origin,
      length,
      new Color(color).getHex(),
      length * 0.2,
      length * 0.1,
    );
    arrow.name = `DebugGizmo_${name}`;

    this.debugObjects.set(name, this.createDebugEntity(arrow));
  }

  /**
   * Update an existing line's endpoints.
   * @param name - Gizmo identifier
   * @param start - New start position
   * @param end - New end position
   */
  static updateLine(name: string, start: Vector3, end: Vector3): void {
    if (!this.isDebugEnabled()) return;

    const obj = this.debugObjects.get(name)?.object3D;
    if (obj && obj instanceof Line) {
      const positions = obj.geometry.attributes.position.array as Float32Array;
      positions[0] = start.x;
      positions[1] = start.y;
      positions[2] = start.z;
      positions[3] = end.x;
      positions[4] = end.y;
      positions[5] = end.z;
      obj.geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Remove a specific debug gizmo.
   * @param name - Gizmo identifier
   */
  static remove(name: string): void {
    const entity = this.debugObjects.get(name);
    if (entity) {
      entity.dispose();
      this.debugObjects.delete(name);
    }
  }

  /** Remove all debug gizmos. */
  static clear(): void {
    if (!this.world) return;

    for (const name of Array.from(this.debugObjects.keys())) {
      this.remove(name);
    }
    this.debugObjects.clear();
  }

  static dispose(): void {
    this.clear();
    this.world = null;
  }

  /** Get all active debug gizmo names. */
  static getActiveGizmos(): string[] {
    return Array.from(this.debugObjects.keys());
  }

  /** Check if a gizmo exists. */
  static has(name: string): boolean {
    return this.debugObjects.has(name);
  }

  private static createDebugEntity(object3D: Mesh | ArrowHelper): Entity {
    return this.world!.createTransformEntity(object3D, {
      parent: this.world!.sceneEntity,
      persistent: true,
    });
  }
}
