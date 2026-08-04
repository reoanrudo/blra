#!/usr/bin/env npx tsx
/**
 * 法令XMLインジェストスクリプト（汎用版）
 *
 * e-Gov 法令API v2 で取得したXMLをパースし、Article + Law + Link を PostgreSQL に投入する。
 * 複数法令に対応。既存データは upsert（DB全消去なし）。
 *
 * Usage:
 *   npx tsx scripts/ingest.ts                  # 全対象法令（laws-config.ts の LAWS）
 *   npx tsx scripts/ingest.ts <egovLawId>      # 指定法令のみ
 *   npx tsx scripts/ingest.ts --rebuild-links  # Link テーブルのみ再構築
 *   npx tsx scripts/ingest.ts --skip-links     # Article投入後のLink再構築を延期
 *   npx tsx scripts/ingest.ts --dry-run        # DB書き込まずパース結果のみ出力
 */

import { PrismaClient, RegulationCategory } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { normalizeArticleNumber } from "../src/lib/article/normalize-article";
import {
  materializeArticleRows,
  parseLawXml,
} from "../src/lib/law-refresh/parse-law-xml";
import type { ArticleRow } from "../src/lib/law-refresh/types";
import { LAWS, type LawConfig } from "./laws-config";

// ─── Constants ───

const DATA_DIR = path.join(
  __dirname,
  "..",
  "spikes",
  "001-xml-parse",
  "data",
  "law-book-2026",
);

// Regex patterns for link extraction
const KANSUJI = "[一二三四五六七八九十百千]+";
const NUMBER_PAT = `(?:${KANSUJI}|\\d+|[０-９]+)(?:の(?:${KANSUJI}|\\d+|[０-９]+))?`;

