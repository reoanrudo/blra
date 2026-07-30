/**
 * @fastify/secure-session の設定（M5）。
 *
 * 暗号化Cookie（httpOnly + Secure + SameSite=Lax）でセッションを管理する。
 * 設計書 §14.2「Managed OIDC による認証」のセッション戦略。
 *
 * OIDC 無効時（スタブモード）はセッション機能を登録しない。
 * テストでは SessionUser を直接注入できるモックヘルパーを提供する。
 */

import secureSession from "@fastify/secure-session";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import type { SessionUser } from "./types.js";

/**
 * セッションに格納するデータの型。
 * @fastify/secure-session の SessionData を拡張する。
 */
export interface BlraSessionData {
  user?: SessionUser | null;
  oauthState?: string | null;
  oauthNonce?: string | null;
  oauthVerifier?: string | null;
  oauthReturnTo?: string | null;
}

// @fastify/secure-session の型拡張
declare module "@fastify/secure-session" {
  interface SessionData extends BlraSessionData {}
}

/**
 * セッションプラグインを Fastify に登録する。
 * buildApp() から呼ばれる。
 */
export async function registerSession(app: FastifyInstance): Promise<void> {
  if (!config.oidc.enabled) {
    // スタブモード: secure-session を登録せず、テストヘルパーで代替
    return;
  }

  await app.register(secureSession, {
    // Cookie 名
    cookieName: "blra_session",
    // Cookie 属性
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false, // 開発環境（localhost）。本番では true
      maxAge: config.oidc.sessionMaxAge,
    },
    // 暗号化キー（32バイト以上の base64 文字列）
    key: Buffer.from(config.oidc.sessionSecret, "base64"),
  });
}
