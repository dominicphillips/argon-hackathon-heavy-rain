import * as THREE from "three";
import {
  BASELINE_A_CONFIG,
  MATERIALS,
  computeChassisMetrics,
  type CameraPresetId,
  type ChassisConfig,
  type LoadCaseId,
} from "../model/chassisModel.ts";

export interface SceneVisualOptions {
  explosionFactor: number; // 0..1
  deformationAmp: number; // e.g., 1, 20, 35
  deformationPhase: number; // 0..1 (1 = full static peak, or sin wave in animation)
  showBodySilhouette: boolean;
  showWheels: boolean;
  showBaselineGhost: boolean;
  showLoadVectors: boolean;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  label: string;
  shortcut: string;
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPose> = {
  isometric: {
    position: [3.35, 1.45, 2.95],
    target: [0, 0.3, 0],
    label: "Isometric",
    shortcut: "1",
  },
  side: {
    position: [0.0, 0.65, 4.35],
    target: [0, 0.25, 0],
    label: "Side profile",
    shortcut: "2",
  },
  top: {
    position: [0.01, 4.75, 0.01],
    target: [0, 0.15, 0],
    label: "Top plan",
    shortcut: "3",
  },
  front: {
    position: [3.65, 1.15, 1.15],
    target: [0.55, 0.25, 0],
    label: "Front bay",
    shortcut: "4",
  },
  underbody: {
    position: [2.25, -1.85, 2.15],
    target: [0, 0.12, 0],
    label: "Underbody",
    shortcut: "5",
  },
};

interface DeformableMeshRecord {
  mesh: THREE.Mesh;
  restPositions: Float32Array;
  baseColor: THREE.Color;
  role: "rail" | "crossmember" | "pack" | "tower" | "subframe";
}

export interface ChassisSceneHandle {
  scene: THREE.Scene;
  /** Parametric chassis sub-assemblies (lifted during the flight transition). */
  root: THREE.Group;
  /** Turntable datum floor and shadow catcher (stays on the ground). */
  floor: THREE.Group;
  updateGeometry: (config: ChassisConfig, options: SceneVisualOptions) => void;
  updateVisualState: (
    config: ChassisConfig,
    options: SceneVisualOptions
  ) => void;
  dispose: () => void;
}

/**
 * Helper to track and dispose Three.js geometries and materials cleanly.
 */
class ResourceTracker {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();

  trackGeometry<T extends THREE.BufferGeometry>(geom: T): T {
    this.geometries.add(geom);
    return geom;
  }

  trackMaterial<T extends THREE.Material>(mat: T): T {
    this.materials.add(mat);
    return mat;
  }

  trackTexture<T extends THREE.Texture>(tex: T): T {
    this.textures.add(tex);
    return tex;
  }

  disposeAll(): void {
    for (const g of this.geometries) {
      g.dispose();
    }
    for (const m of this.materials) {
      m.dispose();
    }
    for (const t of this.textures) {
      t.dispose();
    }
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }
}

/**
 * Creates a soft radial contact shadow texture on an offscreen 2D canvas.
 */
function createContactShadowTexture(
  tracker: ResourceTracker
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, "rgba(17, 19, 23, 0.24)");
  grad.addColorStop(0.55, "rgba(17, 19, 23, 0.10)");
  grad.addColorStop(1, "rgba(17, 19, 23, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return tracker.trackTexture(texture);
}

/**
 * Builds a swept rectangular tube BufferGeometry along a 3D curve with flat normals
 * and initialized vertex color buffer for copper stress shading.
 */
function createSweptBoxRailGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  widthZ: number,
  heightY: number,
  tracker: ResourceTracker
): THREE.BufferGeometry {
  const pts = curve.getPoints(segments);
  const positions: number[] = [];
  const indices: number[] = [];

  const hw = widthZ / 2;
  const hh = heightY / 2;

  // At each station, build 4 corner vertices in local YZ plane perpendicular to curve tangent
  for (let i = 0; i <= segments; i++) {
    const p = pts[i];
    const tangent = curve.getTangent(i / segments).normalize();
    // Side vector along Z (or perpendicular to tangent and world Y)
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    if (side.lengthSq() < 0.001) {
      side.set(0, 0, 1);
    }
    const localUp = new THREE.Vector3().crossVectors(side, tangent).normalize();

    // 4 corners: 0=bottom-in, 1=bottom-out, 2=top-out, 3=top-in
    const c0 = p
      .clone()
      .addScaledVector(side, -hw)
      .addScaledVector(localUp, -hh);
    const c1 = p
      .clone()
      .addScaledVector(side, hw)
      .addScaledVector(localUp, -hh);
    const c2 = p
      .clone()
      .addScaledVector(side, hw)
      .addScaledVector(localUp, hh);
    const c3 = p
      .clone()
      .addScaledVector(side, -hw)
      .addScaledVector(localUp, hh);

    positions.push(
      c0.x,
      c0.y,
      c0.z,
      c1.x,
      c1.y,
      c1.z,
      c2.x,
      c2.y,
      c2.z,
      c3.x,
      c3.y,
      c3.z
    );
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 4;
    const next = (i + 1) * 4;
    for (let face = 0; face < 4; face++) {
      const f0 = base + face;
      const f1 = base + ((face + 1) % 4);
      const n0 = next + face;
      const n1 = next + ((face + 1) % 4);
      indices.push(f0, n0, n1, f0, n1, f1);
    }
  }

  // End caps
  indices.push(0, 1, 2, 0, 2, 3);
  const last = segments * 4;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2);

  const indexedGeom = new THREE.BufferGeometry();
  indexedGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  indexedGeom.setIndex(indices);
  const nonIndexed = indexedGeom.toNonIndexed();
  indexedGeom.dispose();

  nonIndexed.computeVertexNormals();
  const vCount = nonIndexed.attributes.position.count;
  const colors = new Float32Array(vCount * 3);
  colors.fill(0.82);
  nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return tracker.trackGeometry(nonIndexed);
}

/**
 * Lofted translucent SUV concept body shell with wheel arch flares and fastback roofline.
 */
