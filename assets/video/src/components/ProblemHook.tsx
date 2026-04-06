import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { sceneT } from "../sceneSpeed";

// Scene 1: "The Hook" (see CaliberDemo frame range)

export const ProblemHook: React.FC = () => {
  const { fps } = useVideoConfig();
  const t = sceneT(useCurrentFrame());

  const enter = spring({
    frame: t - 2,
    fps,
    config: { damping: 22, stiffness: 120 },
  });
  const groupY = interpolate(enter, [0, 1], [28, 0]);
  const groupScale = interpolate(enter, [0, 1], [0.97, 1]);

  const headlineOpacity = interpolate(t, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  const subtitleOpacity = interpolate(t, [24, 42], [0, 1], {
    extrapolateRight: "clamp",
  });

  const headline1Opacity = interpolate(t, [65, 78], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headline2Opacity = interpolate(t, [84, 97], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const beat3Opacity = interpolate(t, [102, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const settle = spring({
    frame: t - 86,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const h2Lift = headline2Opacity * interpolate(settle, [0, 1], [14, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          transform: `translateY(${groupY}px) scale(${groupScale})`,
          transformOrigin: "center center",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontFamily: theme.fontMono,
            color: theme.brand2,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            opacity: headlineOpacity * headline1Opacity,
          }}
        >
          THE PROBLEM
        </div>

        <div
          style={{
            position: "relative",
            height: 168,
            width: 1680,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              fontSize: 68,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              color: theme.text,
              letterSpacing: "-0.03em",
              opacity: headlineOpacity * headline1Opacity,
              textAlign: "center",
              lineHeight: 1.12,
              maxWidth: 1500,
              padding: "0 40px",
            }}
          >
            Your agent only knows
            <br />
            what your repo says.
          </div>
          <div
            style={{
              position: "absolute",
              fontSize: 68,
              fontWeight: 700,
              fontFamily: theme.fontSans,
              letterSpacing: "-0.03em",
              opacity: headline2Opacity,
              textAlign: "center",
              lineHeight: 1.12,
              maxWidth: 1500,
              padding: "0 40px",
              color: theme.brand3,
              transform: `translateY(${-h2Lift}px)`,
            }}
          >
            Caliber audits, generates,
            <br />
            and keeps configs honest.
          </div>
        </div>

        <div
          style={{
            fontSize: 28,
            fontFamily: theme.fontSans,
            color: theme.textMuted,
            fontWeight: 400,
            opacity: subtitleOpacity * headline1Opacity,
            textAlign: "center",
            maxWidth: 920,
            lineHeight: 1.35,
          }}
        >
          Score your setup — then ship CLAUDE.md, rules, and skills that match your code.
        </div>

        <div
          style={{
            fontSize: 22,
            fontFamily: theme.fontMono,
            color: theme.accent,
            fontWeight: 500,
            opacity: beat3Opacity * headline2Opacity,
            letterSpacing: "0.04em",
          }}
        >
          caliber score · init · refresh
        </div>

        <div
          style={{
            width: 80,
            height: 2,
            backgroundColor: theme.brand3,
            borderRadius: 1,
            opacity: subtitleOpacity * Math.max(headline1Opacity, headline2Opacity * 0.9) * 0.35,
            marginTop: 4,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
