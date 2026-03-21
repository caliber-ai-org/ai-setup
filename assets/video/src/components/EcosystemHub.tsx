import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Logo } from "./Logo";
import { theme } from "./theme";
import { ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon } from "./ToolIcons";

const editors = [
  { name: "Claude Code", Icon: ClaudeIcon, color: "#D97757", angle: -40 },
  { name: "Cursor", Icon: CursorIcon, color: "#7dd3fc", angle: 40 },
  { name: "Codex", Icon: CodexIcon, color: "#86efac", angle: 150 },
  { name: "Copilot", Icon: CopilotIcon, color: "#c4b5fd", angle: 210 },
];

export const EcosystemHub: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [10, 28], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [10, 28], [20, 0], { extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [22, 40], [0, 1], { extrapolateRight: "clamp" });
  const subtitleOpacity = interpolate(frame, [48, 68], [0, 1], { extrapolateRight: "clamp" });
  const orbitRotation = interpolate(frame, [0, 120], [0, 12], { extrapolateRight: "clamp" });
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${theme.brand3}0a, transparent)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 780,
          height: 780,
          borderRadius: "50%",
          border: `1px solid ${theme.brand3}12`,
          opacity: interpolate(frame, [20, 45], [0, 0.8], { extrapolateRight: "clamp" }),
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 660,
          height: 660,
          borderRadius: "50%",
          border: `1px dashed ${theme.surfaceBorder}`,
          opacity: interpolate(frame, [18, 40], [0, 0.4], { extrapolateRight: "clamp" }),
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.brand3}15, transparent 70%)`,
          filter: "blur(60px)",
          opacity: interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" }),
        }}
      />

      <div style={{ marginBottom: 24, zIndex: 1 }}>
        <Logo size={1.6} animate delay={0} />
      </div>

      <div
        style={{
          fontSize: 120,
          fontWeight: 800,
          fontFamily: theme.fontSans,
          letterSpacing: "-0.04em",
          background: `linear-gradient(135deg, ${theme.brand1}, ${theme.brand3})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          zIndex: 1,
        }}
      >
        caliber
      </div>

      <div
        style={{
          fontSize: 48,
          fontFamily: theme.fontSans,
          color: theme.textSecondary,
          opacity: taglineOpacity,
          marginTop: 14,
          fontWeight: 400,
          zIndex: 1,
        }}
      >
        AI setup tailored for your codebase
      </div>

      <div
        style={{
          marginTop: 28,
          padding: "20px 48px",
          borderRadius: 40,
          backgroundColor: `${theme.brand3}12`,
          border: `1px solid ${theme.brand3}25`,
          opacity: subtitleOpacity,
          display: "flex",
          alignItems: "center",
          gap: 14,
          zIndex: 1,
          boxShadow: theme.cardGlow,
        }}
      >
        <span style={{ fontSize: 38, fontFamily: theme.fontSans, color: theme.brand1, fontWeight: 600 }}>
          Bring your own AI
        </span>
        <span style={{ fontSize: 32, fontFamily: theme.fontSans, color: theme.textSecondary }}>
          — API key or coding agent seat
        </span>
        <div
          style={{
            width: 4,
            height: 36,
            backgroundColor: theme.brand3,
            opacity: cursorVisible ? 1 : 0,
            marginLeft: 4,
          }}
        />
      </div>

      {editors.map((editor, i) => {
        const delay = 18 + i * 6;
        const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 65 } });
        const radius = 340;
        const angle = ((editor.angle + orbitRotation) * Math.PI) / 180;
        const x = Math.cos(angle) * radius * s;
        const y = Math.sin(angle) * radius * 0.52 * s;

        const lineProgress = interpolate(frame, [delay + 8, delay + 22], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const pulsePhase = ((frame - delay) % 45) / 45;
        const pulseOpacity = s > 0.9 ? 0.12 + Math.sin(pulsePhase * Math.PI * 2) * 0.08 : 0;

        return (
          <div key={editor.name}>
            <svg
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              <defs>
                <linearGradient id={`line-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={theme.brand3} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={editor.color} stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <line
                x1="50%"
                y1="44%"
                x2={`${50 + (x / 19.2)}%`}
                y2={`${44 + (y / 10.8)}%`}
                stroke={`url(#line-${i})`}
                strokeWidth={2}
                opacity={lineProgress}
                strokeDasharray="6 8"
              />
            </svg>

            <div
              style={{
                position: "absolute",
                left: `calc(50% + ${x}px - 120px)`,
                top: `calc(44% + ${y}px - 32px)`,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "18px 32px",
                borderRadius: 36,
                backgroundColor: theme.surface,
                border: `1px solid ${theme.surfaceBorder}`,
                color: theme.text,
                fontSize: 30,
                fontWeight: 500,
                fontFamily: theme.fontSans,
                opacity: s,
                transform: `scale(${interpolate(s, [0, 1], [0.8, 1])})`,
                boxShadow: `0 0 36px ${editor.color}${Math.round(pulseOpacity * 255).toString(16).padStart(2, "0")}`,
              }}
            >
              <editor.Icon size={36} color={editor.color} />
              {editor.name}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
