# Source guide

This file augments the repository-root `AGENTS.md` for code under `src/`.

## Layout

- `src/framework/` is the AR runtime. `ARViewer.ts` is its facade;
  `managers/initializer/Initializer.ts` creates the world and explicitly
  registers every runtime component and system.
- `src/demo/` is the showcase host page (`src/demo/index.ts` is the app entry).
  It drives the runtime through `ARViewer`, its data types, and its session
  events rather than reaching into managers or systems directly.
- `src/assets.ts` is the fixed `AssetManifest` (UIKitML panels, arrow models,
  HDRIs). Product models and textures are loaded dynamically through
  `AssetManager`.

## ECS conventions

- Components are runtime-only. The native scene is empty, so there is no
  `defineComponents()` authoring manifest. Declare components in system-free
  modules and register them in `Initializer.ts` next to their systems.
- Register systems with `world.registerSystem(...)` in `Initializer.ts`; do not
  register systems from the demo.
- Query with `required` / `excluded` / `where` instead of keeping entity arrays.
- Push every signal or query subscription's unsubscribe into `cleanupFuncs`.
- Do not allocate in `update()`; keep scratch vectors, quaternions, and
  raycasters as fields. Read signals with `.peek()` in hot loops.
- For vector fields use `entity.getVectorView(Component, 'field')`;
  `setValue` throws on vector fields.
- Grabbing is project-owned (`features/CustomGrab`), and built-in IWSDK
  grabbing is disabled. Do not add `OneHandGrabbable` / `TwoHandsGrabbable` /
  `DistanceGrabbable` without enabling the feature in `iwsdk.config.json`.

## Asset manifest

`src/assets.ts` is imported independently by the app runtime and the IWSDK
editor. Keep it deterministic and side-effect free (no `World`, DOM, timers, or
fetches), and build URLs from `import.meta.env.BASE_URL`. A file in `public/` is
not available as a fixed asset until it is registered there.

`AssetManager.getGLTF()` clones the object tree but shares geometry, materials,
and textures. Never dispose shared resources from a placed clone; clone a
material before mutating it for a single instance.

More detailed, editor-oriented references live in `.cursor/rules/` and
`.github/instructions/`.
