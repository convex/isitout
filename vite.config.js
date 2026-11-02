import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The MCP consent page (/mcp/connect) must not be framed by other sites.
  server: { headers: { "Content-Security-Policy": "frame-ancestors 'none'" } },
  preview: { headers: { "Content-Security-Policy": "frame-ancestors 'none'" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
