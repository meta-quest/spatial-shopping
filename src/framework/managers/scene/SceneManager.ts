/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Entity,
  World,
  AssetManager,
  RayInteractable,
  XRAnchor,
  DepthOccludable,
} from "@iwsdk/core";
import {
  Object3D,
  Mesh,
  LineSegments,
  BufferGeometry,
  LineBasicMaterial,
  Box3,
  Vector3,
  Material,
  MeshStandardMaterial,
  Texture,
} from "@iwsdk/core";
import { CONFIG } from "../../config/ViewerConfig";
import { ArrowMoverSystemFloor } from "../../features/ArrowMover/ArrowMoverSystemFloor";
import { ArrowMoverSystemWall } from "../../features/ArrowMover/ArrowMoverSystemWall";
import {
  CustomBbox,
  BoundingBoxManager,
} from "../../features/BoundingBox/BoundingBoxManager";
import {
  CustomFollower,
  CustomFollowBehavior,
} from "../../features/CustomFollower/CustomFollowerSystem";
import {
  CustomGrab,
  GrabState,
} from "../../features/CustomGrab/CustomGrabSystem";
import { ErrorUtil } from "../../utils/ErrorUtil";
import { MessageHandler } from "../../utils/MessageHandler";
import { XRSessionErrorCode } from "../session/ErrorCodes";
import { AssetLoader, type LoadedTexturePack } from "./AssetLoader";
import { ProductData, XRData, MaterialSet } from "../../types/ProductData";
import { getBoundingBox } from "../../utils/BoundingBoxUtils";
import { UIManager } from "../ui/UIManager.js";
import { InterpolationDestination } from "../../features/Interpolate/InterpolateSystem";
import { PreferredOrientation } from "../../utils/PlacementUtils";
import { RENDER_ORDER } from "../../config/RenderOrder.js";

function toMaterialArray(materials: Material | Material[]): Material[] {
  return Array.isArray(materials) ? materials : [materials];
}

/**
 * Copies a geometry's attribute map, groups, and bounds while sharing the
 * underlying BufferAttribute objects (and their vertex arrays).
 */
export function shallowCloneGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = source.name;
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  for (const name of ["position", "normal", "color"] as const) {
    const attributes = source.morphAttributes[name];
    if (attributes) geometry.morphAttributes[name] = [...attributes];
  }
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  for (const group of source.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.drawRange.start = source.drawRange.start;
  geometry.drawRange.count = source.drawRange.count;
  geometry.userData = { ...source.userData };
  return geometry;
}

export type CurrentProduct = {
  product: string;
  entity: Entity | null;
  customBboxAndEntities: { customBbox: CustomBbox; entities: Entity[] };
} | null;
/**
 * Manages product data and provides access to product information
 * Follows Singleton pattern to ensure single source of truth
 */
export class SceneManager {
  private world: World | null = null;
  private assetLoader: AssetLoader = new AssetLoader();

  public showDimensions: boolean = false;
  public currentProduct: CurrentProduct | null = null;
  public arrowMoverSystemFloor: ArrowMoverSystemFloor | null = null;
  public arrowMoverSystemWall: ArrowMoverSystemWall | null = null;
  public uiManager!: UIManager | null;

  /**
   * Unpatched material clones captured before DepthOccludable injects its
   * shader code. Restored when occlusion is turned off.
   */
  private occlusionSnapshot: Map<Mesh, Material | Material[]> = new Map();

  /** Creates a new SceneManager instance. */
  constructor() {}

  /**
   * Initializes the scene manager.
   * @param world - The world to initialize the scene manager for.
   */
  public async init(world: World | null): Promise<void> {
    this.world = world;
  }

  /**
   * Loads and adds a product from its asset URL.
   * @param productData - The product data containing asset URL and metadata.
   */
  async addProduct(productData: ProductData): Promise<void> {
    if (!this.world) return;

    const metadata: XRData | null = productData.xr || null;

    if (!metadata || !metadata.assetUrl || metadata.assetUrl.trim() === "") {
      this.uiManager!.showErrorPanel("No asset URL provided in product data.");
      throw MessageHandler.raiseError(XRSessionErrorCode.ASSET_FETCH_FAILED);
    }

    try {
      await AssetManager.loadGLTF(metadata.assetUrl, metadata.assetUrl);
      const result = AssetManager.getGLTF(metadata.assetUrl);
      if (!result) {
        throw new Error(`AssetManager did not cache ${metadata.assetUrl}`);
      }
      await this.processLoadedMesh(productData, result.scene, metadata);
    } catch (caught: unknown) {
      const error =
        caught instanceof Error ? caught : new Error(String(caught));
      const errorCode = ErrorUtil.classifyAssetError(error);
      if (errorCode === XRSessionErrorCode.ASSET_FETCH_FAILED) {
        this.uiManager!.showErrorPanel(error.message);
      }
      throw MessageHandler.raiseError(
        errorCode +
          " product: " +
          productData.id +
          " url: " +
          metadata.assetUrl +
          " error: " +
          error.message,
      );
    }
  }

