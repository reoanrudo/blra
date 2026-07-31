import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// 法令リーダー（SCR-03）フロントエンドの Vite 設定。
//
// 開発時は Vite(:5173) から Fastify(:3000) へプロキシ転送し、同一オリジン化する。
// これにより Cookie（SameSite=Lax, httpOnly）が fetch に付く。
// HANDOFF.md §「フロントエンド基盤の導入」・ADR-030 に準拠。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // API・認証エンドポイントは全て Fastify へ転送。
      //
      // 注意: /sources/:id はクライアントルート（TanStack Router）と
      // API エンドポイント（GET /sources/:id）でパスが衝突する。
      // ブラウザの直接ナビゲーション（Accept: text/html）は Vite が処理し、
      // API fetch（Accept: application/json）のみ転送する。
      "/auth": "http://localhost:3000",
      "/me": "http://localhost:3000",
      "/admin": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/ready": "http://localhost:3000",
      // /sources, /provisions は API リクエストのみ転送
      "^/sources(/|$)": {
        target: "http://localhost:3000",
        changeOrigin: true,
        // Accept: text/html のリクエストは転送せず Vite に処理させる
        bypass: (req) => {
          const accept = req.headers.accept ?? "";
          if (accept.includes("text/html")) {
            return "/index.html"; // Vite に SPA の index.html を返させる
          }
        },
      },
      "^/provisions(/|$)": {
        target: "http://localhost:3000",
        changeOrigin: true,
        bypass: (req) => {
          const accept = req.headers.accept ?? "";
          if (accept.includes("text/html")) {
            return "/index.html";
          }
        },
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
