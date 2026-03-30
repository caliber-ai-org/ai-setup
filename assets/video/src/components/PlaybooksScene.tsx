import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { SkillsShIcon, AwesomeIcon, OpenSkillsIcon, ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon } from "./ToolIcons";

// SVG icons for build steps (replaces emoji per ui-ux-pro-max rule: no-emoji-icons)
const SearchIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
    <path d="M16 16L21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const BoltIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill={color}>
    <path d="M13 2L4 14H12L11 22L20 10H12L13 2Z" />
  </svg>
);

const FileIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6C5.45 2 5 2.45 5 3V21C5 21.55 5.45 22 6 22H18C18.55 22 19 21.55 19 21V7L14 2Z" stroke={color} strokeWidth={1.5} />
    <path d="M14 2V7H19" stroke={color} strokeWidth={1.5} />
    <path d="M8 13H16M8 17H13" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

const PlugIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path d="M12 2V6M8 2V6M16 2V6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <rect x={6} y={6} width={12} height={8} rx={2} stroke={color} strokeWidth={1.5} />
    <path d="M10 14V18M14 14V18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M10 18H14" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const BrainIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path d="M12 2C8.5 2 6 4 6 7C4.5 7 3 8.5 3 10.5C3 12.5 4.5 14 6 14V20C6 21 7 22 8 22H16C17 22 18 21 18 20V14C19.5 14 21 12.5 21 10.5C21 8.5 19.5 7 18 7C18 4 15.5 2 12 2Z" stroke={color} strokeWidth={1.5} />
    <path d="M12 8V16M9 11H15" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

const CheckIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.5} fill={`${color}15`} />
    <path d="M8 12L11 15L16 9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Tree SVG icons
const FolderIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill={`${color}30`}>
    <path d="M3 6C3 4.9 3.9 4 5 4H9L11 6H19C20.1 6 21 6.9 21 8V18C21 19.1 20.1 20 19 20H5C3.9 20 3 19.1 3 18V6Z" stroke={color} strokeWidth={1.2} />
  </svg>
);

const DocIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke={color} strokeWidth={1.2} />
    <path d="M14 2V8H20" stroke={color} strokeWidth={1.2} />
  </svg>
);

type StepIconType = "search" | "bolt" | "file" | "plug" | "brain" | "check";

const stepIcons: Record<StepIconType, React.FC<{ color: string }>> = {
  search: SearchIcon,
  bolt: BoltIcon,
  file: FileIcon,
  plug: PlugIcon,
  brain: BrainIcon,
  check: CheckIcon,
};

const buildSteps: Array<{ frame: number; icon: StepIconType; text: string; color: string }> = [
  { frame: 20,  icon: "search", text: "Scanning registries...", color: theme.brand1 },
  { frame: 35,  icon: "bolt",   text: "Installed 4 skills from Skills.sh", color: theme.brand3 },
  { frame: 52,  icon: "file",   text: "Generated CLAUDE.md — 847 lines", color: theme.accent },
  { frame: 68,  icon: "file",   text: "Generated .cursor/rules/ — 12 files", color: theme.accent },
  { frame: 84,  icon: "file",   text: "Generated AGENTS.md + copilot-instructions", color: theme.accent },
  { frame: 100, icon: "plug",   text: "Added MCP: context7 — docs lookup", color: theme.purple },
  { frame: 115, icon: "plug",   text: "Added MCP: postgres — database tools", color: theme.purple },
  { frame: 132, icon: "brain",  text: "Created CALIBER_LEARNINGS.md", color: theme.green },
  { frame: 150, icon: "brain",  text: "Indexed 14 sessions — patterns extracted", color: theme.green },
  { frame: 170, icon: "check",  text: "Setup complete — 94/100 Grade A", color: theme.green },
];

type PlatformType = "claude" | "cursor" | "codex" | "copilot";

