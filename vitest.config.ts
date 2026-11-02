import { defineConfig } from "vitest/config";

// Workspace-Pakete aus dem Quelltext laden, nicht aus dist
const conditions = ["source", "import", "module", "node", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: ["source"] } },
  test: { include: ["packages/*/test/**/*.test.ts", "server/test/**/*.test.ts"] },
});
