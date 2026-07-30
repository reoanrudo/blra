/**
 * Fastify アプリケーション構築関数。
 *
 * server.ts（エントリポイント）とテストの両方から呼べるように切り出した。
 * テストでは db や ingestOptions を注入して app.inject() で HTTP リクエストをシミュレートする。
 *
 * 設計書 §12.2 API のルーティングを登録する。
 */

import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "./db/types.js";
import { config } from "./config.js";
import { corpusRoutes } from "./routes/corpus.js";
import { adminRoutes, type AdminRouteOptions } from "./routes/admin.js";
import { apiError, INTERNAL_ERROR } from "./http/errors.js";

export interface BuildAppOptions {
  /** テスト時に別の DB 接続を注入する。省略時は共有 singleton を使う。 */
  db?: Kysely<Database>;
  /** Admin ルートのオプション（取込 Fetcher モック等）。 */
  admin?: AdminRouteOptions;
  /** ログレベル（テストで "silent" にする等）。 */
  logLevel?: string;
}

/**
 * Fastify アプリケーションを構築する。
 * listen() は呼ばない。呼び出し元（server.ts またはテスト）が制御する。
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const db = options.db ?? (await import("./db/connection.js")).db;

  const app = Fastify({
    logger: {
      level: options.logLevel ?? config.logLevel,
    },
    // クライアントのタイポ・基数間違いを 415/400 で落とす
    forceCloseConnections: true,
  });

  // DB 接続確認
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

  // プロセス生存確認（DB 不要）
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Corpus API（Source Registry 参照系）— 設計書 §12.2 # Corpus
  await app.register(corpusRoutes, { db, prefix: "" });

  // Admin API（書き込み系 + 監査）— 設計書 §12.2 # Admin
  await app.register(async (instance) => {
    await adminRoutes(instance, { db, ...options.admin });
  }, { prefix: "" });

  // エラーハンドラー: Fastify 標準エラー（バリデーション等）を統一形式へ
  app.setErrorHandler((rawErr, request, reply) => {
    const err = rawErr as FastifyError;

    // ajv のバリデーションエラー
    if (err.validation && err.validation.length > 0) {
      app.log.warn({ err, url: request.url }, "バリデーションエラー");
      const messages = err.validation
        .map((v: { message?: string }) => v.message ?? "validation error")
        .join("; ");
      return reply.status(400).send(apiError("VALIDATION_ERROR", messages));
    }

    // それ以外は内部エラーとして扱う
    app.log.error({ err, url: request.url }, "未処理エラー");
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      return reply.status(500).send(INTERNAL_ERROR);
    }
    // 4xx で明示的に送出されたエラーはそのまま返す
    return reply.status(statusCode).send(
      apiError("ERROR", err.message),
    );
  });

  return app;
}