  /**
   * Processes the loaded mesh and creates the product entity.
   * @param productData - The product data to process the mesh for.
   * @param mesh - The mesh to process.
   * @param metadata - The metadata to process the mesh for.
   */
  private async processLoadedMesh(
    productData: ProductData,
    mesh: Object3D,
    metadata: XRData | null,
  ): Promise<void> {
    let entity: Entity | null = null;

    const productMesh = mesh;
    productMesh.renderOrder = RENDER_ORDER.product;
    productMesh.name = productData.id;

    productMesh.position.set(0, 0, 0);
    productMesh.rotation.set(0, 0, 0);
    productMesh.scale.set(1, 1, 1);
    this.makeMeshResourcesOwned(productMesh);

    if (metadata?.initialPosition) {
      productMesh.position.set(...metadata.initialPosition);
    } else {
      productMesh.position.set(...CONFIG.placement.initial.defaultPosition);
    }

    if (metadata?.initialRotation && metadata.initialRotation.length >= 3) {
      productMesh.rotation.set(
        metadata.initialRotation[0],
        metadata.initialRotation[1],
        metadata.initialRotation[2],
      );
    }

    if (metadata?.initialScale) {
      if (typeof metadata.initialScale === "number") {
        productMesh.scale.setScalar(metadata.initialScale);
      } else {
        productMesh.scale.set(
          ...(metadata.initialScale as [number, number, number]),
        );
      }
    }

    productMesh.userData.orientation =
      metadata?.orientation || PreferredOrientation.horizontal;

    if (metadata?.materialAdjustments) {
      this.applyMaterialAdjustments(productMesh, metadata.materialAdjustments);
    }

    entity = this.world!.createTransformEntity(productMesh);
    entity.addComponent(RayInteractable);
    entity.addComponent(XRAnchor);

    const emptyBbox: CustomBbox = {
      mesh: new LineSegments(
        new BufferGeometry(),
        new LineBasicMaterial({ color: 0x000000 }),
      ),
      bbox: new Box3(),
    };
    let customBboxAndEntities: { customBbox: CustomBbox; entities: Entity[] } =
      { customBbox: emptyBbox, entities: [] };

    if (entity?.object3D) {
      entity.object3D.visible = false;
      entity.object3D.userData.originalScale = entity.object3D.scale.clone();
      entity.object3D.userData.originalRotation =
        entity.object3D.quaternion.clone();
      const originalBBox = getBoundingBox(entity.object3D);
      entity.object3D.userData.originalSize = originalBBox.getSize(
        new Vector3(),
      );
      entity.object3D.userData.product = productData.id;
      entity.object3D.userData.assetUrl = metadata?.assetUrl || "";

      customBboxAndEntities = this.createCustomBbox(
        entity.object3D,
        productData,
      );
      entity.object3D.userData.bboxSize =
        customBboxAndEntities.customBbox.bbox.getSize(new Vector3());
    }

    this.currentProduct = {
      product: productData.id,
      entity,
      customBboxAndEntities,
    };

    if (this.arrowMoverSystemFloor) {
      this.arrowMoverSystemFloor.setPlacedObject(this.currentProduct.entity);
    }
    if (this.arrowMoverSystemWall) {
      this.arrowMoverSystemWall.setPlacedObject(this.currentProduct.entity);
    }
  }

