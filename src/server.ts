/**
 * Fastify サーバーのエントリポイント。
 * アプリ構築は src/app.ts の buildApp() に委譲。
 * ここでは listen / graceful shutdown のみを担当する。
 */

import { config } from "./config.js";
import { closeDatabase } from "./db/connection.js";
import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`サーバー起動: http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error({ err }, "サーバー起動に失敗");
    process.exit(1);
  }

  // graceful shutdown
  async function shutdown(signal: string) {
    app.log.info({ signal }, "シャットダウンを開始");
    await app.close();
    await closeDatabase();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
