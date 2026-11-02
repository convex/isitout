import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    // `@convex-dev/mcp/test` is TypeScript source that uses `import.meta.glob`.
    server: { deps: { inline: ["convex-test", "@convex-dev/mcp"] } },
  },
});