const fileTree: Array<{
  name: string;
  indent: number;
  appearsAt: number;
  status: string;
  platform: PlatformType | null;
}> = [
  { name: "CLAUDE.md", indent: 0, appearsAt: 52, status: "new", platform: "claude" },
  { name: ".cursor/", indent: 0, appearsAt: 68, status: "dir", platform: null },
  { name: "rules/", indent: 1, appearsAt: 68, status: "dir", platform: null },
  { name: "api-patterns.mdc", indent: 2, appearsAt: 70, status: "new", platform: "cursor" },
  { name: "testing.mdc", indent: 2, appearsAt: 74, status: "new", platform: "cursor" },
  { name: "security.mdc", indent: 2, appearsAt: 78, status: "new", platform: "cursor" },
  { name: "AGENTS.md", indent: 0, appearsAt: 84, status: "new", platform: "codex" },
  { name: "copilot-instructions.md", indent: 0, appearsAt: 88, status: "new", platform: "copilot" },
  { name: ".claude/", indent: 0, appearsAt: 100, status: "dir", platform: null },
  { name: "settings.local.json", indent: 1, appearsAt: 104, status: "mcp", platform: "claude" },
  { name: "CALIBER_LEARNINGS.md", indent: 0, appearsAt: 132, status: "learn", platform: null },
];

const registries = [
  { name: "Skills.sh", Icon: SkillsShIcon, color: theme.brand1 },
  { name: "Awesome Claude Code", Icon: AwesomeIcon, color: theme.brand2 },
  { name: "SkillsBench", Icon: OpenSkillsIcon, color: theme.green },
];

const platformIcons: Record<PlatformType, { Icon: React.FC<{ size?: number; color?: string }>; color: string }> = {
  claude: { Icon: ClaudeIcon, color: theme.brand2 },
  cursor: { Icon: CursorIcon, color: theme.accent },
  codex: { Icon: CodexIcon, color: theme.green },
  copilot: { Icon: CopilotIcon, color: theme.purple },
};

