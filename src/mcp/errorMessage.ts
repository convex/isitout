import { ConvexError } from "convex/values";

export function errorMessage(e: unknown) {
  if (e instanceof ConvexError) {
    return String(e.data);
  }
  return "Something went wrong. Make sure you're signed in with your @convex.dev account.";
}
