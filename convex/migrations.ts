import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const BATCH_SIZE = 500;

// Pushes from before release tags existed have no `release_tag`. They're shown
// as "default", but queries on the "default" tag skip them. This sets it on
// every such row, one batch at a time:
//
//   npx convex run migrations:backfillReleaseTags --prod
//
// Once it's done, `release_tag` can become required in the schema.
export const backfillReleaseTags = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("version_history")
      .paginate({ numItems: BATCH_SIZE, cursor: cursor ?? null });
    let updated = 0;
    for (const row of page) {
      if (row.release_tag === undefined) {
        await ctx.db.patch("version_history", row._id, {
          release_tag: "default",
        });
        updated++;
      }
    }
    console.log(`Set release_tag on ${updated} of ${page.length} rows`);
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillReleaseTags, {
        cursor: continueCursor,
      });
    }
    return null;
  },
});
