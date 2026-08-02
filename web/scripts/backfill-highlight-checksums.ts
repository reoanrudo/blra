#!/usr/bin/env npx tsx
/**
 * 既存ハイライトの anchorChecksum を旧形式（座標文字列 "start-end"）から
 * 新形式（SHA-256 先頭16文字）へ再計算する backfill スクリプト。
 *
 * 新形式の生成ロジックは user-highlights/route.ts の computeAnchorChecksum と同一。
 * exactQuote も同時にサーバー側で再生成する（article.text からの slice）。
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function computeAnchorChecksum(
  articleText: string,
  rangeStart: number,
  rangeEnd: number,
  exactQuote: string,
): string {
  const contextBefore = articleText.slice(Math.max(0, rangeStart - 10), rangeStart);
  const contextAfter = articleText.slice(rangeEnd, Math.min(articleText.length, rangeEnd + 10));
  const material = `${contextBefore}⟦${exactQuote}⟧${contextAfter}`;
  return createHash("sha256").update(material, "utf8").digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
  // 旧形式（数字-数字パターン）の checksum を持つハイライトを取得
  const highlights = await prisma.userHighlight.findMany({
    where: { anchorChecksum: { contains: "-" } },
    select: { id: true, articleId: true, rangeStart: true, rangeEnd: true },
  });

  console.log(`Backfill対象: ${highlights.length}件`);

  let updated = 0;
  for (const hl of highlights) {
    const article = await prisma.article.findUnique({
      where: { id: hl.articleId },
      select: { text: true },
    });
    if (!article?.text) {
      console.log(`  SKIP ${hl.id}: Article text not found`);
      continue;
    }
    const articleText = article.text;
    if (hl.rangeEnd > articleText.length) {
      console.log(`  SKIP ${hl.id}: rangeEnd exceeds text length`);
      continue;
    }

    const serverExactQuote = articleText.slice(hl.rangeStart, hl.rangeEnd);
    const anchorChecksum = computeAnchorChecksum(articleText, hl.rangeStart, hl.rangeEnd, serverExactQuote);

    await prisma.userHighlight.update({
      where: { id: hl.id },
      data: { exactQuote: serverExactQuote, anchorChecksum },
    });
    updated++;
    console.log(`  UPDATED ${hl.id}: checksum=${anchorChecksum}, quote="${serverExactQuote.slice(0, 20)}..."`);
  }

  console.log(`Done: ${updated}/${highlights.length} updated`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
