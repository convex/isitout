import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConnectPage } from "./mcp/ConnectPage";
import { McpPage } from "./mcp/McpPage";
import {
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";

import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";

const address = import.meta.env.VITE_CONVEX_URL;
const convex = new ConvexReactClient(address);

function LoginButton() {
  const { signIn } = useAuthActions();
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <button className="LoginButton" onClick={() =>
          // Come back to the same page (e.g. an agent's consent page).
          signIn("google", {
            redirectTo: window.location.pathname + window.location.search,
          })
        }>
        Log in
      </button>
    </div>
  );
}

function Page() {
  switch (window.location.pathname) {
    case "/mcp/connect":
      return <ConnectPage />;
    case "/mcp":
      return <McpPage />;
    default:
      return <App />;
  }
}

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <Authenticated>
        <Page />
      </Authenticated>
      <Unauthenticated>
        <LoginButton />
      </Unauthenticated>
    </ConvexAuthProvider>
  </StrictMode>
);
