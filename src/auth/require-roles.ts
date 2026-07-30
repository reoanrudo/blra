/**
 * RBAC 認可ミドルウェア（M5）。
 *
 * 設計書 §12.3（ロール5種）。
 * preHandler フックとして動作し、セッションの有無とロール要件を検証する。
 *
 * 使用例:
 *   app.post("/admin/ingest", { preHandler: requireRoles("CORPUS_EDITOR") }, handler)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RoleEnum } from "../db/types.js";
import { hasAnyRole, type SessionUser } from "./types.js";
import { apiError } from "../http/errors.js";

/**
 * 認証済みかを確認するヘルパー。
 * スタブモード（OIDC無効）では app.stubSessionUser から取得（テスト用）。
 */
export function getSessionUser(request: FastifyRequest): SessionUser | null {
  // OIDC有効時: @fastify/secure-session の request.session から取得
  const session = (request as FastifyRequest & { session?: { user?: SessionUser | null } }).session;
  if (session?.user) {
    return session.user;
  }

  // スタブモード（OIDC無効）: app.decorate された stubSessionUser から取得
  // テストヘルパーが app.stubSessionUser に SessionUser をセットする
  const app = request.server as FastifyInstance & {
    stubSessionUser?: SessionUser | null;
  };
  return app.stubSessionUser ?? null;
}

/**
 * 認証必須の preHandler。
 * 未認証の場合 401 を返す。
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = getSessionUser(request);
  if (!user) {
    await reply
      .status(401)
      .send(apiError("UNAUTHORIZED", "ログインが必要です"));
  }
}

/**
 * 指定ロールのいずれかを所持していることを要求する preHandler。
 * 認証（requireAuth）の後に使用する。
 *
 * @param required 必要ロール（いずれか1つでも所持すればOK）
 */
export function requireRoles(...required: RoleEnum[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = getSessionUser(request);

    // 未認証
    if (!user) {
      await reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "ログインが必要です"));
      return;
    }

    // ロールチェック
    if (!hasAnyRole(user.roles, required)) {
      await reply.status(403).send(
        apiError(
          "FORBIDDEN",
          `この操作には権限が不足しています（必要: ${required.join(", ")}）`,
        ),
      );
    }
  };
}

/**
 * 自組織のみアクセス可能なエンドポイント用の検証。
 * パスパラメータ :id の organizationId が セッションの組織と一致するか。
 * SYSTEM_ADMIN は全組織にアクセス可能。
 */
export function requireSameOrganization(
  paramKey: string = "id",
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const user = getSessionUser(request);
    if (!user) {
      await reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "ログインが必要です"));
      return;
    }

    // SYSTEM_ADMIN は全組織アクセス可
    if (user.roles.includes("SYSTEM_ADMIN")) {
      return;
    }

    const targetOrgId = (request.params as Record<string, string>)[paramKey];
    if (targetOrgId !== user.organizationId) {
      await reply
        .status(403)
        .send(apiError("FORBIDDEN", "自組織のリソースのみ操作できます"));
    }
  };
}
