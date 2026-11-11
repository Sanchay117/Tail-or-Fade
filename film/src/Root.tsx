import { Composition, Still } from "remotion";
import { Film, type FilmProps } from "./Film.tsx";
import { FPS, makePlan } from "./plan.ts";
import { Logo, Thumbnail } from "./Stills.tsx";

export function Root() {
  return (
    <>
      <Composition
        id="TailOrFade"
        component={Film}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={FPS * 180}
        defaultProps={{ captions: true, music: true, repo: "", site: "" } satisfies FilmProps}
        calculateMetadata={async ({ props }) => {
          const plan = await makePlan();
          return { durationInFrames: plan.total, props: { ...props, plan } };
        }}
      />
      <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} />
      <Still id="Logo" component={Logo} width={800} height={800} />
    </>
  );
}
