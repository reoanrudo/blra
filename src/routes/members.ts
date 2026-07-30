/**
 * 組織・メンバー管理 API（M5: SCR-20）。
 *
 * 設計書 §19.3 SCR-20「組織・メンバー管理（最小版）」。
 * 以下のエンドポイントを提供する:
 *   GET    /admin/organizations/:id/members          メンバー一覧
 *   POST   /admin/organizations/:id/members          メンバー追加（既存ユーザのみ）
 *   PATCH  /admin/organizations/:id/members/:userId  ロール変更
 *   DELETE /admin/organizations/:id/members/:userId  メンバー削除
 *
 * 全エンドポイント要認証 + ORGANIZATION_ADMIN（自組織のみ）。
 * SYSTEM_ADMIN は全組織アクセス可。
 */

import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database, RoleEnum } from "../db/types.js";
import {
  listMembers,
  addMember,
  changeMemberRole,
  removeMember,
} from "../db/repos/member-repo.js";
import { getUserByEmail } from "../db/repos/user-repo.js";
import {
  requireRoles,
  requireSameOrganization,
  getSessionUser,
} from "../auth/require-roles.js";
import { wrapResponse, generateRequestId } from "../http/meta.js";
import {
  apiError,
  NOT_FOUND,
  isValidUuid,
} from "../http/errors.js";
import type { RoleEnum as RE } from "../db/types.js";

const VALID_ROLES: RoleEnum[] = [
  "ORGANIZATION_ADMIN",
  "RESEARCHER",
  "REVIEWER",
  "CORPUS_EDITOR",
  "SYSTEM_ADMIN",
];

export interface MemberRouteOptions {
  db: Kysely<Database>;
}

export async function memberRoutes(
  app: FastifyInstance,
  opts: MemberRouteOptions,
): Promise<void> {
  const { db } = opts;

  // GET /admin/organizations/:id/members — メンバー一覧
  app.get<{ Params: { id: string } }>(
    "/admin/organizations/:id/members",
    {
      preHandler: [requireRoles("ORGANIZATION_ADMIN", "SYSTEM_ADMIN"), requireSameOrganization()],
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidUuid(id)) {
        return reply.status(404).send(NOT_FOUND("Organization"));
      }

      const members = await listMembers(db, id);

      return reply.send(
        wrapResponse(
          members.map((m) => ({
            user_id: m.user_id,
            email: m.email,
            display_name: m.display_name,
            role: m.role,
            granted_at: m.granted_at,
          })),
          generateRequestId(request.id),
          new Date().toISOString(),
        ),
      );
    },
  );

  // POST /admin/organizations/:id/members — メンバー追加
  app.post<{
    Params: { id: string };
    Body: { email?: string; role?: string };
  }>(
    "/admin/organizations/:id/members",
    {
      preHandler: [requireRoles("ORGANIZATION_ADMIN", "SYSTEM_ADMIN"), requireSameOrganization()],
      schema: {
        body: {
          type: "object",
          required: ["email", "role"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: VALID_ROLES },
          },
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.status(400).send(
          apiError(
            "VALIDATION_ERROR",
            request.validationError.validation
              ?.map((v: { message?: string }) => v.message ?? "validation error")
              .join("; ") ?? "validation error",
          ),
        );
      }

      const { id: orgId } = request.params;
      const { email, role } = request.body;
      const user = getSessionUser(request)!;

      // 既存ユーザを email で検索（招待メールは M5 範囲外）
      const targetUser = await getUserByEmail(db, email!);
      if (!targetUser) {
        return reply
          .status(404)
          .send(NOT_FOUND("ユーザ（まだ登録されていないメールアドレスです）"));
      }

      // ロール付与
      await addMember(db, {
        organizationId: orgId,
        userId: targetUser.user_id,
        role: role as RE,
        grantedBy: user.userId,
      });

      return reply.status(201).send(
        wrapResponse(
          {
            user_id: targetUser.user_id,
            email: targetUser.email,
            display_name: targetUser.display_name,
            role,
            organization_id: orgId,
          },
          generateRequestId(request.id),
          new Date().toISOString(),
        ),
      );
    },
  );

  // PATCH /admin/organizations/:id/members/:userId — ロール変更
  app.patch<{
    Params: { id: string; userId: string };
    Body: { oldRole?: string; newRole?: string };
  }>(
    "/admin/organizations/:id/members/:userId",
    {
      preHandler: [requireRoles("ORGANIZATION_ADMIN", "SYSTEM_ADMIN"), requireSameOrganization()],
      schema: {
        body: {
          type: "object",
          required: ["oldRole", "newRole"],
          properties: {
            oldRole: { type: "string", enum: VALID_ROLES },
            newRole: { type: "string", enum: VALID_ROLES },
          },
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.status(400).send(
          apiError(
            "VALIDATION_ERROR",
            request.validationError.validation
              ?.map((v: { message?: string }) => v.message ?? "validation error")
              .join("; ") ?? "validation error",
          ),
        );
      }

      const { id: orgId, userId } = request.params;
      const { oldRole, newRole } = request.body;

      if (!isValidUuid(userId)) {
        return reply.status(404).send(NOT_FOUND("Member"));
      }

      await changeMemberRole(db, {
        organizationId: orgId,
        userId,
        oldRole: oldRole as RE,
        newRole: newRole as RE,
      });

      return reply.send(
        wrapResponse(
          {
            user_id: userId,
            organization_id: orgId,
            old_role: oldRole,
            new_role: newRole,
          },
          generateRequestId(request.id),
          new Date().toISOString(),
        ),
      );
    },
  );

  // DELETE /admin/organizations/:id/members/:userId — メンバー削除
  app.delete<{
    Params: { id: string; userId: string };
    Querystring: { role?: string };
  }>(
    "/admin/organizations/:id/members/:userId",
    {
      preHandler: [requireRoles("ORGANIZATION_ADMIN", "SYSTEM_ADMIN"), requireSameOrganization()],
    },
    async (request, reply) => {
      const { id: orgId, userId } = request.params;
      const { role } = request.query;

      if (!isValidUuid(userId)) {
        return reply.status(404).send(NOT_FOUND("Member"));
      }

      await removeMember(db, {
        organizationId: orgId,
        userId,
        role: role as RE | undefined,
      });

      return reply.status(204).send();
    },
  );
}
