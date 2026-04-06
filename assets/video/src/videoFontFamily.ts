import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

let sans = "ui-sans-serif, system-ui, sans-serif";
let mono = "ui-monospace, monospace";

/**
 * Call once at the start of CaliberDemo so headless renders use real Inter + JetBrains Mono.
 */
export function ensureVideoFontsLoaded(): void {
  sans = loadFont("normal", {
    weights: ["400", "500", "600", "700"],
    subsets: ["latin"],
  }).fontFamily;
  mono = loadJetBrainsMono("normal", {
    weights: ["400", "500", "600", "700"],
    subsets: ["latin"],
  }).fontFamily;
}

export function getFontSans(): string {
  return sans;
}

export function getFontMono(): string {
  return mono;
}
