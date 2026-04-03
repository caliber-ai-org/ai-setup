import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "./theme";

// Scene 3: "Stays Fresh" (10-14s, 120 frames)
// Animation: opacity fades + width interpolation for divider. No springs.

const diffLines = [
  { prefix: " ", text: "// api/src/routes/auth.ts", color: theme.textMuted },
  { prefix: "-", text: 'app.use(expressSession({ store: redis }))', color: theme.red },
  { prefix: "+", text: "app.use(lucia({ adapter: drizzleAdapter }))", color: theme.green },
  { prefix: "+", text: '// migrated from Redis sessions → Lucia Auth', color: theme.green },
];

export const FreshScene: React.FC = () => {
  const frame = useCurrentFrame();

  const headlineOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const cardOpacity = interpolate(frame, [10, 22], [0, 1], {
    extrapolateRight: "clamp",
  });

  const diffOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  const dividerWidth = interpolate(frame, [36, 52], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const updatesOpacity = interpolate(frame, [48, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  const pillsOpacity = interpolate(frame, [66, 78], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        {/* LP section label */}
        <div
          style={{
            fontSize: 22,
            fontFamily: theme.fontMono,
            color: theme.brand2,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            opacity: headlineOpacity,
          }}
        >
          STAYS FRESH
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            fontFamily: theme.fontSans,
            color: theme.text,
            letterSpacing: "-0.03em",
            opacity: headlineOpacity,
            marginTop: -16,
          }}
        >
          Configs that keep up.
        </div>

        {/* Card with gradient top border */}
        <div
          style={{
            width: 800,
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.surfaceBorder}`,
            borderRadius: 16,
            overflow: "hidden",
            opacity: cardOpacity,
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

          {/* Top: Code changes */}
          <div style={{ padding: "28px 32px", opacity: diffOpacity }}>
            <div
              style={{
                fontSize: 18,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                fontWeight: 500,
                marginBottom: 16,
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
              }}
            >
              Code changes
            </div>
            <div
              style={{
                backgroundColor: theme.surfaceHeader,
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {diffLines.map((line) => (
                <div key={line.text} style={{ display: "flex", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 20,
                      fontFamily: theme.fontMono,
                      color: line.color,
                      fontWeight: 500,
                      width: 16,
                      textAlign: "center" as const,
                    }}
                  >
                    {line.prefix}
                  </span>
                  <span style={{ fontSize: 20, fontFamily: theme.fontMono, color: line.color }}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", justifyContent: "center", padding: "0 32px" }}>
            <div
              style={{
                height: 2,
                width: `${dividerWidth}%`,
                backgroundColor: theme.brand3,
                borderRadius: 1,
              }}
            />
          </div>

          {/* Bottom: Configs update */}
          <div style={{ padding: "28px 32px", opacity: updatesOpacity }}>
            <div
              style={{
                fontSize: 18,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                fontWeight: 500,
                marginBottom: 16,
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
              }}
            >
              Configs update
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["CLAUDE.md — auth stack updated", ".cursor/rules/ — session patterns fixed"].map((text) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                    <circle cx={10} cy={10} r={9} stroke={theme.green} strokeWidth={1.5} opacity={0.4} />
                    <path
                      d="M6 10L9 13L14 7"
                      stroke={theme.green}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: 24,
                      fontFamily: theme.fontMono,
                      color: theme.text,
                      fontWeight: 500,
                    }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Command pills — LP badge style */}
        <div style={{ display: "flex", gap: 20, opacity: pillsOpacity }}>
          {["caliber refresh", "caliber learn"].map((cmd) => (
            <div
              key={cmd}
              style={{
                padding: "10px 24px",
                borderRadius: 6,
                backgroundColor: "rgba(249,115,22,0.1)",
              }}
            >
              <span style={{ fontSize: 20, fontFamily: theme.fontMono, color: theme.brand2 }}>
                {cmd}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
