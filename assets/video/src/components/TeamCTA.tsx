import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "./theme";
import { Logo } from "./Logo";
import { ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon } from "./ToolIcons";

// Scene 5: "Team + CTA" (764-901 in CaliberDemo, 138 frames)
// Phase A (0-80): The story — first dev creates configs, team gets them via git
// Phase B (80-138): CTA
// Animation: opacity fades only. Springs only for Logo.

const Avatar: React.FC<{ size: number; color: string; label?: string }> = ({
  size,
  color,
  label,
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.cardBg,
        border: `2px solid ${color}50`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none">
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
    {label && (
      <span style={{ fontSize: 18, fontFamily: theme.fontMono, color, fontWeight: 500 }}>
        {label}
      </span>
    )}
  </div>
);

// Config file badges that appear next to each team member
const configFiles = [
  { name: "CLAUDE.md", color: theme.brand2 },
  { name: ".cursor/rules/", color: theme.accent },
  { name: "AGENTS.md", color: theme.green },
];

export const TeamCTA: React.FC = () => {
  const frame = useCurrentFrame();

  const isCTAPhase = frame >= 80;

  // Phase A timing
  const teamOpacity = interpolate(frame, [0, 15, 72, 84], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Step 1: First dev + "caliber init" (frames 0-15)
  const step1Opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Step 2: Config files appear in repo column (frames 16-28)
  const filesOpacity = interpolate(frame, [16, 28], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Step 3: Arrow from repo to team (frames 28-38)
  const arrowOpacity = interpolate(frame, [28, 38], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Step 4: Team members appear with their own config badges (frames 36-54)
  const team1Opacity = interpolate(frame, [36, 44], [0, 1], { extrapolateRight: "clamp" });
  const team2Opacity = interpolate(frame, [42, 50], [0, 1], { extrapolateRight: "clamp" });
  const team3Opacity = interpolate(frame, [48, 56], [0, 1], { extrapolateRight: "clamp" });

  // Step 5: "Ready" checkmarks next to each team member (frames 54-66)
  const checksOpacity = interpolate(frame, [54, 66], [0, 1], { extrapolateRight: "clamp" });

  // Phase B
  const ctaOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const commandOpacity = interpolate(frame, [98, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const platformsOpacity = interpolate(frame, [108, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const teamMembers = [
    { color: theme.accent, name: "Dev 2", opacity: team1Opacity },
    { color: theme.green, name: "Dev 3", opacity: team2Opacity },
    { color: theme.purple, name: "Dev 4", opacity: team3Opacity },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Phase A: Team sync story */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          opacity: teamOpacity,
        }}
      >
        {/* Section label + headline */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontSize: 22,
              fontFamily: theme.fontMono,
              color: theme.brand2,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
          >
            TEAM SYNC
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.03em",
            }}
          >
            One dev sets up. Everyone benefits.
          </div>
        </div>

        {/* 3-column flow: First Dev → Repo → Team */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            width: 1400,
            justifyContent: "center",
          }}
        >
          {/* Column 1: First dev */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              opacity: step1Opacity,
              width: 200,
            }}
          >
            <Avatar size={72} color={theme.brand3} label="First dev" />
            <div
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                backgroundColor: "rgba(249,115,22,0.1)",
              }}
            >
              <span style={{ fontSize: 20, fontFamily: theme.fontMono, color: theme.brand2 }}>
                caliber init
              </span>
            </div>
          </div>

          {/* Arrow 1: dev → repo */}
          <div style={{ opacity: filesOpacity, padding: "0 16px" }}>
            <svg width={60} height={24} viewBox="0 0 60 24" fill="none">
              <path
                d="M0 12H50M44 6L52 12L44 18"
                stroke={theme.brand3}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.5}
              />
            </svg>
          </div>

          {/* Column 2: Git repo with config files */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              opacity: filesOpacity,
              width: 340,
            }}
          >
            {/* Repo card */}
            <div
              style={{
                backgroundColor: theme.cardBg,
                border: `1px solid ${theme.surfaceBorder}`,
                borderRadius: 12,
                padding: "20px 28px",
                width: "100%",
                position: "relative",
              }}
            >
              {/* Gradient top border */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: theme.gradientBorder,
                }}
              />

              {/* Repo header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z"
                    stroke={theme.textMuted}
                    strokeWidth={1.5}
                    fill={`${theme.textMuted}20`}
                  />
                </svg>
                <span
                  style={{
                    fontSize: 18,
                    fontFamily: theme.fontMono,
                    color: theme.textMuted,
                    fontWeight: 500,
                  }}
                >
                  your-repo/
                </span>
              </div>

              {/* Config files list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {configFiles.map((file) => (
                  <div key={file.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                      <rect
                        x={2}
                        y={1}
                        width={12}
                        height={14}
                        rx={2}
                        stroke={file.color}
                        strokeWidth={1.2}
                        fill={`${file.color}15`}
                      />
                      <path d="M5 5H11M5 8H9" stroke={file.color} strokeWidth={1} opacity={0.6} />
                    </svg>
                    <span
                      style={{
                        fontSize: 20,
                        fontFamily: theme.fontMono,
                        color: file.color,
                        fontWeight: 500,
                      }}
                    >
                      {file.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <span
              style={{
                fontSize: 16,
                fontFamily: theme.fontMono,
                color: theme.textMuted,
                opacity: 0.6,
              }}
            >
              committed to git
            </span>
          </div>

          {/* Arrow 2: repo → team */}
          <div style={{ opacity: arrowOpacity, padding: "0 16px" }}>
            <svg width={60} height={24} viewBox="0 0 60 24" fill="none">
              <path
                d="M0 12H50M44 6L52 12L44 18"
                stroke={theme.brand3}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.5}
              />
            </svg>
          </div>

          {/* Column 3: Team members */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              width: 360,
            }}
          >
            {teamMembers.map((member) => (
              <div
                key={member.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  opacity: member.opacity,
                }}
              >
                <Avatar size={52} color={member.color} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 20,
                      fontFamily: theme.fontSans,
                      color: theme.text,
                      fontWeight: 500,
                    }}
                  >
                    {member.name}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontFamily: theme.fontMono,
                      color: theme.textMuted,
                    }}
                  >
                    git clone → full setup
                  </span>
                </div>
                {/* Ready checkmark */}
                <div style={{ marginLeft: "auto", opacity: checksOpacity }}>
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                    <circle
                      cx={12}
                      cy={12}
                      r={10}
                      stroke={theme.green}
                      strokeWidth={1.5}
                      fill={`${theme.green}15`}
                    />
                    <path
                      d="M8 12L11 15L16 9"
                      stroke={theme.green}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            fontSize: 28,
            fontFamily: theme.fontSans,
            color: theme.textMuted,
            fontWeight: 400,
            opacity: checksOpacity,
          }}
        >
          Clone, code — same setup, every time.
        </div>
      </div>

      {/* Phase B: CTA */}
      {isCTAPhase && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            opacity: ctaOpacity,
          }}
        >
          <Logo size={1.2} animate delay={82} />

          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.03em",
              marginTop: 8,
            }}
          >
            caliber
          </div>

          <div
            style={{
              fontSize: 28,
              fontFamily: theme.fontSans,
              color: theme.textMuted,
              fontWeight: 400,
            }}
          >
            AI setup tailored for your codebase.
          </div>

          <div
            style={{
              padding: "18px 44px",
              borderRadius: 8,
              backgroundColor: theme.cardBg,
              border: "1px solid rgba(249,115,22,0.3)",
              boxShadow: theme.cardGlowStrong,
              opacity: commandOpacity,
            }}
          >
            <span style={{ fontSize: 26, fontFamily: theme.fontMono, color: theme.textMuted }}>
              {"$ "}
            </span>
            <span style={{ fontSize: 26, fontFamily: theme.fontMono, color: theme.text }}>
              npm install -g @rely-ai/caliber
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 40,
              alignItems: "center",
              opacity: platformsOpacity,
            }}
          >
            {[
              { Icon: ClaudeIcon, label: "Claude Code", color: theme.brand2 },
              { Icon: CursorIcon, label: "Cursor", color: theme.accent },
              { Icon: CodexIcon, label: "Codex", color: theme.green },
              { Icon: CopilotIcon, label: "Copilot", color: theme.purple },
            ].map((p) => (
              <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p.Icon size={22} color={p.color} />
                <span
                  style={{
                    fontSize: 22,
                    fontFamily: theme.fontSans,
                    color: p.color,
                    fontWeight: 500,
                  }}
                >
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
