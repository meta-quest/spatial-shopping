/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  Material,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "@iwsdk/core";
import { TexturePack } from "../../types/ProductData.js";
import { MessageHandler } from "../../utils/MessageHandler.js";

export type LoadedTexturePack = {
  diffuse: Texture | null;
  metallicRoughness: Texture | null;
  normal: Texture | null;
  occlusion: Texture | null;
};

/** Applies runtime product-variant textures using IWSDK's shared asset cache. */
export class AssetLoader {
  public async loadTexture(
    textureUrl?: string,
    baseAssetUrl?: string,
  ): Promise<Texture | null> {
    if (!textureUrl) {
      return null;
    }

    const resolvedUrl = this.resolveTextureUrl(textureUrl, baseAssetUrl);
    try {
      const cachedTexture = await AssetManager.loadTexture(resolvedUrl);
      const ownedTexture = cachedTexture.clone();
      ownedTexture.needsUpdate = true;
      return ownedTexture;
    } catch (error) {
      const message = `AssetLoader: Failed to load texture ${resolvedUrl}: ${String(error)}`;
      MessageHandler.raiseError(message);
      throw new Error(message);
    }
  }

  public async loadTexturePack(
    texturePack: TexturePack,
    baseAssetUrl?: string,
  ): Promise<LoadedTexturePack> {
    const results = await Promise.allSettled([
      this.loadTexture(texturePack.diffuse, baseAssetUrl),
      this.loadTexture(texturePack.metallicRoughness, baseAssetUrl),
      this.loadTexture(texturePack.normal, baseAssetUrl),
      this.loadTexture(texturePack.occlusion, baseAssetUrl),
    ]);

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) {
      for (const result of results) {
        if (result.status === "fulfilled") result.value?.dispose();
      }
      throw failure.reason;
    }

    const textures = results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });

    return {
      diffuse: textures[0],
      metallicRoughness: textures[1],
      normal: textures[2],
      occlusion: textures[3],
    };
  }

  public applyTexturePackToMaterial(
    material: Material,
    textures: LoadedTexturePack,
    repeat: [number, number],
  ): Set<Texture> {
    if (!(material instanceof MeshStandardMaterial)) {
      this.disposeTexturePack(textures);
      MessageHandler.raiseWarning(
        "AssetLoader: Material is not a MeshStandardMaterial; skipping texture pack",
      );
      return new Set();
    }

    const replacedTextures = new Set<Texture>();
    if (textures.diffuse && material.map) replacedTextures.add(material.map);
    if (textures.metallicRoughness) {
      if (material.metalnessMap) replacedTextures.add(material.metalnessMap);
      if (material.roughnessMap) replacedTextures.add(material.roughnessMap);
    }
    if (textures.normal && material.normalMap)
      replacedTextures.add(material.normalMap);
    if (textures.occlusion && material.aoMap)
      replacedTextures.add(material.aoMap);

    if (textures.diffuse) {
      this.setTextureRepeat(textures.diffuse, repeat);
      textures.diffuse.colorSpace = SRGBColorSpace;
      material.map = textures.diffuse;
    }

    if (textures.metallicRoughness) {
      this.setTextureRepeat(textures.metallicRoughness, repeat);
      material.metalnessMap = textures.metallicRoughness;
      material.roughnessMap = textures.metallicRoughness;
    }

    if (textures.normal) {
      this.setTextureRepeat(textures.normal, repeat);
      material.normalMap = textures.normal;
    }

    if (textures.occlusion) {
      this.setTextureRepeat(textures.occlusion, repeat);
      material.aoMap = textures.occlusion;
    }

    material.needsUpdate = true;
    return replacedTextures;
  }

  private getBasePath(assetUrl: string): string {
    try {
      const url = new URL(assetUrl, window.location.href);
      return new URL(".", url).href;
    } catch {
      const separator = assetUrl.lastIndexOf("/");
      return separator >= 0 ? assetUrl.slice(0, separator + 1) : "";
    }
  }

  private resolveTextureUrl(textureUrl: string, baseAssetUrl?: string): string {
    if (/^(?:https?:|data:|blob:|\/)/.test(textureUrl) || !baseAssetUrl) {
      return textureUrl;
    }

    const basePath = this.getBasePath(baseAssetUrl);
    try {
      return new URL(textureUrl, basePath || window.location.href).href;
    } catch {
      return `${basePath}${textureUrl}`;
    }
  }

  private setTextureRepeat(texture: Texture, repeat: [number, number]): void {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.needsUpdate = true;
  }

  public disposeTexturePack(textures: LoadedTexturePack): void {
    const uniqueTextures = new Set(Object.values(textures).filter(Boolean));
    for (const texture of uniqueTextures) texture?.dispose();
  }
}
