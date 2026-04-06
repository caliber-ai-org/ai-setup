// Design tokens matching the Caliber LP (caliber-ai.dev). Sans/mono resolve via @remotion/google-fonts after ensureVideoFontsLoaded().
import { getFontMono, getFontSans } from "../videoFontFamily";

const colors = {
  bg: "#09090b",
  surface: "#18181b",
  surfaceHeader: "#27272a",
  surfaceBorder: "#262626", // LP border-border (gray-800)
  surfaceHover: "#1c1c1e",
  cardBg: "#0d0d0d", // LP card background

  // Brand gradient (logo bars — LP orange palette)
  brand1: "#fdba74", // lightest (orange-300)
  brand2: "#fb923c", // mid (orange-400)
  brand3: "#f97316", // deepest / primary (orange-500)

  // Accent
  accent: "#7dd3fc", // cyan/blue (sky-300)
  accentDim: "#38bdf8",

  // Semantic (LP -400 variants for status indicators)
  green: "#34d399", // emerald-400
  greenDim: "#16a34a",
  red: "#f87171", // red-400
  yellow: "#fbbf24", // amber-400

  // Text (LP tokens)
  text: "#fafafa",
  textSecondary: "#a1a1aa",
  textMuted: "#737373", // LP neutral-500

  // Radii
  radius: 12,
  radiusSm: 8,
  radiusLg: 16,

  // Additional semantic
  purple: "#c4b5fd",

  // LP signature effects
  terminalGlow: "0 0 60px -20px rgba(249,115,22,0.08)",
  cardGlow: "0 0 30px -10px rgba(249,115,22,0.05)",
  cardGlowStrong: "0 0 14px rgba(249,115,22,0.5), 0 0 6px #f97316",
  heroGlow:
    "radial-gradient(600px circle at 50% 40%, rgba(249,115,22,0.08), transparent 70%)",
  gradientBorder:
    "linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)",
} as const;

export const theme = {
  ...colors,
  get fontSans(): string {
    return getFontSans();
  },
  get fontMono(): string {
    return getFontMono();
  },
};
