/**
 * openid-client のクライアント初期化（M5）。
 *
 * 設計書 §14.2「Managed OIDC による認証」。
 * Keycloak の discovery エンドポイントから設定を取得し、
 * 認可コードフロー + PKCE のクライアントを構築する。
 *
 * OIDC 無効時（スタブモード）は null を返す。
 */

import { Issuer, type BaseClient } from "openid-client";
import { config } from "../config.js";

let clientPromise: Promise<BaseClient | null> | null = null;

/**
 * OIDC クライアントを取得する（シングルトン）。
 * 初回呼び出しで Keycloak の discovery を実行し、クライアントを構築・キャッシュする。
 * OIDC 無効時は null。
 */
export async function getOidcClient(): Promise<BaseClient | null> {
  if (!config.oidc.enabled) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = initClient().catch((err) => {
      // 初期化失敗時はキャッシュをクリアして再試行可能にする
      clientPromise = null;
      throw err;
    });
  }

  return clientPromise;
}

async function initClient(): Promise<BaseClient> {
  const { issuer, clientId, clientSecret, redirectUri } = config.oidc;

  // Keycloak の well-known エンドポイントから issuer メタデータを取得
  const issuerInstance = await Issuer.discover(issuer);

  // 認可コードフロー + PKCE のクライアントを構築
  const client = new issuerInstance.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
  });

  return client;
}

/**
 * OIDC クライアントを強制的に再初期化する（テスト用）。
 */
export function resetOidcClient(): void {
  clientPromise = null;
}
