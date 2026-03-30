import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";

const painPoints = [
  "No project context for agents",
  "Missing MCPs that unlock key features",
  "Stale configs nobody updates",
  "Every developer has their own setup",
];

export const ProblemHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 15], [16, 0], {
    extrapolateRight: "clamp",
  });

  // Pulsing red/orange glow
  const glowPulse = interpolate(
    frame,
    [0, 30, 60, 90],
    [0, 0.25, 0.18, 0.25],
    { extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Radial warning glow */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(239,68,68,${glowPulse}) 0%, rgba(249,115,22,0.06) 45%, transparent 70%)`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {/* Main title */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            fontFamily: theme.fontSans,
            color: theme.text,
            opacity: titleOpacity,
            letterSpacing: "-0.03em",
            textAlign: "center",
          }}
        >
          Bad setup = bad agent.
        </div>

        {/* Pain point pills */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            alignItems: "center",
          }}
        >
          {painPoints.map((point, i) => {
            const pillDelay = 20 + i * 10;
            const pillScale = spring({
              frame: frame - pillDelay,
              fps,
              config: { damping: 14, stiffness: 100 },
            });
            const pillOpacity = interpolate(frame, [pillDelay, pillDelay + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={point}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 36px",
                  borderRadius: 40,
                  backgroundColor: `${theme.red}10`,
                  border: `1px solid ${theme.red}22`,
                  opacity: pillOpacity,
                  transform: `scale(${pillScale})`,
                }}
              >
                <span style={{ fontSize: 28, color: theme.red, fontWeight: 700 }}>&#x2715;</span>
                <span
                  style={{
                    fontSize: 34,
                    fontFamily: theme.fontSans,
                    color: theme.textSecondary,
                    fontWeight: 500,
                  }}
                >
                  {point}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
