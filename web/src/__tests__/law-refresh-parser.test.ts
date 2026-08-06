import { describe, expect, it } from "vitest";
import { makeMinimalLawXml } from "@/__tests__/fixtures/minimal-law-xml";
import {
  materializeArticleRows,
  parseLawXml,
} from "@/lib/law-refresh/parse-law-xml";

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

  it("同一本文でも子セル属性・セル境界が異なる表行を区別する", () => {
    const baseRow = `
      <TableRow>
        <TableColumn BorderTop="solid"><Sentence>甲</Sentence></TableColumn>
        <TableColumn><Sentence>乙</Sentence></TableColumn>
      </TableRow>`;
    const differentAttributeRow = `
      <TableRow>
        <TableColumn BorderTop="dashed"><Sentence>甲</Sentence></TableColumn>
        <TableColumn><Sentence>乙</Sentence></TableColumn>
      </TableRow>`;
    const differentCellBoundaryRow = `
      <TableRow><TableColumn><Sentence>甲乙</Sentence></TableColumn></TableRow>`;
    const anchorRow = `
      <TableRow><TableColumn><Sentence>丙</Sentence></TableColumn></TableRow>`;
    const makeXml = (rows: string[]) => `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        ${rows.join("")}
      </Table></TableStruct></AppdxTable></LawBody></Law>`;
    const rowKeys = (rows: string[]) =>
      parseLawXml(makeXml(rows), context).nodes
        .filter((node) => node.level === "table_row")
        .map((node) => node.durableNodeKey);

    const before = rowKeys([baseRow, anchorRow]);
    const after = rowKeys([
      differentCellBoundaryRow,
      anchorRow,
      differentAttributeRow,
      baseRow,
    ]);

    expect(new Set(after).size).toBe(4);
    expect(before.every((key) => after.includes(key))).toBe(true);
    expect(after.every((key) => !key.includes("/occurrence:"))).toBe(true);
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

  it("bodyChecksumは条・項番号だけの変更に影響されない", () => {
    const lawXml = (articleNumber: string, paragraphNumber: string) => `
      <Law><LawBody><MainProvision>
        <Article Num="${articleNumber}">
          <ArticleTitle>第${articleNumber}条</ArticleTitle>
          <Paragraph Num="${paragraphNumber}">
            <ParagraphNum>${paragraphNumber}</ParagraphNum>
            <ParagraphSentence><Sentence>同じ本文</Sentence></ParagraphSentence>
          </Paragraph>
        </Article>
      </MainProvision></LawBody></Law>`;
    const checksums = (articleNumber: string, paragraphNumber: string) =>
      parseLawXml(lawXml(articleNumber, paragraphNumber), context).nodes.map(
        (node) => ({ level: node.level, bodyChecksum: node.bodyChecksum }),
      );

    expect(checksums("10", "1")).toEqual(checksums("11", "2"));
  });

  it("表示番号がない項・号・枝番号はlegacy公開値とcontentChecksumを維持する", () => {
    const xml = `
      <Law><LawBody><MainProvision>
        <Article Num="1"><ArticleTitle>第一条</ArticleTitle>
          <Paragraph Num="9"><ParagraphNum/>
            <ParagraphSentence><Sentence>項本文</Sentence></ParagraphSentence>
            <Item Num="8">
              <ItemSentence><Sentence>号本文</Sentence></ItemSentence>
              <Subitem1 Num="7">
                <Subitem1Sentence><Sentence>枝本文</Sentence></Subitem1Sentence>
              </Subitem1>
            </Item>
          </Paragraph>
        </Article>
      </MainProvision></LawBody></Law>`;
    const nodes = parseLawXml(xml, context).nodes;
    const paragraph = nodes.find((node) => node.level === "paragraph")!;
    const item = nodes.find((node) => node.level === "item")!;
    const subitem = nodes.find((node) => node.level === "subitem1")!;

    expect(paragraph.paragraphNumber).toBeNull();
    expect(item.itemNumber).toBeNull();
    expect(subitem.subitemNumber).toBeNull();
    expect(paragraph.legacyStableNodeKey).toBe(
      "root/article:1@1/paragraph:1@1",
    );
    expect(item.legacyStableNodeKey).toBe(
      "root/article:1@1/paragraph:1@1/item:1@1",
    );
    expect(subitem.legacyStableNodeKey).toBe(
      "root/article:1@1/paragraph:1@1/item:1@1/subitem1:1@1",
    );
    expect(paragraph.contentChecksum).toBe(
      "ea1a8cbe50d45cbd2f58f79e42a5f1797e0b1c8d0c096f75330ddddcbd33297b",
    );
    expect(item.contentChecksum).toBe(
      "d473cba00276545fbef352a0f72eb5e1dda3e327aab45aef42fac4bb7f3c0d63",
    );
    expect(subitem.contentChecksum).toBe(
      "063edad1214869b64d1472a3a71ec3f83b5994efcb0cf992e699df4642831eec",
    );
    expect(subitem.durableNodeKey).toBe(
      "main/article:1/paragraph:9/item:8/subitem1:7",
    );
  });

  it("durable keyとchecksumはcontextのrevisionIdに依存しない", () => {
    const xml = makeMinimalLawXml(["10", "11"]);
    const first = parseLawXml(xml, context);
    const second = parseLawXml(xml, { ...context, revisionId: "rev-other" });
    const revisionIndependentFields = (document: typeof first) =>
      document.nodes.map((node) => ({
        durableNodeKey: node.durableNodeKey,
        legacyStableNodeKey: node.legacyStableNodeKey,
        contentChecksum: node.contentChecksum,
        bodyChecksum: node.bodyChecksum,
      }));

    expect(second.revisionId).toBe("rev-other");
    expect(revisionIndependentFields(second)).toEqual(
      revisionIndependentFields(first),
    );
  });

  it("条・項・号・枝番号から意味的な階層keyを作る", () => {
    const xml = `
      <Law><LawBody><MainProvision>
        <Article Num="10_2"><ArticleTitle>第十条の二</ArticleTitle>
          <Paragraph Num="2"><ParagraphNum>2</ParagraphNum>
            <Item Num="3"><ItemTitle>三</ItemTitle>
              <Subitem1 Num="4"><Subitem1Title>イ</Subitem1Title></Subitem1>
            </Item>
          </Paragraph>
        </Article>
      </MainProvision></LawBody></Law>`;
    const nodes = parseLawXml(xml, context).nodes;

    expect(nodes.map((node) => node.durableNodeKey)).toEqual([
      "main/article:10の2",
      "main/article:10の2/paragraph:2",
      "main/article:10の2/paragraph:2/item:三",
      "main/article:10の2/paragraph:2/item:三/subitem1:イ",
    ]);
  });

  it("materializeArticleRowsはsourceIndexからIDとparentIdを解決する", () => {
    const document = parseLawXml(makeMinimalLawXml(["10"]), context);
    const rows = materializeArticleRows(document, "row_");

    expect(rows.map(({ id, parentId, lawId, lawRevisionId }) => ({
      id,
      parentId,
      lawId,
      lawRevisionId,
    }))).toEqual([
      {
        id: "row_000001",
        parentId: null,
        lawId: "law-test",
        lawRevisionId: "rev-test",
      },
      {
        id: "row_000002",
        parentId: "row_000001",
        lawId: "law-test",
        lawRevisionId: "rev-test",
      },
    ]);
    expect(rows.map((row) => row.durableNodeKey)).toEqual(
      document.nodes.map((node) => node.durableNodeKey),
    );
    expect(rows.map((row) => row.stableNodeKey)).toEqual(
      document.nodes.map((node) => node.legacyStableNodeKey),
    );
  });

  it("TableColumnの罫線・結合属性をtableCellMetaへ抽出する", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow>
          <TableColumn BorderTop="solid" BorderBottom="none" BorderLeft="solid" BorderRight="none" colspan="2" rowspan="3">
            <Sentence>結合セル</Sentence>
          </TableColumn>
        </TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const columns = parseLawXml(xml, context).nodes.filter(
      (node) => node.level === "table_column",
    );

    expect(columns).toHaveLength(1);
    expect(columns[0].tableCellMeta).toEqual({
      borderTop: "solid",
      borderRight: "none",
      borderBottom: "none",
      borderLeft: "solid",
      colspan: 2,
      rowspan: 3,
    });
  });

  it("TableColumnの属性省略時は罫線none・結合1がデフォルト", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow>
          <TableColumn><Sentence>プレーン</Sentence></TableColumn>
        </TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const columns = parseLawXml(xml, context).nodes.filter(
      (node) => node.level === "table_column",
    );

    expect(columns).toHaveLength(1);
    expect(columns[0].tableCellMeta).toEqual({
      borderTop: "none",
      borderRight: "none",
      borderBottom: "none",
      borderLeft: "none",
      colspan: 1,
      rowspan: 1,
    });
  });

  it("table_column以外のレベルのtableCellMetaはnull", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow><TableColumn><Sentence>セル</Sentence></TableColumn></TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const nonColumnNodes = parseLawXml(xml, context).nodes.filter(
      (node) => node.level !== "table_column",
    );

    expect(nonColumnNodes.length).toBeGreaterThan(0);
    expect(nonColumnNodes.every((node) => node.tableCellMeta === null)).toBe(true);
  });

  it("materializeArticleRowsはtableCellMetaをtableMetadata JSON文字列へ格納する", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow>
          <TableColumn BorderTop="solid" colspan="2"><Sentence>結合</Sentence></TableColumn>
        </TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const document = parseLawXml(xml, context);
    const rows = materializeArticleRows(document, "row_");
    const column = rows.find((row) => row.level === "table_column")!;

    expect(column.tableMetadata).not.toBeNull();
    expect(JSON.parse(column.tableMetadata!)).toEqual({
      borderTop: "solid",
      borderRight: "none",
      borderBottom: "none",
      borderLeft: "none",
      colspan: 2,
      rowspan: 1,
    });
  });

  it("table_column以外の行のtableMetadataはnull", () => {
    const xml = `
      <Law><LawBody><AppdxTable><TableStruct><Table>
        <TableRow><TableColumn><Sentence>セル</Sentence></TableColumn></TableRow>
      </Table></TableStruct></AppdxTable></LawBody></Law>`;

    const rows = materializeArticleRows(parseLawXml(xml, context), "row_");
    const nonColumnRows = rows.filter((row) => row.level !== "table_column");

    expect(nonColumnRows.length).toBeGreaterThan(0);
    expect(nonColumnRows.every((row) => row.tableMetadata === null)).toBe(true);
  });
});

