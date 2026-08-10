/**
 * 元XMLのTableColumn属性から、DBのtableMetadata（罫線・結合情報）を補完する。
 *
 * 基準法（325AC0000000201）は対象外。既にセットされているセルは変更しない。
 * 既定は確認のみ。実際に更新する場合は --apply を付ける。
 *
 * 使用法:
 *   npx tsx scripts/backfill-table-metadata-from-xml.ts
 *   npx tsx scripts/backfill-table-metadata-from-xml.ts --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseLawXml } from "../src/lib/law-refresh/parse-law-xml";
import { planTableMetadataBackfill } from "../src/lib/law-refresh/table-metadata-backfill";
import type { ParsedLawNode, TableCellStyle } from "../src/lib/law-refresh/types";

const BASE_LAW_EGOV_ID = "325AC0000000201";
const XML_DIRECTORY = "spikes/001-xml-parse/data/law-book-2026";
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

interface DatabaseTableCell {
  id: string;
  text: string | null;
  tableMetadata: unknown | null;
  tablePath: number[];
}

interface LawResult {
  egovLawId: string;
  name: string;
  updated: number;
  skippedTables: number;
  error?: string;
}

async function loadDatabaseTableCells(
  lawId: string,
  revisionId: string,
): Promise<DatabaseTableCell[]> {
  return prisma.$queryRawUnsafe<DatabaseTableCell[]>(
    `WITH RECURSIVE tree AS (
       SELECT id, "parentId", level, text, "tableMetadata", "sortOrder",
              ARRAY["sortOrder"] AS path,
              NULL::integer[] AS "tablePath"
       FROM "Article"
       WHERE "lawId" = $1 AND "lawRevisionId" = $2
         AND "parentId" IS NULL AND "deletedAt" IS NULL
       UNION ALL
       SELECT a.id, a."parentId", a.level, a.text, a."tableMetadata", a."sortOrder",
              t.path || a."sortOrder",
              CASE WHEN a.level = 'table'::"ArticleLevel"
                THEN t.path || a."sortOrder"
                ELSE t."tablePath"
              END
       FROM "Article" a
       JOIN tree t ON a."parentId" = t.id
       WHERE a."lawId" = $1 AND a."lawRevisionId" = $2 AND a."deletedAt" IS NULL
     )
     SELECT id, text, "tableMetadata", "tablePath"
     FROM tree
     WHERE level = 'table_column'::"ArticleLevel" AND "tablePath" IS NOT NULL
     ORDER BY "tablePath", path`,
    lawId,
    revisionId,
  );
}

function sourceTableCells(nodes: ParsedLawNode[]) {
  const bySourceIndex = new Map(nodes.map((node) => [node.sourceIndex, node]));
  const tableOrders = new Map<number, number>();
  let tableCount = 0;
  for (const node of nodes) {
    if (node.level === "table") {
      tableCount++;
      tableOrders.set(node.sourceIndex, tableCount);
    }
  }

  return nodes.flatMap((node) => {
    if (node.level !== "table_column" || !node.tableCellMeta) return [];
    let parentSourceIndex = node.parentSourceIndex;
    while (parentSourceIndex !== null) {
      const parent = bySourceIndex.get(parentSourceIndex);
      if (!parent) break;
      if (parent.level === "table") {
        const tableOrder = tableOrders.get(parent.sourceIndex);
        return tableOrder === undefined
          ? []
          : [{ tableOrder, text: node.text, tableCellMeta: node.tableCellMeta }];
      }
      parentSourceIndex = parent.parentSourceIndex;
    }
    return [];
  });
}

function databaseTableCells(cells: DatabaseTableCell[]) {
  const tableOrderByPath = new Map<string, number>();
  let tableCount = 0;
  return {
    cells: cells.map((cell) => {
      const pathKey = cell.tablePath.join(".");
      let tableOrder = tableOrderByPath.get(pathKey);
      if (tableOrder === undefined) {
        tableCount++;
        tableOrder = tableCount;
        tableOrderByPath.set(pathKey, tableOrder);
      }
      return {
        id: cell.id,
        tableOrder,
        text: cell.text,
        tableMetadata: cell.tableMetadata,
      };
    }),
    get tableCount() {
      return tableCount;
    },
  };
}

async function updateCells(
  updates: Array<{ id: string; tableMetadata: TableCellStyle }>,
): Promise<void> {
  const batchSize = 500;
  for (let start = 0; start < updates.length; start += batchSize) {
    const batch = updates.slice(start, start + batchSize);
    await prisma.$transaction(
      batch.map((update) =>
        prisma.article.update({
          where: { id: update.id },
          data: {
            tableMetadata: update.tableMetadata as unknown as Prisma.InputJsonValue,
          },
        }),
      ),
    );
  }
}

async function main() {
  const laws = await prisma.law.findMany({
    where: {
      egovLawId: { not: BASE_LAW_EGOV_ID },
      currentRevisionId: { not: null },
    },
    select: { id: true, egovLawId: true, name: true, currentRevisionId: true },
    orderBy: { egovLawId: "asc" },
  });
  const results: LawResult[] = [];

  for (const law of laws) {
    const xmlPath = join(XML_DIRECTORY, `${law.egovLawId}.xml`);
    if (!existsSync(xmlPath)) continue;

    try {
      const xml = readFileSync(xmlPath, "utf-8");
      const document = parseLawXml(xml, {
        lawId: law.id,
        egovLawId: law.egovLawId,
        revisionId: law.currentRevisionId!,
        tolerateDuplicateDurableKeys: true,
      });
      const source = sourceTableCells(document.nodes);
      if (source.length === 0) continue;

      const stored = databaseTableCells(
        await loadDatabaseTableCells(law.id, law.currentRevisionId!),
      );
      const sourceTableCount = new Set(source.map((cell) => cell.tableOrder)).size;
      if (stored.tableCount !== sourceTableCount) {
        results.push({
          egovLawId: law.egovLawId,
          name: law.name,
          updated: 0,
          skippedTables: sourceTableCount,
          error: `表数不一致（DB ${stored.tableCount} / XML ${sourceTableCount}）`,
        });
        continue;
      }

      const plan = planTableMetadataBackfill(stored.cells, source);
      if (APPLY && plan.updates.length > 0) await updateCells(plan.updates);
      results.push({
        egovLawId: law.egovLawId,
        name: law.name,
        updated: plan.updates.length,
        skippedTables: plan.skippedTableOrders.length,
      });
    } catch (error) {
      results.push({
        egovLawId: law.egovLawId,
        name: law.name,
        updated: 0,
        skippedTables: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalUpdated = results.reduce((sum, result) => sum + result.updated, 0);
  const errors = results.filter((result) => result.error);
  const skippedTables = results.reduce((sum, result) => sum + result.skippedTables, 0);
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    processedLaws: results.length,
    updateCandidates: totalUpdated,
    skippedTables,
    errors,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
