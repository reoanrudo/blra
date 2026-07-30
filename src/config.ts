/**
 * 環境変数の読込と検証。
 * アプリケーション全体で唯一の設定アクセスポイント。
 */

import { config as loadEnv } from "dotenv";

// .env を読み込む（他のモジュールよりも先に実行する必要がある）
loadEnv();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`必須環境変数 ${key} が設定されていません。.env を確認してください。`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * OIDC / Keycloak 設定（M5: 認証基盤）。
 * 設計書 §14.2「Managed OIDC による認証」。
 *
 * 全項目オプショナル: 未設定時は認証機能が無効（スタブモード）になる。
 * これにより M4 までのテストが OIDC 依存せず動作し続ける。
 */
const oidcEnabled = process.env.OIDC_ENABLED === "true";

const oidc = oidcEnabled
  ? {
      enabled: true as const,
      // Keycloak の issuer URL（例: http://localhost:8080/realms/blra）
      issuer: required("OIDC_ISSUER"),
      // Keycloak クライアントID
      clientId: required("OIDC_CLIENT_ID"),
      // OIDC クライアントシークレット（PKCE 使用時も設定推奨）
      clientSecret: required("OIDC_CLIENT_SECRET"),
      // コールバックURL（Fastify 側）
      redirectUri: optional(
        "OIDC_REDIRECT_URI",
        "http://localhost:3000/auth/callback",
      ),
      // ログアウト後のリダイレクト先
      postLogoutRedirectUri: optional(
        "OIDC_POST_LOGOUT_REDIRECT_URI",
        "http://localhost:5173",
      ),
      // @fastify/secure-session の Cookie 暗号化キー（32バイト以上）
      sessionSecret: required("SESSION_SECRET"),
      // Cookie の有効期限（秒）。デフォルト8時間 = 業務利用1日
      sessionMaxAge: parseInt(optional("SESSION_MAX_AGE", "28800"), 10),
    }
  : {
      enabled: false as const,
      issuer: "",
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      postLogoutRedirectUri: "",
      sessionSecret: "",
      sessionMaxAge: 28800,
    };

export const config = {
  databaseUrl: required("DATABASE_URL"),
  port: parseInt(optional("PORT", "3000"), 10),
  host: optional("HOST", "0.0.0.0"),
  logLevel: optional("LOG_LEVEL", "info"),
  // e-Gov 法令API v2 のベースURL（認証不要）
  egovApiBase: optional("EGOV_API_BASE", "https://laws.e-gov.go.jp/api/2"),
  // 原本XMLの保存先ディレクトリ（ローカルFS。§8.2-2 原本は先に残す）
  rawDataDir: optional("RAW_DATA_DIR", "data/raw"),
  // OIDC / Keycloak（M5）
  oidc,
} as const;
