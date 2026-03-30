import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { ProblemHook } from "./components/ProblemHook";
import { ScoreTransition } from "./components/ScoreTransition";
import { PlaybooksScene } from "./components/PlaybooksScene";
import { LearnRefreshScene } from "./components/LearnRefreshScene";
import { TeamCTA } from "./components/TeamCTA";
import { theme } from "./components/theme";

const CrossFade: React.FC<{ children: React.ReactNode; from: number; duration: number }> = ({
  children,
  from,
  duration,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [from, from + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [from + duration - 10, from + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// 22 seconds = 660 frames @ 30fps
// Scene breakdown:
//   0-3s      (0-90):      ProblemHook — Bad setup = bad agent
//   3-7s      (90-210):    ScoreTransition — 47→94, local scoring
//   7-13.5s   (210-405):   PlaybooksScene — caliber init (6.5s hero scene)
//   13.5-17s  (405-510):   LearnRefreshScene — learn + refresh
//   17-22s    (510-660):   TeamCTA — one dev sets up, everyone benefits + CTA

export const CaliberDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.fontSans }}>
      {/* Subtle grid texture */}
      <AbsoluteFill
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 59px, ${theme.surfaceHeader} 59px, ${theme.surfaceHeader} 60px), repeating-linear-gradient(90deg, transparent, transparent 59px, ${theme.surfaceHeader} 59px, ${theme.surfaceHeader} 60px)`,
          backgroundSize: "60px 60px",
          opacity: 0.35,
        }}
      />

      {/* 0-3s: Problem hook */}
      <CrossFade from={0} duration={90}>
        <Sequence from={0} durationInFrames={90}>
          <ProblemHook />
        </Sequence>
      </CrossFade>

      {/* 3-7s: Score */}
      <CrossFade from={90} duration={120}>
        <Sequence from={90} durationInFrames={120}>
          <ScoreTransition />
        </Sequence>
      </CrossFade>

      {/* 7-13.5s: Playbooks — the hero scene (6.5s = 195 frames) */}
      <CrossFade from={210} duration={195}>
        <Sequence from={210} durationInFrames={195}>
          <PlaybooksScene />
        </Sequence>
      </CrossFade>

      {/* 13.5-17s: Learn + Refresh */}
      <CrossFade from={405} duration={105}>
        <Sequence from={405} durationInFrames={105}>
          <LearnRefreshScene />
        </Sequence>
      </CrossFade>

      {/* 17-22s: Team sync + CTA */}
      <CrossFade from={510} duration={150}>
        <Sequence from={510} durationInFrames={150}>
          <TeamCTA />
        </Sequence>
      </CrossFade>
    </AbsoluteFill>
  );
};
