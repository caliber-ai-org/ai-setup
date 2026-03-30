import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";

// SVG icons (no emoji per ui-ux-pro-max)
const CheckCircle: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.5} fill={`${color}15`} />
    <path d="M8 12L11 15L16 9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRight: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <path d="M5 12H19M14 7L19 12L14 17" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RefreshIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <path d="M3 12C3 7.03 7.03 3 12 3C15.16 3 17.94 4.64 19.5 7.13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M21 12C21 16.97 16.97 21 12 21C8.84 21 6.06 19.36 4.5 16.87" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M16 7H20V3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 17H4V21" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HookIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M12 3V15M12 15C12 17.21 10.21 19 8 19C5.79 19 4 17.21 4 15V12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M8 8L12 3L16 8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UndoIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M3 7H15C18.31 7 21 9.69 21 13C21 16.31 18.31 19 15 19H9" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M7 3L3 7L7 11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const learnSteps = [
  { text: "3 session patterns detected", Icon: CheckCircle, color: theme.green },
  { text: "1 anti-pattern captured", Icon: CheckCircle, color: theme.yellow },
  { text: "Written to CALIBER_LEARNINGS.md", Icon: ArrowRight, color: theme.brand2 },
];

const diffLines = [
  { type: "context", text: "  export async function deploy() {" },
  { type: "remove", text: "-    await runMigrations();" },
  { type: "add", text: "+    await runMigrations({ dryRun: true });" },
  { type: "add", text: "+    await validateSchema();" },
  { type: "context", text: "     await pushToStaging();" },
];

