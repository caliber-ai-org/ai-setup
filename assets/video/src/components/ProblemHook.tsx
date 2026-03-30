import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";

const painPoints = [
  { text: "No project context for agents", desc: "Generic responses, wrong patterns" },
  { text: "Missing MCPs that unlock key features", desc: "Half your toolchain sits unused" },
  { text: "Stale configs nobody updates", desc: "Last month's architecture, today's code" },
  { text: "Every developer has their own setup", desc: "No single source of truth" },
];

// SVG X icon (replaces emoji)
const XIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={11} stroke={theme.red} strokeWidth={1.5} opacity={0.3} />
    <path d="M8 8L16 16M16 8L8 16" stroke={theme.red} strokeWidth={2} strokeLinecap="round" />
  </svg>
);

export const ProblemHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 60 },
  });
  const titleTranslate = interpolate(titleY, [0, 1], [24, 0]);

  // Pulsing red/orange glow — two layers for depth
  const glowPulse = interpolate(
    frame,
    [0, 30, 60, 90],
    [0, 0.2, 0.14, 0.2],
    { extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Outer glow ring */}
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(249,115,22,${glowPulse * 0.3}) 0%, transparent 50%)`,
        }}
      />
      {/* Inner red glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(239,68,68,${glowPulse}) 0%, rgba(249,115,22,0.04) 40%, transparent 65%)`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 56,
          transform: `translateY(${titleTranslate}px)`,
        }}
      >
        {/* Main title — gradient text */}
        <div
          style={{
            fontSize: 100,
            fontWeight: 800,
            fontFamily: theme.fontSans,
            opacity: titleOpacity,
            letterSpacing: "-0.04em",
            textAlign: "center",
            background: `linear-gradient(135deg, ${theme.text} 0%, ${theme.textSecondary} 100%)`,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Bad setup = bad agent.
        </div>

        {/* Pain point cards — 2x2 grid for premium feel */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            width: 1200,
          }}
        >
          {painPoints.map((point, i) => {
            const pillDelay = 18 + i * 8;
            const pillSpring = spring({
              frame: frame - pillDelay,
              fps,
              config: { damping: 16, stiffness: 90 },
            });
            const pillOpacity = interpolate(frame, [pillDelay, pillDelay + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={point.text}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "20px 28px",
                  borderRadius: 16,
                  backgroundColor: `${theme.red}08`,
                  border: `1px solid ${theme.red}18`,
                  opacity: pillOpacity,
                  transform: `scale(${pillSpring}) translateY(${interpolate(pillSpring, [0, 1], [8, 0])}px)`,
                }}
              >
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  <XIcon size={24} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 28,
                      fontFamily: theme.fontSans,
                      color: theme.text,
                      fontWeight: 600,
                    }}
                  >
                    {point.text}
                  </span>
                  <span
                    style={{
                      fontSize: 20,
                      fontFamily: theme.fontSans,
                      color: theme.textMuted,
                      fontWeight: 400,
                    }}
                  >
                    {point.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
