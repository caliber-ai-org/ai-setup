import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";

function getScoreColor(score: number): string {
  if (score < 50) return theme.red;
  if (score < 70) return theme.yellow;
  return theme.green;
}

function getGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// SVG shield icon (replaces text-only security message)
const ShieldIcon: React.FC = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L4 6V11C4 16.55 7.84 21.74 12 23C16.16 21.74 20 16.55 20 11V6L12 2Z"
      fill={`${theme.green}20`}
      stroke={theme.green}
      strokeWidth={1.5}
    />
    <path d="M9 12L11 14L15 10" stroke={theme.green} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const categories = [
  { label: "Files & Setup", before: 6, after: 24, max: 25, icon: "setup" },
  { label: "Quality", before: 12, after: 22, max: 25, icon: "quality" },
  { label: "Grounding", before: 7, after: 19, max: 20, icon: "ground" },
  { label: "Accuracy", before: 5, after: 13, max: 15, icon: "accuracy" },
  { label: "Freshness", before: 5, after: 10, max: 10, icon: "fresh" },
  { label: "Bonus", before: 2, after: 5, max: 5, icon: "bonus" },
];

export const ScoreTransition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerScale = spring({
    frame: frame - 2,
    fps,
    config: { damping: 16, stiffness: 70 },
  });

  // Linear counter from 47 to 94 over frames 25-55
  const counterProgress = interpolate(frame, [25, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const score = Math.round(interpolate(counterProgress, [0, 1], [47, 94]));
  const barWidth = interpolate(counterProgress, [0, 1], [47, 94]);
  const scoreColor = getScoreColor(score);
  const grade = getGrade(score);

  // Green glow pulse when score >= 90
  const glowActive = score >= 90;
  const glowPulse = glowActive
    ? interpolate(frame, [58, 70, 85, 100], [0, 0.4, 0.25, 0.35], { extrapolateRight: "clamp" })
    : 0;

  const subtitleOpacity = interpolate(frame, [70, 88], [0, 1], { extrapolateRight: "clamp" });
  const securityOpacity = interpolate(frame, [82, 96], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Success glow behind card */}
      {glowActive && (
        <div
          style={{
            position: "absolute",
            width: 1300,
            height: 800,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, rgba(34,197,94,${glowPulse}) 0%, transparent 60%)`,
          }}
        />
      )}

      <div
        style={{
          backgroundColor: theme.surface,
          borderRadius: 24,
          border: `1px solid ${glowActive ? `${theme.green}30` : theme.surfaceBorder}`,
          minWidth: 1100,
          boxShadow: glowActive
            ? `0 0 100px -20px rgba(34,197,94,0.15), ${theme.terminalGlow}`
            : theme.terminalGlow,
          overflow: "hidden",
          transform: `scale(${containerScale})`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 24px",
            backgroundColor: theme.surfaceHeader,
            borderBottom: `1px solid ${theme.surfaceBorder}`,
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.red }} />
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.yellow }} />
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.green }} />
          <span style={{ color: theme.textMuted, fontSize: 22, fontFamily: theme.fontMono, marginLeft: 16 }}>
            $ caliber score
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 18,
              fontFamily: theme.fontMono,
              color: theme.textMuted,
              opacity: interpolate(frame, [15, 22], [0, 0.6], { extrapolateRight: "clamp" }),
            }}
          >
            Deterministic. No LLM needed.
          </span>
        </div>

        <div style={{ padding: "48px 64px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 28 }}>
            <span
              style={{
                fontSize: 140,
                fontWeight: 700,
                fontFamily: theme.fontSans,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
                background: glowActive
                  ? `linear-gradient(135deg, ${theme.text} 0%, ${theme.green} 100%)`
                  : theme.text,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: glowActive ? "transparent" : theme.text,
              }}
            >
              {score}
            </span>
            <span style={{ color: theme.textMuted, fontSize: 48, fontFamily: theme.fontSans }}>/100</span>
            <div
              style={{
                marginLeft: "auto",
                padding: "10px 36px",
                borderRadius: 36,
                backgroundColor: `${scoreColor}12`,
                border: `1.5px solid ${scoreColor}30`,
                color: scoreColor,
                fontSize: 48,
                fontWeight: 700,
                fontFamily: theme.fontSans,
              }}
            >
              Grade {grade}
            </div>
          </div>

          {/* Progress bar with gradient */}
          <div
            style={{
              width: "100%",
              height: 12,
              backgroundColor: `${theme.textMuted}15`,
              borderRadius: 6,
              overflow: "hidden",
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: `${barWidth}%`,
                height: "100%",
                background: glowActive
                  ? `linear-gradient(90deg, ${theme.yellow} 0%, ${theme.green} 100%)`
                  : scoreColor,
                borderRadius: 6,
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 44px" }}>
            {categories.map((cat, i) => {
              const catValue = Math.round(interpolate(counterProgress, [0, 1], [cat.before, cat.after]));
              const catProgress = catValue / cat.max;
              const catColor = catProgress >= 0.8 ? theme.green : catProgress >= 0.5 ? theme.yellow : theme.red;
              const catOpacity = interpolate(frame, [28 + i * 2, 36 + i * 2], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              return (
                <div key={cat.label} style={{ display: "flex", alignItems: "center", gap: 16, opacity: catOpacity }}>
                  <span style={{ color: theme.textSecondary, fontSize: 28, fontFamily: theme.fontSans, minWidth: 200 }}>
                    {cat.label}
                  </span>
                  <div style={{ flex: 1, height: 8, backgroundColor: `${theme.textMuted}12`, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${catProgress * 100}%`, height: "100%", backgroundColor: catColor, borderRadius: 4 }} />
                  </div>
                  <span
                    style={{
                      color: catColor,
                      fontSize: 28,
                      fontWeight: 600,
                      fontFamily: theme.fontMono,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 90,
                      textAlign: "right" as const,
                    }}
                  >
                    {catValue}/{cat.max}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom — security-focused subtitle */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontFamily: theme.fontSans,
            color: theme.text,
            fontWeight: 600,
            opacity: subtitleOpacity,
          }}
        >
          100% local. No code sent anywhere.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: securityOpacity,
          }}
        >
          {["No API key needed", "No secrets leaked", "Fully reversible"].map((item, i) => (
            <div
              key={item}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                borderRadius: 24,
                backgroundColor: `${theme.green}08`,
                border: `1px solid ${theme.green}18`,
              }}
            >
              <ShieldIcon />
              <span style={{ fontSize: 22, fontFamily: theme.fontSans, color: theme.green, fontWeight: 500 }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
