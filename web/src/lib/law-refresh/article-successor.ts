/**
 * 旧 Revision 所属 Article の URL を、現行 Revision へ解決する route resolution。
 *
 * 法令リフレッシュで Article が別 Revision へ移動しても、ブックマークや外部リンクの
 * URL（/articles/<id>）を維持する。以下の5状態へ分類する:
 *
 * - current    : 指定 Article が既に Law.currentRevisionId 所属。そのまま表示。
 * - redirect   : 確定 mapping chain を辿って現行 Revision の後継 Article へ転送。
 * - removed    : mapping で削除扱い（kind=removed または toArticleId=null）。
 *                旧本文を読み取り専用で表示する。
 * - historical : 旧 Revision 所属だが mapping が未確定（未作成 or ambiguous）。
 *                旧本文を読み取り専用で表示し、「現行条文との対応未確認」を示す。
 * - missing    : Article が存在しない。
 *
 * 純粋関数 + DI 構成: resolveArticleRoute は repository interface を経由して DB へ
 * アクセスするため、ユニットテストは実 DB 不要でインメモリ repository を使える。
 *
 * 循環検出: mapping chain を辿る際、visited set で同じ Article が再登場したら
 * ARTICLE_MAPPING_CYCLE エラーを投げる（データ不整合の早期発見）。
 */

import { prisma } from "@/lib/db";

/** Article の所属 Revision と現行 Revision の関係を表す最小情報。 */
export interface ArticleSuccessorContext {
  lawId: string;
  /** 指定 Article の所属 Revision ID。 */
  lawRevisionId: string;
  /** Article が属する Law の現行 Revision ID（Law.currentRevisionId）。 */
  currentLawRevisionId: string;
}

/** ArticleRevisionMapping のうち route resolution に必要な断片。 */
export interface ArticleSuccessorMapping {
  /** mapping 先 Article ID。removed の場合は null。 */
  toArticleId: string | null;
  /** unchanged / modified / renumbered / removed。 */
  kind: string;
  /** automatic / verified / ambiguous。 */
  status: string;
}

/**
 * route resolution が依存する読み取り専用 repository interface。
 * ユニットテストはこの interface をインメモリで実装して DI する。
 */
export interface ArticleSuccessorRepository {
  /**
   * 指定 Article の所属 Revision と現行 Revision を返す。
   * Article が存在しない場合は null。
   */
  getArticleContext(
    articleId: string,
  ): Promise<ArticleSuccessorContext | null>;

  /**
   * 指定 Article を from とする確定 mapping を返す。
   * mapping が存在しない、または status=ambiguous の場合は null。
   */
  getSuccessorMapping(
    fromArticleId: string,
  ): Promise<ArticleSuccessorMapping | null>;
}

/** route resolution の結果。 */
export type ArticleRouteResolution =
  | { kind: "current"; articleId: string }
  | { kind: "redirect"; articleId: string }
  | { kind: "removed"; articleId: string; currentLawRevisionId: string }
  | { kind: "historical"; articleId: string; reason: "ambiguous" | "unmapped" }
  | { kind: "missing" };

/** mapping chain を辿れる最大 hop 数。これを超えたら循環とみなす。 */
const MAX_MAPPING_HOPS = 120;

/** 循環検出時のエラーコード。 */
export const ARTICLE_MAPPING_CYCLE = "ARTICLE_MAPPING_CYCLE";

/** 循環検出エラー。 */
export class ArticleMappingCycleError extends Error {
  readonly code = ARTICLE_MAPPING_CYCLE;
  constructor(message: string) {
    super(message);
    this.name = "ArticleMappingCycleError";
  }
}

/**
 * 旧 Article ID から現行 Revision 上の対応位置へ解決する。
 *
 * アルゴリズム（計画書 Step 3）:
 * 1. Article が Law.currentRevisionId 所属なら current。
 * 2. 確定 mapping を最大 MAX_MAPPING_HOPS hop まで辿る:
 *    - toArticle が current 所属なら redirect。
 *    - kind=removed または toArticleId=null なら removed。
 *    - 辿った Article が再登場したら ARTICLE_MAPPING_CYCLE で拒否。
 * 3. mapping が ambiguous なら historical(ambiguous)。
 * 4. mapping が未作成なら historical(unmapped)。
 * 5. Article 自体が存在しないなら missing。
 *
 * @param articleId 解決対象の Article ID。
 * @param repository DB アクセスを注入する repository。省略時は prisma 実装。
 */
