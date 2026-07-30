/**
 * OIDC 認証ルート（M5）。
 *
 * 設計書 §19.18.3「auth → OIDC」。
 * 3つのエンドポイントを提供する:
 *   GET /auth/login     — Keycloak 認可エンドポイントへリダイレクト（PKCE）
 *   GET /auth/callback  — 認可コードをトークンと交換し、セッションを格納
 *   GET /auth/logout    — Keycloak end_session + セッション破棄
 *
 * OIDC 無効時（スタブモード）はルートを登録しない。
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { generators } from "openid-client";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { config } from "../config.js";
import { getOidcClient } from "./oidc-client.js";
import { provisionUser } from "./provision.js";
import type { OidcUserInfo, SessionUser } from "./types.js";

export interface AuthRouteOptions {
  db: Kysely<Database>;
}

/**
 * 認証ルートを登録する。
 * buildApp() から呼ばれる。OIDC 無効時は何もしない。
 */
export async function authRoutes(
  app: FastifyInstance,
  opts: AuthRouteOptions,
): Promise<void> {
  if (!config.oidc.enabled) {
    return;
  }

  const { db } = opts;

  // GET /auth/login — Keycloak へリダイレクト
  app.get("/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const client = await getOidcClient();
    if (!client) {
      return reply.status(500).send({ error: "OIDC not configured" });
    }

    // PKCE verifier と state/nonce を生成してセッションに保存
    const verifier = generators.codeVerifier();
    const challenge = generators.codeChallenge(verifier);
    const state = generators.state();
    const nonce = generators.nonce();

    // returnTo（ログイン後に戻るURL）をクエリから取得
    const { returnTo } = request.query as { returnTo?: string };
    const safeReturnTo = sanitizeReturnTo(returnTo);

    // セッションに一時データを保存
    request.session.set("oauthVerifier", verifier);
    request.session.set("oauthState", state);
    request.session.set("oauthNonce", nonce);
    request.session.set("oauthReturnTo", safeReturnTo);

    const authUrl = client.authorizationUrl({
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    return reply.redirect(authUrl);
  });

  // GET /auth/callback — 認可コードをトークンと交換
  app.get(
    "/auth/callback",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const client = await getOidcClient();
      if (!client) {
        return reply.status(500).send({ error: "OIDC not configured" });
      }

      const verifier = request.session.get("oauthVerifier") ?? undefined;
      const state = request.session.get("oauthState") ?? undefined;
      const nonce = request.session.get("oauthNonce") ?? undefined;
      const returnTo = request.session.get("oauthReturnTo") ?? "/admin";

      try {
        // 認可コードをトークンセットと交換（state・nonce 検証含む）
        const params = client.callbackParams(request.raw);
        const tokenSet = await client.callback(
          config.oidc.redirectUri,
          params,
          { code_verifier: verifier, state, nonce },
        );

        // ID トークンの claims からユーザ情報を取得
        const claims = tokenSet.claims();
        // issuer は ID トークンの iss claim から取得
        const issuer = (claims.iss as string) ?? config.oidc.issuer;
        const userInfo: OidcUserInfo = {
          issuer,
          sub: claims.sub,
          email: (claims.email as string) ?? "unknown@example.com",
          displayName:
            (claims.preferred_username as string) ??
            (claims.email as string)?.split("@")[0] ??
            claims.sub,
        };

        // JIT プロビジョニング（app_user 作成/取得 + ロール取得）
        const sessionUser: SessionUser = await provisionUser(db, userInfo);

        // セッションに格納
        request.session.set("user", sessionUser);

        // 一時データをクリア
        request.session.set("oauthVerifier", undefined);
        request.session.set("oauthState", undefined);
        request.session.set("oauthNonce", undefined);
        request.session.set("oauthReturnTo", undefined);

        // フロントエンドへリダイレクト
        const frontendUrl = sanitizeReturnTo(returnTo);
        return reply.redirect(frontendUrl);
      } catch (err) {
        app.log.error({ err }, "OIDC コールバックでエラー");
        return reply
          .status(401)
          .send({ error: { code: "AUTH_FAILED", message: "認証に失敗しました" } });
      }
    },
  );

  // GET /auth/logout — Keycloak end_session + セッション破棄
  app.get("/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const client = await getOidcClient();

    // セッション破棄
    request.session.delete();

    if (client) {
      // Keycloak の end_session エンドポイントへリダイレクト
      const logoutUrl = client.endSessionUrl({
        post_logout_redirect_uri: config.oidc.postLogoutRedirectUri,
      });
      return reply.redirect(logoutUrl);
    }

    return reply.redirect(config.oidc.postLogoutRedirectUri);
  });
}

/**
 * returnTo が安全なパスか検証する（オープンリダイレクト対策）。
 * 相対パス（/ で始まる）のみ許可。外部URLは却下。
 */
function sanitizeReturnTo(returnTo?: string | null): string {
  if (!returnTo) return "/admin";
  // / で始まり、//（プロトコル相対URL）でない場合のみ許可
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return "/admin";
}
