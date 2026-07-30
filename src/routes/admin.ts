/**
 * Admin API ルート（書き込み系 + 監査 + 取込トリガー）。
 * 設計書 §12.2 # Admin。
 *
 * M4 で実装する3エンドポイント:
 *   POST /admin/ingest                         取込トリガー（ingestSourceVersion の HTTP ラッパー）
 *   POST /admin/source-versions/:id/publish    要Review版の手動Publish
 *   GET  /admin/audit                          監査ログ検索
 *
 * M4 時点では認証未実装（M5 OIDC）。監査の actor_id は NULL で記録。
 */

import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  getSourceVersionById,
  publishSourceVersion,
} from "../db/repos/source-repo.js";
import {
  insertAuditRecord,
  queryAuditRecords,
  type AuditQueryFilters,
} from "../db/repos/audit-repo.js";
import { ingestSourceVersion } from "../ingest/pipeline.js";
import type { IngestOptions } from "../ingest/types.js";
import { wrapResponse, generateRequestId } from "../http/meta.js";
import {
  apiError,
  NOT_FOUND,
  ALREADY_PUBLISHED,
  VALIDATION_ERROR,
  INTERNAL_ERROR,
  isValidUuid,
} from "../http/errors.js";

/**
 * correlation_id は UUID 型。request.id が UUID でない場合は null にする。
 */
function toCorrelationId(requestId: string | undefined): string | null {
  if (requestId && isValidUuid(requestId)) {
    return requestId;
  }
  return null;
}

export interface AdminRouteOptions {
  db: Kysely<Database>;
  /** 取込 Fetcher モック（テスト用）。省略時は本番 Fetcher を使う。 */
  ingestFetcher?: IngestOptions["fetcher"];
}

/**
 * Admin ルートを登録する。
 * buildApp から呼ばれる。
 */
