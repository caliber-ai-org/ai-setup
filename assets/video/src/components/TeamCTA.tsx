import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { Logo } from "./Logo";
import { ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon } from "./ToolIcons";

// SVG icons (no emoji per ui-ux-pro-max)
const UserIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={8} r={4} fill={`${color}30`} stroke={color} strokeWidth={1.5} />
    <path
      d="M4 20C4 17.24 7.58 15 12 15C16.42 15 20 17.24 20 20"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      fill={`${color}15`}
    />
  </svg>
);

const GitPushIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path d="M12 19V5M12 5L6 11M12 5L18 11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GitBranchIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <circle cx={6} cy={6} r={3} stroke={color} strokeWidth={1.5} />
    <circle cx={18} cy={18} r={3} stroke={color} strokeWidth={1.5} />
    <circle cx={6} cy={18} r={3} stroke={color} strokeWidth={1.5} />
    <path d="M6 9V15M18 15C18 12 18 9 6 9" stroke={color} strokeWidth={1.5} />
  </svg>
);

const RefreshSmIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M3 12C3 7.03 7.03 3 12 3C15.16 3 17.94 4.64 19.5 7.13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M21 12C21 16.97 16.97 21 12 21C8.84 21 6.06 19.36 4.5 16.87" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M16 7H20V3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 17H4V21" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NetworkIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={5} r={3} stroke={color} strokeWidth={1.5} />
    <circle cx={5} cy={19} r={3} stroke={color} strokeWidth={1.5} />
    <circle cx={19} cy={19} r={3} stroke={color} strokeWidth={1.5} />
    <path d="M12 8V12M12 12L5 16M12 12L19 16" stroke={color} strokeWidth={1.5} />
  </svg>
);

const benefits = [
  { label: "Git-native distribution", color: theme.brand3, Icon: GitBranchIcon },
  { label: "Automatic freshness", color: theme.green, Icon: RefreshSmIcon },
  { label: "Network effect", color: theme.accent, Icon: NetworkIcon },
];

const receiverColors = [theme.accent, theme.green, theme.purple];

