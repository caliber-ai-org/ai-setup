import { Composition } from "remotion";
import { CaliberDemo } from "./CaliberDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CaliberDemo"
      component={CaliberDemo}
      durationInFrames={695}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
