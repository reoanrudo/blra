import { describe, expect, it } from "vitest";
import { makeMinimalLawXml } from "@/__tests__/fixtures/minimal-law-xml";
import { parseLawXml } from "@/lib/law-refresh/parse-law-xml";

const context = {
  lawId: "law-test",
  egovLawId: "325AC0000000201",
  revisionId: "rev-test",
} as const;

describe("parseLawXml durable keys", () => {
  it("第10条の2を挿入しても第11条のkeyを維持する", () => {
    const before = parseLawXml(makeMinimalLawXml(["10", "11"]), context);
    const after = parseLawXml(makeMinimalLawXml(["10", "10_2", "11"]), context);
    const key = (doc: typeof before, num: string) =>
      doc.nodes.find(
        (node) =>
          node.level === "article" &&
          node.articleNumberNormalized === num,
      )?.durableNodeKey;

    expect(key(after, "10の2")).toBe("main/article:10の2");
    expect(key(after, "11")).toBe(key(before, "11"));
  });

  it("無番号の表行を子セルの本文で区別する", () => {
    const xml = `
      <Law Era="Showa" Year="25" PromulgateMonth="05" PromulgateDay="24">
        <LawBody>
          <AppdxTable>
            <TableStruct>
              <Table>
                <TableRow><TableColumn><Sentence>甲</Sentence></TableColumn></TableRow>
                <TableRow><TableColumn><Sentence>乙</Sentence></TableColumn></TableRow>
              </Table>
            </TableStruct>
          </AppdxTable>
        </LawBody>
      </Law>`;

    const rows = parseLawXml(xml, context).nodes.filter(
      (node) => node.level === "table_row",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].durableNodeKey).not.toBe(rows[1].durableNodeKey);
  });

  it("完全に同一の表行と表列だけoccurrence segmentで区別する", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow>
          <TableColumn BorderTop="solid"><Sentence>同じセル</Sentence></TableColumn>
          <TableColumn BorderTop="solid"><Sentence>同じセル</Sentence></TableColumn>
        </TableRow>
        <TableRow>
          <TableColumn BorderTop="solid"><Sentence>同じセル</Sentence></TableColumn>
          <TableColumn BorderTop="solid"><Sentence>同じセル</Sentence></TableColumn>
        </TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const nodes = parseLawXml(xml, context).nodes;
    const rowKeys = nodes
      .filter((node) => node.level === "table_row")
      .map((node) => node.durableNodeKey);
    const columnKeys = nodes
      .filter((node) => node.level === "table_column")
      .map((node) => node.durableNodeKey);

    expect(new Set(rowKeys).size).toBe(2);
    expect(rowKeys).toEqual([
      expect.stringMatching(/\/occurrence:1$/),
      expect.stringMatching(/\/occurrence:2$/),
    ]);
    expect(new Set(columnKeys).size).toBe(4);
    expect(columnKeys.every((key) => /\/occurrence:[12]$/.test(key))).toBe(true);
  });

  it("同じNumでも内容が異なる表要素にはoccurrenceを使わない", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow Num="1"><TableColumn Num="1"><Sentence>甲</Sentence></TableColumn></TableRow>
        <TableRow Num="1"><TableColumn Num="1"><Sentence>乙</Sentence></TableColumn></TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const keys = parseLawXml(xml, context).nodes
      .filter(
        (node) => node.level === "table_row" || node.level === "table_column",
      )
      .map((node) => node.durableNodeKey);

    expect(new Set(keys).size).toBe(4);
    expect(keys.every((key) => !key.includes("/occurrence:"))).toBe(true);
  });

  it("非同一の表行を挿入・並べ替えても既存key集合を維持する", () => {
    const makeTableXml = (cells: string[]) => `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        ${cells.map((cell) => `<TableRow><TableColumn><Sentence>${cell}</Sentence></TableColumn></TableRow>`).join("")}
      </Table></TableStruct></AppdxTable></LawBody></Law>`;
    const keys = (cells: string[]) =>
      parseLawXml(makeTableXml(cells), context).nodes
        .filter((node) => node.level === "table_row")
        .map((node) => node.durableNodeKey);

    const before = keys(["甲", "乙"]);
    const after = keys(["乙", "丙", "甲"]);

    expect(after).toHaveLength(3);
    expect(before.every((key) => after.includes(key))).toBe(true);
  });

  it("表以外の同一無番号nodeはparser errorにする", () => {
    const xml = `
      <Law><LawBody><MainProvision>
        <Chapter><ChapterTitle>総則</ChapterTitle></Chapter>
        <Chapter><ChapterTitle>総則</ChapterTitle></Chapter>
      </MainProvision></LawBody></Law>`;

    expect(() => parseLawXml(xml, context)).toThrow(
      /Duplicate durable node fingerprint/,
    );
  });

  it("附則の挿入後も改正法令番号配下の条keyを維持する", () => {
    const supplement = (amendLawNum: string) => `
      <SupplProvision AmendLawNum="${amendLawNum}">
        <SupplProvisionLabel>附則</SupplProvisionLabel>
        <Article Num="1"><ArticleTitle>第一条</ArticleTitle></Article>
      </SupplProvision>`;
    const lawXml = (amendLawNums: string[]) => `
      <Law><LawBody>${amendLawNums.map(supplement).join("")}</LawBody></Law>`;
    const keyFor = (amendLawNums: string[], amendLawNum: string) =>
      parseLawXml(lawXml(amendLawNums), context).nodes.find(
        (node) =>
          node.level === "article" &&
          node.durableNodeKey.includes(`suppl_provision:${amendLawNum}/`),
      )?.durableNodeKey;

    expect(keyFor(["改正A", "改正B"], "改正B")).toBe(
      "supplementary/suppl_provision:改正B/article:1",
    );
    expect(keyFor(["改正C", "改正A", "改正B"], "改正B")).toBe(
      "supplementary/suppl_provision:改正B/article:1",
    );
  });
});
