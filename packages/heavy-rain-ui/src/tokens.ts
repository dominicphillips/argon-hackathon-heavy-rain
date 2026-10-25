export type SystemSurfaceMode = "ash" | "rain-dark";

export type SystemNavSection = "System" | "Work" | "Apps" | "Activity";

export type WorkerRole = "Builder" | "Connector" | "Researcher" | "Notifier";

export type SystemStatusTone =
  | "accepted"
  | "queued"
  | "running"
  | "building"
  | "completed"
  | "verified"
  | "deployed"
  | "paused"
  | "needs-evidence"
  | "failed";

export const SYSTEM_NAV_SECTIONS: readonly SystemNavSection[] = [
  "System",
  "Work",
  "Apps",
  "Activity",
] as const;

export const WORKER_ROLES: readonly WorkerRole[] = [
  "Builder",
  "Connector",
  "Researcher",
  "Notifier",
] as const;

export const HEAVY_RAIN_MARK_PATH =
  "__grounding/design/brand/heavy-rain-mark.svg" as const;

export interface SystemSurfacePalette {
  canvasBg: string;
  contourLine: string;
  surfacePrimary: string;
  surfaceElevated: string;
  chamberBg: string;
  chamberBorder: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  signalMint: string;
  signalMintSurface: string;
  signalAmber: string;
  signalDanger: string;
}

export const SYSTEM_TOKENS: {
  typography: {
    fontDisplay: string;
    fontSans: string;
    fontMono: string;
  };
  radii: {
    sm: string;
    md: string;
    lg: string;
    pill: string;
  };
  surfaces: Record<SystemSurfaceMode, SystemSurfacePalette>;
} = {
  typography: {
    fontDisplay: '"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontSans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontMono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  radii: {
    sm: "6px",
    md: "8px",
    lg: "10px",
    pill: "9999px",
  },
  surfaces: {
    ash: {
      canvasBg: "#E2E2E4",
      contourLine: "#D2D4D9",
      surfacePrimary: "#EAECEF",
      surfaceElevated: "#F4F5F7",
      chamberBg: "#14171C",
      chamberBorder: "#141517",
      borderSubtle: "#C8CAD0",
      borderStrong: "#141517",
      textPrimary: "#141517",
      textSecondary: "#4A4D55",
      textMuted: "#737780",
      signalMint: "#10B981",
      signalMintSurface: "#DDF5EC",
      signalAmber: "#D97706",
      signalDanger: "#B91C1C",
    },
    "rain-dark": {
      canvasBg: "#0C0F14",
      contourLine: "#151B24",
      surfacePrimary: "#131820",
      surfaceElevated: "#181F2A",
      chamberBg: "#0E131A",
      chamberBorder: "#2E3B4E",
      borderSubtle: "#1F2835",
      borderStrong: "#2E3B4E",
      textPrimary: "#F3F5F7",
      textSecondary: "#94A0B0",
      textMuted: "#5E6877",
      signalMint: "#34D399",
      signalMintSurface: "#102420",
      signalAmber: "#F59E0B",
      signalDanger: "#EF4444",
    },
  },
};
