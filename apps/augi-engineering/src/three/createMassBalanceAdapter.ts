import * as THREE from "three";
import { ResourceTracker, type SceneAdapter } from "@heavy-rain/organization-3d";
import { BASELINE_A_CONFIG, type ChassisConfig } from "../model/chassisModel.ts";
import { computeMassBalance, type MassBalanceMetrics, type Subsystem, type SubsystemId } from "../model/massBalance.ts";
import { createSableAdapter, type SableAdapter } from "./createSableAdapter.ts";

/**
 * Mass-balance scene: the Sable body and chassis held in X-ray view, with a
 * translucent envelope per subsystem, a mass dot at each subsystem center, and
 * a true 3D center-of-gravity marker (sphere, crosshair, drop line, ground tick)
 * at the mass-weighted position. Coordinates: +X front, +Y up, meters.
 */
export interface MassBalanceSceneState {
  parts: readonly Subsystem[];
  selectedId: SubsystemId | null;
  reducedMotion: boolean;
}

export interface MassBalanceAdapter extends SceneAdapter {
  vehicleRoot: THREE.Group;
  markersRoot: THREE.Group;
  setState: (state: MassBalanceSceneState) => void;
  metrics: () => MassBalanceMetrics;
}

const PART_COLORS: Record<SubsystemId, number> = {
  battery: 0x2f6fde,
  body: 0x8c96a3,
  frontDrive: 0xd97706,
  rearDrive: 0xb45309,
  cabin: 0x7c5cc4,
  payload: 0x0f8f6a,
  wheels: 0x3b4149,
};

const CG_COLOR = 0xe11d48;

interface PartMarker {
  group: THREE.Group;
  box: THREE.Mesh;
  edges: THREE.LineSegments;
  dot: THREE.Mesh;
  boxMat: THREE.MeshStandardMaterial;
  edgeMat: THREE.LineBasicMaterial;
  dotMat: THREE.MeshStandardMaterial;
}

