/**
 * TableColumn の罫線・結合情報（tableMetadata）反映スクリプト
 *
 * パーサー（extractTableCellStyle）は正しく実装されているが、
 * 既存DBの tableMetadata 列が未設定のため、再パース結果で更新する。
 *
 * stableNodeKey（legacyStableNodeKey）をマッチングキーとして使用し、
 * 該当する table_column 行の tableMetadata のみを安全に更新する。
 *
 * 使用法: npx tsx scripts/fix-table-metadata.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseLawXml } from "../src/lib/law-refresh/parse-law-xml";

const DATABASE_URL = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const REVISION_ID = "rev_325AC0000000201_20251201_507AC0000000035";
const XML_PATH = "spikes/001-xml-parse/data/law-book-2026/325AC0000000201.xml";
const LAW_ID = "cms8p9kek0000jgn98cvenllv";

async function main() {
  console.log("=== TableColumn tableMetadata 反映スクリプト ===\n");

  const xml = readFileSync(XML_PATH, "utf-8");
  const doc = parseLawXml(xml, {
    lawId: LAW_ID,
    egovLawId: "325AC0000000201",
    revisionId: REVISION_ID,
  });
  console.log(`再パース完了: ${doc.nodes.length}ノード`);

  const tableCols = doc.nodes.filter((n) => n.level === "table_column");
  console.log(`table_columnノード: ${tableCols.length}件\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const node of tableCols) {
    if (!node.legacyStableNodeKey || !node.tableCellMeta) {
      skipped++;
      continue;
    }

    const metadataJson = JSON.stringify(node.tableCellMeta);

    // stableNodeKey で該当行を特定して tableMetadata を更新
    // tableMetadata 列は JSON 型のため ::jsonb でキャスト
    const result = await prisma.$executeRaw`
      UPDATE "Article"
      SET "tableMetadata" = ${metadataJson}::jsonb,
          "updatedAt" = NOW()
      WHERE "lawId" = ${LAW_ID}
        AND "stableNodeKey" = ${node.legacyStableNodeKey}
        AND level = 'table_column'
        AND "deletedAt" IS NULL
    `;

    if (result > 0) {
      updated++;
    } else {
      notFound++;
      console.log(`  [未対応] ${node.legacyStableNodeKey}`);
    }
  }

  console.log(`\n更新完了: ${updated}件更新、${skipped}件スキップ、${notFound}件未対応`);
}

main()
  .catch((err) => {
    console.error("致命的エラー:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
