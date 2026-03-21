import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon, GitHubIcon } from "./ToolIcons";

const outputFiles = [
  { name: "CLAUDE.md", platform: "Claude Code", Icon: ClaudeIcon, color: "#D97757" },
  { name: ".cursor/rules/", platform: "Cursor", Icon: CursorIcon, color: "#7dd3fc" },
  { name: "AGENTS.md", platform: "Codex", Icon: CodexIcon, color: "#86efac" },
  { name: "copilot-instructions.md", platform: "Copilot", Icon: CopilotIcon, color: "#c4b5fd" },
];

export const SyncAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const codeSpring = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 80 } });
  const arrowProgress = interpolate(frame, [20, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const loopPulse = Math.sin(((frame % 30) / 30) * Math.PI * 2);
  const loopOpacity = interpolate(frame, [70, 88], [0, 1], { extrapolateRight: "clamp" });
  const arrowRotation = interpolate(frame, [38, 105], [0, 360], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: `radial-gradient(ellipse 50% 40% at 30% 50%, ${theme.green}06, transparent)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "6%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: headerOpacity,
        }}
      >
        <GitHubIcon size={32} color={theme.textMuted} />
        <span
          style={{
            fontSize: 32,
            fontFamily: theme.fontMono,
            color: theme.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
          }}
        >
          Syncs against your Git
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          top: "14%",
          fontSize: 64,
          fontWeight: 700,
          fontFamily: theme.fontSans,
          color: theme.text,
          opacity: headerOpacity,
          letterSpacing: "-0.02em",
        }}
      >
        Configs evolve with your code
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 60, marginTop: 36 }}>
        <div
          style={{
            backgroundColor: theme.surface,
            border: `1px solid ${theme.surfaceBorder}`,
            borderRadius: 20,
            opacity: codeSpring,
            transform: `scale(${interpolate(codeSpring, [0, 1], [0.95, 1])})`,
            minWidth: 500,
            overflow: "hidden",
            boxShadow: theme.terminalGlow,
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
            <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.red }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.yellow }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.green }} />
            <div style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <GitHubIcon size={20} color={theme.textMuted} />
              <span style={{ color: theme.textMuted, fontSize: 20, fontFamily: theme.fontMono }}>git diff</span>
            </div>
          </div>

          <div style={{ padding: "24px 30px", fontFamily: theme.fontMono, fontSize: 28, lineHeight: 2 }}>
            <div>
              <span style={{ color: theme.green, fontWeight: 600 }}>+</span>
              <span style={{ color: "#c4b5fd" }}> export function </span>
              <span style={{ color: theme.text }}>authenticate</span>
            </div>
            <div>
              <span style={{ color: theme.green, fontWeight: 600 }}>+</span>
              <span style={{ color: "#c4b5fd" }}> export function </span>
              <span style={{ color: theme.text }}>authorize</span>
            </div>
            <div>
              <span style={{ color: theme.green, fontWeight: 600 }}>+</span>
              <span style={{ color: "#c4b5fd" }}> export function </span>
              <span style={{ color: theme.text }}>rateLimit</span>
            </div>
            <div style={{ marginTop: 10, color: theme.textMuted, fontSize: 22 }}>
              src/lib/auth.ts — 3 new exports
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: theme.surface,
              border: `1px solid ${theme.surfaceBorder}`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: arrowProgress,
              transform: `scale(${arrowProgress})`,
              boxShadow: `0 0 40px ${theme.brand3}18`,
            }}
          >
            <svg width={54} height={54} viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${arrowRotation}deg)` }}>
              <path d="M4 12C4 7.58 7.58 4 12 4C15.37 4 18.24 6.11 19.38 9" stroke={theme.brand2} strokeWidth={2.5} strokeLinecap="round" />
              <path d="M20 12C20 16.42 16.42 20 12 20C8.63 20 5.76 17.89 4.62 15" stroke={theme.brand2} strokeWidth={2.5} strokeLinecap="round" />
              <path d="M17 9H20V6" stroke={theme.brand2} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 15H4V18" stroke={theme.brand2} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: 22, fontFamily: theme.fontMono, color: theme.brand2, opacity: arrowProgress, fontWeight: 600 }}>
            $ caliber refresh
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {outputFiles.map((file, i) => {
            const delay = 24 + i * 6;
            const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 75 } });
            return (
              <div
                key={file.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "16px 28px",
                  backgroundColor: theme.surface,
                  border: `1px solid ${theme.surfaceBorder}`,
                  borderRadius: theme.radiusSm,
                  opacity: s,
                  transform: `translateX(${interpolate(s, [0, 1], [24, 0])}px)`,
                }}
              >
                <file.Icon size={32} color={file.color} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: theme.text, fontSize: 28, fontFamily: theme.fontMono, fontWeight: 500 }}>
                    {file.name}
                  </span>
                  <span style={{ color: theme.textMuted, fontSize: 20, fontFamily: theme.fontSans }}>
                    {file.platform}
                  </span>
                </div>
                <span style={{ color: theme.green, fontSize: 24, fontWeight: 700, marginLeft: "auto" }}>✓</span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "6%",
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "22px 48px",
          borderRadius: 40,
          backgroundColor: `${theme.brand3}0d`,
          border: `1px solid ${theme.brand3}20`,
          opacity: loopOpacity,
          boxShadow: theme.cardGlow,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.green,
            boxShadow: `0 0 ${10 + loopPulse * 6}px ${theme.green}60`,
          }}
        />
        <GitHubIcon size={28} color={theme.textSecondary} />
        <span style={{ color: theme.text, fontSize: 34, fontFamily: theme.fontSans, fontWeight: 600 }}>
          Every push. Every branch. Always in sync.
        </span>
      </div>
    </AbsoluteFill>
  );
};
