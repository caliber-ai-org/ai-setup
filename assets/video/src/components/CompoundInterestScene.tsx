import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { sceneT } from "../sceneSpeed";
import compoundInfographicSrc from "../media/claude-md-compound-interest.png";

const IMG_NATURAL_W = 1024;
const IMG_NATURAL_H = 765;
const IMG_DISPLAY_W = 860;
const IMG_DISPLAY_H = Math.round((IMG_DISPLAY_W * IMG_NATURAL_H) / IMG_NATURAL_W);

// Side-by-side layout: copy + bundled infographic (readable at README scale)

export const CompoundInterestScene: React.FC = () => {
  const { fps } = useVideoConfig();
  const t = sceneT(useCurrentFrame());

  const entrance = spring({
    frame: t - 5,
    fps,
    config: { damping: 16, stiffness: 58 },
  });

  const cardScale = interpolate(entrance, [0, 1], [0.84, 1]);
  const cardLift = interpolate(entrance, [0, 1], [40, 0]);
  const cardRotate = interpolate(entrance, [0, 1], [-1.8, 0]);

  const labelOpacity = interpolate(t, [10, 26], [0, 1], {
    extrapolateRight: "clamp",
  });

  const sublabelOpacity = interpolate(t, [22, 38], [0, 1], {
    extrapolateRight: "clamp",
  });

  const float = Math.sin(t * 0.055) * 2;
  const kenBurns = interpolate(t, [0, 175], [1, 1.022], {
    extrapolateRight: "clamp",
  });

  const rimPulse = 0.35 + Math.sin(t * 0.09) * 0.08;

  const combinedScale = cardScale * kenBurns;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 90% 80% at 50% 48%, transparent 0%, rgba(9,9,11,0.35) 55%, rgba(9,9,11,0.9) 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: "88%",
          height: "75%",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(ellipse at 58% 45%, rgba(251,146,60,${0.12 + rimPulse * 0.05}) 0%, rgba(125,211,252,0.05) 40%, transparent 65%)`,
          filter: "blur(2px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 52,
          padding: "0 56px",
          transform: `translateY(${cardLift + float}px)`,
        }}
      >
        <div
          style={{
            flex: "0 0 520px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 16,
            opacity: labelOpacity,
          }}
        >
          <div
            style={{
              fontSize: 19,
              fontFamily: theme.fontMono,
              color: theme.brand2,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
            }}
          >
            Context compounds
          </div>
          <div
            style={{
              fontSize: 46,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.12,
            }}
          >
            Great memory beats
            <br />a bigger model
          </div>
          <div
            style={{
              fontSize: 22,
              fontFamily: theme.fontSans,
              color: theme.textSecondary,
              lineHeight: 1.45,
              opacity: sublabelOpacity,
            }}
          >
            Caliber fingerprints your stack and refreshes CLAUDE.md, rules, and agents when the code moves.
          </div>
        </div>

        <div
          style={{
            padding: 3,
            borderRadius: theme.radiusLg + 6,
            background: `linear-gradient(125deg, ${theme.brand2}cc, ${theme.accent}aa 45%, ${theme.brand3}99 100%)`,
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.06),
              0 24px 80px -20px rgba(0,0,0,0.75),
              0 0 100px -30px rgba(249,115,22,${0.25 + rimPulse}),
              0 0 40px -12px rgba(125,211,252,0.15)
            `,
            transform: `scale(${combinedScale}) rotate(${cardRotate}deg)`,
            transformOrigin: "center center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              borderRadius: theme.radiusLg + 3,
              overflow: "hidden",
              background: "linear-gradient(180deg, #faf8f5 0%, #f0ebe3 100%)",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85)`,
            }}
          >
            <Img
              src={compoundInfographicSrc}
              width={IMG_NATURAL_W}
              height={IMG_NATURAL_H}
              style={{
                width: IMG_DISPLAY_W,
                height: IMG_DISPLAY_H,
                display: "block",
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
