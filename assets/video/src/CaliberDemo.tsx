import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { ProblemHook } from "./components/ProblemHook";
import { CompoundInterestScene } from "./components/CompoundInterestScene";
import { InitScene } from "./components/InitScene";
import { FreshScene } from "./components/FreshScene";
import { TeamCTA } from "./components/TeamCTA";
import { theme } from "./components/theme";

/** Crossfade length in frames (scaled down with ~1.3× faster pacing). */
const FADE = 14;

const CrossFade: React.FC<{ children: React.ReactNode; from: number; duration: number }> = ({
  children,
  from,
  duration,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [from, from + FADE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [from + duration - FADE, from + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ~23s = 695 frames @ 30fps (~1.3× faster than prior 902-frame cut)
// Scene breakdown (2-frame gaps prevent crossfade overlap):
//   0-4.4s    (0-130):     ProblemHook
//   4.5-9.1s  (133-270):   CompoundInterestScene — bundled infographic PNG
//   9.2-15.3s (273-455):   InitScene — terminal + score arc
//   15.3-19.6s(458-586):   FreshScene
//   19.6-23.2s(589-694):   TeamCTA

export const CaliberDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.fontSans }}>
      {/* LP ambient orange glow */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: theme.heroGlow,
          pointerEvents: "none",
        }}
      />

      {/* Scene 1: Hook */}
      <CrossFade from={0} duration={131}>
        <Sequence from={0} durationInFrames={131}>
          <ProblemHook />
        </Sequence>
      </CrossFade>

      {/* Scene 2: Compound interest infographic */}
      <CrossFade from={133} duration={138}>
        <Sequence from={133} durationInFrames={138}>
          <CompoundInterestScene />
        </Sequence>
      </CrossFade>

      {/* Scene 3: Init + Score (hero) */}
      <CrossFade from={273} duration={183}>
        <Sequence from={273} durationInFrames={183}>
          <InitScene />
        </Sequence>
      </CrossFade>

      {/* Scene 4: Fresh */}
      <CrossFade from={458} duration={129}>
        <Sequence from={458} durationInFrames={129}>
          <FreshScene />
        </Sequence>
      </CrossFade>

      {/* Scene 5: Team + CTA */}
      <CrossFade from={589} duration={106}>
        <Sequence from={589} durationInFrames={106}>
          <TeamCTA />
        </Sequence>
      </CrossFade>
    </AbsoluteFill>
  );
};
