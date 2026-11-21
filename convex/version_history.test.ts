import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { push, setup } from "./mcp/test.setup";

describe("listLatest", () => {
  test("returns each service's latest push for the given tag", async () => {
    const t = setup();
    await push(t, "funrun", "20261101T000000Z-aaaaaaaaaaaa", "pro");
    await push(t, "funrun", "20261102T000000Z-bbbbbbbbbbbb", "pro");
    await push(t, "funrun", "20261103T000000Z-cccccccccccc", "default");
    await push(t, "porter", "20261101T000000Z-dddddddddddd", "staging");

    const pro = await t.query(api.version_history.listLatest, {
      release_tag: "pro",
    });
    expect(pro.map((r) => [r.service, r.version])).toEqual([
      ["funrun", "20261102T000000Z-bbbbbbbbbbbb"],
    ]);

    const untagged = await t.query(api.version_history.listLatest, {
      release_tag: null,
    });
    expect(untagged).toEqual([]);
  });

  test("without a tag, returns only default and biz pushes", async () => {
    const t = setup();
    await push(t, "funrun", "20261101T000000Z-aaaaaaaaaaaa", "default");
    await push(t, "funrun", "20261102T000000Z-bbbbbbbbbbbb", "pro");

    const latest = await t.query(api.version_history.listLatest, {});
    expect(latest.map((r) => r.release_tag)).toEqual(["default"]);
  });
});