  /**
   * Clones resources that the viewer mutates so AssetManager's cache stays
   * immutable. Geometry is copied shallowly: the only geometry mutation is
   * adding a `uv2` attribute alias, so vertex buffers can stay shared.
   */
  private makeMeshResourcesOwned(root: Object3D): void {
    const textureClones = new Map<string, Texture>();
    const cloneMaterial = (source: Material): Material => {
      const material = source.clone();
      const properties = material as unknown as Record<string, unknown>;

      for (const key of Object.keys(properties)) {
        const value = properties[key];
        if (!(value instanceof Texture)) continue;

        let texture = textureClones.get(value.uuid);
        if (!texture) {
          texture = value.clone();
          texture.needsUpdate = true;
          textureClones.set(value.uuid, texture);
        }
        properties[key] = texture;
      }

      return material;
    };

    root.traverse((child) => {
      const renderable = child as Object3D & {
        geometry?: BufferGeometry;
        material?: Material | Material[];
      };
      if (renderable.geometry) {
        renderable.geometry = shallowCloneGeometry(renderable.geometry);
      }
      if (!renderable.material) return;
      renderable.material = Array.isArray(renderable.material)
        ? renderable.material.map(cloneMaterial)
        : cloneMaterial(renderable.material);
    });
  }

  /**
   * Creates the custom bounding box.
   * @param object3D - The object3D to create the bounding box for.
   * @param productData - The product data to create the bounding box for.
   * @returns The custom bounding box and the entities.
   */
  createCustomBbox(
    object3D: Object3D,
    productData?: ProductData,
  ): { customBbox: CustomBbox; entities: Entity[] } {
    object3D.updateMatrixWorld(true);

    const bbox = getBoundingBox(object3D, { useWorldSpace: false });
    const bboxCenter = bbox.getCenter(new Vector3());

    object3D.userData.bboxSize = bbox.getSize(new Vector3());
    object3D.userData.bboxMin = bbox.min.clone();
    object3D.userData.bboxMax = bbox.max.clone();

    delete object3D.userData.dimensionCandidates;
    delete object3D.userData.dimensionCandidatesKey;

    const productDimensions =
      productData?.metadata?.dimensions &&
      productData.metadata.dimensions.width &&
      productData.metadata.dimensions.height &&
      productData.metadata.dimensions.length
        ? {
            width: productData.metadata.dimensions.width,
            height: productData.metadata.dimensions.height,
            length: productData.metadata.dimensions.length,
          }
        : undefined;

    const customBbox = BoundingBoxManager.createBoundingBox(
      bbox,
      true,
      productDimensions,
    );
    customBbox.mesh.visible = false;
    this.showDimensions = false;
    const entities: Entity[] = [];

    entities.push(
      this.world!.createTransformEntity(customBbox.mesh).addComponent(
        CustomFollower,
        {
          target: object3D,
          behavior: CustomFollowBehavior.COPY_TRANSFORM,
          offsetPosition: [bboxCenter.x, bboxCenter.y, bboxCenter.z],
        },
      ),
    );

    const dimKeys = ["x", "y", "z"] as const;
    for (const key of dimKeys) {
      const dim = customBbox.dimensions?.[key];
      if (!dim) continue;
      dim.userData.dimensionType = key;
      const offset = new Vector3().copy(dim.position).add(bboxCenter);
      entities.push(
        this.world!.createTransformEntity(dim).addComponent(CustomFollower, {
          target: object3D,
          behavior:
            CustomFollowBehavior.FOLLOW_TARGET_AND_FACE_USER_DYNAMIC_EDGE,
          offsetPosition: [offset.x, offset.y, offset.z],
        }),
      );
      dim.visible = false;
    }

    return {
      customBbox,
      entities,
    };
  }

  /**
   * Resets the product placement.
   */
  resetProductPlacement() {
    if (
      !this.world ||
      !this.currentProduct ||
      !this.currentProduct.entity ||
      !this.currentProduct.entity.object3D
    )
      return;
    this.currentProduct.entity!.object3D!.visible = false;
    this.currentProduct.entity!.object3D!.scale.setScalar(
      this.currentProduct.entity!.object3D!.userData.originalScale.y,
    );
    this.currentProduct.entity!.removeComponent(CustomGrab);
    this.setProductDimensionsVisibility(false);
  }

