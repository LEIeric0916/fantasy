import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/fantasy/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    maxWorkers: 1,
  },
});