export function createMassBalanceAdapter(initial: MassBalanceSceneState, config: ChassisConfig = BASELINE_A_CONFIG): MassBalanceAdapter {
  const tracker = new ResourceTracker();
  const wheelbaseM = config.wheelbaseMm * 1e-3;

  // Reuse the Sable body, chassis, lighting, and floor. The view mode is fixed to X-ray.
  const sable: SableAdapter = createSableAdapter({
    config,
    viewMode: "xray",
    cutawayFraction: 0,
    transportMode: "deformation",
    playing: false,
    deformationAmp: 1,
    explosionFactor: 0,
    flightFactor: 0,
    showLoadVectors: false,
    showBaselineGhost: false,
    reducedMotion: initial.reducedMotion,
  });
  const scene = sable.scene;
  const vehicleRoot = sable.vehicleRoot;

  const markersRoot = new THREE.Group();
  markersRoot.name = "massMarkers";
  vehicleRoot.add(markersRoot);

  let state = initial;
  let metrics = computeMassBalance(state.parts, wheelbaseM);

  // Subsystem envelopes and mass dots
  const unitBox = tracker.geometry(new THREE.BoxGeometry(1, 1, 1));
  const unitEdges = tracker.geometry(new THREE.EdgesGeometry(unitBox));
  const dotGeom = tracker.geometry(new THREE.SphereGeometry(1, 20, 14));
  const markers = new Map<SubsystemId, PartMarker>();
  for (const part of state.parts) {
    const color = PART_COLORS[part.id];
    const boxMat = tracker.material(
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.8, metalness: 0 })
    );
    const edgeMat = tracker.material(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }));
    const dotMat = tracker.material(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.4 }));
    const group = new THREE.Group();
    group.name = `mass-${part.id}`;
    group.userData.partId = part.id;
    const box = new THREE.Mesh(unitBox, boxMat);
    box.renderOrder = 4;
    const edges = new THREE.LineSegments(unitEdges, edgeMat);
    edges.renderOrder = 5;
    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.renderOrder = 6;
    group.add(box, edges, dot);
    markersRoot.add(group);
    markers.set(part.id, { group, box, edges, dot, boxMat, edgeMat, dotMat });
  }

  // Center of gravity: sphere, three-axis crosshair, drop line, ground ring, axle line and tick
  const cgGroup = new THREE.Group();
  cgGroup.name = "centerOfGravity";
  cgGroup.userData.pickable = false;
  const cgMat = tracker.material(
    new THREE.MeshStandardMaterial({ color: CG_COLOR, emissive: CG_COLOR, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1 })
  );
  const cgSphere = new THREE.Mesh(tracker.geometry(new THREE.SphereGeometry(0.085, 28, 20)), cgMat);
  cgSphere.renderOrder = 8;
  const cgLineMat = tracker.material(new THREE.LineBasicMaterial({ color: CG_COLOR, transparent: true, opacity: 0.9 }));
  const arm = 0.42;
  const crossGeom = tracker.geometry(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-arm, 0, 0), new THREE.Vector3(arm, 0, 0),
      new THREE.Vector3(0, -arm, 0), new THREE.Vector3(0, arm, 0),
      new THREE.Vector3(0, 0, -arm), new THREE.Vector3(0, 0, arm),
    ])
  );
  const crosshair = new THREE.LineSegments(crossGeom, cgLineMat);
  crosshair.renderOrder = 8;
  const ringGeom = tracker.geometry(new THREE.RingGeometry(0.12, 0.14, 48));
  const ringMat = tracker.material(new THREE.MeshBasicMaterial({ color: CG_COLOR, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  const haloRing = new THREE.Mesh(ringGeom, ringMat);
  haloRing.rotation.x = -Math.PI / 2;
  haloRing.renderOrder = 8;
  cgGroup.add(cgSphere, crosshair, haloRing);
  markersRoot.add(cgGroup);

  const dropMat = tracker.material(new THREE.LineDashedMaterial({ color: CG_COLOR, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity: 0.75 }));
  const dropGeom = tracker.geometry(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const dropLine = new THREE.Line(dropGeom, dropMat);
  dropLine.userData.pickable = false;
  markersRoot.add(dropLine);

  const groundRing = new THREE.Mesh(tracker.geometry(new THREE.RingGeometry(0.06, 0.08, 40)), ringMat);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.004;
  groundRing.userData.pickable = false;
  markersRoot.add(groundRing);

  // Axle-to-axle reference along the ground, with ticks at both axles and at the CG projection
  const axleMat = tracker.material(new THREE.LineBasicMaterial({ color: 0x5b636e, transparent: true, opacity: 0.7 }));
  const half = wheelbaseM / 2;
  const axleGeom = tracker.geometry(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0.003, 0), new THREE.Vector3(half, 0.003, 0),
      new THREE.Vector3(-half, 0.003, -0.12), new THREE.Vector3(-half, 0.003, 0.12),
      new THREE.Vector3(half, 0.003, -0.12), new THREE.Vector3(half, 0.003, 0.12),
    ])
  );
  const axleLine = new THREE.LineSegments(axleGeom, axleMat);
  axleLine.userData.pickable = false;
  markersRoot.add(axleLine);

  function applyState() {
    metrics = computeMassBalance(state.parts, wheelbaseM);
    const total = Math.max(1, metrics.totalMassKg);
    for (const part of state.parts) {
      const m = markers.get(part.id);
      if (!m) continue;
      const selected = state.selectedId === part.id;
      const dim = state.selectedId !== null && !selected;
      m.group.position.set(part.xM, part.yM, part.zM);
      m.box.scale.set(part.sizeM[0], part.sizeM[1], part.sizeM[2]);
      m.edges.scale.copy(m.box.scale);
      // Mass dot radius grows with the cube root of the mass share so volume tracks mass
      const r = 0.035 + 0.11 * Math.cbrt(Math.max(0, part.massKg) / total);
      m.dot.scale.setScalar(r);
      m.boxMat.opacity = selected ? 0.26 : dim ? 0.04 : 0.1;
      m.edgeMat.opacity = selected ? 0.95 : dim ? 0.18 : 0.4;
      m.dotMat.emissiveIntensity = selected ? 0.9 : 0.25;
      m.dotMat.opacity = dim ? 0.55 : 1;
      m.dotMat.transparent = dim;
    }
    cgGroup.position.set(metrics.xM, metrics.yM, metrics.zM);
    const pos = dropGeom.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, metrics.xM, metrics.yM, metrics.zM);
    pos.setXYZ(1, metrics.xM, 0.004, metrics.zM);
    pos.needsUpdate = true;
    dropLine.computeLineDistances();
    groundRing.position.set(metrics.xM, 0.004, metrics.zM);
  }

  function setState(next: MassBalanceSceneState) {
    state = next;
    applyState();
  }

  applyState();

  return {
    scene,
    vehicleRoot,
    markersRoot,
    fitTarget: () => vehicleRoot,
    setState,
    metrics: () => metrics,
    dispose() {
      tracker.disposeAll();
      sable.dispose?.();
    },
  };
}
