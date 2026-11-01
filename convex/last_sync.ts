import { v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import { checkIdentity } from "./version_history";

const expectedSecret = env.ISITOUT_SECRET;

export const update = mutation({
  args: { time: v.float64(), secret: v.string() },
  handler: async ({ db }, args) => {
    const { secret, ...rest } = args;
    if (secret !== expectedSecret) {
      throw new Error("bad credentials");
    }
    const lastSync = await db.query("last_sync").unique();
    if (lastSync) {
      await db.patch(lastSync._id, rest);
    } else {
      await db.insert("last_sync", rest);
    }
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    checkIdentity(ctx);
    return ctx.db.query("last_sync").unique();
  },
});
