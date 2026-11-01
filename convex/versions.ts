import { env, internalAction } from "./_generated/server";
import { api } from "./_generated/api";

export const fetchDeployedVersions = internalAction({
  args: {},
  handler: async (ctx) => {
    const urlByService: Record<string, string> = {
      dashboard: "https://dashboard.convex.dev/api/version",
      docs: "https://docs.convex.dev/api/version",
    };
    for (const [service, url] of Object.entries(urlByService)) {
      const response = await fetch(url);
      const data = await response.json();
      const rev: string = data.sha;
      await ctx.runMutation(api.version_history.addRow, {
        version: rev,
        service,
        secret: env.ISITOUT_SECRET,
      });
    }
  },
});
