import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { ProblemHook } from "./components/ProblemHook";
import { CompoundInterestScene } from "./components/CompoundInterestScene";
import { InitScene } from "./components/InitScene";
import { FreshScene } from "./components/FreshScene";
import { TeamCTA } from "./components/TeamCTA";
import { theme } from "./components/theme";

const CrossFade: React.FC<{ children: React.ReactNode; from: number; duration: number }> = ({
  children,
  from,
  duration,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [from, from + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [from + duration - 18, from + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ~30s = 902 frames @ 30fps
// Scene breakdown (2-frame gaps prevent crossfade overlap):
//   0-5.6s    (0-170):     ProblemHook — "Bad setup = bad agent" → "Caliber fixes that"
//   5.7-11.7s (172-351):   CompoundInterestScene — CLAUDE.md infographic
//   11.8-19.7s(354-591):   InitScene — terminal + score arc (hero)
//   19.7-25.4s(594-761):   FreshScene — diff → config update flow
//   25.5-30s  (764-901):   TeamCTA — team sync + CTA

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
      <CrossFade from={0} duration={170}>
        <Sequence from={0} durationInFrames={170}>
          <ProblemHook />
        </Sequence>
      </CrossFade>

      {/* Scene 2: Compound interest infographic */}
      <CrossFade from={172} duration={180}>
        <Sequence from={172} durationInFrames={180}>
          <CompoundInterestScene />
        </Sequence>
      </CrossFade>

      {/* Scene 3: Init + Score (hero) */}
      <CrossFade from={354} duration={238}>
        <Sequence from={354} durationInFrames={238}>
          <InitScene />
        </Sequence>
      </CrossFade>

      {/* Scene 4: Fresh */}
      <CrossFade from={594} duration={168}>
        <Sequence from={594} durationInFrames={168}>
          <FreshScene />
        </Sequence>
      </CrossFade>

      {/* Scene 5: Team + CTA */}
      <CrossFade from={764} duration={138}>
        <Sequence from={764} durationInFrames={138}>
          <TeamCTA />
        </Sequence>
      </CrossFade>
    </AbsoluteFill>
  );
};
