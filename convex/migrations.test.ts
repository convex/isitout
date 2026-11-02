/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("backfillReleaseTags sets a tag on every untagged push", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // More than one batch.
    for (let i = 0; i < 600; i++) {
      await ctx.db.insert("version_history", {
        service: "backend",
        version: `${i}`,
      });
    }
    await ctx.db.insert("version_history", {
      service: "backend",
      version: "biz",
      release_tag: "biz",
    });
  });

  await t.mutation(internal.migrations.backfillReleaseTags, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const tags = await t.run(async (ctx) =>
    (await ctx.db.query("version_history").collect()).map(
      (row) => row.release_tag,
    ),
  );
  expect(tags.filter((tag) => tag === "default")).toHaveLength(600);
  expect(tags.filter((tag) => tag === "biz")).toHaveLength(1);
  expect(tags).not.toContain(undefined);
});
