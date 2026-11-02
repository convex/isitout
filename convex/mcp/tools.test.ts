import { describe, expect, test, vi } from "vitest";
import { addAgent, push, setup } from "./test.setup";

describe("list_services", () => {
  test("returns the current version per release tag", async () => {
    const t = setup();
    await push(t, "backend", "20261030-aaaaaaa", "default");
    await push(t, "backend", "20261031-bbbbbbb", "default");
    await push(t, "backend", "20261029-ccccccc", "biz");
    await push(t, "dashboard", "ddddddd", "default");
    const agent = await addAgent(t);

    const { body } = await agent.call("list_services");
    const { services } = body.result.structuredContent;
    expect(services.map((s: { service: string }) => s.service)).toEqual([
      "backend",
      "dashboard",
    ]);
    expect(services[0]).toMatchObject({
      stale: false,
      current: expect.arrayContaining([
        expect.objectContaining({
          releaseTag: "default",
          version: "20261031-bbbbbbb",
        }),
        expect.objectContaining({
          releaseTag: "biz",
          version: "20261029-ccccccc",
        }),
      ]),
    });
    expect(services[0].current).toHaveLength(2);
  });
});

describe("get_push_history", () => {
  test("pages through pushes newest first", async () => {
    const t = setup();
    for (const version of ["1", "2", "3"]) {
      await push(t, "backend", version, "default");
    }
    await push(t, "backend", "biz-1", "biz");
    const agent = await addAgent(t);

    const first = await agent.call("get_push_history", {
      service: "backend",
      releaseTag: "default",
      limit: 2,
    });
    const page1 = first.body.result.structuredContent;
    expect(page1.pushes.map((p: { version: string }) => p.version)).toEqual([
      "3",
      "2",
    ]);
    expect(page1.nextCursor).not.toBeNull();

    const second = await agent.call("get_push_history", {
      service: "backend",
      releaseTag: "default",
      limit: 2,
      cursor: page1.nextCursor,
    });
    const page2 = second.body.result.structuredContent;
    expect(page2.pushes.map((p: { version: string }) => p.version)).toEqual([
      "1",
    ]);
    expect(page2.nextCursor).toBeNull();
  });

  test("returns a tool error for an unknown service", async () => {
    const t = setup();
    const agent = await addAgent(t);
    const { body } = await agent.call("get_push_history", { service: "nope" });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Unknown service "nope"');
  });
});

describe("find_services_with_commit", () => {
  // Fakes the GitHub API: `head` is included in a version's commit iff the
  // version's commit is listed in `includedIn`. Comparisons with a commit in
  // `failing` return a server error.
  function stubGitHub(
    head: string,
    includedIn: string[],
    failing: string[] = [],
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const commit = url.pathname.match(
          /^\/repos\/convex\/convex\/commits\/(\w+)$/,
        );
        if (commit) {
          expect(commit[1]).toBe(head);
          return Response.json({
            sha: head,
            html_url: `https://github.com/convex/convex/commit/${head}`,
            author: { login: "octocat" },
            commit: { message: "Fix things\n\nDetails" },
          });
        }
        const compare = url.pathname.match(
          /^\/repos\/convex\/convex\/compare\/(\w+)\.\.\.(\w+)$/,
        );
        if (compare) {
          const [, base] = compare;
          if (failing.includes(base)) {
            return new Response("Server error", { status: 500 });
          }
          return Response.json({
            status: includedIn.includes(base) ? "behind" : "ahead",
          });
        }
        return new Response("Not found", { status: 404 });
      }),
    );
  }

  test("reports which services include the commit", async () => {
    const t = setup();
    await push(t, "backend", "20261031-aaaaaaa", "default");
    await push(t, "funrun", "20261030-bbbbbbb", "default");
    await push(t, "convex-py", "0.7.0", "default");
    const agent = await addAgent(t);
    stubGitHub("1234567", ["aaaaaaa"]);

    const { body } = await agent.call("find_services_with_commit", {
      ref: "1234567",
    });
    const result = body.result.structuredContent;
    expect(result.commit).toEqual({
      sha: "1234567",
      title: "Fix things",
      author: "octocat",
      url: "https://github.com/convex/convex/commit/1234567",
      prNumber: null,
    });
    const statuses = Object.fromEntries(
      result.services.map((s: { service: string; status: string }) => [
        s.service,
        s.status,
      ]),
    );
    expect(statuses).toEqual({
      backend: "included",
      funrun: "not_included",
      // Not built from the monorepo.
      "convex-py": "unknown",
    });
  });

  test("reports an error when a comparison fails", async () => {
    const t = setup();
    await push(t, "backend", "20261031-aaaaaaa", "default");
    await push(t, "funrun", "20261030-bbbbbbb", "default");
    const agent = await addAgent(t);
    stubGitHub("1234567", ["aaaaaaa"], ["bbbbbbb"]);

    const { body } = await agent.call("find_services_with_commit", {
      ref: "1234567",
    });
    const statuses = Object.fromEntries(
      body.result.structuredContent.services.map(
        (s: { service: string; status: string }) => [s.service, s.status],
      ),
    );
    expect(statuses).toEqual({ backend: "included", funrun: "error" });
  });

  test("returns a tool error when the commit doesn't exist", async () => {
    const t = setup();
    const agent = await addAgent(t);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not found", { status: 404 })),
    );
    const { body } = await agent.call("find_services_with_commit", {
      ref: "fffffff",
    });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Commit not found");
  });
});
