import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";

const learnSteps = [
  { text: "3 session patterns detected", icon: "\u2713", color: theme.green },
  { text: "1 anti-pattern captured", icon: "\u2713", color: theme.yellow },
  { text: "Written to CALIBER_LEARNINGS.md", icon: "\u2192", color: theme.brand2 },
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
    config: { damping: 14, stiffness: 80 },
  });

  const rightCardScale = spring({
    frame: frame - 12,
    fps,
    config: { damping: 14, stiffness: 80 },
  });

  const subtitleOpacity = interpolate(frame, [75, 90], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 40,
      }}
    >
      {/* Section header */}
      <div
        style={{
          fontSize: 28,
          fontFamily: theme.fontMono,
          color: theme.textMuted,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          opacity: headerOpacity,
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
          {/* Terminal header */}
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
            <span
              style={{
                color: theme.textMuted,
                fontSize: 20,
                fontFamily: theme.fontMono,
                marginLeft: 14,
              }}
            >
              $ caliber learn finalize
            </span>
          </div>

          <div style={{ padding: "32px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Phase label */}
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

            {/* Learn steps */}
            {learnSteps.map((step, i) => {
              const stepDelay = 28 + i * 14;
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
                  <span style={{ color: step.color, fontWeight: 700, width: 24, textAlign: "center" }}>
                    {step.icon}
                  </span>
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
                marginTop: 16,
                opacity: interpolate(frame, [68, 76], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              <div
                style={{
                  padding: "10px 22px",
                  borderRadius: 28,
                  backgroundColor: `${theme.green}12`,
                  border: `1px solid ${theme.green}25`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 18, color: theme.green }}>&#x1F4C4;</span>
                <span style={{ fontSize: 22, fontFamily: theme.fontMono, color: theme.green, fontWeight: 500 }}>
                  CALIBER_LEARNINGS.md
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 12,
                    backgroundColor: `${theme.green}20`,
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
          {/* Terminal header */}
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
            <span
              style={{
                color: theme.textMuted,
                fontSize: 20,
                fontFamily: theme.fontMono,
                marginLeft: 14,
              }}
            >
              $ caliber refresh
            </span>
          </div>

          <div style={{ padding: "32px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Phase label */}
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
                backgroundColor: `${theme.bg}`,
                border: `1px solid ${theme.surfaceBorder}`,
                borderRadius: 12,
                padding: "16px 20px",
                opacity: interpolate(frame, [32, 40], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              {diffLines.map((line, i) => {
                const lineOpacity = interpolate(frame, [36 + i * 5, 40 + i * 5], [0, 1], {
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
                opacity: interpolate(frame, [68, 76], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              <span style={{ fontSize: 22, color: theme.green, fontWeight: 700 }}>{"\u2713"}</span>
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
                opacity: interpolate(frame, [76, 84], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              {[".cursor/rules/", "AGENTS.md", "copilot-instructions.md"].map((file) => (
                <div
                  key={file}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    backgroundColor: `${theme.accent}10`,
                    border: `1px solid ${theme.accent}20`,
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

      {/* Bottom subtitle */}
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
    </AbsoluteFill>
  );
};
