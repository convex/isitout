import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { errorMessage } from "./errorMessage";

const MCP_URL = `${import.meta.env.VITE_CONVEX_SITE_URL}/mcp`;

export function McpPage() {
  const connections = useQuery(api.mcp.server.listConnections);
  const revokeConnection = useMutation(api.mcp.server.revokeConnection);
  const createApiKey = useAction(api.mcp.server.createApiKey);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try {
      const { apiKey } = await createApiKey({ name: keyName || "API key" });
      setNewKey(apiKey);
      setKeyName("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <main className="flex flex-col w-[100vw] p-8 gap-6 items-center">
      <div className="flex flex-col gap-6 max-w-2xl w-full">
        <h1 className="text-4xl font-extrabold">
          <a href="/">isitout</a> MCP
        </h1>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">MCP server</h2>
          <p>
            Add this URL as a connector in Claude, ChatGPT or Cursor. You'll be
            asked to sign in and approve the agent.
          </p>
          <code className="bg-gray-100 rounded p-2">{MCP_URL}</code>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Connected agents</h2>
          {connections === undefined ? (
            <p className="text-gray-500">Loading…</p>
          ) : connections.length === 0 ? (
            <p className="text-gray-500">No connected agents.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center gap-4 py-2">
                  <div className="flex flex-col flex-grow">
                    <span className="font-medium">
                      {c.name}{" "}
                      {c.kind === "apiKey" && (
                        <span className="text-xs text-gray-500">API key</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500">
                      Connected {new Date(c.createdAt).toLocaleString()}
                      {c.lastUsedAt &&
                        ` · last used ${new Date(c.lastUsedAt).toLocaleString()}`}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revokeConnection({ id: c.id })}
                  >
                    Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">API keys</h2>
          <p>For CLI agents that can't sign in through the browser.</p>
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g. Claude Code on my laptop)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
            <Button onClick={() => void create()}>Create API key</Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {newKey && (
            <div className="flex flex-col gap-1">
              <p className="text-sm">
                Copy this key now, it won't be shown again:
              </p>
              <code className="bg-gray-100 rounded p-2 break-all text-sm">
                claude mcp add --transport http isitout {MCP_URL} --header
                "Authorization: Bearer {newKey}"
              </code>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
