import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { GET as getToc } from "@/app/api/law-toc/route";
import { GET as getSearch } from "@/app/api/search/route";

const prisma = new PrismaClient();
const ARCHITECTS_ACT_EGOV_ID = "325AC1000000202";
let dbAvailable = false;

interface SupplementRow {
  id: string;
  title: string | null;
  systemTags: unknown;
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("附則メタデータのDB境界 (integration)", () => {
  it("建築士法の44附則を制定時または改正法番号で識別できる", async () => {
    if (!dbAvailable) return;

    const supplements = await prisma.$queryRawUnsafe<SupplementRow[]>(
      `SELECT article.id, article.title, article."systemTags"
       FROM "Article" article
       JOIN "Law" law ON law.id = article."lawId"
       WHERE law."egovLawId" = $1
         AND article.level = 'suppl_provision'
         AND article."parentId" IS NULL
         AND article."deletedAt" IS NULL
       ORDER BY article."sortOrder"`,
      ARCHITECTS_ACT_EGOV_ID,
    );

    expect(supplements).toHaveLength(44);
    expect(supplements[0].title).toBe("制定時附則");
    expect(supplements[1].title).toBe(
      "附則（昭和二六年六月一日法律第一七八号・抄）",
    );
    expect(supplements.every((row) => row.systemTags !== null)).toBe(true);
    expect(new Set(supplements.map((row) => row.id)).size).toBe(44);
  });

  it("建築士法の目次は附則44件を単一の折りたたみグループにする", async () => {
    if (!dbAvailable) return;

    const laws = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "Law" WHERE "egovLawId" = $1',
      ARCHITECTS_ACT_EGOV_ID,
    );
    const response = await getToc(
      new NextRequest(`http://localhost/api/law-toc?lawId=${encodeURIComponent(laws[0].id)}`),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as {
      nodes: Array<{
        id: string;
        parentId: string | null;
        level: string;
        title: string | null;
      }>;
    };
    const nodes = body.nodes;
    const groups = nodes.filter((node) => node.level === "supplement_group");

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("附則・経過措置（44件）");
    expect(
      nodes.filter(
        (node) => node.level === "suppl_provision" && node.parentId === groups[0].id,
      ),
    ).toHaveLength(44);
  });

  it("改正法番号から該当する附則を検索できる", async () => {
    if (!dbAvailable) return;

    const title = "附則（昭和二六年六月一日法律第一七八号・抄）";
    const response = await getSearch(
      new NextRequest(
        `http://localhost/api/search?q=${encodeURIComponent("昭和二六年六月一日法律第一七八号")}`,
      ),
    );
    const body = (await response.json()) as {
      results: Array<{ caption: string | null; lawName: string; matchSource: string }>;
    };

    expect(body.results).toContainEqual(
      expect.objectContaining({
        caption: title,
        lawName: "建築士法",
        matchSource: "caption",
      }),
    );
  });
});
