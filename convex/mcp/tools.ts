import { createTool, ToolDefinition } from "@convex-dev/mcp";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import {
  checkUserIsAllowed,
  listLatestPushes,
  listServices,
  renderVersionHistoryRow,
  renderedVersionHistoryRow,
} from "../version_history";
import { compareCommitsForService, resolveCommitRef } from "../github";
import {
  STANDALONE_PACKAGE_SERVICES,
  comparisonBaseFor,
} from "../../src/git_refs";

// 7 days, same as the 🥱 in the UI.
const STALE_AGE_MILLIS = 1000 * 3600 * 24 * 7;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

const tool = createTool<Id<"users">>();

const push = v.object({
  service: v.string(),
  version: v.string(),
  releaseTag: v.string(),
  pushedAt: v.string(),
  isStable: v.boolean(),
  url: v.string(),
});

const serviceSummary = v.object({
  service: v.string(),
  lastPushedAt: v.string(),
  stale: v.boolean(),
  current: v.array(push),
});

const pushHistory = v.object({
  pushes: v.array(push),
  nextCursor: v.union(v.string(), v.null()),
});

function renderPush(row: ReturnType<typeof renderVersionHistoryRow>) {
  return {
    service: row.service,
    version: row.version,
    releaseTag: row.release_tag,
    pushedAt: new Date(row.pushDate).toISOString(),
    isStable: row.is_stable,
    url: row.url,
  };
}

// Each tool reads through an internal query that checks the connection's user
// again, so that removing a user or their email verification also cuts off
// their agents.
//
// Annotated to break the type cycle through `internal.mcp.tools`. `tool()`
// returns this type anyway.
export const tools: Record<string, ToolDefinition<any, any, Id<"users">>> = {
  list_services: tool({
    description:
      "List every service tracked by isitout with the version it currently " +
      "runs on each release tag (`default`, and `biz` for services that " +
      "have a separate business-tier release). A service is `stale` when " +
      "nothing was pushed to it in the last 7 days.",
    args: {},
    returns: v.object({ services: v.array(serviceSummary) }),
    annotations: { readOnlyHint: true },
    scope: "isitout:read",
    handler: async (ctx, _args, user) => ({
      services: await ctx.runQuery(internal.mcp.tools.servicesForUser, {
        userId: user.userId,
      }),
    }),
  }),
  find_services_with_commit: tool({
    description:
      "Check which services have a commit from the convex/convex monorepo " +
      "deployed. `ref` can be a commit SHA, a PR number (`#1234` or " +
      "`1234`), or a GitHub or Graphite PR URL; PRs must be merged. For " +
      "each service's current version, `status` is `included` (it's out), " +
      "`not_included` (not out yet), `unknown` (the histories diverged, " +
      "or the service isn't built from the monorepo) or `error` (the " +
      "comparison with GitHub failed, so it's not known either way).",
    args: { ref: v.string() },
    returns: v.object({
      commit: v.object({
        sha: v.string(),
        title: v.string(),
        author: v.string(),
        url: v.string(),
        prNumber: v.union(v.number(), v.null()),
      }),
      services: v.array(
        v.object({
          service: v.string(),
          releaseTag: v.string(),
          version: v.string(),
          pushedAt: v.string(),
          status: v.union(
            v.literal("included"),
            v.literal("not_included"),
            v.literal("unknown"),
            v.literal("error"),
          ),
        }),
      ),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "isitout:read",
    handler: async (ctx, args, user) => {
      const latest = await ctx.runQuery(
        internal.mcp.tools.latestPushesForUser,
        {
          userId: user.userId,
        },
      );
      const commit = await resolveCommitRef(args.ref);
      if (commit.kind === "error") {
        throw new ConvexError(commit.message);
      }
      const services = await Promise.all(
        latest.map(async (row) => ({
          service: row.service,
          releaseTag: row.release_tag,
          version: row.version,
          pushedAt: new Date(row.pushDate).toISOString(),
          status: await commitStatus(row.service, row.version, commit.sha),
        })),
      );
      return {
        commit: {
          sha: commit.sha,
          title: commit.title,
          author: commit.authorName,
          url: commit.htmlUrl,
          prNumber: commit.prNumber,
        },
        services,
      };
    },
  }),
  get_push_history: tool({
    description:
      "List the deploys of one service, newest first. Optionally filter by " +
      "`releaseTag` (e.g. `default` or `biz`). Returns up to `limit` " +
      `pushes (default ${DEFAULT_HISTORY_LIMIT}, max ${MAX_HISTORY_LIMIT}); ` +
      "pass `nextCursor` back as `cursor` to get older pushes.",
    args: {
      service: v.string(),
      releaseTag: v.optional(v.string()),
      limit: v.optional(v.number()),
      cursor: v.optional(v.string()),
    },
    returns: pushHistory,
    annotations: { readOnlyHint: true },
    scope: "isitout:read",
    handler: async (ctx, args, user) =>
      await ctx.runQuery(internal.mcp.tools.pushHistoryForUser, {
        userId: user.userId,
        ...args,
      }),
  }),
};

async function commitStatus(service: string, version: string, sha: string) {
  if (STANDALONE_PACKAGE_SERVICES.has(service)) {
    return "unknown" as const;
  }
  try {
    const comparison = await compareCommitsForService({
      base: comparisonBaseFor(service, version),
      head: sha,
      service,
    });
    switch (comparison) {
      case "behind":
      case "identical":
        return "included" as const;
      case "ahead":
        return "not_included" as const;
      default:
        return "unknown" as const;
    }
  } catch (e) {
    console.error(`Failed to compare ${sha} with ${service}@${version}`, e);
    return "error" as const;
  }
}

export const servicesForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(serviceSummary),
  handler: async (ctx, { userId }) => {
    await checkUserIsAllowed(ctx, userId);
    const services = await listServices(ctx);
    const latest = await listLatestPushes(ctx);
    return Object.entries(services)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([service, lastPushed]) => ({
        service,
        lastPushedAt: new Date(lastPushed).toISOString(),
        stale: Date.now() - lastPushed >= STALE_AGE_MILLIS,
        current: latest.filter((r) => r.service === service).map(renderPush),
      }));
  },
});

export const latestPushesForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(renderedVersionHistoryRow),
  handler: async (ctx, { userId }) => {
    await checkUserIsAllowed(ctx, userId);
    return await listLatestPushes(ctx);
  },
});

export const pushHistoryForUser = internalQuery({
  args: {
    userId: v.id("users"),
    service: v.string(),
    releaseTag: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: pushHistory,
  handler: async (ctx, { userId, service, releaseTag, limit, cursor }) => {
    await checkUserIsAllowed(ctx, userId);
    const numItems = Math.min(
      Math.max(Math.floor(limit ?? DEFAULT_HISTORY_LIMIT), 1),
      MAX_HISTORY_LIMIT,
    );
    const exists = await ctx.db
      .query("version_history")
      .withIndex("by_service", (q) => q.eq("service", service))
      .first();
    if (!exists) {
      throw new ConvexError(
        `Unknown service "${service}". Use list_services to see the services.`,
      );
    }
    const query =
      releaseTag === undefined
        ? ctx.db
            .query("version_history")
            .withIndex("by_service", (q) => q.eq("service", service))
        : ctx.db
            .query("version_history")
            .withIndex("by_service_and_release_tag", (q) =>
              q.eq("service", service).eq("release_tag", releaseTag),
            );
    const result = await query
      .order("desc")
      .paginate({ numItems, cursor: cursor ?? null });
    return {
      pushes: result.page.map((row) =>
        renderPush(renderVersionHistoryRow(row)),
      ),
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});
