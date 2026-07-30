/**
 * Corpus API ルート（Source Registry 参照系）。
 * 設計書 §12.2 # Corpus の読み取り系エンドポイント。
 *
 * M4 で実装する4エンドポイント:
 *   GET /sources                  取込済み法令一覧
 *   GET /sources/{id}             法令1件のメタデータ
 *   GET /sources/{id}/versions    法令の版履歴
 *   GET /provisions/{id}          条項の現行版取得
 *
 * §5.3 制約: 公開済み版（published_at IS NOT NULL）のみ返す。
 */

import type { FastifyPluginAsync } from "fastify";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../db/types.js";
import {
  listPublishedSources,
  getSourceById,
  listPublishedSourceVersions,
} from "../db/repos/source-repo.js";
import {
  getProvisionCurrentVersion,
  listProvisionsWithCurrentVersion,
} from "../db/repos/provision-repo.js";
import { listReferenceEdgesBySource } from "../db/repos/reference-edge-repo.js";
import { wrapResponse, generateRequestId } from "../http/meta.js";
import { NOT_FOUND, isValidUuid } from "../http/errors.js";

export interface CorpusRouteOptions {
  db: Kysely<Database>;
}

/**
 * corpus_version（最新の取込時刻）を取得する。
 * 全レスポンスの meta.corpus_version に使う。
 */
async function getCorpusVersion(db: Kysely<Database>): Promise<string> {
  const result = await sql<{ max: string | null }>`
    SELECT MAX(recorded_at) as max FROM source_version
  `.execute(db);
  const max = result.rows[0]?.max;
  return max ?? new Date().toISOString();
}