const BASE_LINK_PATTERNS: Record<string, RegExp> = {
  "前条": new RegExp(`前条(?:\\s*第(${NUMBER_PAT})項)?`, "g"),
  "第○項（同条内）": new RegExp(`(?<!\\S)第(${NUMBER_PAT})項(?!\\s*第)`, "g"),
  "同条": /同条/g,
  "別表第○": new RegExp(`別表第(${NUMBER_PAT})`, "g"),
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLinkPatterns(laws: readonly LawConfig[]): Record<string, RegExp> {
  const names = Array.from(new Set(laws.flatMap((law) => [law.name, law.shortName]).filter(Boolean)))
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  return {
    "他法令第○条": new RegExp(
      `(${names})(?:の)?第(${NUMBER_PAT})条(?:\\s*第(${NUMBER_PAT})項)?(?:\\s*第(${NUMBER_PAT})号)?`,
      "g",
    ),
    ...BASE_LINK_PATTERNS,
  };
}

// ─── Article Row Generation ───

interface LinkRow {
  id: string;
  sourceId: string;
  targetId: string | null;
  linkType: string;
  sourceRange: string | null;
  isResolved: boolean;
  targetLawName: string | null;
  targetText: string | null;
  targetArticleNumberNormalized: string | null;
}

// 法令ごとに独立したIDカウンタ（プレフィックスで衝突回避）
function makeIdGen(prefix: string) {
  let counter = 0;
  return {
    next: () => {
      counter++;
      return `${prefix}${String(counter).padStart(6, "0")}`;
    },
    peek: () => counter,
  };
}

const BATCH_SIZE = 5000;

// ─── Link Extraction（汎用版：egovLawId ベースで全法令を解決） ───

// 法律名 → egovLawId のマッピング（リンク解決用）
function buildLawNameMap(laws: readonly LawConfig[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of laws) {
    m.set(l.name, l.egovLawId);
    if (l.shortName) m.set(l.shortName, l.egovLawId);
  }
  // 主要な別名・略称
  const aliases: Record<string, string> = {
    "建築基準法": "325AC0000000201",
    "建基法": "325AC0000000201",
    "建築基準法施行令": "325CO0000000338",
    "建基令": "325CO0000000338",
    "建築基準法施行規則": "325M50004000040",
    "建基規": "325M50004000040",
  };
  for (const [k, v] of Object.entries(aliases)) m.set(k, v);
  return m;
}

function extractLinks(
  allArticles: ArticleRow[],
  linkPatterns: Record<string, RegExp>,
  lawNameMap: Map<string, string>,
  egovToInternal: Map<string, string>,
  idGen: ReturnType<typeof makeIdGen>,
): LinkRow[] {
  const links: LinkRow[] = [];

  // 法令別の article number → articleId マップ
  const articleNumMap = new Map<string, string>();
  for (const a of allArticles) {
    if (a.level === "article" && a.articleNumberNormalized) {
      articleNumMap.set(`${a.lawId}|${a.articleNumberNormalized}`, a.id);
    }
  }

  const paragraphMap = new Map<string, string>();
  for (const a of allArticles) {
    if (a.level === "paragraph" && a.parentId && a.paragraphNumber) {
      paragraphMap.set(`${a.parentId}|${normalizeArticleNumber(a.paragraphNumber)}`, a.id);
    }
  }

  const previousArticleMap = new Map<string, string>();
  const siblingsByParent = new Map<string, ArticleRow[]>();
  for (const article of allArticles) {
    if (article.level !== "article") continue;
    const key = `${article.lawId}|${article.parentId ?? "root"}`;
    const siblings = siblingsByParent.get(key) ?? [];
    siblings.push(article);
    siblingsByParent.set(key, siblings);
  }
  for (const siblings of siblingsByParent.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder);
    for (let index = 1; index < siblings.length; index++) {
      previousArticleMap.set(siblings[index].id, siblings[index - 1].id);
    }
  }

  const orderedPatterns = ["他法令第○条", "前条", "別表第○", "第○項（同条内）", "同条"];

  for (const article of allArticles) {
    if (!article.text) continue;

    const text = article.text;
    const matchedRanges = new Set<number>();

    for (const patternName of orderedPatterns) {
      const pattern = linkPatterns[patternName];
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const startPos = match.index;
        const endPos = startPos + match[0].length;

        let overlapping = false;
        for (let i = startPos; i < endPos; i++) {
          if (matchedRanges.has(i)) { overlapping = true; break; }
        }
        if (overlapping) continue;

        for (let i = startPos; i < endPos; i++) matchedRanges.add(i);

        const matchText = match[0];
        let targetId: string | null = null;
        let linkType = "unresolved";
        let targetLawName: string | null = null;
        let targetArticleNumberNormalized: string | null = null;

        if (patternName === "他法令第○条") {
          const lawNameStr = match[1];
          const articleNum = normalizeArticleNumber(match[2]) || match[2];
          const paraNum = match[3] ? (normalizeArticleNumber(match[3]) || match[3]) : null;
          targetArticleNumberNormalized = paraNum ? `${articleNum}_${paraNum}` : articleNum;
          targetLawName = lawNameStr;
          // 既存の LinkType enum に合わせて法→法/令 を区別
          linkType = lawNameStr.includes("施行令") || lawNameStr.includes("令") ? "law_to_order" : "law_to_law";

          // 法律名 → egovLawId → 内部 lawId
          const targetEgovId = lawNameMap.get(lawNameStr);
          if (targetEgovId) {
            const targetLawDbId = egovToInternal.get(targetEgovId);
            if (targetLawDbId) {
              targetId = articleNumMap.get(`${targetLawDbId}|${articleNum}`) || null;
              if (targetId && paraNum) {
                const paraId = paragraphMap.get(`${targetId}|${paraNum}`);
                if (paraId) targetId = paraId;
              }
            }
          }
        } else if (patternName === "前条") {
          linkType = "internal";
          targetArticleNumberNormalized = matchText;
          const containingArticleId = article.level === "article" ? article.id : article.parentId;
          if (containingArticleId) targetId = previousArticleMap.get(containingArticleId) ?? null;
        } else if (patternName === "第○項（同条内）") {
          linkType = "internal";
          targetArticleNumberNormalized = normalizeArticleNumber(match[1]) || match[1];
          const parentArticleId = article.level === "article" ? article.id : article.parentId;
          if (parentArticleId) {
            targetId = paragraphMap.get(`${parentArticleId}|${targetArticleNumberNormalized}`) ?? null;
          }
        } else if (patternName === "同条") {
          linkType = "internal";
          targetArticleNumberNormalized = "同条";
          targetId = article.parentId;
        } else if (patternName === "別表第○") {
          linkType = "internal";
          targetArticleNumberNormalized = normalizeArticleNumber(match[1]) || match[1];
        }

        links.push({
          id: idGen.next(),
          sourceId: article.id,
          targetId,
          linkType: targetId ? linkType : "unresolved",
          sourceRange: `${startPos}-${endPos}`,
          isResolved: targetId !== null,
          targetLawName,
          targetText: matchText,
          targetArticleNumberNormalized,
        });
      }
    }
  }

  return links;
}

