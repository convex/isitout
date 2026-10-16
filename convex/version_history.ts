import moment from "moment";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { UNTAGGED_SERVICES } from "../src/untagged_services";

const expectedSecret = process.env.ISITOUT_SECRET;

export const addRow = mutation({
  args: {
    version: v.string(),
    service: v.string(),
    release_tag: v.optional(v.string()),
    secret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { version, service, release_tag, secret }) => {
    if (secret !== expectedSecret) {
      throw new Error("bad credentials");
    }
    const tag = release_tag ?? "default";
    const currRow = await ctx.db
      .query("version_history")
      .withIndex("by_service_and_release_tag", (q) =>
        q.eq("service", service).eq("release_tag", tag),
      )
      .order("desc")
      .first();
    if (currRow?.version === version) {
      return;
    }
    await ctx.db.insert("version_history", {
      service,
      version,
      release_tag: tag,
      is_stable: true,
    });
  },
});

async function listServices(ctx: QueryCtx) {
  const services: Record<string, number> = {};
  let doc = await ctx.db
    .query("version_history")
    .withIndex("by_service")
    .order("desc")
    .first();
  while (doc !== null) {
    const service = doc.service;
    services[service] = doc._creationTime;
    doc = await ctx.db
      .query("version_history")
      .withIndex("by_service", (q) => q.lt("service", service))
      .order("desc")
      .first();
  }
  return services;
}

export const services = query({
  args: {},
  returns: (v as any).record(v.string(), v.number()),
  handler: listServices,
});

const renderedVersionHistoryRow = v.object({
  _id: v.id("version_history"),
  _creationTime: v.number(),
  service: v.string(),
  version: v.string(),
  release_tag: v.string(),
  url: v.string(),
  buildDate: v.number(),
  pushDate: v.number(),
  is_stable: v.boolean(),
});

export const list = query({
  args: { service: v.optional(v.string()) },
  returns: v.array(renderedVersionHistoryRow),
  handler: async (ctx, { service }) => {
    await checkIdentity(ctx);
    let queryResult;
    if (service) {
      queryResult = await ctx.db
        .query("version_history")
        .withIndex("by_service", (q) => q.eq("service", service))
        .order("desc")
        .take(20);
    } else {
      queryResult = await ctx.db
        .query("version_history")
        .order("desc")
        .take(20);
    }
    const result = queryResult.map(renderVersionHistoryRow);
    return result;
  },
});

function renderVersionHistoryRow(row: Doc<"version_history">) {
  let url = `https://go.cvx.is/github_release/${row.service}/${row.version}`;
  let buildDate = 0;

  if (row.service == "local-dev") {
    url = `https://github.com/convex/convex-backend/releases/tag/${row.version}`;
  } else if (row.service == "self-hosted") {
    url = `https://github.com/convex/convex-backend/pkgs/container/convex-backend`;
  } else if (row.service == "convex-js") {
    const [npmVersion] = row.version.split("-");
    url = `https://github.com/convex/convex/releases/tag/npm/${encodeURIComponent(npmVersion)}`;
  } else if (row.service == "convex-py" || row.service == "convex-rs") {
    const [packageVersion] = row.version.split("-");
    url = `https://github.com/convex/${row.service}/releases/tag/${row.service}/${encodeURIComponent(packageVersion)}`;
  } else if (UNTAGGED_SERVICES.has(row.service)) {
    const [datePart, sha] = row.version.split("-");
    buildDate = +moment(datePart).toDate();
    url = `https://github.com/convex/convex/commit/${sha}`;
  } else {
    const [datePart, rest] = row.version.split("-");
    if (rest) {
      buildDate = +moment(datePart).toDate();
    } else {
      url = `https://github.com/convex/convex/commit/${row.version}`;
    }
  }

  const pushDate = row._creationTime;
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    service: row.service,
    version: row.version,
    release_tag: row.release_tag ?? "default",
    url,
    buildDate,
    pushDate,
    is_stable: row.is_stable ?? true,
  };
}

export const listLatest = query({
  args: {},
  returns: v.array(renderedVersionHistoryRow),
  handler: async (ctx) => {
    const services = await listServices(ctx);
    const allowedTags = ["default", "biz"];
    const results: ReturnType<typeof renderVersionHistoryRow>[] = [];

    for (const [service] of Object.entries(services)) {
      let hasCurrentDefault = false;

      for (const tag of allowedTags) {
        const row = await ctx.db
          .query("version_history")
          .withIndex("by_service_and_release_tag", (q) =>
            q.eq("service", service).eq("release_tag", tag),
          )
          .order("desc")
          .first();
        if (row) {
          results.push(renderVersionHistoryRow(row));
          if (tag === "default") {
            hasCurrentDefault = true;
          }
        }
      }
      // Only include legacy rows if no current "default" row exists
      if (!hasCurrentDefault) {
        const legacyRow = await ctx.db
          .query("version_history")
          .withIndex("by_service_and_release_tag", (q) =>
            q.eq("service", service).eq("release_tag", undefined),
          )
          .order("desc")
          .first();
        if (legacyRow) {
          results.push(renderVersionHistoryRow(legacyRow));
        }
      }
    }

    // Sort by pushDate descending.
    results.sort((a, b) => b.pushDate - a.pushDate);
    return results;
  },
});

export const prevRev = query({
  args: {
    service: v.string(),
    release_tag: v.string(),
    _creationTime: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("version_history")
      .withIndex("by_service_and_release_tag", (q) =>
        q
          .eq("service", args.service)
          .eq("release_tag", args.release_tag)
          .lt("_creationTime", args._creationTime),
      )
      .order("desc")
      .first();
  },
});

const DEFAULT_BIZ_DELAY_HOURS = 24;

export const latestStableReleaseForBiz = query({
  args: {
    service: v.string(),
    delayHours: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const delayHours = args.delayHours ?? DEFAULT_BIZ_DELAY_HOURS;
    const cutoff = Date.now() - delayHours * 60 * 60 * 1000;
    const release = await ctx.db
      .query("version_history")
      .withIndex("by_service_release_tag_and_is_stable", (q) =>
        q
          .eq("service", args.service)
          .eq("release_tag", "default")
          .eq("is_stable", true)
          .lte("_creationTime", cutoff),
      )
      .order("desc")
      .first();

    return release?.version;
  },
});

export const markReleaseStability = mutation({
  args: {
    service: v.string(),
    version: v.string(),
    is_stable: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await checkIdentity(ctx);

    // Find all releases with the same service and version (across all release tags)
    const releases = await ctx.db
      .query("version_history")
      .withIndex("by_service_and_version", (q) =>
        q.eq("service", args.service).eq("version", args.version),
      )
      .collect();

    // Update stability for all matching releases
    for (const release of releases) {
      await ctx.db.patch(release._id, { is_stable: args.is_stable });
    }
  },
});

export async function checkIdentity(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthenticated call");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Unauthenticated call");
  }
  if (!user.email) {
    throw new Error("Requires email");
  }
  if (!user.email.endsWith("@convex.dev")) {
    throw new Error("Must have @convex.dev email");
  }
  if (user.emailVerificationTime === undefined) {
    throw new Error("Email must be verified");
  }
}
