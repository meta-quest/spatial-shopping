# 3D Asset Preparation Guide

Essential guide for creating 3D assets for Spatial Shopping on Meta Quest devices.

## Quick Reference

| Aspect           | Requirement               |
| ---------------- | ------------------------- |
| **Format**       | GLB (recommended) or GLTF |
| **Max Polygons** | 60K-100K triangles        |
| **Texture Size** | Max 2048×2048             |
| **File Size**    | Target < 10 MB            |
| **Scale**        | 1 unit = 1 meter          |

## 3D Model Requirements

### File Format

- **Use GLB format** (all textures embedded, single file)
- GLTF supported but requires separate texture files

### Scale & Setup

- **Units**: 1 unit = 1 meter (real-world scale)
- **Origin**: Place at base/bottom center
- **Orientation**: Y-axis up

### Geometry Checklist

- Clean topology, no n-gons
- No duplicate vertices
- Remove hidden/internal geometry
- Name materials descriptively: "Leather", "Metal_Frame"
- Triangulate on export

## Textures

### Required Maps (PBR)

- **Base Color** (sRGB) - Required
- **Metallic-Roughness** (linear) - Required
- **Normal Map** (OpenGL +Y) - Recommended
- **Ambient Occlusion** - Optional

### Format

- **Base Color**: WebP or JPG (quality 85-95)
- **Metallic-Roughness**: WebP or PNG
- **Normal Map**: lossless WebP or PNG; lossy compression visibly smooths
  fine surface detail

WebP textures can also be embedded in a GLB with the `EXT_texture_webp`
extension, which three.js decodes without an extra decoder.

## Materials

### Properties

- **Roughness**: 0.0 (mirror) to 1.0 (matte)
- **Metallic**: 0.0 (non-metal) or 1.0 (metal)

## Product Configuration

Edit `public/demo/data/vendor-products.json`:

```json
{
  "xrMetadata": {
    "PRODUCT_ID": {
      "assetUrl": "demo/gltf/model.glb",
      "initialPosition": [0, 0, 2.5],
      "initialRotation": [0, 0, 0],
      "initialScale": 1.0,
      "preferredPlacement": "floor",
      "orientation": "horizontal"
    }
  }
}
```

### Key Properties

| Property             | Values                                          | Example           |
| -------------------- | ----------------------------------------------- | ----------------- |
| `preferredPlacement` | `floor`, `wall`, `table`, `ceiling`, `any`      | `"floor"`         |
| `orientation`        | `horizontal`, `vertical`, `inverted-horizontal` | `"horizontal"`    |
| `initialScale`       | Number (1.0 = actual size)                      | `1.5` (150% size) |
| `initialPosition`    | `[x, y, z]` in meters                           | `[0, 0, 2.5]`     |

### Material Variations

For color/material variants, add a `materialSet` array to the variation's entry
in `variations`. Texture file names resolve relative to the model's folder:

```json
{
  "materialName": "Leather",
  "texturePack": {
    "diffuse": "Leather_baseColor_Brown.png",
    "metallicRoughness": "Leather_metallicRoughness.webp",
    "normal": "Leather_normal.webp",
    "repeat": [1, 1]
  }
}
```

**Note**: `materialName` must exactly match the material name in your 3D model.

## Testing

### 1. Desktop Preview

```bash
npm run dev
```

Verify model loads and textures display correctly.

### 2. Quest Device Testing

Navigate to `https://<your-ip>:8081` on Quest browser.

### Checklist

- [ ] Model loads (3-5 seconds)
- [ ] Correct real-world size
- [ ] Textures display properly
- [ ] Smooth performance (no lag)
- [ ] Correct placement (floor/wall/table)
- [ ] Material variations work

### Debug Mode

Set `DEBUG_MODE` to `LOGS` (3D logs), `GIZMOS` (debug gizmos), or `FULL`
(both) before starting the dev server. Production builds ignore it.

```bash
DEBUG_MODE=FULL npm run dev
```

## Troubleshooting

### Model Doesn't Load

- Validate with [glTF Validator](https://github.khronos.org/glTF-Validator/)
- Check console for errors
- Verify file path is correct

### Wrong Size

- Model at 1 unit = 1 meter
- Adjust `initialScale` in config

### Textures Wrong

- Use GLB with embedded textures
- Ensure base color is sRGB format

### Material Variations Don't Work

- Material name in 3D model must exactly match config
- Check texture paths are correct

### Performance Issues

- Reduce polygons
- Max texture size: 2048×2048
- Merge similar materials

## Resources

- **Validate glTF**: https://github.khronos.org/glTF-Validator/
- **Example Assets**: `public/demo/gltf/` (leather lounge chair and plant)
- **[Main README](../../README.md)** - Full project documentation
