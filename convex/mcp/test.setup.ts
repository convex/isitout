/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import mcpTest from "@convex-dev/mcp/test";
import { afterEach, beforeEach, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import schema from "../schema";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

// Defined in test.functions.ts, which isn't deployed, so it's not in `internal`.
const createApiKeyForUserRef = makeFunctionReference<
  "action",
  { userId: Id<"users"> },
  { apiKey: string }
>("mcp/test.functions:createApiKeyForUser");

beforeEach(() => {
  vi.stubEnv("CONVEX_SITE_URL", "https://isitout.convex.site");
  vi.stubEnv("SITE_URL", "https://isitout.test");
  vi.stubEnv("GITHUB_TOKEN2", "test-token");
  vi.stubEnv("ISITOUT_SECRET", "test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

export function setup() {
  const t = convexTest(schema, modules);
  mcpTest.register(t);
  return t;
}

export type T = ReturnType<typeof setup>;

export async function addUser(t: T, email = "someone@convex.dev") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email, emailVerificationTime: Date.now() }),
  );
  return { userId, asUser: t.withIdentity({ subject: `${userId}|session` }) };
}

// An agent connected with an API key, as a CLI agent would be.
export async function addAgent(t: T, email?: string) {
  const { userId } = await addUser(t, email);
  const { apiKey } = await t.action(createApiKeyForUserRef, { userId });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    return { status: res.status, body: await res.json() };
  };
  return { userId, call };
}

export async function push(
  t: T,
  service: string,
  version: string,
  release_tag?: string,
) {
  await t.run((ctx) =>
    ctx.db.insert("version_history", { service, version, release_tag }),
  );
}
