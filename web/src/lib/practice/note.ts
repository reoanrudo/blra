import { prisma } from "@/lib/db";
import type { DrawingNoteTemplate } from "@prisma/client";

export async function getDrawingNoteTemplates(
  articleId: string,
): Promise<DrawingNoteTemplate[]> {
  return prisma.drawingNoteTemplate.findMany({
    where: { articleId },
    orderBy: { title: "asc" },
  });
}

export async function getDrawingNoteTemplatesForArticles(
  articleIds: string[],
): Promise<
  Record<
    string,
    { id: string; title: string; templateText: string; tags: string[] }[]
  >
> {
  if (articleIds.length === 0) return {};

  const templates = await prisma.$queryRawUnsafe<
    {
      id: string;
      articleId: string;
      title: string;
      templateText: string;
      tags: string[];
    }[]
  >(
    `SELECT id, "articleId", title, "templateText", tags
    FROM "DrawingNoteTemplate"
    WHERE "articleId" IN (${articleIds.map((_, i) => `$${i + 1}`).join(", ")})`,
    ...articleIds,
  );

  const result: Record<
    string,
    { id: string; title: string; templateText: string; tags: string[] }[]
  > = {};
  for (const t of templates) {
    if (!result[t.articleId]) result[t.articleId] = [];
    result[t.articleId].push({
      id: t.id,
      title: t.title,
      templateText: t.templateText,
      tags: t.tags,
    });
  }
  return result;
}
