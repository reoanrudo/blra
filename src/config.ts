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

export const config = {
  databaseUrl: required("DATABASE_URL"),
  port: parseInt(optional("PORT", "3000"), 10),
  host: optional("HOST", "0.0.0.0"),
  logLevel: optional("LOG_LEVEL", "info"),
  // e-Gov 法令API v2 のベースURL（認証不要）
  egovApiBase: optional("EGOV_API_BASE", "https://laws.e-gov.go.jp/api/2"),
  // 原本XMLの保存先ディレクトリ（ローカルFS。§8.2-2 原本は先に残す）
  rawDataDir: optional("RAW_DATA_DIR", "data/raw"),
} as const;
