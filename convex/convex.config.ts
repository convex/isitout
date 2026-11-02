import { defineApp } from "convex/server";
import { v } from "convex/values";
import mcp from "@convex-dev/mcp/convex.config.js";

const app = defineApp({
  env: {
    GITHUB_TOKEN2: v.string(),
    ISITOUT_SECRET: v.string(),
    SITE_URL: v.string(),
  },
});
app.use(mcp);
export default app;
