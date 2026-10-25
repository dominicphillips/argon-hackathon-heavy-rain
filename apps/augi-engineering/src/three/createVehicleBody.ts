import * as THREE from "three";
import { ResourceTracker } from "@heavy-rain/organization-3d";

/**
 * Sculpted AUGI Sable exterior: painted body loft, glass greenhouse, signature
 * lights, cabin interior, and four wheel pods that fold flat for the fictional
 * flight transition. Dimensions follow the active wheelbase (L) and track (W)
 * in meters. This is concept styling, not a validated aerodynamic surface.
 */
export interface VehicleBodyHandle {
  group: THREE.Group;
  paint: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  interiorMaterials: THREE.Material[];
  wheels: THREE.Group;
  wheelPivots: THREE.Group[];
  thrustDiscs: THREE.Mesh[];
  /** Full-width half extent of the body in z (meters). */
  halfWidth: number;
  dispose: () => void;
}

interface Station {
  x: number;
  ring: [number, number][]; // [z, y] pairs, 13 points from left sill over the roof to right sill
  cabin: boolean;
  /** True on the flat roof plateau, where the roof span is painted instead of glazed. */
  roofPanel: boolean;
}

/** Tire radius in meters (about 29 in overall diameter). Wheel centers sit at this height. */
export const TIRE_RADIUS = 0.37;
/** Circular arch envelope around each axle: tire radius plus a small clearance. */
const ARCH_RADIUS = TIRE_RADIUS + 0.055;

/** Top of the arch envelope at longitudinal offset d from an axle, or -Infinity outside the arch. */
function archTop(d: number): number {
  if (d >= ARCH_RADIUS) return -Infinity;
  return TIRE_RADIUS + Math.sqrt(ARCH_RADIUS * ARCH_RADIUS - d * d);
}

function buildStations(L: number, W: number): Station[] {
  const frontOverhang = 0.86;
  const rearOverhang = 0.92;
  const totalLen = L + frontOverhang + rearOverhang;
  const xFront = L / 2 + frontOverhang;
  const xRear = -L / 2 - rearOverhang;
  const numStations = 40;
  const halfW = W * 0.57;
  const stations: Station[] = [];

  for (let i = 0; i <= numStations; i++) {
    const t = i / numStations; // 0 rear, 1 front
    const x = xRear + t * totalLen;

    // Fender flares over both axles, keyed to the arch envelope
    const dF = Math.abs(x - L / 2);
    const dR = Math.abs(x + L / 2);
    const dAxle = Math.min(dF, dR);
    const flare = dAxle < ARCH_RADIUS ? Math.cos((dAxle / ARCH_RADIUS) * (Math.PI / 2)) : 0;
    const arch = archTop(dAxle);

    // Plan-view taper toward nose and tail
    let planTaper = 1;
    if (t > 0.8) planTaper = 1 - 0.3 * Math.pow((t - 0.8) / 0.2, 1.6);
    else if (t < 0.1) planTaper = 1 - 0.18 * Math.pow((0.1 - t) / 0.1, 1.5);

    // Sill follows the arch envelope over each tire so the lower contour opens around the wheel
    const sillBase = 0.24 + (t > 0.94 ? 0.05 * ((t - 0.94) / 0.06) : 0) + (t < 0.05 ? 0.04 : 0);
    const ySill = Math.max(sillBase, arch);

    // Beltline: high shoulder held through the front axle, hood falling to the nose beyond it
    let yBelt = 0.87 - 0.03 * t;
    if (t > 0.82) {
      const hoodT = (t - 0.82) / 0.18;
      yBelt = 0.845 - 0.3 * Math.pow(hoodT, 1.4);
    } else if (t < 0.12) {
      yBelt = 0.87 - 0.03 * t - 0.08 * ((0.12 - t) / 0.12);
    }
    // Keep the fender/hood shoulder clear of the arch envelope
    yBelt = Math.max(yBelt, arch + 0.05);

    // Greenhouse: fast roofline between t = 0.14 and t = 0.66
    let yRoof = yBelt + 0.02;
    let tumblehome = 0.8;
    let cabin = false;
    let roofPanel = false;
    if (t >= 0.1 && t <= 0.7) {
      let profile = 0;
      if (t < 0.26) profile = Math.sin(((t - 0.1) / 0.16) * (Math.PI / 2));
      else if (t <= 0.46) profile = 1 - 0.03 * ((t - 0.26) / 0.2);
      else profile = 0.97 * Math.cos(((t - 0.46) / 0.24) * (Math.PI / 2));
      profile = Math.max(0, profile);
      cabin = profile > 0.06;
      roofPanel = profile > 0.93;
      yRoof = yBelt + 0.5 * profile;
      tumblehome = 0.82 - 0.14 * profile;
    }

    const zLower = halfW * planTaper * (0.93 + 0.1 * flare);
    const zMid = halfW * planTaper * (1 + 0.12 * flare);
    const zBelt = halfW * planTaper * (0.95 + 0.03 * flare);
    const zRoof = halfW * planTaper * tumblehome;

    // Ring heights from sill to roof crown, each held above the arch and strictly above the point below
    const heights = [
      ySill,
      Math.max(ySill + 0.07, arch + 0.012),
      Math.max(ySill + (yBelt - ySill) * 0.48, arch + 0.025),
      Math.max(yBelt - 0.05, arch + 0.025),
      yBelt + 0.015,
      yRoof - 0.035,
      yRoof,
    ];
    for (let k = 1; k < heights.length; k++) heights[k] = Math.max(heights[k], heights[k - 1] + 0.004);
    const [y0, y1, y2, y3, y4, y5, y6] = heights;

    const ring: [number, number][] = [
      [-zLower * 0.8, y0],
      [-zLower, y1],
      [-zMid, y2],
      [-zBelt, y3],
      [-zBelt * 0.95, y4],
      [-zRoof, y5],
      [0, y6],
      [zRoof, y5],
      [zBelt * 0.95, y4],
      [zBelt, y3],
      [zMid, y2],
      [zLower, y1],
      [zLower * 0.8, y0],
    ];
    stations.push({ x, ring, cabin, roofPanel });
  }
  return stations;
}

