import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { Logo } from "./Logo";

// Visual flow: 1 dev on left → config files travel via git → 3 devs on right receive them
// Then transition to CTA

const AVATAR_SIZE = 72;
const SMALL_AVATAR = 56;

// Config file icons that "fly" across
const configFiles = [
  { name: "CLAUDE.md", color: theme.brand2, delay: 20 },
  { name: ".cursor/rules/", color: theme.accent, delay: 24 },
  { name: "AGENTS.md", color: theme.green, delay: 28 },
  { name: "MCPs", color: theme.purple, delay: 32 },
];

const DevAvatar: React.FC<{
  size: number;
  color: string;
  label: string;
  opacity: number;
  scale: number;
}> = ({ size, color, label, opacity, scale }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      opacity,
      transform: `scale(${scale})`,
    }}
  >
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.surface,
        border: `2px solid ${color}50`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <circle cx={12} cy={8} r={4} fill={`${color}40`} stroke={color} strokeWidth={1.5} />
        <path
          d="M4 20C4 17.24 7.58 15 12 15C16.42 15 20 17.24 20 20"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill={`${color}20`}
        />
      </svg>
    </div>
    <span
      style={{
        fontSize: 18,
        fontFamily: theme.fontMono,
        color,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  </div>
);

export const TeamCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isCTAPhase = frame >= 80;

  // Phase 1: Team flow (0-80)
  const titleSpring = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });
  const titleY = interpolate(titleSpring, [0, 1], [16, 0]);
  const titleOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  // Source dev appears
  const sourceScale = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 100 } });
  const sourceOpacity = interpolate(frame, [6, 14], [0, 1], { extrapolateRight: "clamp" });

  // Config files fly out
  const filesVisible = frame >= 18;

  // Receiver devs staggered
  const recv1 = spring({ frame: frame - 38, fps, config: { damping: 14, stiffness: 100 } });
  const recv2 = spring({ frame: frame - 42, fps, config: { damping: 14, stiffness: 100 } });
  const recv3 = spring({ frame: frame - 46, fps, config: { damping: 14, stiffness: 100 } });

  // Status text under receivers
  const statusOpacity = interpolate(frame, [52, 60], [0, 1], { extrapolateRight: "clamp" });

  // Benefit line
  const benefitOpacity = interpolate(frame, [58, 68], [0, 1], { extrapolateRight: "clamp" });

  // Phase transition
  const teamOpacity = interpolate(frame, [74, 84], [1, 0], { extrapolateRight: "clamp" });

  // CTA phase
  const ctaOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaScale = spring({ frame: frame - 82, fps, config: { damping: 18, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Phase 1: Team sync visualization */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 56,
          opacity: teamOpacity,
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            fontFamily: theme.fontSans,
            color: theme.text,
            letterSpacing: "-0.03em",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          One dev sets up. Everyone benefits.
        </div>

        {/* Flow diagram: Source → Files → Receivers */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            position: "relative",
            width: 1400,
            justifyContent: "center",
          }}
        >
          {/* Source dev (left) */}
          <div style={{ position: "relative", zIndex: 2 }}>
            <DevAvatar
              size={AVATAR_SIZE}
              color={theme.brand3}
              label="caliber init"
              opacity={sourceOpacity}
              scale={sourceScale}
            />
          </div>

          {/* Connection area with flying config files */}
          <div
            style={{
              flex: 1,
              position: "relative",
              height: 120,
              maxWidth: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Baseline connection line */}
            <div
              style={{
                position: "absolute",
                width: "100%",
                height: 1,
                backgroundColor: `${theme.surfaceBorder}`,
                opacity: interpolate(frame, [16, 22], [0, 0.5], { extrapolateRight: "clamp" }),
              }}
            />

            {/* "git push" label on the line */}
            <div
              style={{
                position: "absolute",
                top: -28,
                padding: "4px 16px",
                borderRadius: 12,
                backgroundColor: theme.surface,
                border: `1px solid ${theme.surfaceBorder}`,
                opacity: interpolate(frame, [16, 24], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              <span style={{ fontSize: 16, fontFamily: theme.fontMono, color: theme.textMuted }}>
                git push
              </span>
            </div>

            {/* Flying config file pills */}
            {filesVisible &&
              configFiles.map((file) => {
                // Each file animates from left (0%) to right (100%) of the connection area
                const fileProgress = interpolate(frame, [file.delay, file.delay + 14], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const fileOpacity = interpolate(
                  frame,
                  [file.delay, file.delay + 3, file.delay + 11, file.delay + 14],
                  [0, 1, 1, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                const xPos = interpolate(fileProgress, [0, 1], [-40, 640]);
                const yOffset = configFiles.indexOf(file) * 2 - 3; // slight vertical spread

                return (
                  <div
                    key={file.name}
                    style={{
                      position: "absolute",
                      left: 60,
                      top: "50%",
                      transform: `translateX(${xPos}px) translateY(${yOffset + -12}px)`,
                      opacity: fileOpacity,
                      padding: "6px 18px",
                      borderRadius: 16,
                      backgroundColor: `${file.color}12`,
                      border: `1px solid ${file.color}25`,
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18,
                        fontFamily: theme.fontMono,
                        color: file.color,
                        fontWeight: 500,
                      }}
                    >
                      {file.name}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Receiver devs (right, stacked) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, zIndex: 2 }}>
            {[
              { color: theme.accent, scale: recv1, label: "Dev 2" },
              { color: theme.green, scale: recv2, label: "Dev 3" },
              { color: theme.purple, scale: recv3, label: "Dev 4" },
            ].map((dev) => (
              <DevAvatar
                key={dev.label}
                size={SMALL_AVATAR}
                color={dev.color}
                label={dev.label}
                opacity={interpolate(dev.scale, [0, 1], [0, 1])}
                scale={dev.scale}
              />
            ))}
          </div>
        </div>

        {/* Status: "Same setup. Zero config." appearing under the flow */}
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
              fontSize: 32,
              fontFamily: theme.fontSans,
              color: theme.textSecondary,
              fontWeight: 500,
              opacity: statusOpacity,
            }}
          >
            Clone, code — same setup, every time.
          </div>

          {/* Benefit pills */}
          <div
            style={{
              display: "flex",
              gap: 20,
              opacity: benefitOpacity,
            }}
          >
            {[
              "Git-native — no sync server",
              "Auto-fresh on every pull",
              "Works from day one",
            ].map((text) => (
              <div
                key={text}
                style={{
                  padding: "10px 24px",
                  borderRadius: 24,
                  border: `1px solid ${theme.surfaceBorder}`,
                  backgroundColor: theme.surface,
                }}
              >
                <span style={{ fontSize: 22, fontFamily: theme.fontSans, color: theme.textSecondary, fontWeight: 500 }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
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
            transform: `scale(${ctaScale})`,
          }}
        >
          <Logo size={1.1} animate delay={82} />

          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.03em",
              marginTop: 12,
            }}
          >
            AI setup tailored for your codebase.
          </div>

          <div
            style={{
              fontSize: 28,
              fontFamily: theme.fontSans,
              color: theme.textMuted,
              opacity: interpolate(frame, [94, 106], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Scores your AI setup. Generates what's missing. Syncs to your team via git.
          </div>

          <div
            style={{
              padding: "20px 48px",
              borderRadius: 14,
              backgroundColor: theme.surface,
              border: `1px solid ${theme.surfaceBorder}`,
              opacity: interpolate(frame, [104, 116], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <span style={{ fontSize: 28, fontFamily: theme.fontMono, color: theme.textMuted }}>{"$ "}</span>
            <span style={{ fontSize: 28, fontFamily: theme.fontMono, color: theme.text }}>
              npx @rely-ai/caliber init
            </span>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
