import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

type ForeignKey = {
  localColumns: string[];
  referencedTable: string;
  referencedColumns: string[];
  deleteAction: string;
};

async function getForeignKeys(tableName: string): Promise<ForeignKey[]> {
  return prisma.$queryRaw<ForeignKey[]>`
    SELECT
      ARRAY(
        SELECT attribute.attname
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
          AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) AS "localColumns",
      referenced_table.relname AS "referencedTable",
      ARRAY(
        SELECT attribute.attname
        FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.confrelid
          AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) AS "referencedColumns",
      constraint_row.confdeltype::text AS "deleteAction"
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS referenced_table ON referenced_table.oid = constraint_row.confrelid
    WHERE constraint_row.contype = 'f'
      AND constraint_row.conrelid = ${tableName}::regclass
  `;
}

describe("current-law refresh schema", () => {
  it("更新監査・対応表・範囲解決とdurable keyを持つ", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT
        to_regclass('public."LawRefreshRun"') IS NOT NULL
        AND to_regclass('public."LawRefreshLawResult"') IS NOT NULL
        AND to_regclass('public."LawSyncState"') IS NOT NULL
        AND to_regclass('public."ArticleRevisionMapping"') IS NOT NULL
        AND to_regclass('public."LawBookEntryRangeResolution"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Article' AND column_name = 'durableNodeKey'
        ) AS ok
    `;
    expect(rows[0].ok).toBe(true);
  });

  it("更新監査のrevision参照を削除制限付きで保持する", async () => {
    const foreignKeys = await getForeignKeys('public."LawRefreshLawResult"');

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        {
          localColumns: ["previousRevisionId"],
          referencedTable: "LawRevision",
          referencedColumns: ["id"],
          deleteAction: "r",
        },
        {
          localColumns: ["candidateRevisionId"],
          referencedTable: "LawRevision",
          referencedColumns: ["id"],
          deleteAction: "r",
        },
      ]),
    );
  });

  it("対応表のrevisionとarticleを同じ法令系譜に制約する", async () => {
    const foreignKeys = await getForeignKeys('public."ArticleRevisionMapping"');

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        {
          localColumns: ["fromRevisionId", "lawId"],
          referencedTable: "LawRevision",
          referencedColumns: ["id", "lawId"],
          deleteAction: "r",
        },
        {
          localColumns: ["toRevisionId", "lawId"],
          referencedTable: "LawRevision",
          referencedColumns: ["id", "lawId"],
          deleteAction: "r",
        },
        {
          localColumns: ["fromArticleId", "fromRevisionId", "lawId"],
          referencedTable: "Article",
          referencedColumns: ["id", "lawRevisionId", "lawId"],
          deleteAction: "r",
        },
        {
          localColumns: ["toArticleId", "toRevisionId", "lawId"],
          referencedTable: "Article",
          referencedColumns: ["id", "lawRevisionId", "lawId"],
          deleteAction: "r",
        },
      ]),
    );
  });

  it("対応済みtoArticleの物理削除を制限する", async () => {
    const foreignKeys = await getForeignKeys('public."ArticleRevisionMapping"');
    const toArticleForeignKey = foreignKeys.find(
      ({ localColumns }) => localColumns[0] === "toArticleId",
    );

    expect(toArticleForeignKey?.deleteAction).toBe("r");
  });
});
