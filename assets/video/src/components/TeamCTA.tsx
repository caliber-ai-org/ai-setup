import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { Logo } from "./Logo";
import { ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon } from "./ToolIcons";

const benefits = [
  { label: "Git-native distribution", color: theme.brand3 },
  { label: "Automatic freshness", color: theme.green },
  { label: "Network effect", color: theme.accent },
];

const DevAvatar: React.FC<{ color: string; x: number; y: number; opacity: number; scale: number }> = ({
  color,
  x,
  y,
  opacity,
  scale,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      transform: `scale(${scale})`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
    }}
  >
    {/* Head */}
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: color,
      }}
    />
    {/* Body */}
    <div
      style={{
        width: 56,
        height: 32,
        borderRadius: "28px 28px 0 0",
        backgroundColor: color,
        opacity: 0.7,
      }}
    />
  </div>
);

export const TeamCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isCTAPhase = frame >= 70;

  // Phase 1: Team sync (frames 0-70)
  const titleOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Dev 1 (source) appears first
  const dev1Scale = spring({
    frame: frame - 8,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Arrow animation
  const arrowOpacity = interpolate(frame, [20, 28], [0, 1], {
    extrapolateRight: "clamp",
  });
  const arrowX = interpolate(frame, [20, 35], [-20, 0], {
    extrapolateRight: "clamp",
  });

  // Dev 2, 3, 4 appear staggered
  const dev2Scale = spring({ frame: frame - 30, fps, config: { damping: 12, stiffness: 100 } });
  const dev3Scale = spring({ frame: frame - 34, fps, config: { damping: 12, stiffness: 100 } });
  const dev4Scale = spring({ frame: frame - 38, fps, config: { damping: 12, stiffness: 100 } });

  // Phase 2: CTA (frames 70+)
  const ctaOpacity = interpolate(frame, [70, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const teamOpacity = interpolate(frame, [68, 78], [1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Phase 1: Team sync visual */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
          opacity: teamOpacity,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            fontFamily: theme.fontSans,
            color: theme.text,
            letterSpacing: "-0.02em",
            opacity: titleOpacity,
            textAlign: "center",
          }}
        >
          One dev sets up. Everyone benefits.
        </div>

        {/* Dev flow visualization */}
        <div style={{ position: "relative", width: 700, height: 120, marginTop: 10 }}>
          {/* Source dev */}
          <DevAvatar color={theme.brand3} x={80} y={20} opacity={1} scale={dev1Scale} />

          {/* git push arrow */}
          <div
            style={{
              position: "absolute",
              left: 180,
              top: 40,
              opacity: arrowOpacity,
              transform: `translateX(${arrowX}px)`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 160,
                height: 3,
                backgroundColor: theme.brand2,
                borderRadius: 2,
              }}
            />
            <div
              style={{
                padding: "6px 16px",
                borderRadius: 16,
                backgroundColor: `${theme.brand3}15`,
                border: `1px solid ${theme.brand3}30`,
                fontSize: 18,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                fontWeight: 600,
                whiteSpace: "nowrap" as const,
              }}
            >
              git push
            </div>
            <div
              style={{
                width: 80,
                height: 3,
                backgroundColor: theme.brand2,
                borderRadius: 2,
              }}
            />
            <svg width={16} height={16} viewBox="0 0 16 16" fill={theme.brand2}>
              <path d="M8 0L16 8L8 16L6 14L11 9H0V7H11L6 2Z" />
            </svg>
          </div>

          {/* Receiving devs */}
          <DevAvatar color={theme.accent} x={520} y={0} opacity={1} scale={dev2Scale} />
          <DevAvatar color={theme.green} x={580} y={30} opacity={1} scale={dev3Scale} />
          <DevAvatar color={theme.purple} x={520} y={55} opacity={1} scale={dev4Scale} />
        </div>

        {/* Benefit pills */}
        <div style={{ display: "flex", gap: 24 }}>
          {benefits.map((b, i) => {
            const pillOpacity = interpolate(frame, [42 + i * 6, 48 + i * 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={b.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 28px",
                  borderRadius: 32,
                  backgroundColor: `${b.color}10`,
                  border: `1px solid ${b.color}22`,
                  opacity: pillOpacity,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: b.color,
                  }}
                />
                <span style={{ fontSize: 26, fontWeight: 600, fontFamily: theme.fontSans, color: b.color }}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase 2: CTA */}
      {isCTAPhase && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
            opacity: ctaOpacity,
          }}
        >
          <Logo size={0.9} animate delay={72} />

          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.02em",
              marginTop: 16,
            }}
          >
            caliber
          </div>

          {/* Platform icons row */}
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <ClaudeIcon size={28} color={theme.brand2} />
            <CursorIcon size={28} color={theme.accent} />
            <CodexIcon size={28} color={theme.green} />
            <CopilotIcon size={28} color={theme.purple} />
          </div>

          {/* Command pill */}
          <div
            style={{
              padding: "16px 40px",
              borderRadius: 40,
              backgroundColor: theme.surface,
              border: `1px solid ${theme.surfaceBorder}`,
              boxShadow: theme.terminalGlow,
            }}
          >
            <span style={{ fontSize: 28, fontFamily: theme.fontMono, color: theme.textSecondary }}>
              $ npx @rely-ai/caliber init
            </span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 32,
              fontFamily: theme.fontSans,
              color: theme.textMuted,
              opacity: interpolate(frame, [95, 105], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            AI setup tailored for your codebase
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
