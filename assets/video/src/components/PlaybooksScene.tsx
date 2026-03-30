import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "./theme";
import { SkillsShIcon, AwesomeIcon, OpenSkillsIcon, ClaudeIcon, CursorIcon, CodexIcon, CopilotIcon } from "./ToolIcons";

const buildSteps = [
  { frame: 20,  icon: "\uD83D\uDD0D", text: "Scanning registries...", color: theme.brand1 },
  { frame: 35,  icon: "\u26A1", text: "Installed 4 skills from Skills.sh", color: theme.brand3 },
  { frame: 52,  icon: "\uD83D\uDCDD", text: "Generated CLAUDE.md — 847 lines", color: theme.accent },
  { frame: 68,  icon: "\uD83D\uDCDD", text: "Generated .cursor/rules/ — 12 files", color: theme.accent },
  { frame: 84,  icon: "\uD83D\uDCDD", text: "Generated AGENTS.md + copilot-instructions", color: theme.accent },
  { frame: 100, icon: "\uD83D\uDD0C", text: "Added MCP: context7 — docs lookup", color: theme.purple },
  { frame: 115, icon: "\uD83D\uDD0C", text: "Added MCP: postgres — database tools", color: theme.purple },
  { frame: 132, icon: "\uD83E\uDDE0", text: "Created CALIBER_LEARNINGS.md", color: theme.green },
  { frame: 150, icon: "\uD83E\uDDE0", text: "Indexed 14 sessions — patterns extracted", color: theme.green },
  { frame: 170, icon: "\u2713",  text: "Setup complete — 94/100 Grade A", color: theme.green },
];

const fileTree = [
  { name: "CLAUDE.md", indent: 0, appearsAt: 52, status: "new", platform: "claude" as const },
  { name: ".cursor/", indent: 0, appearsAt: 68, status: "dir", platform: null },
  { name: "rules/", indent: 1, appearsAt: 68, status: "dir", platform: null },
  { name: "api-patterns.mdc", indent: 2, appearsAt: 70, status: "new", platform: "cursor" as const },
  { name: "testing.mdc", indent: 2, appearsAt: 74, status: "new", platform: "cursor" as const },
  { name: "security.mdc", indent: 2, appearsAt: 78, status: "new", platform: "cursor" as const },
  { name: "AGENTS.md", indent: 0, appearsAt: 84, status: "new", platform: "codex" as const },
  { name: "copilot-instructions.md", indent: 0, appearsAt: 88, status: "new", platform: "copilot" as const },
  { name: ".claude/", indent: 0, appearsAt: 100, status: "dir", platform: null },
  { name: "settings.local.json", indent: 1, appearsAt: 104, status: "mcp", platform: "claude" as const },
  { name: "CALIBER_LEARNINGS.md", indent: 0, appearsAt: 132, status: "learn", platform: null },
];

const registries = [
  { name: "Skills.sh", Icon: SkillsShIcon, color: theme.brand1 },
  { name: "Awesome Claude Code", Icon: AwesomeIcon, color: theme.brand2 },
  { name: "SkillsBench", Icon: OpenSkillsIcon, color: theme.green },
];

export const PlaybooksScene: React.FC = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

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
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          fontFamily: theme.fontSans,
          color: theme.text,
          opacity: headerOpacity,
          letterSpacing: "-0.02em",
          marginBottom: 12,
        }}
      >
        Best practices, generated for your codebase
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 24, opacity: headerOpacity }}>
        {registries.map((reg, i) => {
          const opacity = interpolate(frame, [4 + i * 3, 10 + i * 3], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
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
                backgroundColor: `${reg.color}12`,
                border: `1px solid ${reg.color}25`,
                opacity,
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
                    <span style={{ width: 28, textAlign: "center", fontSize: 20 }}>{step.icon}</span>
                    <span style={{ color: step.color }}>{step.text}</span>
                    <span
                      style={{
                        color: theme.green,
                        fontWeight: 700,
                        fontSize: 20,
                        opacity: interpolate(frame, [step.frame + 6, step.frame + 10], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }),
                      }}
                    >
                      ✓
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
                : file.status === "mcp" ? "#c4b5fd"
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
                  <span style={{ color: isDir ? theme.brand1 : theme.textSecondary, fontSize: 18 }}>
                    {isDir ? "📁" : "📄"}
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
                        backgroundColor: `${statusColor}15`,
                        color: statusColor,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {statusBadge}
                    </span>
                  )}
                  {file.platform && (
                    <span style={{ marginLeft: file.status === "dir" ? "auto" : 8, opacity: 0.7 }}>
                      {file.platform === "claude" && <ClaudeIcon size={16} color={theme.brand2} />}
                      {file.platform === "cursor" && <CursorIcon size={16} color={theme.accent} />}
                      {file.platform === "codex" && <CodexIcon size={16} color={theme.green} />}
                      {file.platform === "copilot" && <CopilotIcon size={16} color={theme.purple} />}
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
        {[
          { label: "Claude Code", Icon: ClaudeIcon, color: theme.brand2 },
          { label: "Cursor", Icon: CursorIcon, color: theme.accent },
          { label: "Codex", Icon: CodexIcon, color: theme.green },
          { label: "Copilot", Icon: CopilotIcon, color: theme.purple },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 28px",
              borderRadius: 32,
              backgroundColor: `${item.color}10`,
              border: `1px solid ${item.color}22`,
            }}
          >
            <item.Icon size={24} color={item.color} />
            <span style={{ fontSize: 26, fontWeight: 600, fontFamily: theme.fontSans, color: item.color }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
