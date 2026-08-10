import { expect, test } from "./fixtures";

const ARTICLE_19_ID = "art_325co0000000338_20260101_000225";
const ARTICLE_20_7_ID = "art_325co0000000338_20260101_000370";
const REGULATION_BODY_TABLE_ARTICLE_ID = "art_325m50004000040_20260101_000015";
const REGULATION_APPENDIX_TABLE_ARTICLE_ID = "art_325m50004000040_20260101_014122";

test("建築基準法施行令の表は別表と同じ旧レイアウトを使う", async ({ page }) => {
  await page.goto("/articles/art_325co0000000338_20260101_000019");
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await expect(page.locator(".law-table--legacy").first()).toBeVisible();
  await expect(page.locator(".law-table--legacy .law-table__header-row").first())
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("第19条の居室種類表で見出しと割合を正しい列へ結合する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_19_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const table = page.locator("table.law-table").filter({
    hasText: "居室の種類",
  }).first();
  await expect(table).toBeVisible();

  const layout = await table.evaluate((element) => {
    const htmlTable = element as HTMLTableElement;
    const rows = Array.from(htmlTable.rows);
    const firstColumn = htmlTable.querySelector("col");

    return {
      columnCount: htmlTable.querySelectorAll("col").length,
      firstColumnWidth: firstColumn?.getBoundingClientRect().width ?? null,
      middleColumnWidth:
        htmlTable.querySelector("col:nth-child(2)")?.getBoundingClientRect().width ?? null,
      lastColumnWidth:
        htmlTable.querySelector("col:last-child")?.getBoundingClientRect().width ?? null,
      headerTexts: Array.from(rows[0]?.cells ?? []).map((cell) => cell.textContent),
      headerColSpans: Array.from(rows[0]?.cells ?? []).map((cell) => cell.colSpan),
      roomTypeHeaderTextAlign: rows[0]?.cells[0]
        ? getComputedStyle(rows[0].cells[0]).textAlign
        : null,
      dataCellCounts: rows.slice(1).map((row) => row.cells.length),
      ratioRowSpans: Array.from(htmlTable.querySelectorAll("td[rowspan]"))
        .map((cell) => Number(cell.getAttribute("rowspan"))),
    };
  });

  expect({
    ...layout,
    firstColumnWidth: undefined,
    middleColumnWidth: undefined,
    lastColumnWidth: undefined,
  }).toEqual({
    columnCount: 3,
    firstColumnWidth: undefined,
    middleColumnWidth: undefined,
    lastColumnWidth: undefined,
    headerTexts: ["居室の種類", "割合"],
    headerColSpans: [2, 1],
    roomTypeHeaderTextAlign: "center",
    dataCellCounts: [3, 2, 3, 2, 2, 2, 3, 2],
    ratioRowSpans: [2, 4, 2],
  });
  expect(layout.middleColumnWidth).toBeGreaterThan((layout.firstColumnWidth ?? 0) * 1.5);
  expect(layout.middleColumnWidth).toBeGreaterThan((layout.lastColumnWidth ?? 0) * 1.5);
});

test("施行令の（1）（2）欄は35pxで、説明列を圧迫しない", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_19_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const table = page.locator("table.law-table").filter({ hasText: "居室の種類" }).first();
  const widths = await table.locator("col").evaluateAll((columns) =>
    columns.map((column) => Math.round(column.getBoundingClientRect().width)),
  );

  expect(widths[0]).toBe(35);
  expect(widths[1]).toBeGreaterThan(widths[0]);
});

test("第20条の7の換気回数表でDBのセル結合情報を表示する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_20_7_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const table = page.locator("table.law-table").filter({
    hasText: "住宅等の居室以外の居室",
  }).first();
  await expect(table).toBeVisible();

  const layout = await table.evaluate((element) => {
    const rows = Array.from((element as HTMLTableElement).rows);
    return rows.map((row) =>
      Array.from(row.cells).map((cell) => ({
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
      })),
    );
  });

  expect(layout).toEqual([
    [
      { colSpan: 1, rowSpan: 2 },
      { colSpan: 2, rowSpan: 1 },
      { colSpan: 3, rowSpan: 1 },
    ],
    Array.from({ length: 5 }, () => ({ colSpan: 1, rowSpan: 1 })),
    Array.from({ length: 6 }, () => ({ colSpan: 1, rowSpan: 1 })),
    Array.from({ length: 6 }, () => ({ colSpan: 1, rowSpan: 1 })),
    [{ colSpan: 6, rowSpan: 1 }],
  ]);
});

