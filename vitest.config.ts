import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    env: {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085",
      GCLOUD_PROJECT: "demo-wafda-test",
      APP_URL: "http://localhost:3000",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret-0123456789",
    },
  },
});