async function insertArticleBatch(prisma: PrismaClient, batch: ArticleRow[]): Promise<void> {
  if (batch.length === 0) return;

  const values: unknown[] = [];
  const tuples = batch.map((row) => {
    const base = values.length;
    values.push(
      row.id,
      row.lawId,
      row.lawRevisionId,
      row.parentId,
      row.level,
      row.stableNodeKey,
      row.durableNodeKey,
      row.articleNumber,
      row.articleNumberNormalized,
      row.paragraphNumber,
      row.itemNumber,
      row.subitemNumber,
      row.columnNumber,
      row.tableCoords,
      row.title,
      row.caption,
      row.text,
      row.articleCaptionNormalized,
      row.sortOrder,
      row.regulationType,
      row.systemTags === null ? null : JSON.stringify(row.systemTags),
      row.contentChecksum,
      row.bodyChecksum,
    );
    const p = (offset: number) => `$${base + offset}`;
    return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}::"ArticleLevel", ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, ${p(12)}, ${p(13)}, ${p(14)}, ${p(15)}, ${p(16)}, ${p(17)}, ${p(18)}, ${p(19)}::integer, ${p(20)}::"RegulationType", ${p(21)}::jsonb, ${p(22)}, ${p(23)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Article" (
      "id", "lawId", "lawRevisionId", "parentId", "level", "stableNodeKey", "durableNodeKey",
      "articleNumber", "articleNumberNormalized", "paragraphNumber", "itemNumber",
      "subitemNumber", "columnNumber", "tableCoords", "title", "caption", "text",
      "articleCaptionNormalized", "sortOrder", "regulationType", "systemTags", "contentChecksum", "bodyChecksum",
      "createdAt", "updatedAt"
    ) VALUES ${tuples.join(",")}
    ON CONFLICT ("id") DO NOTHING`,
    ...values,
  );
}

/**
 * seed-law-book -> ingest の標準手順で、取込後の台帳を実データと同期する。
 * seed 時点では Article がまだないため source_verified だが、正常に Article を
 * 保持できた時点で seed-law-book と同じ判定により structure_validated へ進める。
 */
async function synchronizeLawBookEntryAfterIngest(
  prisma: PrismaClient,
  lawId: string,
): Promise<void> {
  const revisions = await prisma.$queryRawUnsafe<Array<{ id: string; articleCount: bigint }>>(
    `SELECT l."currentRevisionId" AS id, COUNT(a.id)::bigint AS "articleCount"
     FROM "Law" l
     LEFT JOIN "Article" a
       ON a."lawId" = l.id
      AND a."lawRevisionId" = l."currentRevisionId"
      AND a."deletedAt" IS NULL
     WHERE l.id = $1 AND l."currentRevisionId" IS NOT NULL
     GROUP BY l."currentRevisionId"`,
    lawId,
  );
  const revision = revisions[0];
  if (!revision || Number(revision.articleCount) === 0) return;

  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `UPDATE "LawBookEntry"
       SET "articleCount" = $3,
           "verificationStatus" = 'structure_validated',
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "lawId" = $1 AND "lawRevisionId" = $2`,
      lawId,
      revision.id,
      Number(revision.articleCount),
    ),
    prisma.$executeRawUnsafe(
      `UPDATE "LawRevision"
       SET "status" = 'active'
       WHERE id = $1`,
      revision.id,
    ),
  ]);
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rebuildLinksOnly = args.includes("--rebuild-links");
  const skipLinks = args.includes("--skip-links");
  const specificEgovId = args.find((a) => !a.startsWith("--"));

  console.log(`=== 法令XMLインジェスト（汎用版） ===\n`);
  if (dryRun) console.log(`[DRY RUN] DB書き込みなし\n`);

  const prisma = new PrismaClient();

  try {
    // 対象法令選択
    let targets = specificEgovId
      ? LAWS.filter((l) => l.egovLawId === specificEgovId)
      : LAWS;

    if (targets.length === 0) {
      console.error(`ERROR: egovLawId ${specificEgovId} が laws-config.ts に見つかりません`);
      process.exit(1);
    }

    console.log(`対象: ${targets.length} 法令\n`);

    // XMLファイル存在チェック
    const missing = targets.filter((l) => !fs.existsSync(path.join(DATA_DIR, `${l.egovLawId}.xml`)));
    if (missing.length > 0) {
      console.error(`ERROR: XML未取得の法令があります。先に fetch-laws.ts を実行してください:`);
      missing.forEach((l) => console.error(`  - ${l.egovLawId} ${l.name}`));
      process.exit(1);
    }

    // ─── 各法令をパース ───
    console.log("[1/4] XML パース中...");
    const parsedByLaw = new Map<string, { rows: ArticleRow[]; config: LawConfig }>();
    for (const law of targets) {
      const xmlPath = path.join(DATA_DIR, `${law.egovLawId}.xml`);
      const start = Date.now();
      const idPrefix = `art_${law.egovLawId.toLowerCase()}_20260101_`;
      const xmlContent = fs.readFileSync(xmlPath, "utf-8");
      const lawId = "__TMP__";
      const revisionId = "__TMP__";
      const parsedDocument = parseLawXml(xmlContent, {
        lawId,
        egovLawId: law.egovLawId,
        revisionId,
      });
      const rows = materializeArticleRows(parsedDocument, idPrefix);
      console.log(`  ${law.shortName.padEnd(14)} ${law.egovLawId}  ${String(rows.length).padStart(5)} 行  (${Date.now() - start}ms)`);
      parsedByLaw.set(law.egovLawId, { rows, config: law });
    }

    if (dryRun) {
      const totalRows = Array.from(parsedByLaw.values()).reduce((s, p) => s + p.rows.length, 0);
      console.log(`\n[DRY RUN] パース成功: 合計 ${totalRows} 行`);
      console.log("(DB書き込みスキップ)");
      return;
    }

    // ─── Law レコードの upsert ───
    console.log("\n[2/4] Law upsert 中...");
    const egovToInternal = new Map<string, string>();
    for (const law of targets) {
      const rec = await prisma.law.upsert({
        where: { egovLawId: law.egovLawId },
        update: {
          name: law.name,
          shortName: law.shortName,
          category: law.category as RegulationCategory,
        },
        create: {
          egovLawId: law.egovLawId,
          name: law.name,
          shortName: law.shortName,
          category: law.category as RegulationCategory,
        },
      });
      egovToInternal.set(law.egovLawId, rec.id);
      console.log(`  ${law.shortName.padEnd(14)} ${law.egovLawId}  -> internal lawId: ${rec.id}`);

      // 当該法令が既にArticleを持っている場合は再取込をスキップ（FK制約エラー回避）
      // 法令改正時の再取込は別途、安全な削除フロー（soft delete + 差分）で対応する
      const existingArticleCount = await prisma.article.count({ where: { lawId: rec.id, deletedAt: null } });
      if (existingArticleCount > 0) {
        console.log(`    (既存 ${existingArticleCount} 行を保持、スキップ)`);
      }
    }

    // ─── Article の投入 ───
    console.log("\n[3/4] Article 投入中...");
    let totalInserted = 0;
    let totalSkipped = 0;
    for (const [egovId, parsed] of parsedByLaw) {
      const internalLawId = egovToInternal.get(egovId)!;

      // 既存Articleがある場合はスキップ（冪等性確保）
      const existingCount = await prisma.article.count({ where: { lawId: internalLawId, deletedAt: null } });
      if (existingCount > 0) {
        totalSkipped += parsed.rows.length;
        console.log(`  ${parsed.config.shortName.padEnd(14)} スキップ (既存 ${existingCount} 行)`);
        await synchronizeLawBookEntryAfterIngest(prisma, internalLawId);
        continue;
      }

      // lawId を一時IDから内部IDに置換
      const revisions = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "currentRevisionId" AS id FROM "Law" WHERE id = $1 AND "currentRevisionId" IS NOT NULL',
        internalLawId,
      );
      const revisionId = revisions[0]?.id;
      if (!revisionId) {
        throw new Error(`${parsed.config.egovLawId}: currentRevisionIdがありません。先にseed-law-book.tsを実行してください`);
      }
      for (const r of parsed.rows) {
        r.lawId = internalLawId;
        r.lawRevisionId = revisionId;
      }

      // バッチ投入
      const insertBatchSize = 500;
      for (let i = 0; i < parsed.rows.length; i += insertBatchSize) {
        await insertArticleBatch(prisma, parsed.rows.slice(i, i + insertBatchSize));
      }
      await synchronizeLawBookEntryAfterIngest(prisma, internalLawId);
      totalInserted += parsed.rows.length;
      console.log(`  ${parsed.config.shortName.padEnd(14)} ${parsed.rows.length} 行 投入`);
    }
    console.log(`  合計: 投入 ${totalInserted} 行 / スキップ ${totalSkipped} 行`);

    if (skipLinks) {
      console.log("\n[4/4] Link再構築をスキップしました");
      return;
    }

    // ─── Link 再構築（全法令横断で） ───
    console.log("\n[4/4] Link 抽出・投入中...");

    // LinkはArticleから再生成できる派生データなので、同一スナップショットで全件再構築する。
    await prisma.link.deleteMany();

    // 全 Article を取得してリンク抽出（今回対象 + 既存）
    const allDbArticles = await prisma.article.findMany({
      where: { deletedAt: null },
      select: {
        id: true, lawId: true, parentId: true, level: true,
        articleNumberNormalized: true, paragraphNumber: true,
        sortOrder: true, text: true,
      },
    });

    const allArticleRows: ArticleRow[] = allDbArticles.map((a) => ({
      id: a.id,
      lawId: a.lawId,
      parentId: a.parentId,
      level: a.level,
      articleNumberNormalized: a.articleNumberNormalized,
      paragraphNumber: a.paragraphNumber,
      sortOrder: a.sortOrder,
      text: a.text,
      articleNumber: null,
      itemNumber: null,
      subitemNumber: null,
      title: null,
      caption: null,
      articleCaptionNormalized: null,
      regulationType: null,
      systemTags: null,
      columnNumber: null,
      tableCoords: null,
      lawRevisionId: "",
      stableNodeKey: "",
      durableNodeKey: "",
      contentChecksum: "",
      bodyChecksum: "",
    }));

    const linkIdGen = makeIdGen("lnk_");
    const lawNameMap = buildLawNameMap(LAWS);
    const linkPatterns = buildLinkPatterns(LAWS);
    const links = extractLinks(allArticleRows, linkPatterns, lawNameMap, egovToInternal, linkIdGen);

    const resolvedCount = links.filter((l) => l.isResolved).length;
    const unresolvedCount = links.filter((l) => !l.isResolved).length;
    console.log(`  抽出: ${links.length} 件 (解決: ${resolvedCount}, 未解決: ${unresolvedCount})`);

    for (let i = 0; i < links.length; i += BATCH_SIZE) {
      const batch = links.slice(i, i + BATCH_SIZE);
      await prisma.link.createMany({
        data: batch.map((l) => ({
          id: l.id,
          sourceId: l.sourceId,
          targetId: l.targetId,
          linkType: l.linkType as never,
          sourceRange: l.sourceRange,
          isResolved: l.isResolved,
          targetLawName: l.targetLawName,
          targetText: l.targetText,
          targetArticleNumberNormalized: l.targetArticleNumberNormalized,
        })),
        skipDuplicates: true,
      });
    }

    // ─── 統計レポート ───
    console.log("\n=== 投入統計レポート ===\n");
    const lawStats = await prisma.article.groupBy({
      by: ["lawId", "level"],
      where: { deletedAt: null },
      _count: true,
    });
    const laws = await prisma.law.findMany();
    const lawNameById = new Map(laws.map((l) => [l.id, l.shortName || l.name]));
    const levelByLaw = new Map<string, Record<string, number>>();
    for (const s of lawStats) {
      const name = lawNameById.get(s.lawId) || s.lawId;
      if (!levelByLaw.has(name)) levelByLaw.set(name, {});
      const obj = levelByLaw.get(name)!;
      obj[s.level] = (obj[s.level] || 0) + s._count;
    }
    for (const [name, levels] of levelByLaw) {
      const total = Object.values(levels).reduce((s, n) => s + n, 0);
      console.log(`  ${name}: ${total} 行`);
    }
    const dbArticleTotal = await prisma.article.count({ where: { deletedAt: null } });
    const dbLinkTotal = await prisma.link.count();
    console.log(`\nDB確認: Article=${dbArticleTotal}件, Link=${dbLinkTotal}件`);

  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Prisma 生SQLで Set を IN 句にするヘルパー
import { Prisma } from "@prisma/client";
function PrismaJoin(set: Set<string>): Prisma.Sql {
  const arr = Array.from(set);
  if (arr.length === 0) return Prisma.raw("NULL");
  return Prisma.raw(arr.map((s) => `'${s.replace(/'/g, "''")}'`).join(","));
}
function PrismaRaw(s: string): Prisma.Sql {
  return Prisma.raw(s);
}

main();
