// Design tokens matching the Caliber LP exactly
export const theme = {
  bg: "#0a0a0a",
  surface: "#171717",          // LP card background
  surfaceHeader: "#262626",    // LP terminal header
  surfaceBorder: "#404040",    // LP border color
  surfaceHover: "#1c1c1c",

  // Brand gradient (logo bars — LP orange palette)
  brand1: "#fdba74", // lightest (orange-300)
  brand2: "#fb923c", // mid (orange-400)
  brand3: "#f97316", // deepest / primary (orange-500)

  // Accent
  accent: "#7dd3fc", // cyan/blue (sky-300)
  accentDim: "#38bdf8",

  // Semantic
  green: "#22c55e",
  greenDim: "#16a34a",
  red: "#ef4444",
  yellow: "#eab308",

  // Text (LP tokens)
  text: "#fafafa",
  textSecondary: "#a3a3a3",
  textMuted: "#52525b",

  // Typography (LP fonts)
  fontSans: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  fontMono: "'Geist Mono', 'JetBrains Mono', 'SF Mono', ui-monospace, monospace",

  // Radii
  radius: 12,
  radiusSm: 8,
  radiusLg: 16,

  // Semantic extended
  purple: "#c4b5fd",

  // LP signature effects
  terminalGlow: "0 0 80px -20px rgba(249,115,22,0.15)",
  cardGlow: "0 0 40px -10px rgba(249,115,22,0.08)",
  errorGlow: "0 0 80px -20px rgba(239,68,68,0.2)",
  successGlow: "0 0 80px -20px rgba(34,197,94,0.15)",
} as const;
