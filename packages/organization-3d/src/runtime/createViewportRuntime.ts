import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { fitBoundsToView, type Bounds3 } from "../math/bounds.ts";
import { measureDistance, type LengthUnit, type MeasureResult } from "../math/measure.ts";
import type { Vec3 } from "../math/vec.ts";
import { CAMERA_DIRECTIONS, type CameraDirectionId } from "./camera.ts";
import { disposeObjectTree } from "./resources.ts";

export interface FrameContext {
  timeSec: number;
  deltaSec: number;
  reducedMotion: boolean;
}

/** Typed contract a consuming app implements to plug domain content into the runtime. */
export interface SceneAdapter {
  scene: THREE.Scene;
  /** Return true to request another frame (continuous animation). */
  onFrame?: (ctx: FrameContext) => boolean | void;
  /** Object whose bounds define "fit" and "reset". Defaults to the scene. */
  fitTarget?: () => THREE.Object3D;
  dispose?: () => void;
}

export interface ViewportRuntimeOptions {
  adapter: SceneAdapter;
  /** Adds a neutral studio environment map for metallic reflections (no post-processing). Defaults to true. */
  environment?: boolean;
  environmentIntensity?: number;
  fovDeg?: number;
  near?: number;
  far?: number;
  /** Device pixel ratio ceiling. Defaults to 2. */
  maxPixelRatio?: number;
  reducedMotion?: boolean;
  shadows?: boolean;
  toneMappingExposure?: number;
  /** Fit margin multiplier used by fitBounds/reset. Defaults to 1.12. */
  fitMargin?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Default direction used by reset(). */
  defaultDirection?: CameraDirectionId | Vec3;
}

export interface FitBoundsOptions {
  direction?: CameraDirectionId | Vec3;
  margin?: number;
  animate?: boolean;
}

export interface PickResult {
  object: THREE.Object3D;
  partId: string | null;
  point: THREE.Vector3;
  distance: number;
}

export interface ViewportRuntime {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  invalidate: () => void;
  setContinuous: (on: boolean) => void;
  setReducedMotion: (on: boolean) => void;
  getBounds: (object?: THREE.Object3D) => Bounds3;
  fitBounds: (bounds?: Bounds3 | THREE.Object3D, options?: FitBoundsOptions) => void;
  reset: (animate?: boolean) => void;
  orbitBy: (deltaAzimuthRad: number, deltaPolarRad: number) => void;
  zoomBy: (factor: number) => void;
  panBy: (dxMeters: number, dyMeters: number) => void;
  /** Returns true when the key was handled. */
  handleKeyDown: (event: KeyboardEvent | { key: string; preventDefault?: () => void }) => boolean;
  pick: (clientX: number, clientY: number, root?: THREE.Object3D) => PickResult | null;
  measure: (a: Vec3, b: Vec3, unit?: LengthUnit) => MeasureResult;
  resize: () => void;
  dispose: () => void;
}

function resolveDirection(direction: CameraDirectionId | Vec3 | undefined, fallback: Vec3): Vec3 {
  if (!direction) return fallback;
  if (typeof direction === "string") return CAMERA_DIRECTIONS[direction] ?? fallback;
  return direction;
}

export function boundsFromObject(object: THREE.Object3D): Bounds3 {
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) {
    return { min: [-1, -1, -1], max: [1, 1, 1] };
  }
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

/**
 * Creates a WebGL viewport bound to `canvas` sized by `container`. Rendering is
 * on demand: frames run only while the camera moves, an adapter animates, or
 * `invalidate()` was called. Throws when a WebGL context cannot be created.
 */