  /**
   * Sets the visibility of the product dimensions.
   * @param visible - The visibility of the product dimensions.
   */
  setProductDimensionsVisibility(visible: boolean) {
    if (
      !this.world ||
      !this.currentProduct ||
      !this.currentProduct.entity ||
      !this.currentProduct.entity.object3D
    )
      return;
    if (visible && !this.currentProduct.entity.object3D.visible) return;

    this.showDimensions = visible;
    this.currentProduct.customBboxAndEntities.customBbox.mesh.visible = visible;
    if (this.currentProduct.customBboxAndEntities.customBbox.dimensions?.x) {
      this.currentProduct.customBboxAndEntities.customBbox.dimensions.x.visible =
        visible;
    }
    if (this.currentProduct.customBboxAndEntities.customBbox.dimensions?.y) {
      this.currentProduct.customBboxAndEntities.customBbox.dimensions.y.visible =
        visible;
    }
    if (this.currentProduct.customBboxAndEntities.customBbox.dimensions?.z) {
      this.currentProduct.customBboxAndEntities.customBbox.dimensions.z.visible =
        visible;
    }
  }

  /**
   * Enables or disables depth occlusion for the current product.
   * @param enabled - Whether occlusion should be enabled.
   */
  setOcclusionEnabled(enabled: boolean) {
    const entity = this.currentProduct!.entity!;
    const hasComponent = entity.hasComponent(DepthOccludable);

    if (enabled && !hasComponent) {
      if (entity.object3D) {
        this.snapshotCurrentMaterials(entity.object3D);
      }
      entity.addComponent(DepthOccludable);
    } else if (!enabled && hasComponent) {
      entity.removeComponent(DepthOccludable);
      this.restoreOcclusionSnapshot();
    }
  }

