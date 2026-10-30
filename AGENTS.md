# Spatial Shopping Contributor Guide

This repository is a WebXR AR shopping showcase built on IWSDK. Keep the demo
host page in `src/demo` and the AR runtime in `src/framework` (facade:
`src/framework/ARViewer.ts`).

## IWSDK 1.1 project setup

`iwsdk.config.json` is the committed authority for the showcase's serializable
world, XR, emulator, scene, and fixed-asset settings. `vite.config.ts` only wires
`iwsdkDev()` plus application build behavior. The demo passes
`virtual:iwsdk-project` into `ARViewer.init()`; `init()` also accepts explicit
world options when the IWSDK Vite plugin is not used.

The native scene at `public/scenes/main.iwsdk.scene.json` is intentionally empty:
products, panels, placement helpers, and lighting are runtime-owned content.
Do not move runtime-dependent product instances into the scene merely to make the
editor hierarchy non-empty.

## Start Here

1. Run `npm ci`.
2. Run `npm run typecheck` before browser or XR testing.
3. Check `npx @iwsdk/cli xr status` before starting a server.
4. If no runtime is connected, run `npm run dev`.
5. Run `npm run check` and `npm run build` before a pull request.

UIKitML sources live in and are served directly from `public/ui/`; there is no
generated UIKit JSON. Demo assets live in `public/demo`; runtime-owned assets are in
`public/3dUI`, `public/hdr`, and `public/imgs`.

## IWSDK Rules

- Keep all `@iwsdk/*` packages on the same exact version.
- Import Three.js runtime values and types from `@iwsdk/core`, never `three`.
  The only permitted direct Three.js import is a loader-only type that IWSDK
  does not export.
- Declare fixed assets in `AssetManifest`; use `AssetManager` for dynamic
  assets. Do not instantiate Three.js loaders.
- Create scene objects with `world.createTransformEntity`. Do not call
  `scene.add()` or parent under an Object3D that is not represented by an
  entity.
- Use `RayInteractable`, `Hovered`, `Pressed`, and pointer events for normal
  object/UI input. A custom ray is acceptable only for semantic XR-plane
  placement, where the selected plane identity is required.
- Use ECS queries instead of maintaining entity arrays in systems.
- Register every signal/query subscription in `cleanupFuncs`.
- Allocate reusable vectors, quaternions, matrices, raycasters, and collections
  outside `update()`.
- Use `.peek()` for signal reads in hot loops.
- Use `entity.dispose()` only for resources owned by that entity. IWSDK
  `AssetManager.getGLTF()` clones object trees but shares geometry, materials,
  and textures unless the application explicitly clones them.
- Environment components belong on `world.activeLevel.value`; set
  `_needsUpdate` after changing their fields.
- `ScreenSpace` values are CSS strings such as `"20px"`, not numbers.
- `PanelUI.config` points to a source `.uikitml` URL. Physical panel bounds are
  owned by entity transforms through `PanelSize` and `PanelUISizeSystem`.

The world is configured for immersive AR with required anchors and plane
detection, optional device-only depth sensing, scene understanding, Horizon
spatial UI, and environment raycast disabled. Locomotion, physics, built-in
grabbing, and composition layers are disabled because the project owns semantic
plane placement and grabbing. Do not enable a built-in feature without also
adding its required components and tests.

## Agent Skills and Rules

Project skills live in `.agents/skills/`: `iwsdk-dev` (entry point for IWSDK
changes), `iwsdk-ui`, `iwsdk-ray`, `iwsdk-debug`, `iwsdk-depth-occlusion`, and
`iwsdk-native-xr-test`. File-scoped rules live in `.cursor/rules/` and
`.github/instructions/` (kept in sync), with additional scoped guidance in
`src/AGENTS.md`.

## XR Agent Auto-Launch

The runtime MCP cannot click the 2D catalog. To opt into dev-only auto-launch,
set a product ID before starting the server:

```bash
VITE_AGENT_AUTO_LAUNCH_PRODUCT_ID=B001234567 npm run dev
```

Leave the variable unset for normal development and production builds.

## Verification

Always typecheck before testing:

```bash
npm run typecheck
npm run test:run
npm run build
```

For XR behavior, check the runtime connection first, accept the session, then
inspect console logs, the scene hierarchy, and ECS state. Test both the IWER
emulator and a Quest device for changes involving room capture, semantic
planes, depth sensing, or hand/controller input.
