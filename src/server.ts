/**
 * Fastify サーバーのエントリポイント。
 * M1 ではヘルスチェックのみ。ルーティングは M2 以降に追加する。
 */

import Fastify from "fastify";
import { sql } from "kysely";
import { config } from "./config.js";
import { db, closeDatabase } from "./db/connection.js";

const app = Fastify({
  logger: {
    level: config.logLevel,
  },
});

// ヘルスチェック: プロセスの生存確認
app.get("/health", async () => {
  return { status: "ok" };
});

// 準備状態確認: DB 接続確認（M1 の動作検証用）
app.get("/ready", async (_request, reply) => {
  try {
    await sql`SELECT 1`.execute(db);
    return { status: "ready", database: "connected" };
  } catch (err) {
    app.log.error({ err }, "DB 接続確認に失敗");
    reply.status(503);
    return { status: "not_ready", database: "disconnected" };
  }
});

async function main() {
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`サーバー起動: http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error({ err }, "サーバー起動に失敗");
    process.exit(1);
  }
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

void main();
