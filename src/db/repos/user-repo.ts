/**
 * app_user テーブルのリポジトリ（M5）。
 *
 * JIT プロビジョニング（provision.ts）と
 * SCR-20 メンバー管理（members.ts）で使用する。
 *
 * OIDC 仕様上 sub は issuer 内でのみ一意のため、(oidc_issuer, oidc_sub) で識別する。
 */

import type { Kysely, Selectable } from "kysely";
import type { Database } from "../types.js";

type AppUser = Selectable<Database["app_user"]>;

/**
 * OIDC issuer + sub でユーザを検索する。
 */
export async function getUserByOidc(
  db: Kysely<Database>,
  oidcIssuer: string,
  oidcSub: string,
): Promise<AppUser | undefined> {
  return db
    .selectFrom("app_user")
    .selectAll()
    .where("oidc_issuer", "=", oidcIssuer)
    .where("oidc_sub", "=", oidcSub)
    .executeTakeFirst();
}

/**
 * user_id でユーザを検索する。
 */
export async function getUserById(
  db: Kysely<Database>,
  userId: string,
): Promise<AppUser | undefined> {
  return db
    .selectFrom("app_user")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

/**
 * email でユーザを検索する（SCR-20 メンバー追加時の既存ユーザ検索）。
 */
export async function getUserByEmail(
  db: Kysely<Database>,
  email: string,
): Promise<AppUser | undefined> {
  return db
    .selectFrom("app_user")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}
