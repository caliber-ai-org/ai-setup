import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "./theme";
import { sceneT } from "../sceneSpeed";

// Scene 1: "The Hook" (see CaliberDemo frame range)
// Animation: opacity fades only. Zero springs. Zero transforms.

export const ProblemHook: React.FC = () => {
  const t = sceneT(useCurrentFrame());

  const headlineOpacity = interpolate(t, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  const subtitleOpacity = interpolate(t, [24, 42], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Sequential: fade OUT first (65-78), blank gap, then fade IN (84-97)
  const headline1Opacity = interpolate(t, [65, 78], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headline2Opacity = interpolate(t, [84, 97], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
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
            opacity: headlineOpacity * headline1Opacity,
          }}
        >
          THE PROBLEM
        </div>

        {/* Headline crossfade */}
        <div
          style={{
            position: "relative",
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              fontSize: 80,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.03em",
              opacity: headlineOpacity * headline1Opacity,
              whiteSpace: "nowrap",
            }}
          >
            Bad setup = bad agent.
          </div>
          <div
            style={{
              position: "absolute",
              fontSize: 80,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              letterSpacing: "-0.03em",
              opacity: headline2Opacity,
              whiteSpace: "nowrap",
              color: theme.brand3,
            }}
          >
            Caliber fixes that.
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            fontFamily: theme.fontSans,
            color: theme.textMuted,
            fontWeight: 400,
            opacity: subtitleOpacity * headline1Opacity,
          }}
        >
          Scores your AI setup. Generates what's missing.
        </div>

        {/* Accent line */}
        <div
          style={{
            width: 80,
            height: 2,
            backgroundColor: theme.brand3,
            borderRadius: 1,
            opacity: subtitleOpacity * headline1Opacity * 0.3,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
