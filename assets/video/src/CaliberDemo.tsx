import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { ScoreTransition } from "./components/ScoreTransition";
import { EcosystemHub } from "./components/EcosystemHub";
import { PlaybooksScene } from "./components/PlaybooksScene";
import { SyncAnimation } from "./components/SyncAnimation";
import { ROIStats } from "./components/ROIStats";
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

// 21 seconds = 630 frames @ 30fps
// Scene breakdown:
//   0-3.5s    (0-105):     EcosystemHub — Bring your own AI
//   3.5-7s    (105-210):   ScoreTransition — Fully runs on your setup
//   7-14.5s   (210-435):   PlaybooksScene — Best playbooks (7.5s hero scene)
//   14.5-18s  (435-540):   SyncAnimation — Continuous git sync
//   18-21s    (540-630):   ROI + CTA — Max velocity, min cost

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

      {/* 0-3.5s: Ecosystem hub */}
      <CrossFade from={0} duration={105}>
        <Sequence from={0} durationInFrames={105}>
          <EcosystemHub />
        </Sequence>
      </CrossFade>

      {/* 3.5-7s: Score */}
      <CrossFade from={105} duration={105}>
        <Sequence from={105} durationInFrames={105}>
          <ScoreTransition />
        </Sequence>
      </CrossFade>

      {/* 7-14.5s: Playbooks — the hero scene (7.5s = 225 frames) */}
      <CrossFade from={210} duration={225}>
        <Sequence from={210} durationInFrames={225}>
          <PlaybooksScene />
        </Sequence>
      </CrossFade>

      {/* 14.5-18s: Continuous git sync */}
      <CrossFade from={435} duration={105}>
        <Sequence from={435} durationInFrames={105}>
          <SyncAnimation />
        </Sequence>
      </CrossFade>

      {/* 18-21s: ROI + CTA */}
      <CrossFade from={540} duration={90}>
        <Sequence from={540} durationInFrames={90}>
          <ROIStats />
        </Sequence>
      </CrossFade>
    </AbsoluteFill>
  );
};
