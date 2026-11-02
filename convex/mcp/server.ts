import { McpServer } from "@convex-dev/mcp";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { ActionCtx, env, internalQuery, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { checkUserIsAllowed } from "../version_history";
import { tools } from "./tools";

// Annotated to break the type cycle through `internal.mcp.server`.
export const mcp: McpServer<Id<"users">> = new McpServer(components.mcp, {
  name: "isitout",
  title: "isitout",
  version: "0.1.0",
  instructions:
    "isitout tracks which version of each Convex service is deployed. " +
    "Use list_services to see every service and what it's running, " +
    "find_services_with_commit to check whether a commit or PR from " +
    "convex/convex has been deployed, and get_push_history to see the " +
    "recent deploys of one service.",
  consentUrl: `${env.SITE_URL}/mcp/connect`,
  // Only the standard OAuth redirect flow for now.
  deviceFlow: false,
  scopes: {
    "isitout:read":
      "See services, their push history and which commits are out",
  },
  tools,
});

// Connections act as a user from the `users` table, and only @convex.dev
// users can connect, like in the UI.
async function getAllowedUserId(ctx: QueryCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  if ("db" in ctx) {
    await checkUserIsAllowed(ctx, userId);
  } else {
    await ctx.runQuery(internal.mcp.server.checkUser, { userId });
  }
  return userId;
}

export const checkUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await checkUserIsAllowed(ctx, userId);
    return null;
  },
});

export const {
  getAuthRequest,
  authorize,
  listConnections,
  revokeConnection,
} = mcp.api({
  // `ctx` is the query, mutation or action ctx of the function being called.
  // TODO(nicolas) Fix the type in @convex-dev/mcp to avoid the cast here
  getUserId: (ctx) => getAllowedUserId(ctx as QueryCtx | ActionCtx),
});
