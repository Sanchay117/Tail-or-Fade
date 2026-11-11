import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadHanken } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexMono";

// The app's own type and colours (web/src/styles.css), so the film matches the product.
export const fonts = {
  display: loadBricolage("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] }).fontFamily,
  body: loadHanken("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily,
  mono: loadPlex("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily,
};

export const ink = {
  ink: "#0d1b24",
  inkSoft: "#3c4d57",
  mist: "#edf3f2",
  mistDeep: "#dfe9e7",
  white: "#f8fbfa",
  line: "rgba(13,27,36,0.12)",
};

/** Tail is the cool family, Fade the warm one, exactly as the app swaps them. */
export const tail = ["#0fbf9f", "#33b4ff", "#5a63ff", "#c4f25e"] as const;
export const fade = ["#ff5a4e", "#ff3d8b", "#ffb03a", "#8a5cff"] as const;

export const grad = (c: readonly string[], angle = 100) => `linear-gradient(${angle}deg, ${c[0]}, ${c[1]} 52%, ${c[2]})`;
