import {
  BASELINE_A_CONFIG,
  MATERIALS,
  clampParameter,
  type ChassisConfig,
  type LoadCaseId,
  type MaterialId,
} from "./chassisModel.ts";

export const AUGI_STORAGE_SNAPSHOTS_KEY = "augi.sable.study.snapshots.v1";
export const AUGI_STORAGE_PREFS_KEY = "augi.sable.study.prefs.v1";

export interface SavedStudySnapshot {
  snapshotId: string;
  label: string;
  savedAtIso: string;
  config: ChassisConfig;
  compareBaselineId: string;
  notes?: string;
}

function isValidMaterialId(val: unknown): val is MaterialId {
  return typeof val === "string" && val in MATERIALS;
}

function isValidLoadCase(val: unknown): val is LoadCaseId {
  return val === "torsion" || val === "bending";
}

export function sanitizeChassisConfig(raw: unknown): ChassisConfig {
  if (!raw || typeof raw !== "object") {
    return { ...BASELINE_A_CONFIG };
  }
  const obj = raw as Record<string, unknown>;
  return {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id : "custom-study",
    name:
      typeof obj.name === "string" && obj.name.trim()
        ? obj.name
        : "Custom Study Candidate",
    wheelbaseMm: clampParameter("wheelbaseMm", Number(obj.wheelbaseMm)),
    trackWidthMm: clampParameter("trackWidthMm", Number(obj.trackWidthMm)),
    wallGaugeMm: Number(
      clampParameter("wallGaugeMm", Number(obj.wallGaugeMm)).toFixed(1)
    ),
    crossMemberCount: Math.round(
      clampParameter("crossMemberCount", Number(obj.crossMemberCount))
    ),
    materialId: isValidMaterialId(obj.materialId)
      ? obj.materialId
      : BASELINE_A_CONFIG.materialId,
    loadCase: isValidLoadCase(obj.loadCase)
      ? obj.loadCase
      : BASELINE_A_CONFIG.loadCase,
    torsionTorqueKNm: Number(
      clampParameter("torsionTorqueKNm", Number(obj.torsionTorqueKNm)).toFixed(
        1
      )
    ),
    bendingLoadKN: Number(
      clampParameter("bendingLoadKN", Number(obj.bendingLoadKN)).toFixed(1)
    ),
  };
}

export function loadSavedSnapshots(): SavedStudySnapshot[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(AUGI_STORAGE_SNAPSHOTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid: SavedStudySnapshot[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if (
          typeof rec.snapshotId === "string" &&
          typeof rec.label === "string" &&
          typeof rec.savedAtIso === "string" &&
          rec.config
        ) {
          valid.push({
            snapshotId: rec.snapshotId,
            label: rec.label,
            savedAtIso: rec.savedAtIso,
            config: sanitizeChassisConfig(rec.config),
            compareBaselineId:
              typeof rec.compareBaselineId === "string"
                ? rec.compareBaselineId
                : "baseline-a",
            notes: typeof rec.notes === "string" ? rec.notes : undefined,
          });
        }
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveSnapshotsToStorage(snapshots: SavedStudySnapshot[]): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    window.localStorage.setItem(
      AUGI_STORAGE_SNAPSHOTS_KEY,
      JSON.stringify(snapshots)
    );
    return true;
  } catch {
    return false;
  }
}

export function createSnapshotRecord(
  config: ChassisConfig,
  customLabel?: string,
  compareBaselineId = "baseline-a"
): SavedStudySnapshot {
  const now = new Date();
  const shortTime = now.toISOString().slice(11, 16) + " UTC";
  const label =
    customLabel?.trim() ||
    `${config.wheelbaseMm}×${config.trackWidthMm} · ${config.wallGaugeMm.toFixed(1)}mm (${shortTime})`;

  return {
    snapshotId: `snap_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    savedAtIso: now.toISOString(),
    config: sanitizeChassisConfig({ ...config }),
    compareBaselineId,
  };
}
