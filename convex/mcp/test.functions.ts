import { mcp } from "./server";

// Lets tests connect agents with an API key instead of going through OAuth.
// Convex doesn't deploy files with more than one dot in their name, so this
// only exists in tests.
export const { createApiKeyForUser } = mcp.internalApi();