export async function adminRoutes(
  app: FastifyInstance,
  opts: AdminRouteOptions,
): Promise<void> {
  const { db } = opts;

  // POST /admin/ingest — 取込トリガー
  // body: { lawId: string }
  // 同期待ち: ingestSourceVersion() の完了を待って結果を返す。
  app.post<{
    Body: { lawId?: string };
  }>(
    "/admin/ingest",
    {
      schema: {
        body: {
          type: "object",
          required: ["lawId"],
          properties: {
            lawId: { type: "string", minLength: 1 },
          },
        },
      },
      // バリデーションエラーをハンドラ内で処理する（Fastify デフォルトのエラーレスポンスを回避）
      attachValidation: true,
    },
    async (request, reply) => {
      // attachValidation: true により、バリデーションエラーはここで処理
      if (request.validationError) {
        return reply
          .status(400)
          .send(
            apiError(
              "VALIDATION_ERROR",
              request.validationError.validation
                ?.map((v: { message?: string }) => v.message ?? "validation error")
                .join("; ") ?? "validation error",
            ),
          );
      }

      const { lawId } = request.body;

      try {
        const ingestOptions: IngestOptions = {};
        if (opts.ingestFetcher) {
          ingestOptions.fetcher = opts.ingestFetcher;
        }

        const result = await ingestSourceVersion(db, lawId!, ingestOptions);

        // 監査記録（取込は監査対象: §12.4）
        await insertAuditRecord(db, {
          action: result.status === "SKIPPED" ? "INGEST_SKIPPED" : "INGEST",
          resourceType: "source_version",
          resourceId: result.sourceVersionId,
          afterHash: result.contentHash,
          correlationId: toCorrelationId(request.id),
          clientContext: {
            lawId,
            status: result.status,
            segmentCount: result.segmentCount,
            extractionRate: result.extractionRate,
          },
        });

        const status = result.status === "PENDING_REVIEW" ? 202 : 200;

        return reply.status(status).send(
          wrapResponse(
            {
              source_id: result.sourceId,
              source_version_id: result.sourceVersionId,
              status: result.status,
              content_hash: result.contentHash,
              segment_count: result.segmentCount,
              extraction_rate: result.extractionRate,
              validation_errors: result.validationErrors,
            },
            generateRequestId(request.id),
            new Date().toISOString(),
          ),
        );
      } catch (err) {
        app.log.error({ err, lawId }, "取込パイプラインでエラー");
        return reply.status(500).send(INTERNAL_ERROR);
      }
    },
  );

  // POST /admin/source-versions/:id/publish — 手動Publish
  app.post<{ Params: { id: string } }>(
    "/admin/source-versions/:id/publish",
    async (request, reply) => {
      const { id } = request.params;

      if (!isValidUuid(id)) {
        return reply.status(404).send(NOT_FOUND("SourceVersion"));
      }

      // 対象 source_version が存在するか確認
      const sourceVersion = await getSourceVersionById(db, id);
      if (!sourceVersion) {
        return reply.status(404).send(NOT_FOUND("SourceVersion"));
      }

      // 既に Publish 済みか確認
      if (sourceVersion.published_at !== null) {
        return reply.status(409).send(ALREADY_PUBLISHED);
      }

      // before_hash を記録（Publish前の状態）
      const beforeHash = sourceVersion.content_hash;

      // Publish 実行
      const updated = await publishSourceVersion(db, id);
      if (updated === 0) {
        // レース条件: 確認後に別リクエストが Publish した可能性
        return reply.status(409).send(ALREADY_PUBLISHED);
      }

      // 監査記録（Publish は監査対象: §12.4）
      await insertAuditRecord(db, {
        action: "PUBLISH",
        resourceType: "source_version",
        resourceId: id,
        beforeHash,
        afterHash: sourceVersion.content_hash,
        correlationId: toCorrelationId(request.id),
      });

      return reply.send(
        wrapResponse(
          {
            source_version_id: id,
            published_at: new Date().toISOString(),
            processing_status: "PUBLISHED",
          },
          generateRequestId(request.id),
          new Date().toISOString(),
        ),
      );
    },
  );

  // GET /admin/audit — 監査ログ検索
  // クエリパラメータ: from, to, action, resourceType, resourceId, limit
  app.get<{
    Querystring: {
      from?: string;
      to?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      limit?: string;
    };
  }>(
    "/admin/audit",
    async (request, reply) => {
      const qs = request.query;
      const filters: AuditQueryFilters = {};

      if (qs.from) {
        const d = new Date(qs.from);
        if (isNaN(d.getTime())) {
          return reply
            .status(400)
            .send(VALIDATION_ERROR("from の日付形式が不正です"));
        }
        filters.from = d;
      }
      if (qs.to) {
        const d = new Date(qs.to);
        if (isNaN(d.getTime())) {
          return reply
            .status(400)
            .send(VALIDATION_ERROR("to の日付形式が不正です"));
        }
        filters.to = d;
      }
      if (qs.action) filters.action = qs.action;
      if (qs.resourceType) filters.resourceType = qs.resourceType;
      if (qs.resourceId) filters.resourceId = qs.resourceId;
      if (qs.limit) {
        const n = parseInt(qs.limit, 10);
        if (isNaN(n) || n < 1) {
          return reply
            .status(400)
            .send(VALIDATION_ERROR("limit は正の整数で指定してください"));
        }
        filters.limit = n;
      }

      const records = await queryAuditRecords(db, filters);

      return reply.send(
        wrapResponse(
          records.map((r) => ({
            audit_id: r.audit_id,
            occurred_at: r.occurred_at,
            actor_id: r.actor_id,
            action: r.action,
            resource_type: r.resource_type,
            resource_id: r.resource_id,
            before_hash: r.before_hash,
            after_hash: r.after_hash,
            correlation_id: r.correlation_id,
          })),
          generateRequestId(request.id),
          new Date().toISOString(),
        ),
      );
    },
  );
}