describe("parseLawXml ルビ（Ruby）処理", () => {
  it("ルビの親字を本文に残し、読み仮名を除外する", () => {
    const xml = `
      <Law><LawBody><MainProvision>
        <Article Num="1"><ArticleTitle>第一条</ArticleTitle>
          <Paragraph Num="1">
            <ParagraphSentence>
              <Sentence>施設並びに<Ruby>跨<Rt>こ</Rt></Ruby>線橋を設ける。</Sentence>
            </ParagraphSentence>
          </Paragraph>
        </Article>
      </MainProvision></LawBody></Law>`;
    const nodes = parseLawXml(xml, context).nodes;
    const paragraph = nodes.find((n) => n.level === "paragraph")!;

    // 親字「跨」が本文に含まれる
    expect(paragraph.text).toContain("跨線橋");
    // 読み仮名「こ」が本文に含まれない
    expect(paragraph.text).not.toMatch(/こ/);
    // 前後の文脈が正しい順序で結合される
    expect(paragraph.text).toContain("施設並びに跨線橋を設ける。");
  });

  it("1つのSentence内に複数のルビがあっても全て正しく処理する", () => {
    const xml = `
      <Law><LawBody><MainProvision>
        <Article Num="1"><ArticleTitle>第一条</ArticleTitle>
          <Paragraph Num="1">
            <ParagraphSentence>
              <Sentence>消火<Ruby>栓<Rt>せん</Rt></Ruby>、スプリンクラー、貯水<Ruby>槽<Rt>そう</Rt></Ruby>その他</Sentence>
            </ParagraphSentence>
          </Paragraph>
        </Article>
      </MainProvision></LawBody></Law>`;
    const nodes = parseLawXml(xml, context).nodes;
    const paragraph = nodes.find((n) => n.level === "paragraph")!;

    expect(paragraph.text).toContain("消火栓");
    expect(paragraph.text).toContain("貯水槽");
    expect(paragraph.text).not.toMatch(/せん|そう/);
  });

  it("Column内のSentenceにあるルビも正しく処理する（第2条定義書き構造）", () => {
    const xml = `
      <Law><LawBody><MainProvision>
        <Article Num="2"><ArticleTitle>第二条</ArticleTitle>
          <Paragraph Num="1">
            <ParagraphSentence><Sentence>定義は次のとおり。</Sentence></ParagraphSentence>
            <Item Num="1">
              <ItemTitle>一</ItemTitle>
              <ItemSentence>
                <Column Num="1"><Sentence>建築物</Sentence></Column>
                <Column Num="2"><Sentence>施設並びに<Ruby>跨<Rt>こ</Rt></Ruby>線橋を含む。</Sentence></Column>
              </ItemSentence>
            </Item>
          </Paragraph>
        </Article>
      </MainProvision></LawBody></Law>`;
    const nodes = parseLawXml(xml, context).nodes;
    // Column レベルのノードから確認
    const columns = nodes.filter((n) => n.level === "column");
    const col2 = columns[1];

    expect(col2).toBeDefined();
    expect(col2.text).toContain("跨線橋");
    expect(col2.text).not.toMatch(/こ/);
    expect(col2.text).toContain("施設並びに跨線橋を含む。");
  });
});