function loftGeometry(
  stations: Station[],
  includeSegment: (station: Station, j: number) => boolean,
  tracker: ResourceTracker,
  closeEnds: boolean
): THREE.BufferGeometry {
  const ringPoints = 13;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const st of stations) {
    for (const [z, y] of st.ring) positions.push(st.x, y, z);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const rowA = i * ringPoints;
    const rowB = (i + 1) * ringPoints;
    for (let j = 0; j < ringPoints - 1; j++) {
      if (!includeSegment(stations[i], j) && !includeSegment(stations[i + 1], j)) continue;
      const a0 = rowA + j, a1 = rowA + j + 1, b0 = rowB + j, b1 = rowB + j + 1;
      indices.push(a0, b0, b1, a0, b1, a1);
    }
  }
  if (closeEnds) {
    // Nose and tail caps (fan from ring center)
    for (const idx of [0, stations.length - 1]) {
      const st = stations[idx];
      const cx = st.x;
      let cy = 0, cz = 0;
      for (const [z, y] of st.ring) { cy += y; cz += z; }
      cy /= ringPoints; cz /= ringPoints;
      const centerIndex = positions.length / 3;
      positions.push(cx, cy, cz);
      const row = idx * ringPoints;
      for (let j = 0; j < ringPoints - 1; j++) {
        if (idx === 0) indices.push(centerIndex, row + j + 1, row + j);
        else indices.push(centerIndex, row + j, row + j + 1);
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return tracker.geometry(geom);
}

export function createVehicleBody(L: number, W: number): VehicleBodyHandle {
  const tracker = new ResourceTracker();
  const group = new THREE.Group();
  group.name = "vehicleBody";
  const stations = buildStations(L, W);
  const halfWidth = W * 0.57 * 1.12;

  const paint = tracker.material(
    new THREE.MeshPhysicalMaterial({
      color: 0xc9d0d8,
      metalness: 0.72,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      side: THREE.DoubleSide,
    })
  );
  const glass = tracker.material(
    new THREE.MeshPhysicalMaterial({
      color: 0x141a21,
      metalness: 0.35,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const trim = tracker.material(new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.4, roughness: 0.55 }));
  const seatMat = tracker.material(new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.05, roughness: 0.85 }));
  const seatAccent = tracker.material(new THREE.MeshStandardMaterial({ color: 0xc9a27a, metalness: 0.05, roughness: 0.8 }));
  const dashMat = tracker.material(new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.3, roughness: 0.6 }));
  const interiorMaterials: THREE.Material[] = [seatMat, seatAccent, dashMat, trim];

  // Painted body (everything except the glazed segments in cabin stations; the roof plateau stays painted)
  const glazed = (st: Station, j: number) => st.cabin && (j === 4 || j === 7 || (!st.roofPanel && (j === 5 || j === 6)));
  const bodyGeom = loftGeometry(stations, (st, j) => !glazed(st, j), tracker, true);
  const bodyMesh = new THREE.Mesh(bodyGeom, paint);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.userData.partId = "body-shell";
  group.add(bodyMesh);

  // Glass greenhouse
  const glassGeom = loftGeometry(stations, glazed, tracker, false);
  const glassMesh = new THREE.Mesh(glassGeom, glass);
  glassMesh.userData.partId = "greenhouse";
  glassMesh.renderOrder = 3;
  group.add(glassMesh);

  // Character line and door seams as thin dark edges
  const seamMat = tracker.material(new THREE.LineBasicMaterial({ color: 0x3b4149, transparent: true, opacity: 0.55 }));
  const seamPts: THREE.Vector3[] = [];
  for (const sign of [1, -1] as const) {
    for (const xs of [L * 0.14, -L * 0.2]) {
      const st = stations.reduce((best, s) => (Math.abs(s.x - xs) < Math.abs(best.x - xs) ? s : best), stations[0]);
      const idxs = sign === 1 ? [9, 10, 11] : [3, 2, 1];
      for (let k = 0; k < idxs.length - 1; k++) {
        const [z0, y0] = st.ring[idxs[k]];
        const [z1, y1] = st.ring[idxs[k + 1]];
        seamPts.push(new THREE.Vector3(st.x, y0, z0 * 1.002), new THREE.Vector3(st.x, y1, z1 * 1.002));
      }
    }
  }
  const seamGeom = tracker.geometry(new THREE.BufferGeometry().setFromPoints(seamPts));
  group.add(new THREE.LineSegments(seamGeom, seamMat));

  // Signature lights
  const xFront = L / 2 + 0.86;
  const xRear = -L / 2 - 0.92;
  const drlMat = tracker.material(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdbeafe, emissiveIntensity: 2.2, roughness: 0.3 }));
  const tailMat = tracker.material(new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xdc2626, emissiveIntensity: 1.6, roughness: 0.35 }));
  const frontBar = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.03, 0.02, W * 0.78)), drlMat);
  frontBar.position.set(xFront - 0.05, 0.62, 0);
  group.add(frontBar);
  for (const sign of [1, -1] as const) {
    const pod = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.05, 0.05, 0.18)), drlMat);
    pod.position.set(xFront - 0.12, 0.6, sign * W * 0.36);
    pod.rotation.y = sign * 0.35;
    group.add(pod);
  }
  const rearBar = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.03, 0.025, W * 0.84)), tailMat);
  rearBar.position.set(xRear + 0.06, 0.78, 0);
  group.add(rearBar);

  // Lower black trim band, front splitter, and diffuser
  const trimBand = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(L + 1.1, 0.06, W * 1.04)), trim);
  trimBand.position.set(0, 0.255, 0);
  group.add(trimBand);

  // Cabin interior: four seats, dash, yoke, console
  const interior = new THREE.Group();
  interior.name = "interior";
  const seatX = [L * 0.12, -L * 0.22];
  for (const sx of seatX) {
    for (const sign of [1, -1] as const) {
      const seat = new THREE.Group();
      seat.position.set(sx, 0.36, sign * W * 0.24);
      const cushion = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.5, 0.12, 0.46)), seatMat);
      cushion.position.y = 0.06;
      const back = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.12, 0.56, 0.46)), seatAccent);
      back.position.set(-0.22, 0.34, 0);
      back.rotation.z = 0.18;
      const head = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.1, 0.16, 0.24)), seatMat);
      head.position.set(-0.3, 0.7, 0);
      seat.add(cushion, back, head);
      seat.userData.partId = "seat";
      interior.add(seat);
    }
  }
  const dash = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(0.42, 0.22, W * 0.82)), dashMat);
  dash.position.set(L * 0.36, 0.62, 0);
  dash.userData.partId = "dashboard";
  interior.add(dash);
  const yoke = new THREE.Mesh(tracker.geometry(new THREE.TorusGeometry(0.15, 0.022, 10, 24, Math.PI * 1.35)), trim);
  yoke.position.set(L * 0.27, 0.62, W * 0.24);
  yoke.rotation.set(0, Math.PI / 2, Math.PI * 0.82);
  interior.add(yoke);
  const console = new THREE.Mesh(tracker.geometry(new THREE.BoxGeometry(L * 0.5, 0.16, 0.2)), dashMat);
  console.position.set(L * 0.06, 0.38, 0);
  interior.add(console);
  group.add(interior);

  // Wheel pods on fold pivots for the flight transition
  const wheels = new THREE.Group();
  wheels.name = "wheels";
  const wheelPivots: THREE.Group[] = [];
  const thrustDiscs: THREE.Mesh[] = [];
  const tireMat = tracker.material(new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.05, roughness: 0.9 }));
  const rimMat = tracker.material(new THREE.MeshStandardMaterial({ color: 0xd3d9e2, metalness: 0.9, roughness: 0.22 }));
  const rimDark = tracker.material(new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.7, roughness: 0.35 }));
  const thrustMat = tracker.material(new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  // Tire: lathed ring with a flat tread so the rim dish stays open (no cylinder caps hiding the spokes)
  const tireProfile = [
    [0.25, -0.13], [0.34, -0.13], [TIRE_RADIUS, -0.095], [TIRE_RADIUS, 0.095], [0.34, 0.13], [0.25, 0.13],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tireGeom = tracker.geometry(new THREE.LatheGeometry(tireProfile, 48));
  tireGeom.rotateX(Math.PI / 2);
  // Rim barrel is open-ended; a dark dish sits deep inside so spokes read in relief
  const rimGeom = tracker.geometry(new THREE.CylinderGeometry(0.25, 0.25, 0.27, 32, 1, true));
  rimGeom.rotateX(Math.PI / 2);
  const dishGeom = tracker.geometry(new THREE.CircleGeometry(0.245, 32));
  const spokeGeom = tracker.geometry(new THREE.BoxGeometry(0.035, 0.21, 0.035));
  const hubGeom = tracker.geometry(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16));
  hubGeom.rotateX(Math.PI / 2);
  const thrustGeom = tracker.geometry(new THREE.RingGeometry(0.16, 0.4, 40));
  thrustGeom.rotateX(-Math.PI / 2);
  const wheelY = TIRE_RADIUS;
  for (const [xs, zs] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(xs * (L / 2), wheelY, zs * (W / 2 - 0.02));
    pivot.userData = { xs, zs };
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeom, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeom, rimDark);
    const dish = new THREE.Mesh(dishGeom, rimDark);
    dish.position.z = zs * 0.0;
    dish.rotation.y = zs > 0 ? 0 : Math.PI;
    wheel.add(tire, rim, dish);
    for (let s = 0; s < 7; s++) {
      const spoke = new THREE.Mesh(spokeGeom, rimMat);
      const a = (s / 7) * Math.PI * 2;
      // Spokes sit just inside the open barrel lip, well clear of the dish
      spoke.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, zs * 0.1);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
    }
    const hub = new THREE.Mesh(hubGeom, rimMat);
    hub.position.z = zs * 0.11;
    wheel.add(hub);
    wheel.userData.partId = "wheel";
    const thrust = new THREE.Mesh(thrustGeom, thrustMat);
    thrust.position.y = -0.43;
    thrust.visible = false;
    thrustDiscs.push(thrust);
    pivot.add(wheel, thrust);
    wheels.add(pivot);
    wheelPivots.push(pivot);
  }
  group.add(wheels);

  return {
    group,
    paint,
    glass,
    interiorMaterials,
    wheels,
    wheelPivots,
    thrustDiscs,
    halfWidth,
    dispose: () => tracker.disposeAll(),
  };
}
