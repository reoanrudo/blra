import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// 法令リーダー（SCR-03）フロントエンドの Vite 設定。
//
// 開発時は Vite(:5173) から Fastify(:3000) へプロキシ転送し、同一オリジン化する。
// これにより Cookie（SameSite=Lax, httpOnly）が fetch に付く。
// HANDOFF.md §「フロントエンド基盤の導入」・ADR-030 に準拠。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // API・認証エンドポイントは全て Fastify へ転送
      "/auth": "http://localhost:3000",
      "/me": "http://localhost:3000",
      "/sources": "http://localhost:3000",
      "/provisions": "http://localhost:3000",
      "/admin": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/ready": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