export const TeamCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isCTAPhase = frame >= 70;

  // Phase 1: Team sync (frames 0-70)
  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 60 },
  });
  const titleTranslate = interpolate(titleSpring, [0, 1], [24, 0]);
  const titleOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Source dev
  const dev1Scale = spring({
    frame: frame - 8,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  // Arrow animation
  const arrowProgress = spring({
    frame: frame - 18,
    fps,
    config: { damping: 20, stiffness: 50 },
  });
  const arrowOpacity = interpolate(frame, [18, 26], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Receiving devs staggered with spring
  const dev2Scale = spring({ frame: frame - 28, fps, config: { damping: 14, stiffness: 90 } });
  const dev3Scale = spring({ frame: frame - 32, fps, config: { damping: 14, stiffness: 90 } });
  const dev4Scale = spring({ frame: frame - 36, fps, config: { damping: 14, stiffness: 90 } });

  // Phase 2: CTA
  const ctaOpacity = interpolate(frame, [70, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaScale = spring({
    frame: frame - 72,
    fps,
    config: { damping: 16, stiffness: 70 },
  });

  const teamOpacity = interpolate(frame, [68, 78], [1, 0], {
    extrapolateRight: "clamp",
  });

  // Glow behind CTA
  const glowPulse = isCTAPhase
    ? interpolate(frame, [80, 100, 120, 150], [0, 0.3, 0.2, 0.25], { extrapolateRight: "clamp" })
    : 0;

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
        {/* Gradient title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            fontFamily: theme.fontSans,
            letterSpacing: "-0.03em",
            opacity: titleOpacity,
            textAlign: "center",
            transform: `translateY(${titleTranslate}px)`,
            background: `linear-gradient(135deg, ${theme.text} 0%, ${theme.textSecondary} 100%)`,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          One dev sets up. Everyone benefits.
        </div>

        {/* Dev flow visualization — SVG avatars */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginTop: 10,
          }}
        >
          {/* Source dev */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              transform: `scale(${dev1Scale})`,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: `${theme.brand3}12`,
                border: `2px solid ${theme.brand3}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UserIcon color={theme.brand3} size={44} />
            </div>
            <span
              style={{
                fontSize: 16,
                fontFamily: theme.fontMono,
                color: theme.brand3,
                fontWeight: 500,
              }}
            >
              caliber init
            </span>
          </div>

          {/* Arrow with git push label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 24px",
              opacity: arrowOpacity,
              transform: `translateX(${interpolate(arrowProgress, [0, 1], [-16, 0])}px)`,
            }}
          >
            <div
              style={{
                width: 120,
                height: 2,
                background: `linear-gradient(90deg, ${theme.brand3} 0%, ${theme.brand2} 100%)`,
                borderRadius: 1,
              }}
            />
            <div
              style={{
                padding: "8px 18px",
                borderRadius: 20,
                backgroundColor: `${theme.brand3}10`,
                border: `1px solid ${theme.brand3}25`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <GitPushIcon color={theme.brand2} />
              <span
                style={{
                  fontSize: 18,
                  fontFamily: theme.fontMono,
                  color: theme.brand2,
                  fontWeight: 600,
                  whiteSpace: "nowrap" as const,
                }}
              >
                git push
              </span>
            </div>
            <div
              style={{
                width: 120,
                height: 2,
                background: `linear-gradient(90deg, ${theme.brand2} 0%, ${theme.brand3} 100%)`,
                borderRadius: 1,
              }}
            />
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
              <path d="M1 7H13M9 3L13 7L9 11" stroke={theme.brand2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Receiving devs — stacked vertically */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {receiverColors.map((color, i) => {
              const scale = [dev2Scale, dev3Scale, dev4Scale][i];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transform: `scale(${scale})`,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: `${color}10`,
                      border: `1.5px solid ${color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <UserIcon color={color} size={30} />
                  </div>
                  <span
                    style={{
                      fontSize: 15,
                      fontFamily: theme.fontMono,
                      color: `${color}`,
                      opacity: 0.7,
                    }}
                  >
                    caliber sync
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Benefit pills with SVG icons */}
        <div style={{ display: "flex", gap: 24 }}>
          {benefits.map((b, i) => {
            const pillSpring = spring({
              frame: frame - (42 + i * 6),
              fps,
              config: { damping: 16, stiffness: 90 },
            });
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
                  gap: 10,
                  padding: "12px 24px",
                  borderRadius: 28,
                  backgroundColor: `${b.color}08`,
                  border: `1px solid ${b.color}18`,
                  opacity: pillOpacity,
                  transform: `scale(${pillSpring}) translateY(${interpolate(pillSpring, [0, 1], [6, 0])}px)`,
                }}
              >
                <b.Icon color={b.color} />
                <span style={{ fontSize: 24, fontWeight: 600, fontFamily: theme.fontSans, color: b.color }}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase 2: CTA */}
      {isCTAPhase && (
        <>
          {/* Brand glow */}
          <div
            style={{
              position: "absolute",
              width: 1000,
              height: 1000,
              borderRadius: "50%",
              background: `radial-gradient(ellipse, rgba(249,115,22,${glowPulse}) 0%, transparent 55%)`,
            }}
          />

          <div
            style={{
              position: "absolute",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 28,
              opacity: ctaOpacity,
              transform: `scale(${ctaScale})`,
            }}
          >
            <Logo size={0.9} animate delay={72} />

            {/* Brand name — gradient */}
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                fontFamily: theme.fontSans,
                letterSpacing: "-0.03em",
                marginTop: 12,
                background: `linear-gradient(135deg, ${theme.text} 0%, ${theme.brand1} 100%)`,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              caliber
            </div>

            {/* Platform icons row */}
            <div
              style={{
                display: "flex",
                gap: 32,
                alignItems: "center",
                padding: "12px 32px",
                borderRadius: 32,
                backgroundColor: `${theme.surface}80`,
                border: `1px solid ${theme.surfaceBorder}`,
              }}
            >
              {[
                { Icon: ClaudeIcon, color: theme.brand2, label: "Claude Code" },
                { Icon: CursorIcon, color: theme.accent, label: "Cursor" },
                { Icon: CodexIcon, color: theme.green, label: "Codex" },
                { Icon: CopilotIcon, color: theme.purple, label: "Copilot" },
              ].map((p) => (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p.Icon size={24} color={p.color} />
                  <span style={{ fontSize: 18, fontFamily: theme.fontSans, color: p.color, fontWeight: 500 }}>
                    {p.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Command pill */}
            <div
              style={{
                padding: "18px 48px",
                borderRadius: 40,
                backgroundColor: theme.surface,
                border: `1px solid ${theme.surfaceBorder}`,
                boxShadow: theme.terminalGlow,
              }}
            >
              <span style={{ fontSize: 28, fontFamily: theme.fontMono, color: theme.textMuted }}>$ </span>
              <span style={{ fontSize: 28, fontFamily: theme.fontMono, color: theme.text }}>
                npx @rely-ai/caliber init
              </span>
            </div>

            {/* Tagline */}
            <div
              style={{
                fontSize: 32,
                fontFamily: theme.fontSans,
                fontWeight: 500,
                opacity: interpolate(frame, [95, 108], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                background: `linear-gradient(90deg, ${theme.textSecondary} 0%, ${theme.textMuted} 100%)`,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              AI setup tailored for your codebase
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
