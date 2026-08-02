#!/usr/bin/env npx tsx
/** e-Gov XMLの附則属性を、既存Article IDを変えずに補完する。 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { LAWS } from "./laws-config";
import { computeArticleContentChecksum } from "./lib/article-content-checksum";
import {
  extractSupplementaryProvisionMetadataFromXml,
  supplementaryProvisionSystemTags,
  supplementaryProvisionTitle,
} from "./lib/supplementary-provision";

const EDITION_KEY = "ksk-2026";
const DATA_DIR = path.join(
  __dirname,
  "..",
  "spikes",
  "001-xml-parse",
  "data",
  "law-book-2026",
);

interface SupplementRow {
  id: string;
  level: string;
  articleNumberNormalized: string | null;
  paragraphNumber: string | null;
  itemNumber: string | null;
  subitemNumber: string | null;
  title: string | null;
  caption: string | null;
  text: string | null;
  systemTags: unknown;
  contentChecksum: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  let supplementCount = 0;
  let changedCount = 0;
  let lawCount = 0;

  try {
    for (const law of LAWS) {
      const xmlPath = path.join(DATA_DIR, `${law.egovLawId}.xml`);
      if (!fs.existsSync(xmlPath)) throw new Error(`${law.egovLawId}: 公式XMLがありません`);
      const metadata = extractSupplementaryProvisionMetadataFromXml(
        fs.readFileSync(xmlPath, "utf8"),
      );
      const rows = await prisma.$queryRawUnsafe<SupplementRow[]>(
        `SELECT
           article.id,
           article.level::text,
           article."articleNumberNormalized",
           article."paragraphNumber",
           article."itemNumber",
           article."subitemNumber",
           article.title,
           article.caption,
           article.text,
           article."systemTags",
           article."contentChecksum"
         FROM "LawBookEntry" entry
         JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
         JOIN "Law" law ON law.id = entry."lawId"
         JOIN "Article" article
           ON article."lawId" = entry."lawId"
          AND article."lawRevisionId" = entry."lawRevisionId"
         WHERE edition."editionKey" = $1
           AND law."egovLawId" = $2
           AND article.level = 'suppl_provision'
           AND article."parentId" IS NULL
           AND article."deletedAt" IS NULL
         ORDER BY article."sortOrder"`,
        EDITION_KEY,
        law.egovLawId,
      );

      if (metadata.length !== rows.length) {
        throw new Error(
          `${law.egovLawId} ${law.name}: XML附則${metadata.length}件とDB附則${rows.length}件が一致しません`,
        );
      }
      if (rows.length === 0) continue;
      lawCount++;
      supplementCount += rows.length;

      const updates = rows.flatMap((row, index) => {
        if (row.systemTags !== null && !isRecord(row.systemTags)) {
          throw new Error(`${law.egovLawId} ${row.id}: systemTagsがobjectではありません`);
        }
        const title = supplementaryProvisionTitle(metadata[index]);
        // isRecord 型ガード通過後の row.systemTags を安全に Record として扱う
        const existingTags: Record<string, unknown> =
          row.systemTags !== null && isRecord(row.systemTags)
            ? row.systemTags
            : {};
        const systemTags = {
          ...existingTags,
          ...supplementaryProvisionSystemTags(metadata[index]),
        };
        const contentChecksum = computeArticleContentChecksum({
          level: row.level,
          articleNumber: row.articleNumberNormalized,
          paragraphNumber: row.paragraphNumber,
          itemNumber: row.itemNumber,
          subitemNumber: row.subitemNumber,
          title,
          caption: row.caption,
          text: row.text,
          systemTags,
        });
        const unchanged = row.title === title
          && row.contentChecksum === contentChecksum
          && stableJson(row.systemTags) === stableJson(systemTags);
        return unchanged ? [] : [{ id: row.id, title, systemTags, contentChecksum }];
      });
      changedCount += updates.length;

      if (!dryRun && updates.length > 0) {
        await prisma.$transaction(
          updates.map((update) => prisma.$executeRawUnsafe(
            `UPDATE "Article"
             SET title = $2,
                 "systemTags" = $3::jsonb,
                 "contentChecksum" = $4,
                 "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $1`,
            update.id,
            update.title,
            JSON.stringify(update.systemTags),
            update.contentChecksum,
          )),
        );
      }
    }

    console.log("=== 附則メタデータ補完 ===");
    console.log(`対象法令: ${lawCount}件`);
    console.log(`附則: ${supplementCount}件`);
    console.log(`${dryRun ? "変更予定" : "変更"}: ${changedCount}件`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
