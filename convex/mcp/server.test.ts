import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { mcp } from "./server";
import { addAgent, addUser, setup } from "./test.setup";

describe("access control", () => {
  test("has no risky tool setups", () => {
    expect(mcp.lint()).toEqual([]);
  });

  test("rejects requests without credentials", async () => {
    const t = setup();
    const res = await t.fetch("/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
  });

  test("only @convex.dev users can manage agents", async () => {
    const t = setup();
    const { asUser } = await addUser(t, "someone@example.com");
    await expect(
      asUser.query(api.mcp.server.listConnections, {}),
    ).rejects.toThrow(/Must have @convex.dev email/);
  });

  test("an agent is cut off when its user loses access", async () => {
    const t = setup();
    const agent = await addAgent(t);
    expect((await agent.call("list_services")).body.result.isError).toBeFalsy();

    await t.run((ctx) =>
      ctx.db.patch("users", agent.userId, { emailVerificationTime: undefined }),
    );
    const { body } = await agent.call("list_services");
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toBeUndefined();
  });
});
