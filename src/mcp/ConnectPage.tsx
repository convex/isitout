import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";
import { errorMessage } from "./errorMessage";

// An agent sends the user here (`/mcp/connect?request=<id>`) to approve it.
export function ConnectPage() {
  const requestId = new URLSearchParams(window.location.search).get("request");
  const request = useQuery(
    api.mcp.server.getAuthRequest,
    requestId ? { requestId } : "skip",
  );
  const authorize = useAction(api.mcp.server.authorize);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    if (!requestId) return;
    setDeciding(true);
    setError(null);
    try {
      const { redirectUrl } = await authorize({ requestId, approve });
      if (redirectUrl) {
        window.location.assign(redirectUrl);
      }
    } catch (e) {
      setError(errorMessage(e));
      setDeciding(false);
    }
  };

  let body;
  if (window.top !== window.self) {
    // Don't let other sites trick users into approving in an iframe.
    body = <p>This page can't be shown in a frame.</p>;
  } else if (!requestId) {
    body = <p>Missing request. Start again from your agent.</p>;
  } else if (request === undefined) {
    body = <p className="text-gray-500">Loading…</p>;
  } else if (request === null || request.status !== "pending") {
    body = <p>This request has expired. Start again from your agent.</p>;
  } else {
    body = (
      <>
        <p>
          <span className="font-bold">{request.clientName ?? "An agent"}</span>{" "}
          <span className="text-xs text-gray-500">(name not verified)</span>{" "}
          wants to access isitout as you. It will be able to:
        </p>
        <ul className="list-disc pl-6">
          {request.scopes.map((scope) => (
            <li key={scope.name}>{scope.description}</li>
          ))}
        </ul>
        <p className="text-sm text-gray-600">
          You'll be sent back to{" "}
          <span className="font-mono">
            {request.redirectUri && new URL(request.redirectUri).host}
          </span>
          .
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            disabled={deciding}
            onClick={() => void decide(false)}
          >
            Deny
          </Button>
          <Button disabled={deciding} onClick={() => void decide(true)}>
            Allow
          </Button>
        </div>
      </>
    );
  }

  return (
    <main className="flex h-[100vh] w-[100vw] items-center justify-center p-4">
      <div className="flex flex-col gap-4 max-w-md w-full border rounded-lg p-6">
        <h1 className="text-2xl font-extrabold">Connect an agent to isitout</h1>
        {body}
      </div>
    </main>
  );
}
