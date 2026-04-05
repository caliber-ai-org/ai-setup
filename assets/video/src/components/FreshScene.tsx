import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "./theme";
import { sceneT } from "../sceneSpeed";

// Scene 4: "Stays Fresh" (frame range in CaliberDemo)
// Animation: opacity fades + width interpolation for divider. No springs.

// Redis logo — simplified diamond shape
const RedisLogo: React.FC<{ size: number; opacity?: number }> = ({ size, opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ opacity }}>
    <path
      d="M16 2L30 10V22L16 30L2 22V10L16 2Z"
      fill="rgba(248,113,113,0.15)"
      stroke="#f87171"
      strokeWidth={1.5}
    />
    <text
      x="16"
      y="19"
      textAnchor="middle"
      fill="#f87171"
      fontSize="11"
      fontWeight="700"
      fontFamily={theme.fontMono}
    >
      R
    </text>
  </svg>
);

// Aerospike logo — simplified A in hexagon
const AerospikeLogo: React.FC<{ size: number; opacity?: number }> = ({ size, opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ opacity }}>
    <path
      d="M16 2L30 10V22L16 30L2 22V10L16 2Z"
      fill="rgba(52,211,153,0.15)"
      stroke="#34d399"
      strokeWidth={1.5}
    />
    <text
      x="16"
      y="19"
      textAnchor="middle"
      fill="#34d399"
      fontSize="11"
      fontWeight="700"
      fontFamily={theme.fontMono}
    >
      A
    </text>
  </svg>
);

const diffLines = [
  { prefix: " ", text: "// services/cache/client.ts", color: theme.textMuted },
  { prefix: "-", text: "import Redis from 'ioredis'", color: theme.red },
  { prefix: "-", text: "const cache = new Redis(process.env.REDIS_URL)", color: theme.red },
  { prefix: "+", text: "import Aerospike from 'aerospike'", color: theme.green },
  { prefix: "+", text: "const cache = Aerospike.connect(config)", color: theme.green },
];

export const FreshScene: React.FC = () => {
  const t = sceneT(useCurrentFrame());

  const headlineOpacity = interpolate(t, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  const cardOpacity = interpolate(t, [14, 28], [0, 1], {
    extrapolateRight: "clamp",
  });

  const diffOpacity = interpolate(t, [24, 38], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Warning banner appears after the diff — shows why stale configs are dangerous
  const warningOpacity = interpolate(t, [44, 58], [0, 1], {
    extrapolateRight: "clamp",
  });

  const dividerWidth = interpolate(t, [64, 82], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const updatesOpacity = interpolate(t, [78, 92], [0, 1], {
    extrapolateRight: "clamp",
  });

  const pillsOpacity = interpolate(t, [100, 114], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
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
            marginTop: -12,
          }}
        >
          Configs that keep up.
        </div>

        {/* Migration visual: Redis → Aerospike with logos */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            opacity: cardOpacity,
          }}
        >
          {/* Redis — crossed out */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            <RedisLogo size={36} />
            <span
              style={{
                fontSize: 24,
                fontFamily: theme.fontMono,
                color: theme.red,
                fontWeight: 600,
              }}
            >
              Redis
            </span>
            {/* Strikethrough line */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: -4,
                right: -4,
                height: 2,
                backgroundColor: theme.red,
                opacity: 0.6,
              }}
            />
          </div>

          {/* Arrow */}
          <svg width={40} height={20} viewBox="0 0 40 20" fill="none">
            <path
              d="M0 10H32M26 4L34 10L26 16"
              stroke={theme.textMuted}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Aerospike — new */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AerospikeLogo size={36} />
            <span
              style={{
                fontSize: 24,
                fontFamily: theme.fontMono,
                color: theme.green,
                fontWeight: 600,
              }}
            >
              Aerospike
            </span>
          </div>
        </div>

        {/* Card with gradient top border */}
        <div
          style={{
            width: 860,
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

          {/* Top: Code changes — the migration diff */}
          <div style={{ padding: "24px 32px", opacity: diffOpacity }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontFamily: theme.fontMono,
                  color: theme.brand2,
                  fontWeight: 500,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                }}
              >
                Code changes
              </div>
              {/* Migration badge */}
              <div
                style={{
                  padding: "3px 12px",
                  borderRadius: 4,
                  backgroundColor: "rgba(248,113,113,0.1)",
                  border: `1px solid rgba(248,113,113,0.25)`,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontFamily: theme.fontMono,
                    color: theme.red,
                    fontWeight: 500,
                  }}
                >
                  Redis → Aerospike
                </span>
              </div>
            </div>
            <div
              style={{
                backgroundColor: theme.surfaceHeader,
                borderRadius: 8,
                padding: "14px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {diffLines.map((line) => (
                <div key={line.text} style={{ display: "flex", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 19,
                      fontFamily: theme.fontMono,
                      color: line.color,
                      fontWeight: 500,
                      width: 16,
                      textAlign: "center" as const,
                    }}
                  >
                    {line.prefix}
                  </span>
                  <span style={{ fontSize: 19, fontFamily: theme.fontMono, color: line.color }}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Warning: agent still references Redis patterns */}
          <div style={{ padding: "0 32px 20px", opacity: warningOpacity }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 20px",
                borderRadius: 8,
                backgroundColor: "rgba(248,113,113,0.06)",
                border: `1px solid rgba(248,113,113,0.15)`,
              }}
            >
              {/* Warning icon */}
              <svg width={22} height={22} viewBox="0 0 22 22" fill="none">
                <path
                  d="M11 2L1 20H21L11 2Z"
                  stroke={theme.yellow}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  fill={`${theme.yellow}15`}
                />
                <path
                  d="M11 9V13M11 16V16.5"
                  stroke={theme.yellow}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontSize: 17,
                    fontFamily: theme.fontMono,
                    color: theme.yellow,
                    fontWeight: 600,
                  }}
                >
                  Agent configs still reference Redis APIs
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontFamily: theme.fontMono,
                    color: theme.textMuted,
                  }}
                >
                  CLAUDE.md, .cursor/rules/ — outdated cache patterns
                </span>
              </div>
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

          {/* Bottom: Caliber auto-updates configs */}
          <div style={{ padding: "24px 32px", opacity: updatesOpacity }}>
            <div
              style={{
                fontSize: 18,
                fontFamily: theme.fontMono,
                color: theme.brand2,
                fontWeight: 500,
                marginBottom: 14,
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
              }}
            >
              Caliber auto-updates
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "CLAUDE.md — cache layer → Aerospike",
                ".cursor/rules/ — Redis patterns removed",
              ].map((text) => (
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
                      fontSize: 22,
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
