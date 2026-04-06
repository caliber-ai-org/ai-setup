import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "./theme";
import { DEMO_SCENES, getDemoSceneIndex } from "../sceneTimeline";

/** Top progress strip: scene label + 1–5 dots (readability for silent README GIF). */
export const SceneProgress: React.FC = () => {
  const frame = useCurrentFrame();
  const active = getDemoSceneIndex(frame);
  const label = DEMO_SCENES[active]?.label ?? "";
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 36,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          opacity,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontFamily: theme.fontMono,
            color: theme.textMuted,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {DEMO_SCENES.map((_, i) => {
            const on = i === active;
            return (
              <div
                key={DEMO_SCENES[i].key}
                style={{
                  width: on ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: on ? theme.brand3 : theme.surfaceBorder,
                  boxShadow: on ? `0 0 12px ${theme.brand3}66` : undefined,
                  transition: "none",
                }}
              />
            );
          })}
        </div>
        <span
          style={{
            fontSize: 15,
            fontFamily: theme.fontMono,
            color: theme.textMuted,
            fontWeight: 500,
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {active + 1}/{DEMO_SCENES.length}
        </span>
      </div>
    </AbsoluteFill>
  );
};
