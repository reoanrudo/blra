/**
 * /me エンドポイント（M5）。
 *
 * 設計書 §19.18.3「auth → OIDC / me」。
 * 現在ログイン中のユーザ情報を返す。
 * フロントエンド（React）がセッション状態を把握するために使用する。
 *
 * 認証必須。未認証時は 401。
 */

import type { FastifyInstance } from "fastify";
import { requireAuth, getSessionUser } from "../auth/require-roles.js";
import { wrapResponse, generateRequestId } from "../http/meta.js";
import { apiError } from "../http/errors.js";

/**
 * /me ルートを登録する。
 */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getSessionUser(request);
      if (!user) {
        // requireAuth で弾かれるはずだが念のため
        return reply
          .status(401)
          .send(apiError("UNAUTHORIZED", "ログインが必要です"));
      }

      return reply.send(
        wrapResponse(
          {
            user_id: user.userId,
            display_name: user.displayName,
            organization_id: user.organizationId,
            roles: user.roles,
          },
          generateRequestId(request.id),
          new Date().toISOString(),
        ),
      );
    },
  );
}
