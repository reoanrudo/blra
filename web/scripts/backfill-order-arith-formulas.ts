/**
 * 建築基準法施行令で欠落した算式を、保存済みの公式XMLから復元する。
 *
 * parser が ArithFormula を除外していた版で取り込まれたデータだけを対象に、
 * 条番号と「次の式」を含む文で一意照合して安全に更新する。
 *
 * 使用法: npx tsx scripts/backfill-order-arith-formulas.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseLawXml } from "../src/lib/law-refresh/parse-law-xml";

const E_GOV_LAW_ID = "325CO0000000338";
const LAW_ID = "law_325co0000000338";
const REVISION_ID = "rev_325CO0000000338_20251201_507CO0000000377";
const XML_PATH = "spikes/001-xml-parse/data/law-book-2026/325CO0000000338.xml";

const prisma = new PrismaClient();

function articleNumberFor(
  nodeIndex: number,
  nodes: ReturnType<typeof parseLawXml>["nodes"],
): string | null {
  let current = nodes[nodeIndex];
  while (current) {
    if (current.level === "article") return current.articleNumberNormalized;
    if (current.parentSourceIndex === null) return null;
    current = nodes[current.parentSourceIndex];
  }
  return null;
}

async function main(): Promise<void> {
  const xml = readFileSync(XML_PATH, "utf8");
  const document = parseLawXml(xml, {
    lawId: LAW_ID,
    egovLawId: E_GOV_LAW_ID,
    revisionId: REVISION_ID,
  });
  const formulaNodes = document.nodes.filter((node) =>
    node.text?.includes("次の式によつて") && node.text.includes("＝"),
  );

  let updated = 0;
  let skipped = 0;

  for (const node of formulaNodes) {
    const formulaText = node.text!;
    const anchor = formulaText
      .split("\n")
      .find((line) => line.includes("次の式によつて"));
    const articleNumber = articleNumberFor(node.sourceIndex, document.nodes);
    if (!anchor || !articleNumber) {
      skipped++;
      continue;
    }

    let candidates = await prisma.$queryRaw<Array<{ id: string; text: string | null }>>`
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM "Article"
        WHERE "lawRevisionId" = ${REVISION_ID}
          AND level = 'article'
          AND "articleNumberNormalized" = ${articleNumber}
          AND "deletedAt" IS NULL
        UNION ALL
        SELECT child.id
        FROM "Article" child
        JOIN descendants parent ON child."parentId" = parent.id
        WHERE child."deletedAt" IS NULL
      )
      SELECT id, text
      FROM "Article"
      WHERE id IN (SELECT id FROM descendants)
        AND text LIKE ${`%${anchor}%`}
    `;

    // 旧取込時にルビの親字も落ちていると、式の前文全体では一致しない。
    // 同一条内の十分に長い先頭文で一意なら、その行だけを救済する。
    if (candidates.length === 0) {
      const prefix = anchor.slice(0, 24);
      candidates = await prisma.$queryRaw<Array<{ id: string; text: string | null }>>`
        WITH RECURSIVE descendants AS (
          SELECT id
          FROM "Article"
          WHERE "lawRevisionId" = ${REVISION_ID}
            AND level = 'article'
            AND "articleNumberNormalized" = ${articleNumber}
            AND "deletedAt" IS NULL
          UNION ALL
          SELECT child.id
          FROM "Article" child
          JOIN descendants parent ON child."parentId" = parent.id
          WHERE child."deletedAt" IS NULL
        )
        SELECT id, text
        FROM "Article"
        WHERE id IN (SELECT id FROM descendants)
          AND text LIKE ${`%${prefix}%`}
      `;
    }

    if (candidates.length !== 1) {
      skipped++;
      console.log(`[skip] 第${articleNumber}条: 照合候補 ${candidates.length}件`);
      continue;
    }
    if (candidates[0].text === formulaText) continue;

    await prisma.article.update({
      where: { id: candidates[0].id },
      data: {
        text: formulaText,
        contentChecksum: node.contentChecksum,
        bodyChecksum: node.bodyChecksum,
      },
    });
    updated++;
  }

  console.log(`算式復元: ${updated}件更新、${skipped}件保留`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
