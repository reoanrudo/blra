/**
 * 認証・認可関連の型定義（M5）。
 *
 * 設計書 §12.3（ロール5種）、§14.2（Managed OIDC）。
 * セッション格納内容と、リクエストから取り出す AuthUser 型を定義する。
 */

import type { RoleEnum } from "../db/types.js";

/**
 * セッション（@fastify/secure-session）に格納するユーザ情報。
 * 暗号化Cookieに保存されるため、機密情報は含めない。
 */
export interface SessionUser {
  /** app_user.user_id */
  userId: string;
  /** 現在選択中の組織 */
  organizationId: string;
  /** 所持ロール一覧 */
  roles: RoleEnum[];
  /** OIDC subject（issuer 内で一意。再検証用） */
  oidcSub: string;
  /** OIDC issuer URL（プロバイダ識別用） */
  oidcIssuer: string;
  /** 表示名 */
  displayName: string;
  /** セッション開始時刻（epoch ms） */
  createdAt: number;
}

/**
 * OIDC から取得するユーザ属性（JIT プロビジョニングで使用）。
 */
export interface OidcUserInfo {
  /** OIDC issuer URL（プロバイダ識別用） */
  issuer: string;
  /** OIDC sub claim（issuer 内で一意） */
  sub: string;
  /** email claim */
  email: string;
  /** preferred_username または email のローカル部 */
  displayName: string;
}

/**
 * AuthUser が指定ロールのいずれかを持っているか判定する。
 */
export function hasAnyRole(roles: RoleEnum[], required: RoleEnum[]): boolean {
  return required.some((r) => roles.includes(r));
}