function createSuvBodyLoftGeometry(
  L: number,
  W: number,
  tracker: ResourceTracker
): THREE.BufferGeometry {
  // Normalize stations u in [-1, +1] where +1 is front nose and -1 is rear tail
  const frontOverhang = 0.44;
  const rearOverhang = 0.48;
  const totalLen = L + frontOverhang + rearOverhang;
  const xFront = L / 2 + frontOverhang;
  const xRear = -L / 2 - rearOverhang;

  const numStations = 28;
  const halfW = W * 0.56;

  // Profile stations from rear (0) to front (numStations)
  // At each station we define 9 cross-section points from bottom-center-right -> rocker -> beltline -> roof-rail -> top-center -> mirror left
  const ringPoints = 13;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= numStations; i++) {
    const t = i / numStations; // 0 = rear bumper, 1 = front nose
    const x = xRear + t * totalLen;

    // Determine proximity to front (+L/2) or rear (-L/2) wheel arches for muscular fender flares
    const distFrontAxle = Math.abs(x - L / 2);
    const distRearAxle = Math.abs(x + L / 2);
    const wheelRadius = 0.39;
    const archFlareFront =
      distFrontAxle < wheelRadius * 1.18
        ? Math.cos(((distFrontAxle / (wheelRadius * 1.18)) * Math.PI) / 2)
        : 0;
    const archFlareRear =
      distRearAxle < wheelRadius * 1.18
        ? Math.cos(((distRearAxle / (wheelRadius * 1.18)) * Math.PI) / 2)
        : 0;
    const archFactor = Math.max(archFlareFront, archFlareRear);

    // Plan taper at front nose and rear tail
    let planTaper = 1.0;
    if (t > 0.86) {
      planTaper = 1.0 - 0.24 * Math.pow((t - 0.86) / 0.14, 1.5);
    } else if (t < 0.12) {
      planTaper = 1.0 - 0.16 * Math.pow((0.12 - t) / 0.12, 1.4);
    }

    // Sill height lifts over wheel arches
    const ySill = 0.21 + 0.24 * archFactor + (t > 0.9 ? 0.06 : 0);

    // Beltline / shoulder height
    let yBelt = 0.78 - 0.04 * t;
    if (t > 0.72) {
      // Hood slope down toward front fascia
      const hoodT = (t - 0.72) / 0.28;
      yBelt = 0.75 - 0.18 * Math.pow(hoodT, 1.45);
    }

    // Roofline height (sleek SUV cabin between t=0.10 and t=0.68)
    let yRoof = yBelt + 0.03;
    let tumblehome = 0.76;
    if (t >= 0.08 && t <= 0.72) {
      let cabinProfile = 0;
      if (t < 0.24) {
        // Raked D-pillar fastback SUV tailgate
        cabinProfile = Math.sin(((t - 0.08) / 0.16) * (Math.PI / 2));
      } else if (t <= 0.52) {
        // Gently arched SUV roof
        cabinProfile = 1.0 - 0.04 * ((t - 0.24) / 0.28);
      } else {
        // Steep raked windshield A-pillar
        cabinProfile =
          0.96 * Math.cos(((t - 0.52) / 0.2) * (Math.PI / 2));
      }
      yRoof = yBelt + 0.42 * Math.max(0, cabinProfile);
      tumblehome = 0.74 - 0.06 * Math.max(0, cabinProfile);
    }

    const zLower = halfW * planTaper * (0.94 + 0.09 * archFactor);
    const zMid = halfW * planTaper * (1.0 + 0.11 * archFactor);
    const zBelt = halfW * planTaper * (0.93 + 0.04 * archFactor);
    const zRoof = halfW * planTaper * tumblehome;

    // 13 points around the cross-section from left under-rocker over the roof to right under-rocker
    const sectionPts: [number, number][] = [
      [-zLower * 0.78, ySill],
      [-zLower, ySill + 0.06],
      [-zMid, (ySill + yBelt) * 0.52],
      [-zBelt, yBelt - 0.04],
      [-zBelt * 0.94, yBelt + 0.02],
      [-zRoof, yRoof - 0.03],
      [0, yRoof],
      [zRoof, yRoof - 0.03],
      [zBelt * 0.94, yBelt + 0.02],
      [zBelt, yBelt - 0.04],
      [zMid, (ySill + yBelt) * 0.52],
      [zLower, ySill + 0.06],
      [zLower * 0.78, ySill],
    ];

    for (const [z, y] of sectionPts) {
      positions.push(x, y, z);
    }
  }

  for (let i = 0; i < numStations; i++) {
    const rowA = i * ringPoints;
    const rowB = (i + 1) * ringPoints;
    for (let j = 0; j < ringPoints - 1; j++) {
      const a0 = rowA + j;
      const a1 = rowA + j + 1;
      const b0 = rowB + j;
      const b1 = rowB + j + 1;
      indices.push(a0, b0, b1, a0, b1, a1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return tracker.trackGeometry(geom);
}

/**
 * Adds a crisp CAD wireframe edge overlay to a mesh.
 */
function addCadEdges(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  edgeMaterial: THREE.LineBasicMaterial,
  tracker: ResourceTracker,
  thresholdAngle = 22
): void {
  const edgeGeom = tracker.trackGeometry(
    new THREE.EdgesGeometry(geometry, thresholdAngle)
  );
  const lines = new THREE.LineSegments(edgeGeom, edgeMaterial);
  parent.add(lines);
}

/**
 * Builds the complete interactive Three.js scene for the AUGI Sable concept chassis.
 */
export function createChassisScene(): ChassisSceneHandle {
  const scene = new THREE.Scene();

  // Studio lighting rig
  const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 1.25);
  hemiLight.position.set(0, 6, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.75);
  keyLight.position.set(3.4, 5.8, 3.1);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1.0;
  keyLight.shadow.camera.far = 14.0;
  const d = 2.8;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 3.0;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.9);
  rimLight.position.set(-3.8, 2.8, -3.2);
  scene.add(rimLight);

  const underLight = new THREE.DirectionalLight(0xe2e8f0, 0.65);
  underLight.position.set(0.5, -3.5, 1.2);
  scene.add(underLight);

  // Root groups
  const dynamicRoot = new THREE.Group();
  dynamicRoot.name = "chassisRoot";
  scene.add(dynamicRoot);
  const floorRoot = new THREE.Group();
  floorRoot.name = "chassisFloor";
  scene.add(floorRoot);

  let activeTracker = new ResourceTracker();
  let deformableMeshes: DeformableMeshRecord[] = [];

  // Sub-assembly group references for explosion & deformation
  let leftRailGroup = new THREE.Group();
  let rightRailGroup = new THREE.Group();
  let crossMembersGroup = new THREE.Group();
  let batteryGroup = new THREE.Group();
  let frontSubframeGroup = new THREE.Group();
  let rearSubframeGroup = new THREE.Group();
  let suspensionFLGroup = new THREE.Group();
  let suspensionFRGroup = new THREE.Group();
  let suspensionRLGroup = new THREE.Group();
  let suspensionRRGroup = new THREE.Group();
  let wheelsGroup = new THREE.Group();
  let bodyShellGroup = new THREE.Group();
  let ghostGroup = new THREE.Group();
  let loadArrowsGroup = new THREE.Group();
  let explosionLinesGroup = new THREE.Group();

  let lastGeometrySignature = "";

  function geometrySignature(config: ChassisConfig): string {
    return `${config.wheelbaseMm}_${config.trackWidthMm}_${config.wallGaugeMm.toFixed(1)}_${config.crossMemberCount}_${config.materialId}`;
  }

  /**
   * Builds a single corner double-wishbone + coilover + brake rotor + caliper + hub assembly.
   */
  function buildSuspensionCorner(
    xSign: 1 | -1,
    zSign: 1 | -1,
    axleX: number,
    hubZ: number,
    railZ: number,
    tracker: ResourceTracker,
    castMat: THREE.Material,
    darkMetalMat: THREE.Material,
    rotorMat: THREE.Material,
    caliperMat: THREE.Material,
    springMat: THREE.Material,
    edgeMat: THREE.LineBasicMaterial
  ): THREE.Group {
    const corner = new THREE.Group();
    corner.position.set(axleX, 0, 0);

    const hubY = 0.29;
    const innerZ = zSign * (Math.abs(railZ) + 0.02);
    const outerZ = hubZ - zSign * 0.05;
    const armSpan = Math.abs(outerZ - innerZ);

    // 1. Lower forged L-arm wishbone (2 branches from subframe to lower ball joint)
    for (const xOffset of [-0.11, 0.11]) {
      const pStart = new THREE.Vector3(xOffset, hubY - 0.08, innerZ);
      const pEnd = new THREE.Vector3(0, hubY - 0.07, outerZ);
      const len = pStart.distanceTo(pEnd);
      const armGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.032, 0.022, len)
      );
      const armMesh = new THREE.Mesh(armGeom, darkMetalMat);
      armMesh.position.copy(pStart).lerp(pEnd, 0.5);
      armMesh.lookAt(pEnd);
      armMesh.castShadow = true;
      corner.add(armMesh);
    }

    // 2. Upper forged A-arm wishbone
    for (const xOffset of [-0.085, 0.085]) {
      const pStart = new THREE.Vector3(xOffset, hubY + 0.11, innerZ);
      const pEnd = new THREE.Vector3(0, hubY + 0.095, outerZ);
      const len = pStart.distanceTo(pEnd);
      const armGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.024, 0.018, len)
      );
      const armMesh = new THREE.Mesh(armGeom, castMat);
      armMesh.position.copy(pStart).lerp(pEnd, 0.5);
      armMesh.lookAt(pEnd);
      armMesh.castShadow = true;
      corner.add(armMesh);
    }

    // 3. Steering knuckle / upright
    const knuckleGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.048, 0.055, 0.21, 12)
    );
    const knuckleMesh = new THREE.Mesh(knuckleGeom, castMat);
    knuckleMesh.position.set(0, hubY + 0.01, outerZ);
    corner.add(knuckleMesh);

    // 4. Coilover damper + helical coil spring
    const strutBottom = new THREE.Vector3(
      0,
      hubY - 0.04,
      innerZ + zSign * (armSpan * 0.58)
    );
    const strutTop = new THREE.Vector3(
      -xSign * 0.03,
      hubY + 0.31,
      innerZ + zSign * 0.02
    );
    const strutDir = new THREE.Vector3().subVectors(strutTop, strutBottom);
    const strutLen = strutDir.length();

    const damperGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.024, 0.02, strutLen, 12)
    );
    damperGeom.rotateX(Math.PI / 2);
    const damperMesh = new THREE.Mesh(damperGeom, darkMetalMat);
    damperMesh.position.copy(strutBottom).lerp(strutTop, 0.5);
    damperMesh.lookAt(strutTop);
    corner.add(damperMesh);

    // Helical 3D coil spring around damper
    const helixPts: THREE.Vector3[] = [];
    const turns = 6.5;
    const helixSteps = 56;
    const springRadius = 0.042;
    const upVec = strutDir.clone().normalize();
    const ortho1 = new THREE.Vector3(1, 0, 0);
    const ortho2 = new THREE.Vector3().crossVectors(upVec, ortho1).normalize();
    ortho1.crossVectors(ortho2, upVec).normalize();

    for (let s = 0; s <= helixSteps; s++) {
      const frac = s / helixSteps;
      const angle = frac * turns * Math.PI * 2;
      const center = strutBottom
        .clone()
        .lerp(strutTop, 0.18 + 0.68 * frac);
      center.addScaledVector(ortho1, Math.cos(angle) * springRadius);
      center.addScaledVector(ortho2, Math.sin(angle) * springRadius);
      helixPts.push(center);
    }
    const springCurve = new THREE.CatmullRomCurve3(helixPts);
    const springGeom = tracker.trackGeometry(
      new THREE.TubeGeometry(springCurve, 52, 0.0085, 8, false)
    );
    const springMesh = new THREE.Mesh(springGeom, springMat);
    springMesh.castShadow = true;
    corner.add(springMesh);

    // 5. Ventilated brake rotor disc
    const rotorGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.185, 0.185, 0.026, 28)
    );
    rotorGeom.rotateX(Math.PI / 2);
    const rotorMesh = new THREE.Mesh(rotorGeom, rotorMat);
    rotorMesh.position.set(0, hubY, hubZ);
    rotorMesh.castShadow = true;
    addCadEdges(rotorMesh, rotorGeom, edgeMat, tracker, 25);
    corner.add(rotorMesh);

    // Rotor ventilation slot ring & center hat
    const hatGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.095, 0.095, 0.038, 18)
    );
    hatGeom.rotateX(Math.PI / 2);
    const hatMesh = new THREE.Mesh(hatGeom, darkMetalMat);
    hatMesh.position.set(0, hubY, hubZ + zSign * 0.005);
    corner.add(hatMesh);

    // 5 wheel lug studs
    const studGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.007, 0.007, 0.025, 6)
    );
    studGeom.rotateX(Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const stud = new THREE.Mesh(studGeom, castMat);
      stud.position.set(
        Math.cos(a) * 0.058,
        hubY + Math.sin(a) * 0.058,
        hubZ + zSign * 0.022
      );
      corner.add(stud);
    }

    // 6. Multi-piston brake caliper
    const caliperGeom = tracker.trackGeometry(
      new THREE.BoxGeometry(0.092, 0.145, 0.058)
    );
    const caliperMesh = new THREE.Mesh(caliperGeom, caliperMat);
    caliperMesh.position.set(
      -xSign * 0.135,
      hubY + 0.045,
      hubZ + zSign * 0.004
    );
    caliperMesh.rotation.z = xSign * 0.32;
    addCadEdges(caliperMesh, caliperGeom, edgeMat, tracker);
    corner.add(caliperMesh);

    // 7. Hub axis hairline extending outward (matches 04-augi-chassis.png)
    const axisPts = [
      new THREE.Vector3(0, hubY, hubZ),
      new THREE.Vector3(0, hubY, hubZ + zSign * 0.34),
    ];
    const axisGeom = tracker.trackGeometry(
      new THREE.BufferGeometry().setFromPoints(axisPts)
    );
    const axisLine = new THREE.Line(axisGeom, edgeMat);
    corner.add(axisLine);

    return corner;
  }

  /**
   * Builds a multi-spoke turbine wheel & tire assembly at a corner.
   */
  function buildWheelCorner(
    axleX: number,
    hubZ: number,
    zSign: 1 | -1,
    tracker: ResourceTracker,
    rimMat: THREE.Material,
    tireMat: THREE.Material
  ): THREE.Group {
    const wheel = new THREE.Group();
    const hubY = 0.29;
    wheel.position.set(axleX, hubY, hubZ + zSign * 0.02);

    // Sculpted tire torus
    const tireGeom = tracker.trackGeometry(
      new THREE.TorusGeometry(0.31, 0.088, 16, 36)
    );
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    wheel.add(tireMesh);

    // Outer alloy rim barrel
    const barrelGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.245, 0.245, 0.21, 28, 1, true)
    );
    barrelGeom.rotateX(Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeom, rimMat);
    wheel.add(barrelMesh);

    // 10 turbine spokes
    const spokeGeom = tracker.trackGeometry(
      new THREE.BoxGeometry(0.024, 0.21, 0.016)
    );
    for (let s = 0; s < 10; s++) {
      const angle = (s / 10) * Math.PI * 2;
      const spoke = new THREE.Mesh(spokeGeom, rimMat);
      spoke.position.set(
        Math.cos(angle) * 0.125,
        Math.sin(angle) * 0.125,
        zSign * 0.055
      );
      spoke.rotation.z = angle - Math.PI / 2 + 0.14;
      wheel.add(spoke);
    }

    return wheel;
  }

  /**
   * Rebuilds the parametric 3D geometry when wheelbase, track, wall gauge, cross-members, or material change.
   */
  function rebuildSceneGeometry(
    config: ChassisConfig,
    options: SceneVisualOptions
  ): void {
    // Clear previous meshes and dispose GPU resources
    dynamicRoot.clear();
    floorRoot.clear();
    activeTracker.disposeAll();
    activeTracker = new ResourceTracker();
    deformableMeshes = [];

    const tracker = activeTracker;
    const L = config.wheelbaseMm * 1e-3; // e.g. 2.98 m
    const W = config.trackWidthMm * 1e-3; // e.g. 1.68 m
    const gaugeFactor = config.wallGaugeMm / 2.4; // 1.0 at 2.4 mm baseline
    const nCm = Math.round(config.crossMemberCount);
    const matSpec = MATERIALS[config.materialId] ?? MATERIALS["al-6061-t6"];

    // Shared materials
    const baseAlloyColor = new THREE.Color(matSpec.tintHex);

    const deformableVertexColorMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.52,
        roughness: 0.36,
      })
    );

    const castAluminumMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: baseAlloyColor.clone().offsetHSL(0, 0, -0.04),
        metalness: 0.58,
        roughness: 0.38,
      })
    );

    const darkAnodizedMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x3b424d,
        metalness: 0.65,
        roughness: 0.35,
      })
    );

    const cellModuleMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd6dce5,
        metalness: 0.45,
        roughness: 0.42,
      })
    );

    const hvOrangeMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.25,
        roughness: 0.4,
      })
    );

    const rotorMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x9aa3b0,
        metalness: 0.72,
        roughness: 0.28,
      })
    );

    const caliperMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x282e38,
        metalness: 0.5,
        roughness: 0.35,
      })
    );

    const springMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1e242d,
        metalness: 0.45,
        roughness: 0.4,
      })
    );

    const cadEdgeMat = tracker.trackMaterial(
      new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.34,
      })
    );

    const datumRingMat = tracker.trackMaterial(
      new THREE.LineBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.65,
      })
    );

    const datumSubtleMat = tracker.trackMaterial(
      new THREE.LineBasicMaterial({
        color: 0xb8bec8,
        transparent: true,
        opacity: 0.5,
      })
    );

    // -------------------------------------------------------------------------
    // 1. Turntable Datum Floor & Contact Shadow
    // -------------------------------------------------------------------------
    const turntableGroup = new THREE.Group();
    floorRoot.add(turntableGroup);

    const shadowPlaneGeom = tracker.trackGeometry(
      new THREE.PlaneGeometry(5.6, 5.6)
    );
    shadowPlaneGeom.rotateX(-Math.PI / 2);
    const shadowMat = tracker.trackMaterial(
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    const shadowPlane = new THREE.Mesh(shadowPlaneGeom, shadowMat);
    shadowPlane.position.y = -0.01;
    shadowPlane.receiveShadow = true;
    turntableGroup.add(shadowPlane);

    const contactTex = createContactShadowTexture(tracker);
    if (contactTex) {
      const contactGeom = tracker.trackGeometry(
        new THREE.PlaneGeometry(L * 1.45, W * 1.55)
      );
      contactGeom.rotateX(-Math.PI / 2);
      const contactMat = tracker.trackMaterial(
        new THREE.MeshBasicMaterial({
          map: contactTex,
          transparent: true,
          depthWrite: false,
        })
      );
      const contactMesh = new THREE.Mesh(contactGeom, contactMat);
      contactMesh.position.y = -0.008;
      turntableGroup.add(contactMesh);
    }

    // Concentric turntable rings & degree ticks (matching 04-augi-chassis.png)
    const rOuter = 2.42;
    const rInner = 2.24;
    for (const radius of [rOuter, rInner, 1.48]) {
      const pts: THREE.Vector3[] = [];
      const segs = 128;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(Math.cos(a) * radius, -0.005, Math.sin(a) * radius)
        );
      }
      const ringGeom = tracker.trackGeometry(
        new THREE.BufferGeometry().setFromPoints(pts)
      );
      turntableGroup.add(
        new THREE.Line(
          ringGeom,
          radius === 1.48 ? datumSubtleMat : datumRingMat
        )
      );
    }

    // 72 degree tick marks between rInner and rOuter
    const tickPositions: number[] = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const isMajor = deg % 45 === 0;
      const isMed = deg % 15 === 0;
      const r0 = isMajor ? rInner - 0.04 : isMed ? rInner : rInner + 0.05;
      const r1 = rOuter;
      tickPositions.push(
        Math.cos(rad) * r0,
        -0.005,
        Math.sin(rad) * r0,
        Math.cos(rad) * r1,
        -0.005,
        Math.sin(rad) * r1
      );
    }
    // Axle datum lines on floor at x = ±L/2
    tickPositions.push(
      L / 2,
      -0.004,
      -W * 0.78,
      L / 2,
      -0.004,
      W * 0.78,
      -L / 2,
      -0.004,
      -W * 0.78,
      -L / 2,
      -0.004,
      W * 0.78,
      -rOuter * 1.04,
      -0.004,
      0,
      rOuter * 1.04,
      -0.004,
      0
    );
    const ticksGeom = tracker.trackGeometry(new THREE.BufferGeometry());
    ticksGeom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(tickPositions, 3)
    );
    turntableGroup.add(new THREE.LineSegments(ticksGeom, datumRingMat));

    // -------------------------------------------------------------------------
    // 2. Longitudinal Hydroformed Side Rails (Left & Right)
    // -------------------------------------------------------------------------
    leftRailGroup = new THREE.Group();
    rightRailGroup = new THREE.Group();
    dynamicRoot.add(leftRailGroup, rightRailGroup);

    const railHalfSpanZ = W * 0.41;
    const subframeHalfSpanZ = W * 0.29;
    const railWidthZ = 0.088 * (0.86 + 0.14 * gaugeFactor);
    const railHeightY = 0.118 * (0.86 + 0.14 * gaugeFactor);

    for (const zSign of [1, -1] as const) {
      const targetGroup = zSign === 1 ? leftRailGroup : rightRailGroup;

      // Swept S-curve longitudinal rail from rear crash box over rear axle, along lower sill, over front axle to front crash box
      const curvePts = [
        new THREE.Vector3(-L / 2 - 0.32, 0.37, zSign * subframeHalfSpanZ),
        new THREE.Vector3(-L / 2 - 0.04, 0.43, zSign * (subframeHalfSpanZ * 1.06)),
        new THREE.Vector3(-L / 2 + 0.26, 0.33, zSign * (railHalfSpanZ * 0.92)),
        new THREE.Vector3(-L * 0.28, 0.22, zSign * railHalfSpanZ),
        new THREE.Vector3(0, 0.22, zSign * railHalfSpanZ),
        new THREE.Vector3(L * 0.28, 0.22, zSign * railHalfSpanZ),
        new THREE.Vector3(L / 2 - 0.26, 0.33, zSign * (railHalfSpanZ * 0.92)),
        new THREE.Vector3(L / 2 + 0.04, 0.43, zSign * (subframeHalfSpanZ * 1.06)),
        new THREE.Vector3(L / 2 + 0.34, 0.37, zSign * subframeHalfSpanZ),
      ];
      const railCurve = new THREE.CatmullRomCurve3(curvePts);
      const railGeom = createSweptBoxRailGeometry(
        railCurve,
        44,
        railWidthZ,
        railHeightY,
        tracker
      );
      const railMesh = new THREE.Mesh(railGeom, deformableVertexColorMat);
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      addCadEdges(railMesh, railGeom, cadEdgeMat, tracker, 18);
      targetGroup.add(railMesh);

      deformableMeshes.push({
        mesh: railMesh,
        restPositions: new Float32Array(
          (railGeom.attributes.position as THREE.BufferAttribute).array
        ),
        baseColor: baseAlloyColor,
        role: "rail",
      });

      // Outer rocker sill step flange along battery bay
      const sillLen = L * 0.64;
      const flangeGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(sillLen, 0.026 * gaugeFactor, 0.038)
      ).toNonIndexed();
      flangeGeom.computeVertexNormals();
      const fColors = new Float32Array(
        flangeGeom.attributes.position.count * 3
      ).fill(0.82);
      flangeGeom.setAttribute("color", new THREE.BufferAttribute(fColors, 3));
      const flangeMesh = new THREE.Mesh(flangeGeom, deformableVertexColorMat);
      flangeMesh.position.set(
        0,
        0.18,
        zSign * (railHalfSpanZ + railWidthZ * 0.55)
      );
      addCadEdges(flangeMesh, flangeGeom, cadEdgeMat, tracker);
      targetGroup.add(flangeMesh);

      // Shock tower diagonal gusset arches connecting lower rail to upper arch at front and rear axles
      for (const xSign of [1, -1] as const) {
        const towerGeom = tracker.trackGeometry(
          new THREE.BoxGeometry(0.16, 0.24, 0.075 * (0.88 + 0.12 * gaugeFactor))
        ).toNonIndexed();
        towerGeom.computeVertexNormals();
        const tColors = new Float32Array(
          towerGeom.attributes.position.count * 3
        ).fill(0.82);
        towerGeom.setAttribute("color", new THREE.BufferAttribute(tColors, 3));

        const towerMesh = new THREE.Mesh(towerGeom, deformableVertexColorMat);
        towerMesh.position.set(
          xSign * (L / 2 - 0.02),
          0.44,
          zSign * (subframeHalfSpanZ * 1.05)
        );
        towerMesh.rotation.z = -xSign * 0.18;
        towerMesh.castShadow = true;
        addCadEdges(towerMesh, towerGeom, cadEdgeMat, tracker);
        targetGroup.add(towerMesh);

        deformableMeshes.push({
          mesh: towerMesh,
          restPositions: new Float32Array(
            (towerGeom.attributes.position as THREE.BufferAttribute).array
          ),
          baseColor: baseAlloyColor,
          role: "tower",
        });

        // Upper strut top-hat circular boss + 6 fastener studs
        const hatBossGeom = tracker.trackGeometry(
          new THREE.CylinderGeometry(0.068, 0.076, 0.032, 16)
        );
        const hatBossMesh = new THREE.Mesh(hatBossGeom, castAluminumMat);
        hatBossMesh.position.set(
          xSign * (L / 2 - 0.02),
          0.56,
          zSign * (subframeHalfSpanZ * 1.05)
        );
        addCadEdges(hatBossMesh, hatBossGeom, cadEdgeMat, tracker);
        targetGroup.add(hatBossMesh);
      }
    }

    // -------------------------------------------------------------------------
    // 3. Lateral Cross-Members & Central Spine Ladder
    // -------------------------------------------------------------------------
    crossMembersGroup = new THREE.Group();
    dynamicRoot.add(crossMembersGroup);

    const baySpanX = L * 0.62;
    const crossSpanZ = railHalfSpanZ * 2 - railWidthZ * 0.6;
    const cmHeight = 0.072 * (0.88 + 0.12 * gaugeFactor);
    const cmWidth = 0.064 * (0.88 + 0.12 * gaugeFactor);

    for (let i = 0; i < nCm; i++) {
      const frac = nCm === 1 ? 0.5 : i / (nCm - 1);
      const xPos = -baySpanX / 2 + frac * baySpanX;

      const cmGeom = tracker
        .trackGeometry(new THREE.BoxGeometry(cmWidth, cmHeight, crossSpanZ))
        .toNonIndexed();
      cmGeom.computeVertexNormals();
      const cmColors = new Float32Array(
        cmGeom.attributes.position.count * 3
      ).fill(0.82);
      cmGeom.setAttribute("color", new THREE.BufferAttribute(cmColors, 3));

      const cmMesh = new THREE.Mesh(cmGeom, deformableVertexColorMat);
      cmMesh.position.set(xPos, 0.23, 0);
      cmMesh.castShadow = true;
      cmMesh.receiveShadow = true;
      addCadEdges(cmMesh, cmGeom, cadEdgeMat, tracker);
      crossMembersGroup.add(cmMesh);

      deformableMeshes.push({
        mesh: cmMesh,
        restPositions: new Float32Array(
          (cmGeom.attributes.position as THREE.BufferAttribute).array
        ),
        baseColor: baseAlloyColor,
        role: "crossmember",
      });

      // Flanged end brackets with fastener heads
      for (const zSign of [1, -1] as const) {
        const bracketGeom = tracker.trackGeometry(
          new THREE.BoxGeometry(cmWidth * 1.45, cmHeight * 1.15, 0.045)
        );
        const bracketMesh = new THREE.Mesh(bracketGeom, castAluminumMat);
        bracketMesh.position.set(
          xPos,
          0.23,
          zSign * (crossSpanZ / 2 - 0.015)
        );
        addCadEdges(bracketMesh, bracketGeom, cadEdgeMat, tracker);
        crossMembersGroup.add(bracketMesh);
      }
    }

    // Central longitudinal spine beam tying the cross-members together
    const spineGeom = tracker
      .trackGeometry(
        new THREE.BoxGeometry(baySpanX * 1.04, cmHeight * 1.08, 0.095)
      )
      .toNonIndexed();
    spineGeom.computeVertexNormals();
    const sColors = new Float32Array(
      spineGeom.attributes.position.count * 3
    ).fill(0.82);
    spineGeom.setAttribute("color", new THREE.BufferAttribute(sColors, 3));
    const spineMesh = new THREE.Mesh(spineGeom, deformableVertexColorMat);
    spineMesh.position.set(0, 0.235, 0);
    addCadEdges(spineMesh, spineGeom, cadEdgeMat, tracker);
    crossMembersGroup.add(spineMesh);
    deformableMeshes.push({
      mesh: spineMesh,
      restPositions: new Float32Array(
        (spineGeom.attributes.position as THREE.BufferAttribute).array
      ),
      baseColor: baseAlloyColor,
      role: "crossmember",
    });

    // -------------------------------------------------------------------------
    // 4. Structural Battery Floor Tray, Bottom Shear Plate & Cell Modules
    // -------------------------------------------------------------------------
    batteryGroup = new THREE.Group();
    dynamicRoot.add(batteryGroup);

    const trayLengthX = baySpanX * 1.06;
    const trayWidthZ = crossSpanZ * 0.98;
    const trayGeom = tracker
      .trackGeometry(new THREE.BoxGeometry(trayLengthX, 0.042, trayWidthZ))
      .toNonIndexed();
    trayGeom.computeVertexNormals();
    const trayColors = new Float32Array(
      trayGeom.attributes.position.count * 3
    ).fill(0.8);
    trayGeom.setAttribute("color", new THREE.BufferAttribute(trayColors, 3));

    const trayMesh = new THREE.Mesh(trayGeom, deformableVertexColorMat);
    trayMesh.position.set(0, 0.165, 0);
    trayMesh.receiveShadow = true;
    trayMesh.castShadow = true;
    addCadEdges(trayMesh, trayGeom, cadEdgeMat, tracker);
    batteryGroup.add(trayMesh);

    deformableMeshes.push({
      mesh: trayMesh,
      restPositions: new Float32Array(
        (trayGeom.attributes.position as THREE.BufferAttribute).array
      ),
      baseColor: baseAlloyColor,
      role: "pack",
    });

    // Underbody stiffening shear ribs (visible in Underbody camera preset)
    for (let r = -2; r <= 2; r++) {
      const ribGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(trayLengthX * 0.94, 0.018, 0.036)
      );
      const ribMesh = new THREE.Mesh(ribGeom, darkAnodizedMat);
      ribMesh.position.set(0, 0.136, r * (trayWidthZ * 0.19));
      batteryGroup.add(ribMesh);
    }

    // Individual prismatic battery modules in bays between cross-members
    const numBays = Math.max(1, nCm - 1);
    const bayPitch = baySpanX / numBays;
    const moduleLenX = Math.max(0.08, bayPitch - cmWidth - 0.028);
    const moduleHalfWidthZ = (trayWidthZ - 0.16) * 0.46;

    for (let b = 0; b < numBays; b++) {
      const bayCenterX = -baySpanX / 2 + (b + 0.5) * bayPitch;
      for (const zSign of [1, -1] as const) {
        const modGeom = tracker.trackGeometry(
          new THREE.BoxGeometry(moduleLenX, 0.052, moduleHalfWidthZ)
        );
        const modMesh = new THREE.Mesh(modGeom, cellModuleMat);
        modMesh.position.set(
          bayCenterX,
          0.205,
          zSign * (moduleHalfWidthZ * 0.54 + 0.04)
        );
        modMesh.receiveShadow = true;
        addCadEdges(modMesh, modGeom, cadEdgeMat, tracker);
        batteryGroup.add(modMesh);
      }
    }

    // High-voltage orange busbar & front BMS coolant manifold
    const hvBarGeom = tracker.trackGeometry(
      new THREE.BoxGeometry(trayLengthX * 0.88, 0.014, 0.026)
    );
    const hvBarMesh = new THREE.Mesh(hvBarGeom, hvOrangeMat);
    hvBarMesh.position.set(0, 0.278, 0);
    batteryGroup.add(hvBarMesh);

    // Perimeter hex fastener bolt heads along the tray sill flange
    const boltGeom = tracker.trackGeometry(
      new THREE.CylinderGeometry(0.009, 0.009, 0.016, 6)
    );
    for (let k = 0; k < 12; k++) {
      const bx = -trayLengthX * 0.46 + (k / 11) * (trayLengthX * 0.92);
      for (const zSign of [1, -1] as const) {
        const bolt = new THREE.Mesh(boltGeom, darkAnodizedMat);
        bolt.position.set(bx, 0.198, zSign * (railHalfSpanZ + 0.045));
        batteryGroup.add(bolt);
      }
    }

    // -------------------------------------------------------------------------
    // 5. Front & Rear Megacast Subframes, E-Motors & Crash Beams
    // -------------------------------------------------------------------------
    frontSubframeGroup = new THREE.Group();
    rearSubframeGroup = new THREE.Group();
    dynamicRoot.add(frontSubframeGroup, rearSubframeGroup);

    for (const xSign of [1, -1] as const) {
      const subGroup = xSign === 1 ? frontSubframeGroup : rearSubframeGroup;
      const axleX = xSign * (L / 2);

      // Main cast cradle cross-beam at axle
      const cradleWidthZ = subframeHalfSpanZ * 2.08;
      const cradleGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.32, 0.085, cradleWidthZ)
      );
      const cradleMesh = new THREE.Mesh(cradleGeom, castAluminumMat);
      cradleMesh.position.set(axleX, 0.26, 0);
      cradleMesh.castShadow = true;
      addCadEdges(cradleMesh, cradleGeom, cadEdgeMat, tracker);
      subGroup.add(cradleMesh);

      // Upper subframe tie-bar bridging between shock towers
      const tieBarGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.095, 0.048, cradleWidthZ * 1.02)
      );
      const tieBarMesh = new THREE.Mesh(tieBarGeom, castAluminumMat);
      tieBarMesh.position.set(axleX - xSign * 0.14, 0.42, 0);
      addCadEdges(tieBarMesh, tieBarGeom, cadEdgeMat, tracker);
      subGroup.add(tieBarMesh);

      // Electric drive unit (cylindrical motor stator + top inverter housing)
      const motorGeom = tracker.trackGeometry(
        new THREE.CylinderGeometry(0.115, 0.115, 0.38, 20)
      );
      motorGeom.rotateX(Math.PI / 2);
      const motorMesh = new THREE.Mesh(motorGeom, darkAnodizedMat);
      motorMesh.position.set(axleX, 0.29, 0);
      addCadEdges(motorMesh, motorGeom, cadEdgeMat, tracker, 28);
      subGroup.add(motorMesh);

      const inverterGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.21, 0.065, 0.26)
      );
      const inverterMesh = new THREE.Mesh(inverterGeom, castAluminumMat);
      inverterMesh.position.set(axleX, 0.41, 0);
      addCadEdges(inverterMesh, inverterGeom, cadEdgeMat, tracker);
      subGroup.add(inverterMesh);

      // Left & right half-shafts from e-motor to wheel hubs
      const halfShaftSpan = W - 0.12;
      const shaftGeom = tracker.trackGeometry(
        new THREE.CylinderGeometry(0.018, 0.018, halfShaftSpan, 10)
      );
      shaftGeom.rotateX(Math.PI / 2);
      const shaftMesh = new THREE.Mesh(shaftGeom, darkAnodizedMat);
      shaftMesh.position.set(axleX, 0.29, 0);
      subGroup.add(shaftMesh);

      // Extruded bumper crash cross-beam & crush cans (matches 04-augi-chassis.png)
      const bumperX = axleX + xSign * 0.38;
      const bumperGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.075, 0.115, W * 0.76)
      );
      const bumperMesh = new THREE.Mesh(bumperGeom, castAluminumMat);
      bumperMesh.position.set(bumperX, 0.37, 0);
      bumperMesh.castShadow = true;
      addCadEdges(bumperMesh, bumperGeom, cadEdgeMat, tracker);
      subGroup.add(bumperMesh);

      // Bumper end flange plates
      for (const zSign of [1, -1] as const) {
        const endCapGeom = tracker.trackGeometry(
          new THREE.BoxGeometry(0.11, 0.135, 0.025)
        );
        const endCap = new THREE.Mesh(endCapGeom, castAluminumMat);
        endCap.position.set(
          bumperX - xSign * 0.015,
          0.37,
          zSign * (W * 0.38)
        );
        addCadEdges(endCap, endCapGeom, cadEdgeMat, tracker);
        subGroup.add(endCap);
      }
    }

    // -------------------------------------------------------------------------
    // 6. Four-Corner Suspension Assemblies & Optional Wheels
    // -------------------------------------------------------------------------
    const hubZ = W / 2;
    suspensionFLGroup = buildSuspensionCorner(
      1,
      1,
      L / 2,
      hubZ,
      railHalfSpanZ,
      tracker,
      castAluminumMat,
      darkAnodizedMat,
      rotorMat,
      caliperMat,
      springMat,
      cadEdgeMat
    );
    suspensionFRGroup = buildSuspensionCorner(
      1,
      -1,
      L / 2,
      -hubZ,
      -railHalfSpanZ,
      tracker,
      castAluminumMat,
      darkAnodizedMat,
      rotorMat,
      caliperMat,
      springMat,
      cadEdgeMat
    );
    suspensionRLGroup = buildSuspensionCorner(
      -1,
      1,
      -L / 2,
      hubZ,
      railHalfSpanZ,
      tracker,
      castAluminumMat,
      darkAnodizedMat,
      rotorMat,
      caliperMat,
      springMat,
      cadEdgeMat
    );
    suspensionRRGroup = buildSuspensionCorner(
      -1,
      -1,
      -L / 2,
      -hubZ,
      -railHalfSpanZ,
      tracker,
      castAluminumMat,
      darkAnodizedMat,
      rotorMat,
      caliperMat,
      springMat,
      cadEdgeMat
    );
    dynamicRoot.add(
      suspensionFLGroup,
      suspensionFRGroup,
      suspensionRLGroup,
      suspensionRRGroup
    );

    // Optional Wheels & Tires
    wheelsGroup = new THREE.Group();
    const rimMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd0d7e2,
        metalness: 0.7,
        roughness: 0.25,
      })
    );
    const tireMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1c2026,
        metalness: 0.1,
        roughness: 0.78,
        transparent: true,
        opacity: 0.88,
      })
    );
    for (const [xSign, zSign] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      wheelsGroup.add(
        buildWheelCorner(
          xSign * (L / 2),
          zSign * hubZ,
          zSign,
          tracker,
          rimMat,
          tireMat
        )
      );
    }
    dynamicRoot.add(wheelsGroup);

    // -------------------------------------------------------------------------
    // 7. Optional Translucent Concept SUV Body Silhouette + Signature Lights
    // -------------------------------------------------------------------------
    bodyShellGroup = new THREE.Group();
    const suvBodyGeom = createSuvBodyLoftGeometry(L, W, tracker);
    const suvGlassMat = tracker.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xd8e2ef,
        metalness: 0.08,
        roughness: 0.18,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const suvBodyMesh = new THREE.Mesh(suvBodyGeom, suvGlassMat);
    bodyShellGroup.add(suvBodyMesh);

    const suvWireEdgeMat = tracker.trackMaterial(
      new THREE.LineBasicMaterial({
        color: 0x3b5998,
        transparent: true,
        opacity: 0.32,
      })
    );
    addCadEdges(bodyShellGroup, suvBodyGeom, suvWireEdgeMat, tracker, 12);

    // Front DRL horizon light blade + quad matrix headlamps
    const frontLightX = L / 2 + 0.42;
    const drlMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xe0f2fe,
        emissiveIntensity: 1.8,
      })
    );
    const frontBarGeom = tracker.trackGeometry(
      new THREE.BoxGeometry(0.022, 0.018, W * 0.76)
    );
    const frontBar = new THREE.Mesh(frontBarGeom, drlMat);
    frontBar.position.set(frontLightX, 0.56, 0);
    bodyShellGroup.add(frontBar);

    for (const zSign of [1, -1] as const) {
      const matrixPodGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.035, 0.032, 0.14)
      );
      const pod = new THREE.Mesh(matrixPodGeom, drlMat);
      pod.position.set(frontLightX - 0.01, 0.53, zSign * (W * 0.34));
      bodyShellGroup.add(pod);
    }

    // Rear signature ruby-amber LED light blade + vertical fins
    const rearLightX = -L / 2 - 0.46;
    const tailLightMat = tracker.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 1.7,
      })
    );
    const rearBarGeom = tracker.trackGeometry(
      new THREE.BoxGeometry(0.024, 0.022, W * 0.8)
    );
    const rearBar = new THREE.Mesh(rearBarGeom, tailLightMat);
    rearBar.position.set(rearLightX, 0.72, 0);
    bodyShellGroup.add(rearBar);

    for (const zSign of [1, -1] as const) {
      const finGeom = tracker.trackGeometry(
        new THREE.BoxGeometry(0.028, 0.11, 0.024)
      );
      const fin = new THREE.Mesh(finGeom, tailLightMat);
      fin.position.set(rearLightX + 0.01, 0.67, zSign * (W * 0.4));
      bodyShellGroup.add(fin);
    }
    dynamicRoot.add(bodyShellGroup);

    // -------------------------------------------------------------------------
    // 8. Baseline A Ghost Wireframe Overlay (for Compare Mode)
    // -------------------------------------------------------------------------
    ghostGroup = new THREE.Group();
    const baseL = BASELINE_A_CONFIG.wheelbaseMm * 1e-3;
    const baseW = BASELINE_A_CONFIG.trackWidthMm * 1e-3;
    const baseRailZ = baseW * 0.41;
    const baseSubZ = baseW * 0.29;
    const ghostWireMat = tracker.trackMaterial(
      new THREE.LineBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.58,
      })
    );

    for (const zSign of [1, -1] as const) {
      const ghostCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-baseL / 2 - 0.32, 0.37, zSign * baseSubZ),
        new THREE.Vector3(-baseL / 2 - 0.04, 0.43, zSign * (baseSubZ * 1.06)),
        new THREE.Vector3(-baseL / 2 + 0.26, 0.33, zSign * (baseRailZ * 0.92)),
        new THREE.Vector3(-baseL * 0.28, 0.22, zSign * baseRailZ),
        new THREE.Vector3(0, 0.22, zSign * baseRailZ),
        new THREE.Vector3(baseL * 0.28, 0.22, zSign * baseRailZ),
        new THREE.Vector3(baseL / 2 - 0.26, 0.33, zSign * (baseRailZ * 0.92)),
        new THREE.Vector3(baseL / 2 + 0.04, 0.43, zSign * (baseSubZ * 1.06)),
        new THREE.Vector3(baseL / 2 + 0.34, 0.37, zSign * baseSubZ),
      ]);
      const ghostRailGeom = createSweptBoxRailGeometry(
        ghostCurve,
        28,
        0.088,
        0.118,
        tracker
      );
      const ghostEdges = tracker.trackGeometry(
        new THREE.EdgesGeometry(ghostRailGeom, 15)
      );
      ghostGroup.add(new THREE.LineSegments(ghostEdges, ghostWireMat));
    }

    const ghostPackBox = tracker.trackGeometry(
      new THREE.EdgesGeometry(
        tracker.trackGeometry(
          new THREE.BoxGeometry(baseL * 0.65, 0.09, baseRailZ * 1.9)
        )
      )
    );
    const ghostPackLines = new THREE.LineSegments(ghostPackBox, ghostWireMat);
    ghostPackLines.position.set(0, 0.21, 0);
    ghostGroup.add(ghostPackLines);
    dynamicRoot.add(ghostGroup);

    // -------------------------------------------------------------------------
    // 9. Load Case Vector Arrows & Explosion Leader Lines
    // -------------------------------------------------------------------------
    loadArrowsGroup = new THREE.Group();
    explosionLinesGroup = new THREE.Group();

    const leaderPositions = new Float32Array(12 * 3); // 6 leader lines * 2 endpoints * 3 coords
    const leaderGeom = tracker.trackGeometry(new THREE.BufferGeometry());
    leaderGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(leaderPositions, 3)
    );
    const leaderMat = tracker.trackMaterial(
      new THREE.LineBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.55,
      })
    );
    const leaderLines = new THREE.LineSegments(leaderGeom, leaderMat);
    leaderLines.name = "explosionLeaders";
    explosionLinesGroup.add(leaderLines);

    dynamicRoot.add(loadArrowsGroup, explosionLinesGroup);

    lastGeometrySignature = geometrySignature(config);
    applyVisualState(config, options);
  }

  /**
   * Updates vertex stress colors, elastic deformation displacements, explosion offsets,
   * and visibility flags without rebuilding the entire mesh topology when only sliders/toggles move.
   */
  function applyVisualState(
    config: ChassisConfig,
    options: SceneVisualOptions
  ): void {
    const metrics = computeChassisMetrics(config);
    const L = config.wheelbaseMm * 1e-3;
    const W = config.trackWidthMm * 1e-3;
    const loadCase: LoadCaseId = config.loadCase;

    // Visibility toggles
    wheelsGroup.visible = options.showWheels;
    bodyShellGroup.visible = options.showBodySilhouette;
    ghostGroup.visible = options.showBaselineGhost;
    loadArrowsGroup.visible = options.showLoadVectors;

    // 1. Exploded view assembly offsets
    const exp = Math.max(0, Math.min(1, options.explosionFactor));
    frontSubframeGroup.position.set(exp * 0.56, 0, 0);
    rearSubframeGroup.position.set(-exp * 0.56, 0, 0);
    leftRailGroup.position.set(0, 0, exp * 0.44);
    rightRailGroup.position.set(0, 0, -exp * 0.44);
    crossMembersGroup.position.set(0, exp * 0.34, 0);
    batteryGroup.position.set(0, -exp * 0.38, 0);
    suspensionFLGroup.position.set(L / 2 + exp * 0.22, 0, exp * 0.52);
    suspensionFRGroup.position.set(L / 2 + exp * 0.22, 0, -exp * 0.52);
    suspensionRLGroup.position.set(-L / 2 - exp * 0.22, 0, exp * 0.52);
    suspensionRRGroup.position.set(-L / 2 - exp * 0.22, 0, -exp * 0.52);
    wheelsGroup.position.set(0, exp * 0.12, 0);
    bodyShellGroup.position.set(0, exp * 0.68, 0);

    // Update explosion datum leader lines (zero allocation)
    explosionLinesGroup.visible = exp > 0.02;
    const leaderObj = explosionLinesGroup.getObjectByName(
      "explosionLeaders"
    ) as THREE.LineSegments | undefined;
    if (leaderObj && exp > 0.02) {
      const lp = leaderObj.geometry.attributes
        .position as THREE.BufferAttribute;
      const railZ = W * 0.41;
      // 0: Front subframe leader
      lp.setXYZ(0, L / 2, 0.26, 0);
      lp.setXYZ(1, L / 2 + exp * 0.56, 0.26, 0);
      // 1: Rear subframe leader
      lp.setXYZ(2, -L / 2, 0.26, 0);
      lp.setXYZ(3, -L / 2 - exp * 0.56, 0.26, 0);
      // 2: Left rail leader
      lp.setXYZ(4, 0, 0.22, railZ);
      lp.setXYZ(5, 0, 0.22, railZ + exp * 0.44);
      // 3: Right rail leader
      lp.setXYZ(6, 0, 0.22, -railZ);
      lp.setXYZ(7, 0, 0.22, -railZ - exp * 0.44);
      // 4: Cross-member ladder leader
      lp.setXYZ(8, 0, 0.23, 0);
      lp.setXYZ(9, 0, 0.23 + exp * 0.34, 0);
      // 5: Battery tray leader
      lp.setXYZ(10, 0, 0.16, 0);
      lp.setXYZ(11, 0, 0.16 - exp * 0.38, 0);
      lp.needsUpdate = true;
    }

    // 2. Compute physical elastic displacement amplitude & copper strain contour
    // Torsion copper color (#D97706) and hot peak copper (#B45309)
    const copperMid = new THREE.Color("#D97706");
    const copperHot = new THREE.Color("#B45309");
    const tmpColor = new THREE.Color();

    const twistRad = (metrics.peakTwistDeg * Math.PI) / 180;
    const sagM = metrics.peakBendingDeflectionMm * 1e-3;

    // Visual displacement scale (amplified by options.deformationAmp * options.deformationPhase)
    const phase = options.deformationPhase; // -1..+1 or 0..1
    const effectiveTwistRad = Math.min(
      0.26,
      twistRad * options.deformationAmp * phase
    );
    const effectiveSagM = Math.min(
      0.16,
      sagM * options.deformationAmp * phase
    );

    // Normalized strain intensity based on active load magnitude (0.35 to 1.0)
    const loadIntensity =
      loadCase === "torsion"
        ? Math.min(1.0, 0.25 + (config.torsionTorqueKNm / 24.0) * 0.75)
        : Math.min(1.0, 0.25 + (config.bendingLoadKN / 24.0) * 0.75);

    for (const rec of deformableMeshes) {
      const geom = rec.mesh.geometry;
      const posAttr = geom.attributes.position as THREE.BufferAttribute;
      const colAttr = geom.attributes.color as THREE.BufferAttribute;
      const rest = rec.restPositions;
      const meshOffset = rec.mesh.position;
      const vCount = posAttr.count;

      for (let i = 0; i < vCount; i++) {
        const rx = rest[i * 3];
        const ry = rest[i * 3 + 1];
        const rz = rest[i * 3 + 2];

        // World-approximate coordinates inside chassis
        const wx = rx + meshOffset.x;
        const wy = ry + meshOffset.y;
        const wz = rz + meshOffset.z;

        const normX = Math.max(-1, Math.min(1, wx / (L / 2)));

        let dx = 0;
        let dy = 0;
        let dz = 0;
        let strain = 0;

        if (loadCase === "torsion") {
          // Twist angle varies along longitudinal axis from rear constrained axle (-L/2) to front (+L/2)
          // Symmetric couple visualization around chassis center
          const localAngle = effectiveTwistRad * normX;
          const cosA = Math.cos(localAngle);
          const sinA = Math.sin(localAngle);
          const cy = 0.25;
          const relY = wy - cy;
          const relZ = wz;
          const rotY = relY * cosA - relZ * sinA;
          const rotZ = relY * sinA + relZ * cosA;
          dy = rotY - relY;
          dz = rotZ - relZ;

          // Torsional shear contour peaks along outer rocker rails, torque-box kicks, and shock towers
          const radialDist = Math.min(
            1,
            Math.sqrt(relY * relY + relZ * relZ) / (W * 0.44)
          );
          const archProximity = Math.exp(
            -Math.pow((Math.abs(normX) - 0.72) / 0.35, 2)
          );
          const rockerSpan = Math.exp(-Math.pow(normX / 0.78, 2));
          strain =
            loadIntensity *
            radialDist *
            (0.55 * rockerSpan + 0.65 * archProximity);
          if (rec.role === "tower") {
            strain = Math.max(strain, loadIntensity * 0.85);
          }
        } else {
          // Vertical beam bending sag peaks at mid-span (normX = 0)
          const cosProfile = Math.cos((normX * Math.PI) / 2);
          dy = -effectiveSagM * Math.max(0, cosProfile);

          // Bending normal stress peaks at mid-span along outer rails
          strain =
            loadIntensity *
            Math.pow(Math.max(0, cosProfile), 1.4) *
            (rec.role === "rail" ? 0.98 : 0.68);
        }

        posAttr.setXYZ(i, rx + dx, ry + dy, rz + dz);

        const clampedStrain = Math.max(0, Math.min(1, strain));
        tmpColor.copy(rec.baseColor);
        if (clampedStrain < 0.65) {
          tmpColor.lerp(copperMid, clampedStrain / 0.65);
        } else {
          tmpColor
            .copy(copperMid)
            .lerp(copperHot, (clampedStrain - 0.65) / 0.35);
        }
        colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    // Also tilt front/rear subframes and suspension corners slightly with torsion twist
    if (loadCase === "torsion") {
      frontSubframeGroup.rotation.x = effectiveTwistRad;
      rearSubframeGroup.rotation.x = -effectiveTwistRad;
      const hubDrop = Math.sin(effectiveTwistRad) * (W / 2);
      suspensionFLGroup.position.y = -hubDrop;
      suspensionFRGroup.position.y = hubDrop;
      suspensionRLGroup.position.y = hubDrop;
      suspensionRRGroup.position.y = -hubDrop;
    } else {
      frontSubframeGroup.rotation.x = 0;
      rearSubframeGroup.rotation.x = 0;
      suspensionFLGroup.position.y = 0;
      suspensionFRGroup.position.y = 0;
      suspensionRLGroup.position.y = 0;
      suspensionRRGroup.position.y = 0;
    }

    // 3. Rebuild Load Vector Arrows
    loadArrowsGroup.clear();
    if (options.showLoadVectors) {
      const subZ = W * 0.31;
      if (loadCase === "torsion") {
        // Opposing vertical force couple at front shock towers (+L/2, ±subZ)
        const arrowLen = 0.34 + (config.torsionTorqueKNm / 35) * 0.22;
        const leftUpArrow = new THREE.ArrowHelper(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(L / 2 - 0.02, 0.58, subZ),
          arrowLen,
          0xd97706,
          0.11,
          0.065
        );
        const rightDownArrow = new THREE.ArrowHelper(
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(L / 2 - 0.02, 0.58 + arrowLen, -subZ),
          arrowLen,
          0xd97706,
          0.11,
          0.065
        );
        // Reaction arrows at rear towers
        const rearLeftReaction = new THREE.ArrowHelper(
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(-L / 2 + 0.02, 0.58 + arrowLen * 0.75, subZ),
          arrowLen * 0.75,
          0x2563eb,
          0.09,
          0.055
        );
        const rearRightReaction = new THREE.ArrowHelper(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(-L / 2 + 0.02, 0.58, -subZ),
          arrowLen * 0.75,
          0x2563eb,
          0.09,
          0.055
        );
        loadArrowsGroup.add(
          leftUpArrow,
          rightDownArrow,
          rearLeftReaction,
          rearRightReaction
        );
      } else {
        // Distributed vertical bending load arrows along the mid-span rails
        const arrowLen = 0.3 + (config.bendingLoadKN / 36) * 0.22;
        for (const xFrac of [-0.32, 0, 0.32]) {
          for (const zSign of [1, -1] as const) {
            const downArrow = new THREE.ArrowHelper(
              new THREE.Vector3(0, -1, 0),
              new THREE.Vector3(
                xFrac * L,
                0.32 + arrowLen,
                zSign * (W * 0.41)
              ),
              arrowLen,
              0xd97706,
              0.095,
              0.058
            );
            loadArrowsGroup.add(downArrow);
          }
        }
        // Upward support reactions at the 4 axles
        for (const xSign of [1, -1] as const) {
          for (const zSign of [1, -1] as const) {
            const supportArrow = new THREE.ArrowHelper(
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(
                xSign * (L / 2),
                0.02,
                zSign * (W * 0.31)
              ),
              0.24,
              0x2563eb,
              0.08,
              0.05
            );
            loadArrowsGroup.add(supportArrow);
          }
        }
      }
    }
  }

  return {
    scene,
    root: dynamicRoot,
    floor: floorRoot,
    updateGeometry(config: ChassisConfig, options: SceneVisualOptions) {
      if (geometrySignature(config) !== lastGeometrySignature) {
        rebuildSceneGeometry(config, options);
      } else {
        applyVisualState(config, options);
      }
    },
    updateVisualState(config: ChassisConfig, options: SceneVisualOptions) {
      if (geometrySignature(config) !== lastGeometrySignature) {
        rebuildSceneGeometry(config, options);
      } else {
        applyVisualState(config, options);
      }
    },
    dispose() {
      dynamicRoot.clear();
      floorRoot.clear();
      activeTracker.disposeAll();
    },
  };
}
