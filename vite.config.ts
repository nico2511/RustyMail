import { defineConfig } from "vite";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.capture.test.ts"],
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"]
});