export const PlaybooksScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 60 },
  });
  const headerOpacity = interpolate(headerSpring, [0, 1], [0, 1]);

  const scrollOffset = frame > 90
    ? interpolate(frame, [90, 170], [0, -160], { extrapolateRight: "clamp" })
    : 0;

  const phaseLabel = frame < 32 ? "Scanning registries..."
    : frame < 50 ? "Installing skills..."
    : frame < 95 ? "Generating configs..."
    : frame < 128 ? "Configuring MCPs..."
    : frame < 165 ? "Building persistent memory..."
    : "Setup complete!";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: 40,
      }}
    >
      {/* Gradient title */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          fontFamily: theme.fontSans,
          opacity: headerOpacity,
          letterSpacing: "-0.02em",
          marginBottom: 12,
          background: `linear-gradient(135deg, ${theme.text} 0%, ${theme.brand1} 100%)`,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Best practices, generated for your codebase
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 24, opacity: headerOpacity }}>
        {registries.map((reg, i) => {
          const regSpring = spring({
            frame: frame - 4 - i * 3,
            fps,
            config: { damping: 14, stiffness: 100 },
          });
          return (
            <div
              key={reg.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 24px",
                borderRadius: 28,
                backgroundColor: `${reg.color}10`,
                border: `1px solid ${reg.color}20`,
                opacity: interpolate(regSpring, [0, 1], [0, 1]),
                transform: `scale(${regSpring})`,
              }}
            >
              <reg.Icon size={26} color={reg.color} />
              <span style={{ fontSize: 24, fontWeight: 500, fontFamily: theme.fontSans, color: reg.color }}>
                {reg.name}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 32, width: 1720, maxHeight: 680 }}>
        {/* Terminal build log */}
        <div
          style={{
            flex: 1,
            backgroundColor: theme.surface,
            border: `1px solid ${theme.surfaceBorder}`,
            borderRadius: 20,
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
            <span style={{ color: theme.textMuted, fontSize: 20, fontFamily: theme.fontMono, marginLeft: 14 }}>
              $ caliber init
            </span>
          </div>

          <div style={{ padding: "20px 26px", overflow: "hidden", height: 520 }}>
            <div
              style={{
                fontSize: 20,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                marginBottom: 14,
                fontWeight: 600,
                opacity: interpolate(frame, [16, 22], [0, 1], { extrapolateRight: "clamp" }),
              }}
            >
              {phaseLabel}
            </div>

            <div style={{ transform: `translateY(${scrollOffset}px)` }}>
              {buildSteps.map((step, i) => {
                const stepOpacity = interpolate(frame, [step.frame, step.frame + 5], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const StepIcon = stepIcons[step.icon];

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 8,
                      opacity: stepOpacity,
                      fontFamily: theme.fontMono,
                      fontSize: 22,
                      lineHeight: 1.7,
                    }}
                  >
                    <span style={{ width: 28, display: "flex", justifyContent: "center" }}>
                      <StepIcon color={step.color} />
                    </span>
                    <span style={{ color: step.color }}>{step.text}</span>
                    <span
                      style={{
                        opacity: interpolate(frame, [step.frame + 6, step.frame + 10], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }),
                      }}
                    >
                      <CheckIcon color={theme.green} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* File tree */}
        <div
          style={{
            width: 540,
            backgroundColor: theme.surface,
            border: `1px solid ${theme.surfaceBorder}`,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: theme.cardGlow,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 22px",
              backgroundColor: theme.surfaceHeader,
              borderBottom: `1px solid ${theme.surfaceBorder}`,
            }}
          >
            <span style={{ color: theme.textMuted, fontSize: 20, fontFamily: theme.fontMono }}>
              Generated Files
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 18,
                fontFamily: theme.fontMono,
                color: theme.brand3,
                fontWeight: 600,
              }}
            >
              {fileTree.filter(f => frame >= f.appearsAt && f.status !== "dir").length} files
            </span>
          </div>

          <div style={{ padding: "16px 22px" }}>
            {fileTree.map((file, i) => {
              const fileOpacity = interpolate(frame, [file.appearsAt, file.appearsAt + 5], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              const isDir = file.status === "dir";
              const statusColor = file.status === "new" ? theme.green
                : file.status === "mcp" ? theme.purple
                : file.status === "learn" ? theme.brand2
                : theme.textMuted;

              const statusBadge = file.status === "new" ? "NEW"
                : file.status === "mcp" ? "MCP"
                : file.status === "learn" ? "MEMORY"
                : null;

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    paddingLeft: file.indent * 24,
                    marginBottom: 6,
                    opacity: fileOpacity,
                    fontFamily: theme.fontMono,
                    fontSize: 20,
                    lineHeight: 1.8,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>
                    {isDir
                      ? <FolderIcon color={theme.brand1} />
                      : <DocIcon color={theme.textSecondary} />
                    }
                  </span>
                  <span style={{ color: isDir ? theme.brand1 : theme.text, fontWeight: isDir ? 600 : 400 }}>
                    {file.name}
                  </span>
                  {statusBadge && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 14,
                        fontWeight: 700,
                        padding: "3px 12px",
                        borderRadius: 14,
                        backgroundColor: `${statusColor}12`,
                        color: statusColor,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {statusBadge}
                    </span>
                  )}
                  {file.platform && (
                    <span style={{ marginLeft: statusBadge ? 8 : "auto", opacity: 0.7, display: "flex" }}>
                      {(() => {
                        const p = platformIcons[file.platform];
                        return <p.Icon size={16} color={p.color} />;
                      })()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Platform row */}
      <div
        style={{
          position: "absolute",
          bottom: "3%",
          display: "flex",
          alignItems: "center",
          gap: 32,
          opacity: interpolate(frame, [178, 192], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {(["claude", "cursor", "codex", "copilot"] as const).map((key) => {
          const p = platformIcons[key];
          const labels: Record<PlatformType, string> = {
            claude: "Claude Code",
            cursor: "Cursor",
            codex: "Codex",
            copilot: "Copilot",
          };
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 28px",
                borderRadius: 32,
                backgroundColor: `${p.color}08`,
                border: `1px solid ${p.color}18`,
              }}
            >
              <p.Icon size={24} color={p.color} />
              <span style={{ fontSize: 26, fontWeight: 600, fontFamily: theme.fontSans, color: p.color }}>
                {labels[key]}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
