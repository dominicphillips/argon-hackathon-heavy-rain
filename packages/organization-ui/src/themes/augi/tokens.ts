export const AUGI_LOGO_PATH =
  "__grounding/design/brand/augi-mark.svg" as const;

export const AUGI_TOKENS = {
  id: "augi" as const,
  organizationName: "AUGI",
  vehicleConcept: "AUGI Sable",
  logoPath: AUGI_LOGO_PATH,
  typography: {
    fontDisplay: '"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontSans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontMono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  colors: {
    canvasBg: "#E6E8EB",
    contourLine: "#D6D9E0",
    surfacePrimary: "#F2F4F7",
    surfaceInset: "#DCE0E5",
    borderSubtle: "#C8CCD4",
    borderStrong: "#111317",
    textPrimary: "#111317",
    textSecondary: "#4B525C",
    textMuted: "#767E8A",
    accentControl: "#2563EB",
    accentStress: "#D97706",
    accentPositive: "#0D9488",
    accentCritical: "#DC2626",
  },
  radii: {
    sm: "6px",
    md: "8px",
    lg: "10px",
  },
} as const;
