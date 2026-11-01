import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    GITHUB_TOKEN2: v.string(),
    ISITOUT_SECRET: v.string(),
    SITE_URL: v.string(),
  },
});
export default app;
