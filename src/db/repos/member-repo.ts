/**
 * organization_member テーブルのリポジトリ（M5）。
 *
 * SCR-20 組織・メンバー管理で使用する。
 * 1ユーザが複数ロール所持可（3組複合主キー）。
 */

import type { Kysely, Selectable } from "kysely";
import type { Database, RoleEnum } from "../types.js";

type OrgMember = Selectable<Database["organization_member"]>;

/**
 * メンバー情報（app_user JOIN organization_member）。
 */
export interface MemberWithUser extends OrgMember {
  email: string;
  display_name: string;
}

/**
 * 組織の全メンバーを取得する。
 * app_user を JOIN して email/display_name を含む。
 */
export async function listMembers(
  db: Kysely<Database>,
  organizationId: string,
): Promise<MemberWithUser[]> {
  return db
    .selectFrom("organization_member")
    .innerJoin("app_user", "app_user.user_id", "organization_member.user_id")
    .select([
      "organization_member.organization_id",
      "organization_member.user_id",
      "organization_member.role",
      "organization_member.granted_by",
      "organization_member.granted_at",
      "app_user.email",
      "app_user.display_name",
    ])
    .where("organization_member.organization_id", "=", organizationId)
    .orderBy("app_user.display_name", "asc")
    .orderBy("organization_member.role", "asc")
    .execute() as Promise<MemberWithUser[]>;
}

/**
 * ユーザの全ロール（全組織）を取得する。
 */
export async function getUserRoles(
  db: Kysely<Database>,
  userId: string,
): Promise<{ organizationId: string; role: RoleEnum }[]> {
  const rows = await db
    .selectFrom("organization_member")
    .select(["organization_id", "role"])
    .where("user_id", "=", userId)
    .execute();

  return rows.map((r) => ({
    organizationId: r.organization_id,
    role: r.role as RoleEnum,
  }));
}

/**
 * メンバー（ロール）を追加する。
 * 既に同じ (org, user, role) が存在する場合は何もしない（冪等）。
 */
export async function addMember(
  db: Kysely<Database>,
  params: {
    organizationId: string;
    userId: string;
    role: RoleEnum;
    grantedBy?: string | null;
  },
): Promise<void> {
  await db
    .insertInto("organization_member")
    .values({
      organization_id: params.organizationId,
      user_id: params.userId,
      role: params.role,
      granted_by: params.grantedBy ?? null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

/**
 * メンバーのロールを変更する。
 * 古いロールを削除し、新しいロールを挿入する（UPDATE ではなく DELETE+INSERT）。
 */
export async function changeMemberRole(
  db: Kysely<Database>,
  params: {
    organizationId: string;
    userId: string;
    oldRole: RoleEnum;
    newRole: RoleEnum;
  },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("organization_member")
      .where("organization_id", "=", params.organizationId)
      .where("user_id", "=", params.userId)
      .where("role", "=", params.oldRole)
      .execute();

    await trx
      .insertInto("organization_member")
      .values({
        organization_id: params.organizationId,
        user_id: params.userId,
        role: params.newRole,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  });
}

/**
 * 特定のロール割り当てを削除する。
 */
export async function removeMember(
  db: Kysely<Database>,
  params: {
    organizationId: string;
    userId: string;
    role?: RoleEnum; // 省略時は当該ユーザの全ロールを削除
  },
): Promise<void> {
  let query = db
    .deleteFrom("organization_member")
    .where("organization_id", "=", params.organizationId)
    .where("user_id", "=", params.userId);

  if (params.role) {
    query = query.where("role", "=", params.role);
  }

  await query.execute();
}