export const LearnRefreshScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  const leftCardScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 16, stiffness: 70 },
  });

  const rightCardScale = spring({
    frame: frame - 12,
    fps,
    config: { damping: 16, stiffness: 70 },
  });

  const subtitleOpacity = interpolate(frame, [72, 86], [0, 1], {
    extrapolateRight: "clamp",
  });

  const bonusOpacity = interpolate(frame, [82, 94], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 36,
      }}
    >
      {/* Section header — gradient */}
      <div
        style={{
          fontSize: 28,
          fontFamily: theme.fontMono,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          opacity: headerOpacity,
          background: `linear-gradient(90deg, ${theme.textMuted} 0%, ${theme.brand1} 100%)`,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Continuous Intelligence
      </div>

      {/* Two cards side by side */}
      <div style={{ display: "flex", gap: 40, width: 1600 }}>
        {/* Left card — caliber learn */}
        <div
          style={{
            flex: 1,
            backgroundColor: theme.surface,
            border: `1px solid ${theme.surfaceBorder}`,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: theme.cardGlow,
            transform: `scale(${leftCardScale})`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 22px",
              backgroundColor: theme.surfaceHeader,
              borderBottom: `1px solid ${theme.surfaceBorder}`,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.red }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.yellow }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.green }} />
            <span style={{ color: theme.textMuted, fontSize: 20, fontFamily: theme.fontMono, marginLeft: 14 }}>
              $ caliber learn finalize
            </span>
          </div>

          <div style={{ padding: "28px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                fontSize: 22,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                fontWeight: 600,
                opacity: interpolate(frame, [18, 24], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              Analyzing session history...
            </div>

            {learnSteps.map((step, i) => {
              const stepDelay = 28 + i * 12;
              const stepOpacity = interpolate(frame, [stepDelay, stepDelay + 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              return (
                <div
                  key={step.text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    opacity: stepOpacity,
                    fontFamily: theme.fontMono,
                    fontSize: 24,
                  }}
                >
                  <step.Icon color={step.color} />
                  <span style={{ color: step.color }}>{step.text}</span>
                </div>
              );
            })}

            {/* Output file pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 12,
                opacity: interpolate(frame, [66, 74], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              <div
                style={{
                  padding: "10px 22px",
                  borderRadius: 28,
                  backgroundColor: `${theme.green}08`,
                  border: `1px solid ${theme.green}18`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 22, fontFamily: theme.fontMono, color: theme.green, fontWeight: 500 }}>
                  CALIBER_LEARNINGS.md
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 12,
                    backgroundColor: `${theme.green}18`,
                    color: theme.green,
                    letterSpacing: "0.05em",
                  }}
                >
                  NEW
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right card — caliber refresh */}
        <div
          style={{
            flex: 1,
            backgroundColor: theme.surface,
            border: `1px solid ${theme.surfaceBorder}`,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: theme.cardGlow,
            transform: `scale(${rightCardScale})`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 22px",
              backgroundColor: theme.surfaceHeader,
              borderBottom: `1px solid ${theme.surfaceBorder}`,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.red }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.yellow }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.green }} />
            <span style={{ color: theme.textMuted, fontSize: 20, fontFamily: theme.fontMono, marginLeft: 14 }}>
              $ caliber refresh
            </span>
          </div>

          <div style={{ padding: "28px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                fontSize: 22,
                fontFamily: theme.fontMono,
                color: theme.accent,
                fontWeight: 600,
                opacity: interpolate(frame, [22, 28], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              Detecting code changes...
            </div>

            {/* Git diff */}
            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.surfaceBorder}`,
                borderRadius: 12,
                padding: "16px 20px",
                opacity: interpolate(frame, [32, 40], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              {diffLines.map((line, i) => {
                const lineOpacity = interpolate(frame, [36 + i * 4, 40 + i * 4], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const lineColor =
                  line.type === "add" ? theme.green
                  : line.type === "remove" ? theme.red
                  : theme.textMuted;

                return (
                  <div
                    key={i}
                    style={{
                      fontFamily: theme.fontMono,
                      fontSize: 19,
                      lineHeight: 1.8,
                      color: lineColor,
                      opacity: lineOpacity,
                      backgroundColor: line.type === "add" ? `${theme.green}06` : line.type === "remove" ? `${theme.red}06` : "transparent",
                      padding: "0 4px",
                      borderRadius: 4,
                    }}
                  >
                    {line.text}
                  </div>
                );
              })}
            </div>

            {/* Updated output */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: interpolate(frame, [62, 70], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              <RefreshIcon color={theme.green} />
              <span style={{ fontSize: 22, fontFamily: theme.fontMono, color: theme.text }}>
                CLAUDE.md updated
              </span>
              <span style={{ fontSize: 22, fontFamily: theme.fontMono, color: theme.textMuted }}>
                +12 lines, -3 lines
              </span>
            </div>

            {/* More updated files */}
            <div
              style={{
                display: "flex",
                gap: 12,
                opacity: interpolate(frame, [72, 80], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              {[".cursor/rules/", "AGENTS.md", "copilot-instructions.md"].map((file) => (
                <div
                  key={file}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    backgroundColor: `${theme.accent}08`,
                    border: `1px solid ${theme.accent}15`,
                    fontSize: 18,
                    fontFamily: theme.fontMono,
                    color: theme.accent,
                  }}
                >
                  {file}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom — subtitle + bonus value props (hooks, undo) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
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
          Configs evolve with your code.
        </div>

        {/* Additional value props from LP */}
        <div
          style={{
            display: "flex",
            gap: 24,
            opacity: bonusOpacity,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 24px",
              borderRadius: 28,
              backgroundColor: `${theme.brand3}08`,
              border: `1px solid ${theme.brand3}15`,
            }}
          >
            <HookIcon color={theme.brand3} />
            <span style={{ fontSize: 22, fontFamily: theme.fontSans, color: theme.brand3, fontWeight: 500 }}>
              Auto-refresh via hooks
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 24px",
              borderRadius: 28,
              backgroundColor: `${theme.accent}08`,
              border: `1px solid ${theme.accent}15`,
            }}
          >
            <UndoIcon color={theme.accent} />
            <span style={{ fontSize: 22, fontFamily: theme.fontSans, color: theme.accent, fontWeight: 500 }}>
              One-command undo
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
