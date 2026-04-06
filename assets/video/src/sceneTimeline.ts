/** Global frame ranges for CaliberDemo (must match [CaliberDemo.tsx](CaliberDemo.tsx) Sequences). */
export const DEMO_SCENES = [
  { key: "hook", label: "Setup", from: 0, duration: 131 },
  { key: "memory", label: "Context", from: 133, duration: 138 },
  { key: "init", label: "Init", from: 273, duration: 183 },
  { key: "fresh", label: "Drift", from: 458, duration: 129 },
  { key: "team", label: "Team", from: 589, duration: 106 },
] as const;

export function getDemoSceneIndex(globalFrame: number): number {
  for (let i = 0; i < DEMO_SCENES.length; i++) {
    const s = DEMO_SCENES[i];
    const end = s.from + s.duration - 1;
    if (globalFrame >= s.from && globalFrame <= end) {
      return i;
    }
  }
  // Crossfade gaps: attribute to the upcoming scene
  if (globalFrame < DEMO_SCENES[1].from) {
    return 0;
  }
  if (globalFrame < DEMO_SCENES[2].from) {
    return 1;
  }
  if (globalFrame < DEMO_SCENES[3].from) {
    return 2;
  }
  if (globalFrame < DEMO_SCENES[4].from) {
    return 3;
  }
  return DEMO_SCENES.length - 1;
}
