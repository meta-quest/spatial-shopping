/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

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

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type Entity,
} from "@iwsdk/core";

import type { MaterialSet } from "../../types/ProductData";
import {
  CustomGrab,
  GrabState,
} from "../../features/CustomGrab/CustomGrabSystem.js";
import { InterpolationDestination } from "../../features/Interpolate/InterpolateSystem.js";
import { PreferredOrientation } from "../../utils/PlacementUtils.js";
import { AssetLoader, type LoadedTexturePack } from "./AssetLoader";
import { SceneManager, shallowCloneGeometry } from "./SceneManager";

const materialSet: MaterialSet[] = [
  {
    materialName: "target",
    texturePack: {
      diffuse: "diffuse.png",
      metallicRoughness: "metallic-roughness.png",
      normal: "normal.png",
      repeat: [1, 1],
    },
  },
];

function loadedPack(diffuse: Texture): LoadedTexturePack {
  return {
    diffuse,
    metallicRoughness: null,
    normal: null,
    occlusion: null,
  };
}

function entityFor(root: Group): Entity {
  return { object3D: root } as unknown as Entity;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SceneManager.applyMaterialSet", () => {
  it("keeps a replaced texture alive while a sibling material still uses it", async () => {
    const sharedTexture = new Texture();
    const replacementTexture = new Texture();
    const targetMaterial = new MeshStandardMaterial({ map: sharedTexture });
    targetMaterial.name = "target";
    const siblingMaterial = new MeshStandardMaterial({ map: sharedTexture });
    siblingMaterial.name = "sibling";
    const root = new Group();
    root.add(
      new Mesh(new BoxGeometry(), targetMaterial),
      new Mesh(new BoxGeometry(), siblingMaterial),
    );
    const disposeSpy = vi.spyOn(sharedTexture, "dispose");
    vi.spyOn(AssetLoader.prototype, "loadTexturePack").mockResolvedValue(
      loadedPack(replacementTexture),
    );

    const committed = await new SceneManager().applyMaterialSet(
      entityFor(root),
      materialSet,
    );

    expect(committed).toBe(true);
    expect(targetMaterial.map).toBe(replacementTexture);
    expect(siblingMaterial.map).toBe(sharedTexture);
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it("disposes a replaced texture after its last product reference is removed", async () => {
    const originalTexture = new Texture();
    const replacementTexture = new Texture();
    const targetMaterial = new MeshStandardMaterial({ map: originalTexture });
    targetMaterial.name = "target";
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), targetMaterial));
    const disposeSpy = vi.spyOn(originalTexture, "dispose");
    vi.spyOn(AssetLoader.prototype, "loadTexturePack").mockResolvedValue(
      loadedPack(replacementTexture),
    );

    await new SceneManager().applyMaterialSet(entityFor(root), materialSet);

    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("disposes staged textures without mutating materials when commit is stale", async () => {
    const originalTexture = new Texture();
    const replacementTexture = new Texture();
    const targetMaterial = new MeshStandardMaterial({ map: originalTexture });
    targetMaterial.name = "target";
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), targetMaterial));
    const disposeSpy = vi.spyOn(replacementTexture, "dispose");
    vi.spyOn(AssetLoader.prototype, "loadTexturePack").mockResolvedValue(
      loadedPack(replacementTexture),
    );
    let commitChecks = 0;

    const committed = await new SceneManager().applyMaterialSet(
      entityFor(root),
      materialSet,
      undefined,
      () => ++commitChecks === 1,
    );

    expect(committed).toBe(false);
    expect(targetMaterial.map).toBe(originalTexture);
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});

describe("SceneManager.activateCurrentProduct", () => {
  it("places the loaded product at its existing ECS transform", async () => {
    const object3D = new Group();
    object3D.visible = false;
    object3D.position.set(1, 2, 3);
    object3D.userData.orientation = PreferredOrientation.horizontal;

    const addComponent = vi.fn();
    const entity = {
      object3D,
      hasComponent: vi.fn(() => false),
      addComponent,
    } as unknown as Entity;
    addComponent.mockReturnValue(entity);

    const manager = new SceneManager();
    manager.currentProduct = {
      product: "test-product",
      entity,
      customBboxAndEntities: {} as never,
    };

    await manager.activateCurrentProduct({ snappedToPlane: true });

    expect(object3D.visible).toBe(true);
    expect(addComponent).toHaveBeenNthCalledWith(
      1,
      CustomGrab,
      expect.objectContaining({
        state: GrabState.IDLE,
        rotationAxis: "y",
        snappedToPlane: true,
        isGrabbed: false,
      }),
    );
    expect(addComponent).toHaveBeenNthCalledWith(
      2,
      InterpolationDestination,
      expect.objectContaining({ targetPosition: [1, 2, 3] }),
    );
  });
});

