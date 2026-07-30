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
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Kysely } from "kysely";
import type { Database } from "./db/types.js";
import { config } from "./config.js";
import { corpusRoutes } from "./routes/corpus.js";
import { adminRoutes, type AdminRouteOptions } from "./routes/admin.js";
import { meRoutes } from "./routes/me.js";
import { memberRoutes } from "./routes/members.js";
import { registerSession } from "./auth/session.js";
import { authRoutes } from "./auth/routes.js";
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

  // M5: セッション・認証（OIDC 有効時のみ登録）
  await registerSession(app);
  await app.register(async (instance) => {
    await authRoutes(instance, { db });
  }, { prefix: "" });

  // スタブモード（OIDC無効）時: テストヘルパーが stubSessionUser を設定可能
  // OIDC有効時は使用されない（request.session が優先される）
  if (!config.oidc.enabled) {
    app.decorate("stubSessionUser", null);
  }

  // M5: 素のHTMLフォーム配信（SCR-00 ログイン、SCR-10/12/20 管理画面）
  // プロジェクトルートの public/ から配信
  const { default: fastifyStatic } = await import("@fastify/static");
  await app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "public"),
    prefix: "/",
    decorateReply: false,
  });

  // SCR-03 法令リーダー（React SPA）配信。
  // web/dist が存在する場合（npm run build 済み）のみ配信。
  // ADR-030: 素のHTMLフォーム（public/）は残置。両者は別パス衝突しない。
  const webDistPath = path.resolve(process.cwd(), "web", "dist");
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
      decorateReply: false,
      // 既存の public/ 配信や API ルートと衝突しないよう、
      // ファイルが存在しない場合は次のハンドラへ委譲
      wildcard: false,
    });

    // SPA fallback: API ルートと静的ファイル以外の未知パスは index.html へ。
    // TanStack Router 等のクライアントサイドルーティングを支える。
    app.setNotFoundHandler(async (request, reply) => {
      // API パス（/sources, /provisions, /me, /auth, /admin 等）は JSON エラーのまま
      const apiPrefixes = [
        "/sources",
        "/provisions",
        "/me",
        "/auth",
        "/admin",
        "/health",
        "/ready",
      ];
      if (apiPrefixes.some((p) => request.url.startsWith(p))) {
        return reply
          .status(404)
          .send(apiError("NOT_FOUND", "リソースが見つかりません"));
      }
      // 拡張子付きリクエスト（.js, .css, .png 等）は静的ファイルNotFound
      if (path.extname(request.url)) {
        return reply
          .status(404)
          .send(apiError("NOT_FOUND", "ファイルが見つかりません"));
      }
      // それ以外（/, /reader/xxx 等）は index.html へフォールバック
      try {
        const indexHtml = await readFile(
          path.join(webDistPath, "index.html"),
          "utf-8",
        );
        reply.type("text/html").send(indexHtml);
      } catch {
        reply
          .status(404)
          .send(apiError("NOT_FOUND", "フロントエンドがビルドされていません"));
      }
    });
  }

  // M5: /me エンドポイント
  await app.register(async (instance) => {
    await meRoutes(instance);
  }, { prefix: "" });

  // Admin API（書き込み系 + 監査）— 設計書 §12.2 # Admin
  await app.register(async (instance) => {
    await adminRoutes(instance, { db, ...options.admin });
  }, { prefix: "" });

  // M5: 組織・メンバー管理 API（SCR-20）
  await app.register(async (instance) => {
    await memberRoutes(instance, { db });
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
