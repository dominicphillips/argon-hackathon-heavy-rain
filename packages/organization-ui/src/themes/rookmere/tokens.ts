export const ROOKMERE_LOGO_PATH =
  "__grounding/design/brand/rookmere-capital.svg" as const;

export const ROOKMERE_TOKENS = {
  id: "rookmere" as const,
  organizationName: "Rookmere Capital",
  logoPath: ROOKMERE_LOGO_PATH,
  typography: {
    fontDisplay: '"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontSans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontMono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  colors: {
    canvasBg: "#F6F5F1",
    surfacePrimary: "#FFFFFF",
    surfaceInset: "#EFECE6",
    borderSubtle: "#DCDAD2",
    borderStrong: "#16202A",
    textPrimary: "#16202A",
    textSecondary: "#434E5B",
    textMuted: "#6C7683",
    accentPrimary: "#16202A",
    accentPositive: "#15803D",
    accentPositiveSurface: "#DCFCE7",
    accentWarning: "#B45309",
    accentWarningSurface: "#FEF3C7",
    accentCritical: "#B91C1C",
    accentCriticalSurface: "#FEE2E2",
  },
  radii: {
    sm: "4px",
    md: "6px",
    lg: "8px",
  },
} as const;