export async function resolveArticleRoute(
  articleId: string,
  repository: ArticleSuccessorRepository = createPrismaArticleSuccessorRepository(),
): Promise<ArticleRouteResolution> {
  const context = await repository.getArticleContext(articleId);
  if (!context) {
    return { kind: "missing" };
  }

  // 現行 Revision 所属ならそのまま current。
  if (context.lawRevisionId === context.currentLawRevisionId) {
    return { kind: "current", articleId };
  }

  // mapping chain を辿る。visited で循環を検出する。
  const visited = new Set<string>();
  let currentArticleId = articleId;

  for (let hop = 0; hop < MAX_MAPPING_HOPS; hop++) {
    if (visited.has(currentArticleId)) {
      throw new ArticleMappingCycleError(
        `Article mapping cycle detected at ${currentArticleId} (articleId=${articleId})`,
      );
    }
    visited.add(currentArticleId);

    const mapping = await repository.getSuccessorMapping(currentArticleId);

    // mapping が未作成、または ambiguous なら historical。
    if (!mapping) {
      return { kind: "historical", articleId, reason: "unmapped" };
    }
    if (mapping.status === "ambiguous") {
      return { kind: "historical", articleId, reason: "ambiguous" };
    }

    // removed 扱いなら removed。
    if (mapping.kind === "removed" || mapping.toArticleId === null) {
      return {
        kind: "removed",
        articleId,
        currentLawRevisionId: context.currentLawRevisionId,
      };
    }

    // toArticle の所属を確認。current 所属なら redirect。
    const toContext = await repository.getArticleContext(mapping.toArticleId);
    if (!toContext) {
      // toArticle が存在しない場合は mapping 不整合。historical(unmapped) に倒す。
      return { kind: "historical", articleId, reason: "unmapped" };
    }
    if (toContext.lawRevisionId === toContext.currentLawRevisionId) {
      return { kind: "redirect", articleId: mapping.toArticleId };
    }

    // まだ旧 Revision 所属。chain を継続。
    currentArticleId = mapping.toArticleId;
  }

  // hop 制限に到達＝循環の疑い。エラーで拒否。
  throw new ArticleMappingCycleError(
    `Article mapping exceeded ${MAX_MAPPING_HOPS} hops (articleId=${articleId}); likely cycle`,
  );
}

/**
 * prisma を使ったデフォルトの ArticleSuccessorRepository 実装。
 *
 * getArticleContext: Article → LawRevision → Law.currentRevisionId を1クエリで取得。
 * getSuccessorMapping: ArticleRevisionMapping を (fromArticleId, status in (automatic, verified))
 *   で検索。ambiguous は確定扱いしないため除外し、呼び出し側で null 扱いへ歴史的表示へ。
 */
export function createPrismaArticleSuccessorRepository(
  client: typeof prisma = prisma,
): ArticleSuccessorRepository {
  return {
    async getArticleContext(articleId) {
      const rows = await client.$queryRawUnsafe<
        Array<{ lawId: string; lawRevisionId: string; currentLawRevisionId: string | null }>
      >(
        `SELECT
           a."lawId",
           a."lawRevisionId",
           law."currentRevisionId" AS "currentLawRevisionId"
         FROM "Article" a
         JOIN "Law" law ON law.id = a."lawId"
         WHERE a.id = $1
         LIMIT 1`,
        articleId,
      );
      const row = rows[0];
      if (!row || !row.currentLawRevisionId) return null;
      return {
        lawId: row.lawId,
        lawRevisionId: row.lawRevisionId,
        currentLawRevisionId: row.currentLawRevisionId,
      };
    },

    async getSuccessorMapping(fromArticleId) {
      const rows = await client.$queryRawUnsafe<
        Array<{
          toArticleId: string | null;
          kind: string;
          status: string;
        }>
      >(
        `SELECT
           m."toArticleId",
           m.kind::text AS kind,
           m.status::text AS status
         FROM "ArticleRevisionMapping" m
         WHERE m."fromArticleId" = $1
           AND m.status IN ('automatic', 'verified')
         ORDER BY m."verifiedAt" DESC NULLS LAST, m."createdAt" DESC
         LIMIT 1`,
        fromArticleId,
      );
      const row = rows[0];
      if (!row) return null;
      return {
        toArticleId: row.toArticleId,
        kind: row.kind,
        status: row.status,
      };
    },
  };
}
