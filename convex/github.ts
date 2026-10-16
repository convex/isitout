import { Octokit } from "@octokit/rest";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN2 });

export const compareCommits = action({
  args: {
    base: v.string(),
    head: v.string(),
    service: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (args.service === "self-hosted" || args.service === "local-dev") {
      // Get the base commit. Then extract the git origin revid from the commit message.
      // It looks something like this GitOrigin-RevId: 2aa20649ba78df338cfae387a99f3e581f1d8e72
      const baseCommit = await octokit.repos.getCommit({
        owner: "convex",
        repo: "convex-backend",
        ref: args.base,
      });
      const commitMessage = baseCommit.data.commit.message;
      const match = commitMessage.match(/GitOrigin-RevId: ([a-f0-9]+)/);
      if (!match) {
        throw new Error("Could not find GitOrigin-RevId in commit message");
      }
      args.base = match[1];
      console.log(`${JSON.stringify(args)}`);
    }
    const comparison = await octokit.repos.compareCommits({
      owner: "convex",
      repo: "convex",
      base: args.base,
      head: args.head,
    });
    return comparison.data.status;
  },
});

async function fetchCommit(sha: string, prNumber?: number) {
  const { data } = await octokit.repos.getCommit({
    owner: "convex",
    repo: "convex",
    ref: sha,
  });
  return {
    kind: "ok" as const,
    sha: data.sha,
    title: data.commit.message.split("\n")[0],
    authorName:
      data.author?.login ?? data.commit.author?.name ?? "unknown",
    authorAvatarUrl: data.author?.avatar_url ?? null,
    authorProfileUrl: data.author?.html_url ?? null,
    htmlUrl: data.html_url,
    prNumber: prNumber ?? null,
  };
}

export const resolveRef = action({
  args: { input: v.string() },
  handler: async (ctx, { input }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return { kind: "error" as const, message: "Empty input." };
    }
    const explicitPr = trimmed.match(/^#(\d+)$/);
    const bareDigits = /^\d{1,6}$/.test(trimmed) ? trimmed : null;
    const urlPr = trimmed.match(
      /^https?:\/\/github\.com\/(?:get-)?convex\/convex\/pull\/(\d+)(?:[/?#].*)?$/,
    );
    const graphitePr = trimmed.match(
      /^https?:\/\/app\.graphite\.com\/github\/pr\/(?:get-)?convex\/convex\/(\d+)(?:[/?#].*)?$/,
    );
    const prNumberStr =
      explicitPr?.[1] ?? urlPr?.[1] ?? graphitePr?.[1] ?? bareDigits;
    if (prNumberStr) {
      const number = Number(prNumberStr);
      try {
        const pr = await octokit.pulls.get({
          owner: "convex",
          repo: "convex",
          pull_number: number,
        });
        if (!pr.data.merged || !pr.data.merge_commit_sha) {
          return {
            kind: "error" as const,
            message: `PR #${number} is not merged.`,
          };
        }
        return await fetchCommit(pr.data.merge_commit_sha, number);
      } catch {
        return {
          kind: "error" as const,
          message: `PR #${number} not found in convex/convex.`,
        };
      }
    }
    try {
      return await fetchCommit(trimmed);
    } catch {
      return {
        kind: "error" as const,
        message: "Commit not found in convex/convex.",
      };
    }
  },
});

export const getLatestConvexBackendRelease = internalAction({
  args: {},
  handler: async (_ctx, _args) => {
    const release = await octokit.repos.getLatestRelease({
      owner: "convex",
      repo: "convex-backend",
    });
    return release.data.tag_name;
  },
});

export const getLatestConvexBackendContainer = internalAction({
  args: {},
  handler: async (_ctx, _args) => {
    const packages =
      await octokit.packages.getAllPackageVersionsForPackageOwnedByOrg({
        package_type: "container",
        package_name: "convex-backend",
        org: "convex",
        per_page: 100,
        page: 1,
      });

    if (packages.data.length === 0) {
      throw new Error("No container packages found");
    }

    for (const packageData of packages.data) {
      if (packageData.metadata?.container?.tags[1] === "latest") {
        return packageData?.metadata?.container?.tags[0];
      }
    }

    throw new Error("No latest container package found");
  },
});

async function getLatestTaggedRelease(repo: string, tagPrefix: string) {
  const { data } = await octokit.git.listMatchingRefs({
    owner: "convex",
    repo,
    ref: `tags/${tagPrefix}/`,
  });
  const re = new RegExp(
    `^refs/tags/${tagPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+\\.\\d+\\.\\d+)$`,
  );
  const versions = data
    .flatMap((r) => {
      const versionMatch = r.ref.match(re);
      if (!versionMatch) {
        return [];
      }

      const versionStr = versionMatch[1];

      return [
        {
          commit: r.object.sha,
          versionStr,
          version: versionStr.split(".").map(Number) as [
            number,
            number,
            number,
          ],
        },
      ];
    })
    .sort(
      ({ version: a }, { version: b }) =>
        a[0] - b[0] || a[1] - b[1] || a[2] - b[2],
    );
  const latest = versions.at(-1);
  if (!latest) throw new Error(`No ${tagPrefix}/x.y.z tag found in ${repo}`);
  return `${latest.versionStr}-${latest.commit.slice(0, 7)}`;
}

export const getLatestConvexJsRelease = internalAction({
  args: {},
  handler: async () => getLatestTaggedRelease("convex", "npm"),
});

export const getLatestConvexPyRelease = internalAction({
  args: {},
  handler: async () => getLatestTaggedRelease("convex-py", "convex-py"),
});

export const getLatestConvexRsRelease = internalAction({
  args: {},
  handler: async () => getLatestTaggedRelease("convex-rs", "convex-rs"),
});

export const trackConvexBackendRelease = internalAction({
  args: {},
  handler: async (ctx) => {
    const version = await ctx.runAction(
      internal.github.getLatestConvexBackendRelease,
    );
    await ctx.runMutation(api.version_history.addRow, {
      version,
      service: "local-dev",
      secret: process.env.ISITOUT_SECRET!,
    });
  },
});

export const trackConvexJsRelease = internalAction({
  args: {},
  handler: async (ctx) => {
    const version = await ctx.runAction(
      internal.github.getLatestConvexJsRelease,
    );
    await ctx.runMutation(api.version_history.addRow, {
      version,
      service: "convex-js",
      secret: process.env.ISITOUT_SECRET!,
    });
  },
});

export const trackConvexPyRelease = internalAction({
  args: {},
  handler: async (ctx) => {
    const version = await ctx.runAction(
      internal.github.getLatestConvexPyRelease,
    );
    await ctx.runMutation(api.version_history.addRow, {
      version,
      service: "convex-py",
      secret: process.env.ISITOUT_SECRET!,
    });
  },
});

export const trackConvexRsRelease = internalAction({
  args: {},
  handler: async (ctx) => {
    const version = await ctx.runAction(
      internal.github.getLatestConvexRsRelease,
    );
    await ctx.runMutation(api.version_history.addRow, {
      version,
      service: "convex-rs",
      secret: process.env.ISITOUT_SECRET!,
    });
  },
});

export const trackConvexBackendContainer = internalAction({
  args: {},
  handler: async (ctx) => {
    const version = await ctx.runAction(
      internal.github.getLatestConvexBackendContainer,
    );
    await ctx.runMutation(api.version_history.addRow, {
      version,
      service: "self-hosted",
      secret: process.env.ISITOUT_SECRET!,
    });
  },
});
