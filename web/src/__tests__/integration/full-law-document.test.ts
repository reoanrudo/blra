import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFullLawDocument } from "@/lib/article/full-law-repository";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

const prisma = new PrismaClient();
let revisionId: string | null = null;
let civilRevisionId: string | null = null;
let civilArticle208Id: string | null = null;

beforeAll(async () => {
  try {
    await prisma.$connect();
    const building = await prisma.lawBookEntry.findFirst({
      where: {
        edition: { editionKey: CURRENT_LAW_BOOK_EDITION_KEY },
        law: { egovLawId: "325AC0000000201" },
      },
      select: { lawRevisionId: true },
    });
    revisionId = building?.lawRevisionId ?? null;

    const civil208 = await prisma.article.findFirst({
      where: {
        law: { egovLawId: "129AC0000000089" },
        level: "article",
        articleNumberNormalized: "208",
        deletedAt: null,
      },
      select: { id: true, lawRevisionId: true },
    });
    civilRevisionId = civil208?.lawRevisionId ?? null;
    civilArticle208Id = civil208?.id ?? null;
  } catch {
    revisionId = null;
    civilRevisionId = null;
    civilArticle208Id = null;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("全文法令Repository (integration)", () => {
  it("建築基準法の収録全文を文書順で返す", async () => {
    if (!revisionId) return;

    const document = await getFullLawDocument(revisionId);
    expect(document?.law.egovLawId).toBe("325AC0000000201");
    expect(document?.nodes.length).toBeGreaterThan(2_000);
    expect(
      document?.nodes.some(
        (node) => node.articleNumberNormalized === "107",
      ),
    ).toBe(true);
    expect(
      document?.toc
        .filter((node) => node.level !== "supplement_group")
        .every((node) => document.nodes.some((row) => row.id === node.id)),
    ).toBe(true);
    expect(
      document?.toc.some((node) => node.level === "supplement_group"),
    ).toBe(true);
  });

  it("soft delete済みノードと未収録範囲を返さない", async () => {
    if (!civilRevisionId || !civilArticle208Id) return;

    const document = await getFullLawDocument(civilRevisionId);
    expect(
      document?.nodes.some((node) => node.id === civilArticle208Id),
    ).toBe(false);

    const deleted = await prisma.article.findMany({
      where: { lawRevisionId: civilRevisionId, deletedAt: { not: null } },
      select: { id: true },
    });
    const returned = new Set(document?.nodes.map((node) => node.id));
    expect(deleted.some((node) => returned.has(node.id))).toBe(false);
  });

  it("DB保存済みの解決リンクだけをsourceId別に返す", async () => {
    if (!revisionId) return;

    const document = await getFullLawDocument(revisionId);
    for (const links of Object.values(document?.linksBySource ?? {})) {
      expect(
        links.every((link) => link.isResolved && Boolean(link.targetId)),
      ).toBe(true);
    }
  });
});
