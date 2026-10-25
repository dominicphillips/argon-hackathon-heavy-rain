import * as THREE from "three";
import type { SceneAdapter, FrameContext } from "@heavy-rain/organization-3d";
import type { ChassisConfig } from "../model/chassisModel.ts";
import { createChassisScene, type ChassisSceneHandle } from "./createChassisScene.ts";
import { createVehicleBody, type VehicleBodyHandle } from "./createVehicleBody.ts";

export type ViewMode = "solid" | "cutaway" | "xray";
export type TransportMode = "deformation" | "exploded" | "flight";

export interface SableSceneState {
  config: ChassisConfig;
  viewMode: ViewMode;
  /** 0 = no cut, 1 = full cut across the vehicle width. */
  cutawayFraction: number;
  transportMode: TransportMode;
  playing: boolean;
  deformationAmp: number;
  explosionFactor: number;
  flightFactor: number;
  showLoadVectors: boolean;
  showBaselineGhost: boolean;
  reducedMotion: boolean;
}

export interface SableAdapter extends SceneAdapter {
  vehicleRoot: THREE.Group;
  setState: (state: SableSceneState) => void;
  /** Invoked when playback changes a transport value so the UI slider can follow. */
  onTransportValue?: (mode: TransportMode, value: number) => void;
}

export function createSableAdapter(initial: SableSceneState): SableAdapter {
  const chassis: ChassisSceneHandle = createChassisScene();
  const scene = chassis.scene;
  const vehicleRoot = new THREE.Group();
  vehicleRoot.name = "vehicleRoot";
  vehicleRoot.add(chassis.root);
  scene.add(vehicleRoot);

  let body: VehicleBodyHandle | null = null;
  let bodySignature = "";
  let state = initial;
  let animatedExplosion = initial.explosionFactor;
  let animatedFlight = initial.flightFactor;
  let lastPlaying = false;
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let adapter: SableAdapter;

  function ensureBody(config: ChassisConfig) {
    const sig = `${config.wheelbaseMm}_${config.trackWidthMm}`;
    if (sig === bodySignature && body) return;
    if (body) {
      vehicleRoot.remove(body.group);
      body.dispose();
    }
    body = createVehicleBody(config.wheelbaseMm * 1e-3, config.trackWidthMm * 1e-3);
    vehicleRoot.add(body.group);
    bodySignature = sig;
  }

  function applyViewMode() {
    if (!body) return;
    const { viewMode, cutawayFraction } = state;
    const xray = viewMode === "xray";
    const cut = viewMode === "cutaway";
    const clip = cut ? [cutPlane] : [];
    // Plane sweeps from the near edge (+z) toward the far edge as the fraction grows.
    cutPlane.constant = body.halfWidth - cutawayFraction * body.halfWidth * 2;

    body.paint.transparent = xray;
    body.paint.opacity = xray ? 0.16 : 1;
    body.paint.depthWrite = !xray;
    body.paint.clippingPlanes = clip;
    body.paint.clipShadows = cut;
    body.paint.needsUpdate = true;

    body.glass.opacity = xray ? 0.08 : cut ? 0.5 : 0.96;
    body.glass.clippingPlanes = clip;
    body.glass.needsUpdate = true;

    for (const mat of body.interiorMaterials) {
      mat.transparent = xray;
      mat.opacity = xray ? 0.25 : 1;
      mat.depthWrite = !xray;
      mat.clippingPlanes = clip;
      mat.needsUpdate = true;
    }
    for (const seam of body.group.children) {
      if (seam instanceof THREE.LineSegments) seam.visible = !xray;
    }
  }

  function applyFlight(f: number) {
    if (!body) return;
    const lift = 0.85 * f;
    vehicleRoot.position.y = lift;
    vehicleRoot.rotation.z = -0.05 * f;
    const fold = (Math.PI / 2) * f;
    for (const pivot of body.wheelPivots) {
      const zs = pivot.userData.zs as number;
      pivot.rotation.x = -zs * fold;
      pivot.position.z = zs * (state.config.trackWidthMm * 1e-3 / 2 - 0.02 + 0.22 * f);
    }
    for (const disc of body.thrustDiscs) {
      disc.visible = f > 0.05;
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.38 * f;
    }
  }

  function pushChassis(phase: number) {
    chassis.updateGeometry(state.config, {
      explosionFactor: animatedExplosion,
      deformationAmp: state.deformationAmp,
      deformationPhase: phase,
      showBodySilhouette: false,
      showWheels: false,
      showBaselineGhost: state.showBaselineGhost,
      showLoadVectors: state.showLoadVectors,
    });
  }

  function setState(next: SableSceneState) {
    const prev = state;
    state = next;
    ensureBody(next.config);
    const pausing = prev.playing && !next.playing;
    // Keep the current pose when pausing; otherwise follow the sliders outside the active mode.
    if (!pausing && (!next.playing || next.transportMode !== "exploded")) animatedExplosion = next.explosionFactor;
    if (!pausing && (!next.playing || next.transportMode !== "flight")) animatedFlight = next.flightFactor;
    if (pausing) {
      // Sync sliders with where playback stopped
      if (prev.transportMode === "exploded") adapter.onTransportValue?.("exploded", animatedExplosion);
      if (prev.transportMode === "flight") adapter.onTransportValue?.("flight", animatedFlight);
    }
    lastPlaying = next.playing;
    // Hide the parametric chassis wheels and body (vehicle module owns them)
    pushChassis(1);
    applyViewMode();
    applyFlight(animatedFlight);
    // Body should fade when exploded so sub-assemblies read clearly
    if (body) {
      body.group.position.y = animatedExplosion * 0.75;
      body.group.visible = animatedExplosion < 0.98 || state.viewMode !== "xray";
    }
  }

  function onFrame(ctx: FrameContext): boolean {
    if (!state.playing || ctx.reducedMotion) return false;
    const t = ctx.timeSec;
    if (state.transportMode === "deformation") {
      pushChassis(0.55 + 0.45 * Math.sin(t * 3.1));
      return true;
    }
    if (state.transportMode === "exploded") {
      animatedExplosion = 0.5 - 0.5 * Math.cos(t * 0.9);
      pushChassis(1);
      if (body) body.group.position.y = animatedExplosion * 0.75;
      return true;
    }
    // flight: ease toward 1 then hover
    animatedFlight = Math.min(1, animatedFlight + ctx.deltaSec * 0.45);
    const bob = animatedFlight >= 1 ? 0.03 * Math.sin(t * 1.7) : 0;
    applyFlight(animatedFlight);
    vehicleRoot.position.y += bob;
    return true;
  }

  adapter = {
    scene,
    vehicleRoot,
    fitTarget: () => vehicleRoot,
    onFrame,
    setState,
    dispose() {
      body?.dispose();
      chassis.dispose();
    },
  };
  setState(initial);
  void lastPlaying;
  return adapter;
}
