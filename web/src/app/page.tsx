import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";
import {
  buildArticleHref,
  todayInJapan,
} from "@/lib/applicability/applicability-context";

export default async function Home() {
  // 法令集の掲載順で最初の文書・条文へ遷移する。
  // Task 11: Law.currentRevisionId の Article のみを公開対象とする。
  const firstArticleScope = currentLawBookArticleScopeSql("a", "e", "l");
  const firstArticle = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT a.id
     FROM "LawBookEntry" e
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     JOIN "Law" l ON l.id = e."lawId"
     JOIN "Article" a ON a."lawId" = l.id
     WHERE edition."editionKey" = $1
       AND a.level = 'article'
       AND ${firstArticleScope}
     ORDER BY e."displayOrder", a."sortOrder", a.id
     LIMIT 1`,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  const today = todayInJapan();
  if (firstArticle.length > 0) {
    redirect(
      buildArticleHref(firstArticle[0].id, {
        anchor: "TODAY",
        asOf: today,
        projectId: null,
      }),
    );
  }

  // Absolute fallback: no articles in DB
  redirect(
    buildArticleHref("art_000002", {
      anchor: "TODAY",
      asOf: today,
      projectId: null,
    }),
  );
}
