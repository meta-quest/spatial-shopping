# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — Unreleased

Initial open-source release.

### Added

- Web catalog demo that launches an immersive WebXR AR session for a selected
  product, built on the Immersive Web SDK (IWSDK).
- AR placement on detected real-world surfaces using plane detection and
  anchors, with a placement reticle and feedback when a product is aimed at an
  unsuitable surface (for example, a floor item on a wall).
- Direct manipulation of placed products with hands or controllers: grab to
  move and rotate.
- Precision controls: arrow handles for fine-grained translation and rotation.
- Product variants (colors, materials, and models) selectable in a spatial
  variant panel.
- Real-world dimension display with bounding box and measurement labels.
- Real-world occlusion using WebXR depth sensing on supported Meta Quest
  devices.
- In-headset cart: add products and variants to a cart, review contents, and
  confirm, with callbacks to the host page.
- Spatial UI panels (product details, controls, tooltips, interaction guidance,
  confirmation, notifications) authored in UIKitML.
- `ARViewer` runtime module (`src/framework/`) that encapsulates the AR
  experience and exposes session and cart events to the host page.
