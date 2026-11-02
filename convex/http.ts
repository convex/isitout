import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { mcp } from "./mcp/server";

const http = httpRouter();

http.route({
  path: "/latest-stable-biz-version",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const service = url.searchParams.get("service");
    if (!service) {
      return new Response(JSON.stringify({ error: "Service is required" }), {
        status: 400,
      });
    }
    const delayHoursParam = url.searchParams.get("delayHours");
    let delayHours: number | undefined = undefined;
    if (delayHoursParam !== null) {
      delayHours =
        delayHoursParam.trim() === "" ? NaN : Number(delayHoursParam);
      if (!Number.isFinite(delayHours) || delayHours < 0) {
        return new Response(
          JSON.stringify({
            error: "delayHours must be a non-negative number of hours",
          }),
          { status: 400 }
        );
      }
    }
    const version = await ctx.runQuery(
      api.version_history.latestStableReleaseForBiz,
      { service, delayHours }
    );
    if (!version) {
      return new Response(
        JSON.stringify({
          error: "No stable version found for service " + service,
        }),
        { status: 404 }
      );
    }
    return new Response(JSON.stringify({ service, version }), { status: 200 });
  }),
});

auth.addHttpRoutes(http);
mcp.registerRoutes(http);

export default http;
