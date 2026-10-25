# `@heavy-rain/organization-3d`

Reusable Three.js viewport toolkit for organization applications. It owns the renderer, camera, navigation, picking, measurement, and GPU resource cleanup. Domain geometry, part names, and engineering formulas stay in the consuming app (for example `apps/augi-engineering`).

Conventions: meters, Y-up, right-handed. No imports from `@heavy-rain/system-ui`; visual controls come from `@heavy-rain/organization-ui` in the app.

## Exports

- `createViewportRuntime(canvas, container, { adapter, ... })`: WebGL renderer (pixel ratio capped at 2, soft shadows, ACES tone mapping, local clipping enabled), `PerspectiveCamera`, `OrbitControls` (orbit, pan, zoom, tilt), `ResizeObserver` resize, render-on-demand loop, camera tweening that snaps under reduced motion, and `dispose()`.
- `SceneAdapter`: `{ scene, onFrame?(ctx) => boolean, fitTarget?(), dispose?() }`. Return `true` from `onFrame` while animating; otherwise frames stop when the camera rests.
- `runtime.fitBounds(boundsOrObject, { direction, margin, animate })`, `runtime.reset()`: aspect-aware framing from `fitBoundsToView`.
- `runtime.orbitBy / zoomBy / panBy / handleKeyDown`: keyboard-accessible navigation (arrows orbit, `+`/`-` zoom, `WASD` pan, `R` reset, `F` fit).
- `runtime.pick(clientX, clientY, root?)`: `Raycaster` hit that climbs to the nearest ancestor with `userData.partId`.
- `measureDistance(a, b, unit)`, `formatLength`, `convertLength`: pure measurement helpers (`m`, `mm`, `cm`, `in`, `ft`).
- `fitBoundsToView`, `boundsFitInView`, `unionBounds`: pure fit math used by the runtime and the tests.
- `ResourceTracker`, `disposeObjectTree`: release geometries, materials, and textures.
- `useViewportRuntime(canvasRef, containerRef, { createAdapter, onReady })`: React hook owning the lifecycle and reporting WebGL failure as `error`.
- `capabilities.json`: registry builders can read to select tools.

## Checks

```
node --test src/math/bounds.test.ts src/math/measure.test.ts src/math/capabilities.test.ts   # Node 24 (type stripping)
npx tsc --noEmit -p packages/organization-3d
```
