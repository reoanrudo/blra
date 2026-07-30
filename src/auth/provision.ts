/**
 * JIT（Just-In-Time）プロビジョニング（M5）。
 *
 * 設計書 §14.2「Managed OIDC による認証」のユーザ登録戦略。
 * 初回ログイン時に OIDC から取得した issuer + sub + email で app_user を作成し、
 * デフォルト組織の RESEARCHER ロールを付与する。
 *
 * 2回目以降は既存の app_user とロールを取得する（重複作成しない）。
 *
 * OIDC 仕様上 sub は issuer 内でのみ一意のため、(oidc_issuer, oidc_sub) で識別する。
 */

import type { Kysely } from "kysely";
import type { Database, RoleEnum } from "../db/types.js";
import type { OidcUserInfo, SessionUser } from "./types.js";

// デフォルト組織のUUID（マイグレーション 0007 で seed 渺み）
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000002";
const SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * OIDC ユーザ情報から BLRA 側の SessionUser を構築する。
 * app_user が存在しなければ作成（JIT）。ロールも取得する。
 */
export async function provisionUser(
  db: Kysely<Database>,
  userInfo: OidcUserInfo,
): Promise<SessionUser> {
  // 1. app_user を検索（oidc_issuer + oidc_sub で）
  let user = await db
    .selectFrom("app_user")
    .selectAll()
    .where("oidc_issuer", "=", userInfo.issuer)
    .where("oidc_sub", "=", userInfo.sub)
    .executeTakeFirst();

  // 2. 存在しなければ作成（JIT）
  if (!user) {
    user = await db
      .insertInto("app_user")
      .values({
        user_id: crypto.randomUUID(),
        oidc_issuer: userInfo.issuer,
        oidc_sub: userInfo.sub,
        email: userInfo.email,
        display_name: userInfo.displayName,
        status: "ACTIVE",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // デフォルト組織の RESEARCHER ロールを付与
    await db
      .insertInto("organization_member")
      .values({
        organization_id: DEFAULT_ORG_ID,
        user_id: user.user_id,
        role: "RESEARCHER" as RoleEnum,
        granted_by: null, // JIT なので付与者なし
      })
      .execute();
  }

  // 3. ユーザの全ロールを取得（全組織）
  const memberships = await db
    .selectFrom("organization_member")
    .select(["organization_id", "role"])
    .where("user_id", "=", user.user_id)
    .execute();

  const roles = memberships.map((m) => m.role as RoleEnum);

  // 現在の組織を決定:
  // - SYSTEM_ADMIN ロールがあればシステム組織
  // - そうでなければ最初の組織メンバーシップ（通常は DEFAULT）
  const isSystemAdmin = roles.includes("SYSTEM_ADMIN");
  const organizationId = isSystemAdmin
    ? SYSTEM_ORG_ID
    : memberships[0]?.organization_id ?? DEFAULT_ORG_ID;

  return {
    userId: user.user_id,
    organizationId,
    roles,
    oidcSub: user.oidc_sub,
    oidcIssuer: user.oidc_issuer,
    displayName: user.display_name,
    createdAt: Date.now(),
  };
}