test("第32条の縦結合見出しは同じthead内に置き、セルを欠損させない", async ({ page }) => {
  await page.goto("/articles/art_325co0000000338_20260101_000554");
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const table = page.locator("table.law-table").filter({
    hasText: "尿浄化槽又は合併処理浄化槽を設ける区域",
  }).first();
  await expect(table).toBeVisible();

  await expect(table.locator("thead tr")).toHaveCount(2);
  await expect(table.locator("thead td[rowspan='2']")).toHaveCount(2);
  await expect(table.locator("tbody tr").first().locator("td")).toHaveCount(4);
});

test("法令表を横あふれなしの冊子型組版で表示する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_19_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const table = page.locator("table.law-table").filter({
    hasText: "居室の種類",
  }).first();
  const presentation = await table.evaluate((element) => {
    const htmlTable = element as HTMLTableElement;
    const header = htmlTable.rows[0]?.cells[0];
    const body = htmlTable.rows[1]?.cells[1];
    return {
      scrollWidth: htmlTable.scrollWidth,
      clientWidth: htmlTable.clientWidth,
      headerBackground: header ? getComputedStyle(header).backgroundColor : null,
      headerFontWeight: header ? getComputedStyle(header).fontWeight : null,
      bodyPaddingTop: body ? getComputedStyle(body).paddingTop : null,
    };
  });

  expect(presentation.scrollWidth).toBeLessThanOrEqual(presentation.clientWidth);
  expect(presentation.headerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(Number(presentation.headerFontWeight)).toBeLessThan(600);
  expect(presentation.bodyPaddingTop).toBe("6px");
});

for (const articleId of [
  "art_325co0000000338_20260101_000554",
  "art_325co0000000338_20260101_000945",
]) {
  test(`${articleId} の全表に旧レイアウトを適用し、横あふれを出さない`, async ({ page }) => {
    await page.goto(`/articles/${articleId}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const invalidTables = await page
      .locator("table.law-table")
      .evaluateAll((tables) =>
        tables
          .map((table, index) => ({
            index,
            usesLegacyLayout: table.classList.contains("law-table--legacy"),
            scrollWidth: table.scrollWidth,
            clientWidth: table.clientWidth,
          }))
          .filter((table) =>
            !table.usesLegacyLayout || table.scrollWidth > table.clientWidth,
          ),
      );

    expect(invalidTables).toEqual([]);
  });
}

for (const [label, articleId] of [
  ["本文表", REGULATION_BODY_TABLE_ARTICLE_ID],
  ["別表", REGULATION_APPENDIX_TABLE_ARTICLE_ID],
] as const) {
  test(`建築基準法施行規則の${label}は旧レイアウトで横あふれを出さない`, async ({ page }) => {
    await page.goto(`/articles/${articleId}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const tables = page.locator("table.law-table");
    await expect(tables.first()).toBeVisible();

    const invalidTables = await tables.evaluateAll((elements) =>
      elements
        .map((table, index) => ({
          index,
          usesLegacyLayout: table.classList.contains("law-table--legacy"),
          scrollWidth: table.scrollWidth,
          clientWidth: table.clientWidth,
        }))
        .filter((table) =>
          !table.usesLegacyLayout || table.scrollWidth > table.clientWidth,
        ),
    );

    expect(invalidTables).toEqual([]);
  });
}

for (const [label, articleId] of [
  ["指定検定機関等省令第16条", "art_411m50004000013_20260101_000143"],
  ["指定検定機関等省令第17条", "art_411m50004000013_20260101_000323"],
] as const) {
  test(`${label} の表は別表準拠で横あふれを出さない`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto(`/articles/${articleId}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    const tables = page.locator("table.law-table");
    await expect(tables.first()).toBeVisible();

    const invalid = await page.locator(".law-table-wrapper").evaluateAll((wrappers) =>
      wrappers.flatMap((wrapper, index) => {
        const table = wrapper.querySelector("table.law-table");
        return !table || !table.classList.contains("law-table--legacy") ||
          wrapper.scrollWidth > wrapper.clientWidth || table.scrollWidth > table.clientWidth
          ? [index] : [];
      }),
    );

    expect(invalid).toEqual([]);
  });
}
