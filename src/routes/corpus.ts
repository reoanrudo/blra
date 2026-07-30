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
import { getProvisionCurrentVersion } from "../db/repos/provision-repo.js";
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
};