  private snapshotCurrentMaterials(root: Object3D): void {
    this.disposeOcclusionSnapshot();
    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      this.occlusionSnapshot.set(
        child,
        Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone(),
      );
    });
  }

  /** Swaps the occlusion-patched materials back for the unpatched snapshot. */
  private restoreOcclusionSnapshot(): void {
    for (const [mesh, snapshot] of this.occlusionSnapshot) {
      for (const material of toMaterialArray(mesh.material)) {
        material.dispose();
      }
      mesh.material = snapshot;
    }
    this.occlusionSnapshot.clear();
  }

  /** Disposes snapshot material clones without restoring them. */
  private disposeOcclusionSnapshot(): void {
    for (const snapshot of this.occlusionSnapshot.values()) {
      for (const material of toMaterialArray(snapshot)) {
        material.dispose();
      }
    }
    this.occlusionSnapshot.clear();
  }

  /**
   * Applies staged texture packs to the occlusion snapshot so that turning
   * occlusion off after a variant change restores the new variant.
   * @returns Textures replaced on snapshot materials.
   */
  private applyStagedToOcclusionSnapshot(
    staged: ReadonlyArray<{
      material: Material;
      textures: LoadedTexturePack;
      repeat: [number, number];
    }>,
  ): Set<Texture> {
    const replacedTextures = new Set<Texture>();
    if (this.occlusionSnapshot.size === 0) return replacedTextures;

    const liveToSnapshot = new Map<Material, Material[]>();
    for (const [mesh, snapshot] of this.occlusionSnapshot) {
      const snapshotMaterials = toMaterialArray(snapshot);
      toMaterialArray(mesh.material).forEach((live, index) => {
        const snapshotMaterial = snapshotMaterials[index];
        if (!snapshotMaterial) return;
        const list = liveToSnapshot.get(live) ?? [];
        list.push(snapshotMaterial);
        liveToSnapshot.set(live, list);
      });
    }

    for (const entry of staged) {
      if (!(entry.material instanceof MeshStandardMaterial)) continue;
      for (const snapshotMaterial of liveToSnapshot.get(entry.material) ?? []) {
        if (!(snapshotMaterial instanceof MeshStandardMaterial)) continue;
        for (const texture of this.assetLoader.applyTexturePackToMaterial(
          snapshotMaterial,
          entry.textures,
          entry.repeat,
        )) {
          replacedTextures.add(texture);
        }
      }
    }
    return replacedTextures;
  }

  /**
   * Activates the loaded product at its current ECS Transform.
   *
   * The shopper flow starts in INITIAL_PLACEMENT. Local automation can start
   * in IDLE so it can test downstream interactions without replaying UIKit
   * onboarding gestures.
   */
  async activateCurrentProduct({
    state = GrabState.IDLE,
    snappedToPlane = true,
  }: {
    state?: GrabState;
    snappedToPlane?: boolean;
  } = {}): Promise<void> {
    const entity = this.currentProduct?.entity;
    if (!entity?.object3D) {
      throw new Error("No loaded product is available to activate");
    }

    const productOrientation = entity.object3D.userData.orientation;
    const isHorizontal =
      productOrientation === PreferredOrientation.horizontal ||
      productOrientation === PreferredOrientation.horizontalInverted;
    const rotationAxis = isHorizontal ? "y" : "z";

    if (this.arrowMoverSystemFloor) {
      this.arrowMoverSystemFloor.setPlacedObject(entity);
    }
    if (this.arrowMoverSystemWall) {
      this.arrowMoverSystemWall.setPlacedObject(entity);
    }

    entity.object3D.visible = true;
    if (entity.hasComponent(CustomGrab)) {
      const previousState = entity.getValue(CustomGrab, "state") as GrabState;
      entity.setValue(CustomGrab, "previousState", previousState);
      entity.setValue(CustomGrab, "state", state);
      entity.setValue(CustomGrab, "rotationAxis", rotationAxis);
      entity.setValue(CustomGrab, "snappedToPlane", snappedToPlane);
      entity.setValue(CustomGrab, "isGrabbed", false);
    } else {
      await entity.addComponent(CustomGrab, {
        state,
        previousState: state,
        rotationAxis,
        snappedToPlane,
        isGrabbed: false,
      });
    }

    const pos = entity.object3D.position;
    const quat = entity.object3D.quaternion;
    const interpolationValues = {
      targetPosition: [pos.x, pos.y, pos.z] as [number, number, number],
      targetRotation: [quat.x, quat.y, quat.z, quat.w] as [
        number,
        number,
        number,
        number,
      ],
      positionSpeed: CONFIG.interaction.interpolation.positionSpeed,
      rotationSpeed: CONFIG.interaction.interpolation.rotationSpeed,
    };
    if (entity.hasComponent(InterpolationDestination)) {
      entity
        .getVectorView(InterpolationDestination, "targetPosition")
        .set(interpolationValues.targetPosition);
      entity
        .getVectorView(InterpolationDestination, "targetRotation")
        .set(interpolationValues.targetRotation);
      entity.setValue(
        InterpolationDestination,
        "positionSpeed",
        interpolationValues.positionSpeed,
      );
      entity.setValue(
        InterpolationDestination,
        "rotationSpeed",
        interpolationValues.rotationSpeed,
      );
    } else {
      entity.addComponent(InterpolationDestination, interpolationValues);
    }
  }

  /** Enables shopper-driven initial placement of the product. */
  async enableMovementOfProduct(): Promise<void> {
    await this.activateCurrentProduct({
      state: GrabState.INITIAL_PLACEMENT,
      snappedToPlane: false,
    });
  }

  /**
   * Sets the current product and clears arrow mover targets when product is null.
   * @param product - The current product or null.
   */
  setCurrentProduct(product: CurrentProduct | null): void {
    if (product !== this.currentProduct) this.disposeOcclusionSnapshot();
    this.currentProduct = product;

    if (!product) {
      this.arrowMoverSystemFloor?.setPlacedObject(null);
      this.arrowMoverSystemWall?.setPlacedObject(null);
    }
  }

  /** Sets the floor arrow mover system. */
  setArrowMoverSystem(arrowMoverSystem: ArrowMoverSystemFloor): void {
    this.arrowMoverSystemFloor = arrowMoverSystem;
  }

  /**
   * Applies material set to the entity by swapping textures on materials.
   * @param entity - The entity containing the 3D object.
   * @param materialSet - The material set to apply.
   * @param baseAssetUrl - The base asset URL.
   * @param shouldCommit - Optional guard checked before mutating materials.
   * @returns Whether the staged material set was committed.
   */
  public async applyMaterialSet(
    entity: Entity | null,
    materialSet: MaterialSet[],
    baseAssetUrl?: string,
    shouldCommit: () => boolean = () => true,
  ): Promise<boolean> {
    if (!materialSet?.length) {
      MessageHandler.raiseWarning("No material set to apply");
      return shouldCommit();
    }

    const staged: Array<{
      material: Material;
      geometry: BufferGeometry | undefined;
      textures: LoadedTexturePack;
      repeat: [number, number];
    }> = [];
    const disposeStaged = () => {
      for (const entry of staged) {
        this.assetLoader.disposeTexturePack(entry.textures);
      }
    };

    try {
      for (const swap of materialSet) {
        if (!shouldCommit()) {
          disposeStaged();
          return false;
        }
        const materialToGeometry = this.findMaterialsWithGeometryByName(
          entity!.object3D!,
          swap.materialName,
        );

        if (!materialToGeometry.size) {
          MessageHandler.raiseWarning(
            `SceneManager: Material ${swap.materialName} was not found; skipping texture pack`,
          );
          continue;
        }

        for (const [material, geometry] of materialToGeometry) {
          const textures = await this.assetLoader.loadTexturePack(
            swap.texturePack,
            baseAssetUrl,
          );
          staged.push({
            material,
            geometry,
            textures,
            repeat: swap.texturePack.repeat,
          });
          if (!shouldCommit()) {
            disposeStaged();
            return false;
          }
        }
      }
    } catch (error) {
      disposeStaged();
      throw error;
    }

    if (!shouldCommit()) {
      disposeStaged();
      return false;
    }

    const replacedTextures = this.applyStagedToOcclusionSnapshot(staged);
    for (const entry of staged) {
      if (
        entry.textures.occlusion &&
        entry.geometry?.attributes.uv &&
        !entry.geometry.attributes.uv2
      ) {
        entry.geometry.setAttribute("uv2", entry.geometry.attributes.uv);
      }
      for (const texture of this.assetLoader.applyTexturePackToMaterial(
        entry.material,
        entry.textures,
        entry.repeat,
      )) {
        replacedTextures.add(texture);
      }
    }

    this.disposeUnreferencedTextures(entity!.object3D!, replacedTextures);
    return true;
  }

  /** Disposes replaced textures only after checking every material in the product. */
  private disposeUnreferencedTextures(
    root: Object3D,
    candidates: Set<Texture>,
  ): void {
    if (candidates.size === 0) return;

    const referencedTextures = new Set<Texture>();
    const collectTextures = (materials: Material | Material[]) => {
      for (const material of toMaterialArray(materials)) {
        for (const value of Object.values(
          material as unknown as Record<string, unknown>,
        )) {
          if (value instanceof Texture) referencedTextures.add(value);
        }
      }
    };
    root.traverse((child) => {
      const renderable = child as Object3D & {
        material?: Material | Material[];
      };
      if (renderable.material) collectTextures(renderable.material);
    });
    for (const snapshot of this.occlusionSnapshot.values()) {
      collectTextures(snapshot);
    }

    for (const texture of candidates) {
      if (!referencedTextures.has(texture)) texture.dispose();
    }
  }

  /**
   * Returns a map of Material -> one BufferGeometry that uses it, for all materials with the given name.
   * Used to apply texture packs once per unique material; geometry is only needed for uv2 fallback (occlusion map).
   */
  private findMaterialsWithGeometryByName(
    root: Object3D,
    materialName: string,
  ): Map<Material, BufferGeometry | undefined> {
    const materialToGeometry = new Map<Material, BufferGeometry | undefined>();
    root.traverse((child) => {
      if (!(child instanceof Mesh) || !child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const mat of materials) {
        if (mat && mat.name === materialName && !materialToGeometry.has(mat)) {
          materialToGeometry.set(mat, child.geometry);
        }
      }
    });
    return materialToGeometry;
  }

  /**
   * Applies material property adjustments to meshes under the given root.
   * @param root - The root Object3D to traverse.
   * @param adjustments - Key-value pairs of material properties to apply.
   */
  public applyMaterialAdjustments(
    root: Object3D,
    adjustments: Record<string, unknown>,
  ): void {
    root.traverse((child) => {
      if (child instanceof Mesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials) {
          Object.entries(adjustments).forEach(([key, value]) => {
            if (key in material) {
              (material as unknown as Record<string, unknown>)[key] = value;
            }
          });
          material.needsUpdate = true;
        }
      }
    });
  }

  /** Sets the wall arrow mover system. */
  setArrowMoverSystemWall(arrowMoverSystemWall: ArrowMoverSystemWall): void {
    this.arrowMoverSystemWall = arrowMoverSystemWall;
  }

  /**
   * Get the appropriate arrow mover system based on the placed product's orientation
   * @returns The floor or wall arrow mover system depending on product orientation, or null if no system/product
   */
  getArrowMoverSystemForPlacedProduct():
    ArrowMoverSystemFloor | ArrowMoverSystemWall | null {
    if (!this.currentProduct?.entity?.object3D) {
      return null;
    }

    if (
      this.currentProduct.entity.object3D.userData.orientation ===
      PreferredOrientation.vertical
    ) {
      return this.arrowMoverSystemWall;
    } else {
      return this.arrowMoverSystemFloor;
    }
  }
}
