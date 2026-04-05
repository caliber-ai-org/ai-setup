/** Logical time scale: animations keyed in “original” frame space finish ~1.3× faster in wall-clock. */
export const SCENE_SPEED = 1.3;

export function sceneT(frame: number): number {
  return frame * SCENE_SPEED;
}
