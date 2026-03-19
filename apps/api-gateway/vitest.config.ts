import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@risk-engine/db": path.resolve(root, "packages/db/src"),
      "@risk-engine/http": path.resolve(root, "packages/http/src"),
      "@risk-engine/types": path.resolve(root, "packages/types/src"),
      "@risk-engine/events": path.resolve(root, "packages/events/src"),
      "@risk-engine/redis": path.resolve(root, "packages/redis/src"),
      "@risk-engine/logger": path.resolve(root, "packages/logger/src"),
      "@risk-engine/utils": path.resolve(root, "packages/utils/src"),
      "@risk-engine/email": path.resolve(root, "packages/email/src"),
    },
  },
});
