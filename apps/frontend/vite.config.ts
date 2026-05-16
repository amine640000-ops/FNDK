import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["frontend-production-d39c.up.railway.app", "fndk.site", "www.fndk.site"]
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@nevo/shared-infra": resolve(__dirname, "../../packages/shared-infra/src/index.ts"),
      "@nevo/shared-types": resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      "@nevo/shared-utils": resolve(__dirname, "../../packages/shared-utils/src/index.ts")
    }
  },
  server: {
    port: 5173
  }
});
