import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useStream, type Mode } from "./api";
import { Footer, Topbar, useLocation } from "./ui";
import { Home } from "./pages/Home";
import { Trader } from "./pages/Trader";
import { FollowPage } from "./pages/Follow";
import { Me } from "./pages/Me";

function App() {
  const { path, search } = useLocation();
  const stream = useStream();
  const trader = path.match(/^\/t\/(0x[0-9a-fA-F]{40})\/?$/);
  const follow = path.match(/^\/f\/([0-9a-f]+)\/?$/);
  const mode: Mode = new URLSearchParams(search).get("mode") === "fade" ? "fade" : "tail";

  let page;
  if (trader) page = <Trader key={trader[1]} address={trader[1]!} initialMode={mode} />;
  else if (follow) page = <FollowPage key={follow[1]} id={follow[1]!} />;
  else if (path === "/me") page = <Me />;
  else page = <Home stream={stream} />;

  return (
    <>
      <Topbar path={path} />
      {page}
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