describe("SceneManager.activateCurrentProduct on an already placed product", () => {
  it("writes interpolation targets through vector views", async () => {
    const object3D = new Group();
    object3D.position.set(1, 2, 3);
    object3D.userData.orientation = PreferredOrientation.horizontal;

    const targetPosition = new Float32Array(3);
    const targetRotation = new Float32Array(4);
    const setValue = vi.fn((_component: unknown, key: string) => {
      if (key === "targetPosition" || key === "targetRotation") {
        throw new Error("Array/vector types must be written via getVectorView");
      }
    });
    const entity = {
      object3D,
      hasComponent: vi.fn(() => true),
      getValue: vi.fn(() => GrabState.IDLE),
      setValue,
      getVectorView: vi.fn((_component: unknown, key: string) =>
        key === "targetPosition" ? targetPosition : targetRotation,
      ),
    } as unknown as Entity;

    const manager = new SceneManager();
    manager.currentProduct = {
      product: "test-product",
      entity,
      customBboxAndEntities: {} as never,
    };

    await manager.activateCurrentProduct({ snappedToPlane: true });

    expect(Array.from(targetPosition)).toEqual([1, 2, 3]);
    expect(Array.from(targetRotation)).toEqual([0, 0, 0, 1]);
  });
});

describe("SceneManager occlusion snapshot", () => {
  function occludableProduct(material: MeshStandardMaterial) {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), material);
    root.add(mesh);
    let occluded = false;
    const entity = {
      object3D: root,
      hasComponent: vi.fn(() => occluded),
      addComponent: vi.fn(() => {
        occluded = true;
        // DepthOccludable patches materials in place.
        material.transparent = true;
      }),
      removeComponent: vi.fn(() => {
        occluded = false;
      }),
    } as unknown as Entity;
    const manager = new SceneManager();
    manager.currentProduct = {
      product: "test-product",
      entity,
      customBboxAndEntities: {} as never,
    };
    return { manager, entity, mesh };
  }

  it("restores the newly applied variant when occlusion is turned off", async () => {
    const originalTexture = new Texture();
    const replacementTexture = new Texture();
    const material = new MeshStandardMaterial({ map: originalTexture });
    material.name = "target";
    const { manager, entity, mesh } = occludableProduct(material);
    const originalDispose = vi.spyOn(originalTexture, "dispose");
    vi.spyOn(AssetLoader.prototype, "loadTexturePack").mockResolvedValue(
      loadedPack(replacementTexture),
    );

    manager.setOcclusionEnabled(true);
    await manager.applyMaterialSet(entity, materialSet);
    manager.setOcclusionEnabled(false);

    const restored = mesh.material as MeshStandardMaterial;
    expect(restored).not.toBe(material);
    expect(restored.map).toBe(replacementTexture);
    expect(restored.transparent).toBe(false);
    expect(originalDispose).toHaveBeenCalledOnce();
  });

  it("disposes snapshot clones when the product is cleared", () => {
    const material = new MeshStandardMaterial();
    const { manager } = occludableProduct(material);
    const cloneSpy = vi.spyOn(MeshStandardMaterial.prototype, "clone");

    manager.setOcclusionEnabled(true);
    const snapshot = cloneSpy.mock.results[0]?.value as MeshStandardMaterial;
    const disposeSpy = vi.spyOn(snapshot, "dispose");
    manager.setCurrentProduct(null);

    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});

describe("shallowCloneGeometry", () => {
  it("shares vertex attributes but keeps attribute maps independent", () => {
    const source = new BoxGeometry();
    const copy = shallowCloneGeometry(source);

    expect(copy).not.toBe(source);
    expect(copy.attributes.position).toBe(source.attributes.position);
    expect(copy.index).toBe(source.index);
    expect(copy.groups).toEqual(source.groups);

    copy.setAttribute("uv2", copy.attributes.uv);
    expect(source.attributes.uv2).toBeUndefined();
  });
});