export function createViewportRuntime(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  options: ViewportRuntimeOptions
): ViewportRuntime {
  const { adapter } = options;
  const fovDeg = options.fovDeg ?? 32;
  const fitMargin = options.fitMargin ?? 1.12;
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  let reducedMotion = options.reducedMotion ?? false;
  const defaultDirection = resolveDirection(options.defaultDirection, CAMERA_DIRECTIONS.isometric);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.shadowMap.enabled = options.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.toneMappingExposure ?? 1.0;
  renderer.localClippingEnabled = true;

  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  renderer.setSize(width, height, false);

  let environmentTexture: THREE.Texture | null = null;
  if (options.environment ?? true) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    environmentTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    adapter.scene.environment = environmentTexture;
    adapter.scene.environmentIntensity = options.environmentIntensity ?? 0.6;
  }

  const camera = new THREE.PerspectiveCamera(fovDeg, width / height, options.near ?? 0.05, options.far ?? 200);
  camera.position.set(6, 3, 6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.09;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = options.minDistance ?? 0.5;
  controls.maxDistance = options.maxDistance ?? 60;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.minPolarAngle = 0.03;
  controls.update();

  let dirty = true;
  let continuous = false;
  let disposed = false;
  let rafId = 0;
  let lastTime = performance.now();
  const startTime = lastTime;

  let tweenFrom: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let tweenTo: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let tweenStart = 0;
  const tweenDurationMs = 520;

  const invalidate = () => {
    dirty = true;
  };

  const cancelTween = () => {
    tweenFrom = null;
    tweenTo = null;
  };

  controls.addEventListener("start", cancelTween);
  controls.addEventListener("change", invalidate);

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);

  function resize() {
    if (disposed) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function frame(now: number) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    const deltaSec = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (tweenFrom && tweenTo) {
      const t = Math.min(1, (now - tweenStart) / tweenDurationMs);
      const k = easeOutCubic(t);
      camera.position.lerpVectors(tweenFrom.position, tweenTo.position, k);
      controls.target.lerpVectors(tweenFrom.target, tweenTo.target, k);
      dirty = true;
      if (t >= 1) cancelTween();
    }

    let wantsMore = false;
    if (continuous || dirty) {
      const keep = adapter.onFrame?.({ timeSec: (now - startTime) / 1000, deltaSec, reducedMotion });
      wantsMore = keep === true;
    }

    const controlsChanged = controls.update(deltaSec);
    if (dirty || controlsChanged || continuous || wantsMore) {
      renderer.render(adapter.scene, camera);
      dirty = false;
    }
  }
  rafId = requestAnimationFrame(frame);

  function getBounds(object?: THREE.Object3D): Bounds3 {
    return boundsFromObject(object ?? adapter.fitTarget?.() ?? adapter.scene);
  }

  function applyPose(position: Vec3, target: Vec3, animate: boolean) {
    const nextPos = new THREE.Vector3(...position);
    const nextTarget = new THREE.Vector3(...target);
    if (!animate || reducedMotion) {
      cancelTween();
      camera.position.copy(nextPos);
      controls.target.copy(nextTarget);
      controls.update();
      invalidate();
      return;
    }
    tweenFrom = { position: camera.position.clone(), target: controls.target.clone() };
    tweenTo = { position: nextPos, target: nextTarget };
    tweenStart = performance.now();
    invalidate();
  }

  function fitBounds(bounds?: Bounds3 | THREE.Object3D, fitOptions: FitBoundsOptions = {}) {
    const resolved: Bounds3 =
      bounds instanceof THREE.Object3D ? boundsFromObject(bounds) : bounds ?? getBounds();
    const direction = resolveDirection(fitOptions.direction, defaultDirection);
    const fit = fitBoundsToView(resolved, {
      fovDeg: camera.fov,
      aspect: camera.aspect,
      direction,
      margin: fitOptions.margin ?? fitMargin,
    });
    applyPose(fit.position, fit.target, fitOptions.animate ?? true);
  }

  function reset(animate = true) {
    fitBounds(undefined, { direction: defaultDirection, animate });
  }

  function orbitBy(deltaAzimuthRad: number, deltaPolarRad: number) {
    cancelTween();
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += deltaAzimuthRad;
    spherical.phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, spherical.phi + deltaPolarRad));
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    invalidate();
  }

  function zoomBy(factor: number) {
    cancelTween();
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const next = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
    offset.setLength(next);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    invalidate();
  }

  function panBy(dxMeters: number, dyMeters: number) {
    cancelTween();
    const forward = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const shift = new THREE.Vector3().addScaledVector(right, dxMeters).addScaledVector(up, dyMeters);
    camera.position.add(shift);
    controls.target.add(shift);
    controls.update();
    invalidate();
  }

  function handleKeyDown(event: KeyboardEvent | { key: string; preventDefault?: () => void }): boolean {
    const step = 0.12;
    const panStep = Math.max(0.05, camera.position.distanceTo(controls.target) * 0.04);
    switch (event.key) {
      case "ArrowLeft": orbitBy(-step, 0); break;
      case "ArrowRight": orbitBy(step, 0); break;
      case "ArrowUp": orbitBy(0, -step * 0.8); break;
      case "ArrowDown": orbitBy(0, step * 0.8); break;
      case "+": case "=": zoomBy(0.86); break;
      case "-": case "_": zoomBy(1.16); break;
      case "w": case "W": panBy(0, panStep); break;
      case "s": case "S": panBy(0, -panStep); break;
      case "a": case "A": panBy(-panStep, 0); break;
      case "d": case "D": panBy(panStep, 0); break;
      case "r": case "R": reset(); break;
      case "f": case "F": fitBounds(); break;
      default: return false;
    }
    event.preventDefault?.();
    return true;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX: number, clientY: number, root?: THREE.Object3D): PickResult | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(root ?? adapter.scene, true);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      let cursor: THREE.Object3D | null = hit.object;
      let partId: string | null = null;
      while (cursor) {
        if (cursor.userData && typeof cursor.userData.partId === "string") {
          partId = cursor.userData.partId;
          break;
        }
        if (cursor.userData && cursor.userData.pickable === false) break;
        cursor = cursor.parent;
      }
      return { object: cursor ?? hit.object, partId, point: hit.point.clone(), distance: hit.distance };
    }
    return null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    controls.removeEventListener("start", cancelTween);
    controls.removeEventListener("change", invalidate);
    controls.dispose();
    adapter.dispose?.();
    disposeObjectTree(adapter.scene);
    environmentTexture?.dispose();
    renderer.dispose();
  }

  return {
    renderer,
    camera,
    controls,
    scene: adapter.scene,
    invalidate,
    setContinuous(on) {
      continuous = on;
      if (on) invalidate();
    },
    setReducedMotion(on) {
      reducedMotion = on;
      controls.enableDamping = !on;
      if (on) cancelTween();
      invalidate();
    },
    getBounds,
    fitBounds,
    reset,
    orbitBy,
    zoomBy,
    panBy,
    handleKeyDown,
    pick,
    measure: (a, b, unit) => measureDistance(a, b, unit),
    resize,
    dispose,
  };
}