export const corpusRoutes: FastifyPluginAsync<CorpusRouteOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;

  // GET /sources — 取込済み法令一覧
  app.get("/sources", async (request, reply) => {
    const sources = await listPublishedSources(db);

    if (sources.length === 0) {
      const corpusVersion = await getCorpusVersion(db);
      return reply.send(
        wrapResponse([], generateRequestId(request.id), corpusVersion),
      );
    }

    const corpusVersion = await getCorpusVersion(db);
    return reply.send(
      wrapResponse(
        sources.map((s) => ({
          source_id: s.source_id,
          canonical_uri: s.canonical_uri,
          title: s.title,
          abbrev: s.abbrev,
          authority_class: s.authority_class,
          jurisdiction: s.jurisdiction,
          source_type: s.source_type,
        })),
        generateRequestId(request.id),
        corpusVersion,
      ),
    );
  });

  // GET /sources/:id — 法令1件
  app.get<{ Params: { id: string } }>(
    "/sources/:id",
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidUuid(id)) {
        return reply.status(404).send(NOT_FOUND("Source"));
      }

      const source = await getSourceById(db, id);

      if (!source) {
        return reply.status(404).send(NOT_FOUND("Source"));
      }

      const corpusVersion = await getCorpusVersion(db);
      return reply.send(
        wrapResponse(
          {
            source_id: source.source_id,
            canonical_uri: source.canonical_uri,
            title: source.title,
            title_kana: source.title_kana,
            abbrev: source.abbrev,
            publisher: source.publisher,
            authority_class: source.authority_class,
            jurisdiction: source.jurisdiction,
            source_type: source.source_type,
            status: source.status,
          },
          generateRequestId(request.id),
          corpusVersion,
        ),
      );
    },
  );

  // GET /sources/:id/versions — 版履歴
  app.get<{ Params: { id: string } }>(
    "/sources/:id/versions",
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidUuid(id)) {
        return reply.status(404).send(NOT_FOUND("Source"));
      }

      const source = await getSourceById(db, id);

      if (!source) {
        return reply.status(404).send(NOT_FOUND("Source"));
      }

      const versions = await listPublishedSourceVersions(db, id);
      const corpusVersion = await getCorpusVersion(db);

      return reply.send(
        wrapResponse(
          versions.map((v) => ({
            source_version_id: v.source_version_id,
            content_hash: v.content_hash,
            parser_version: v.parser_version,
            consolidation_state: v.consolidation_state,
            verification_status: v.verification_status,
            promulgated_at: v.promulgated_at,
            valid_from: v.valid_from,
            valid_from_status: v.valid_from_status,
            valid_to: v.valid_to,
            retrieved_at: v.retrieved_at,
            published_at: v.published_at,
          })),
          generateRequestId(request.id),
          corpusVersion,
        ),
      );
    },
  );

  // GET /sources/:id/provisions — source 配下の条文一覧（現行版付き）
  // SCR-03 法令リーダーが章・条単位で本文を表示するために使う。
  // §19.22.2-(4): 本文テキストのみ（ハイライト・参照等のメタデータは別ペイロード）。
  app.get<{
    Params: { id: string };
    Querystring: { from?: string; limit?: string };
  }>("/sources/:id/provisions", async (request, reply) => {
    const { id } = request.params;
    if (!isValidUuid(id)) {
      return reply.status(404).send(NOT_FOUND("Source"));
    }

    const source = await getSourceById(db, id);
    if (!source) {
      return reply.status(404).send(NOT_FOUND("Source"));
    }

    // クエリパラメータを安全にパース（不正値は無視してデフォルトへ）
    const from = parseNonNegInt(request.query.from);
    const limit = parseNonNegInt(request.query.limit);

    const results = await listProvisionsWithCurrentVersion(db, id, {
      from: from ?? 0,
      limit: limit ?? undefined,
    });

    const corpusVersion = await getCorpusVersion(db);
    return reply.send(
      wrapResponse(
        results.map(({ provision, currentVersion }) => ({
          provision_id: provision.provision_id,
          source_id: provision.source_id,
          canonical_path: provision.canonical_path,
          provision_type: provision.provision_type,
          stable_label: provision.stable_label,
          version: {
            provision_version_id: currentVersion.provision_version_id,
            heading: currentVersion.heading,
            body: currentVersion.body,
            citation_anchor: currentVersion.citation_anchor,
            content_fingerprint: currentVersion.content_fingerprint,
            sequence: currentVersion.sequence,
            valid_from: currentVersion.valid_from,
            valid_from_status: currentVersion.valid_from_status,
            valid_to: currentVersion.valid_to,
          },
        })),
        generateRequestId(request.id),
        corpusVersion,
      ),
    );
  });

  // GET /provisions/:id — 条項の現行版
  app.get<{ Params: { id: string } }>(
    "/provisions/:id",
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidUuid(id)) {
        return reply.status(404).send(NOT_FOUND("Provision"));
      }

      const result = await getProvisionCurrentVersion(db, id);

      if (!result) {
        return reply.status(404).send(NOT_FOUND("Provision"));
      }

      const { provision, currentVersion } = result;
      const corpusVersion = await getCorpusVersion(db);

      return reply.send(
        wrapResponse(
          {
            provision_id: provision.provision_id,
            source_id: provision.source_id,
            canonical_path: provision.canonical_path,
            provision_type: provision.provision_type,
            stable_label: provision.stable_label,
            version: {
              provision_version_id: currentVersion.provision_version_id,
              heading: currentVersion.heading,
              body: currentVersion.body,
              citation_anchor: currentVersion.citation_anchor,
              content_fingerprint: currentVersion.content_fingerprint,
              sequence: currentVersion.sequence,
              valid_from: currentVersion.valid_from,
              valid_from_status: currentVersion.valid_from_status,
              valid_to: currentVersion.valid_to,
            },
          },
          generateRequestId(request.id),
          corpusVersion,
        ),
      );
    },
  );

  // GET /provisions/:id/references — 参照エッジ一覧
  // SCR-03 法令リーダーのサポートペイン「関連」用（§19.5）。
  // §19.5 規範順（委任先→定義→例外→参照→未確認→未解決）で返す。
  app.get<{ Params: { id: string } }>(
    "/provisions/:id/references",
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidUuid(id)) {
        return reply.status(404).send(NOT_FOUND("Provision"));
      }

      //条文の存在確認（存在しない条文の参照は 404）
      const provisionExists = await db
        .selectFrom("provision")
        .select("provision_id")
        .where("provision_id", "=", id)
        .executeTakeFirst();

      if (!provisionExists) {
        return reply.status(404).send(NOT_FOUND("Provision"));
      }

      const edges = await listReferenceEdgesBySource(db, id);
      const corpusVersion = await getCorpusVersion(db);

      return reply.send(
        wrapResponse(
          edges.map((e) => ({
            edge_id: e.edge_id,
            target_provision_id: e.target_provision_id,
            target_label: e.target_label,
            edge_type: e.edge_type,
            resolution_status: e.resolution_status,
            source_text_span: e.source_text_span,
          })),
          generateRequestId(request.id),
          corpusVersion,
        ),
      );
    },
  );
};

/**
 * クエリパラメータを非負整数にパースする。
 * 不正値（空文字・負数・非数値）の場合は undefined を返し、呼び出し側でデフォルト値を使う。
 */
function parseNonNegInt(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}
