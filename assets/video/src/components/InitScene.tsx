import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "./theme";
import { sceneT } from "../sceneSpeed";

// Scene 3: "Score + Init" — HERO SCENE (frame range in CaliberDemo)
// Animation: opacity fades + SVG arc stroke. No springs.

const terminalLines = [
  { text: "Scanning project…", color: theme.textMuted, delay: 16 },
  { text: "Detected: TypeScript monorepo · Next.js · PostgreSQL", color: theme.brand2, delay: 40 },
  { text: "Wrote CLAUDE.md, .cursor/rules/, AGENTS.md", color: theme.accent, delay: 64 },
  { text: "Registered MCPs matched to your stack", color: theme.purple, delay: 88 },
  { text: "Score: 94/100 — Grade A", color: theme.green, delay: 112 },
];

const ARC_RADIUS = 54;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
const SCORE_TARGET = 94;

const getScoreColor = (progress: number): string => {
  if (progress < 0.4) return theme.red;
  if (progress < 0.7) return theme.yellow;
  return theme.green;
};

export const InitScene: React.FC = () => {
  const t = sceneT(useCurrentFrame());

  const subtitleOpacity = interpolate(t, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  const cardOpacity = interpolate(t, [6, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  const arcProgress = interpolate(t, [130, 180], [0, SCORE_TARGET / 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arcOpacity = interpolate(t, [124, 138], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scoreNumber = Math.round(
    interpolate(t, [130, 180], [0, SCORE_TARGET], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  const strokeDashoffset = ARC_CIRCUMFERENCE * (1 - arcProgress);

  // Blinking cursor: toggles every 15 logical frames (~0.5s at 30fps baseline)
  const cursorVisible = Math.floor(t / 15) % 2 === 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
        }}
      >
        {/* LP section label */}
        <div
          style={{
            fontSize: 22,
            fontFamily: theme.fontMono,
            color: theme.brand2,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            opacity: subtitleOpacity,
          }}
        >
          MEET CALIBER
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            fontFamily: theme.fontSans,
            color: theme.textSecondary,
            fontWeight: 500,
            opacity: subtitleOpacity,
            textAlign: "center",
            maxWidth: 880,
            lineHeight: 1.3,
          }}
        >
          One command fingerprints the repo and ships configs your agents can trust.
        </div>

        {/* Main content: terminal + score */}
        <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
          {/* Terminal card */}
          <div
            style={{
              width: 860,
              backgroundColor: theme.cardBg,
              border: `1px solid ${theme.surfaceBorder}`,
              borderRadius: 16,
              overflow: "hidden",
              opacity: cardOpacity,
              boxShadow: theme.terminalGlow,
            }}
          >
            {/* Terminal header */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: `1px solid ${theme.surfaceBorder}`,
                backgroundColor: theme.surfaceHeader,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.red }} />
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.yellow }} />
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.green }} />
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 20,
                  fontFamily: theme.fontMono,
                  color: theme.textMuted,
                }}
              >
                {"$ "}
              </span>
              <span style={{ fontSize: 20, fontFamily: theme.fontMono, color: theme.text }}>
                caliber init
              </span>
              {/* Blinking cursor */}
              <span
                style={{
                  fontSize: 20,
                  fontFamily: theme.fontMono,
                  color: theme.brand3,
                  opacity: cursorVisible ? 1 : 0,
                  marginLeft: 2,
                }}
              >
                |
              </span>
            </div>

            {/* Terminal body */}
            <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
              {terminalLines.map((line) => {
                const lineOpacity = interpolate(t, [line.delay, line.delay + 12], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <div key={line.text} style={{ opacity: lineOpacity }}>
                    <span
                      style={{
                        fontSize: 22,
                        fontFamily: theme.fontMono,
                        color: line.color,
                        fontWeight: line.color === theme.green ? 600 : 400,
                      }}
                    >
                      {line.color === theme.green ? "✓ " : "  "}
                      {line.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score arc */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              opacity: arcOpacity,
            }}
          >
            {/* Score label */}
            <div
              style={{
                fontSize: 18,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: 8,
              }}
            >
              CALIBER SCORE
            </div>

            <div style={{ position: "relative", width: 140, height: 140 }}>
              <svg width={140} height={140} viewBox="0 0 140 140">
                <circle
                  cx={70}
                  cy={70}
                  r={ARC_RADIUS}
                  fill="none"
                  stroke={theme.surfaceBorder}
                  strokeWidth={6}
                />
                <circle
                  cx={70}
                  cy={70}
                  r={ARC_RADIUS}
                  fill="none"
                  stroke={getScoreColor(arcProgress)}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={ARC_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  transform="rotate(-90 70 70)"
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 140,
                  height: 140,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    fontFamily: theme.fontSans,
                    color: getScoreColor(arcProgress),
                  }}
                >
                  {scoreNumber}
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: 20,
                fontFamily: theme.fontSans,
                color: theme.textMuted,
                fontWeight: 500,
              }}
            >
              /100
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
