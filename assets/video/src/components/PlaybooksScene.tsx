import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { SkillsShIcon, AwesomeIcon, OpenSkillsIcon } from "./ToolIcons";

const buildSteps = [
  { frame: 20,  icon: "🔍", text: "Scanning Skills.sh registry...", color: theme.brand1, phase: "scan" },
  { frame: 32,  icon: "🔍", text: "Scanning Awesome Claude Code...", color: theme.brand2, phase: "scan" },
  { frame: 44,  icon: "🔍", text: "Scanning SkillsBench...", color: theme.green, phase: "scan" },
  { frame: 58,  icon: "⚡", text: "Installed skill: add-api-route", color: theme.brand3, phase: "skill" },
  { frame: 68,  icon: "⚡", text: "Installed skill: drizzle-migrate", color: theme.brand3, phase: "skill" },
  { frame: 78,  icon: "⚡", text: "Installed skill: auth-middleware", color: theme.brand3, phase: "skill" },
  { frame: 88,  icon: "⚡", text: "Installed skill: test-patterns", color: theme.brand3, phase: "skill" },
  { frame: 102, icon: "📝", text: "Generated CLAUDE.md — 847 lines", color: theme.accent, phase: "config" },
  { frame: 115, icon: "📝", text: "Generated .cursor/rules/ — 12 files", color: theme.accent, phase: "config" },
  { frame: 128, icon: "📝", text: "Generated AGENTS.md + copilot-instructions", color: theme.accent, phase: "config" },
  { frame: 140, icon: "🔌", text: "Added MCP: context7 — docs lookup", color: "#c4b5fd", phase: "mcp" },
  { frame: 152, icon: "🔌", text: "Added MCP: postgres — database tools", color: "#c4b5fd", phase: "mcp" },
  { frame: 168, icon: "🧠", text: "Created CALIBER_LEARNINGS.md — memory", color: theme.green, phase: "learn" },
  { frame: 182, icon: "🧠", text: "Indexed 14 sessions → patterns extracted", color: theme.green, phase: "learn" },
  { frame: 195, icon: "✓",  text: "Setup complete — 94/100 Grade A", color: theme.green, phase: "done" },
];

const fileTree = [
  { name: "CLAUDE.md", indent: 0, appearsAt: 102, status: "new" },
  { name: ".cursor/", indent: 0, appearsAt: 115, status: "dir" },
  { name: "rules/", indent: 1, appearsAt: 115, status: "dir" },
  { name: "api-patterns.mdc", indent: 2, appearsAt: 117, status: "new" },
  { name: "testing.mdc", indent: 2, appearsAt: 119, status: "new" },
  { name: "security.mdc", indent: 2, appearsAt: 121, status: "new" },
  { name: "AGENTS.md", indent: 0, appearsAt: 128, status: "new" },
  { name: "copilot-instructions.md", indent: 0, appearsAt: 130, status: "new" },
  { name: ".claude/", indent: 0, appearsAt: 140, status: "dir" },
  { name: "settings.local.json", indent: 1, appearsAt: 142, status: "mcp" },
  { name: "CALIBER_LEARNINGS.md", indent: 0, appearsAt: 168, status: "learn" },
];

const registries = [
  { name: "Skills.sh", Icon: SkillsShIcon, color: theme.brand1 },
  { name: "Awesome Claude Code", Icon: AwesomeIcon, color: theme.brand2 },
  { name: "SkillsBench", Icon: OpenSkillsIcon, color: theme.green },
];

export const PlaybooksScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const cursorVisible = Math.floor(frame / 12) % 2 === 0;

  const scrollOffset = frame > 120
    ? interpolate(frame, [120, 195], [0, -220], { extrapolateRight: "clamp" })
    : 0;

  const phaseLabel = frame < 55 ? "Scanning registries..."
    : frame < 98 ? "Installing skills..."
    : frame < 138 ? "Generating configs..."
    : frame < 165 ? "Configuring MCPs..."
    : frame < 195 ? "Building persistent memory..."
    : "Setup complete!";

  const phaseLabelOpacity = interpolate(frame, [16, 24], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: 40,
        background: `radial-gradient(ellipse 50% 40% at 40% 50%, ${theme.brand3}06, transparent)`,
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
        Best playbooks, generated for your codebase
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 24, opacity: headerOpacity }}>
        {registries.map((reg, i) => {
          const s = spring({ frame: frame - 4 - i * 3, fps, config: { damping: 14, stiffness: 90 } });
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
                opacity: s,
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
            <div
              style={{
                width: 12,
                height: 24,
                backgroundColor: theme.brand3,
                opacity: cursorVisible ? 1 : 0,
                marginLeft: 4,
              }}
            />
          </div>

          <div style={{ padding: "20px 26px", overflow: "hidden", height: 520 }}>
            <div
              style={{
                fontSize: 20,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                marginBottom: 14,
                opacity: phaseLabelOpacity,
                fontWeight: 600,
              }}
            >
              {phaseLabel}
            </div>

            <div style={{ transform: `translateY(${scrollOffset}px)` }}>
              {buildSteps.map((step, i) => {
                const stepOpacity = interpolate(frame, [step.frame, step.frame + 6], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const stepX = interpolate(frame, [step.frame, step.frame + 8], [-14, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                const charCount = step.text.length;
                const typedChars = Math.round(
                  interpolate(frame, [step.frame, step.frame + Math.min(charCount * 0.4, 12)], [0, charCount], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                );
                const displayText = step.text.substring(0, typedChars);

                const checkOpacity = interpolate(frame, [step.frame + 10, step.frame + 14], [0, 1], {
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
                      transform: `translateX(${stepX}px)`,
                      fontFamily: theme.fontMono,
                      fontSize: 22,
                      lineHeight: 1.7,
                    }}
                  >
                    <span style={{ width: 28, textAlign: "center", fontSize: 20 }}>{step.icon}</span>
                    <span style={{ color: step.color }}>{displayText}</span>
                    {step.phase !== "done" && (
                      <span style={{ color: theme.green, opacity: checkOpacity, fontWeight: 700, fontSize: 20 }}>✓</span>
                    )}
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
              const fileOpacity = interpolate(frame, [file.appearsAt, file.appearsAt + 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const fileX = interpolate(frame, [file.appearsAt, file.appearsAt + 8], [12, 0], {
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
                    transform: `translateX(${fileX}px)`,
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
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "3%",
          display: "flex",
          alignItems: "center",
          gap: 28,
          opacity: interpolate(frame, [200, 215], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {[
          { label: "4 Skills", color: theme.brand3 },
          { label: "5 Config files", color: theme.accent },
          { label: "2 MCPs", color: "#c4b5fd" },
          { label: "Persistent memory", color: theme.green },
        ].map((item, i) => {
          const s = spring({ frame: frame - 200 - i * 4, fps, config: { damping: 14, stiffness: 80 } });
          return (
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
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [12, 0])}px)`,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: item.color,
                  boxShadow: `0 0 10px ${item.color}40`,
                }}
              />
              <span style={{ fontSize: 26, fontWeight: 600, fontFamily: theme.fontSans, color: item.color }}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
