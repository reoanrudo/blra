import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GET as getGlossary } from "@/app/api/glossary/route";

const prisma = new PrismaClient();
let dbAvailable = false;

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

describe("関連用語API (integration)", () => {
  it("文字列のcategory指定でPostgreSQL enumを絞り込める", async () => {
    if (!dbAvailable) return;

    const response = await getGlossary(
      new NextRequest("http://localhost/api/glossary?category=legal_definition"),
    );
    const rows = (await response.json()) as Array<{ category: string }>;

    expect(response.status).toBe(200);
    expect(rows.every((row) => row.category === "legal_definition")).toBe(true);
  });
});
