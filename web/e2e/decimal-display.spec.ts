import { expect, test } from "./fixtures";

const ARTICLE_19_ID = "art_325co0000000338_20260101_000225";
const ARTICLE_20_PARAGRAPH_ID = "art_325co0000000338_20260101_000273";
const ARTICLE_20_7_TABLE_CELL_ID = "art_325co0000000338_20260101_000392";
const ARTICLE_20_9_ID = "art_325co0000000338_20260101_000438";
const ARTICLE_21_ID = "art_325co0000000338_20260101_000441";
const ARTICLE_81_DEFINITION_ITEM_ID = "art_325co0000000338_20260101_000938";

test("本文中の漢数字小数を算用数字と小数点で表示する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_19_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const paragraph = page.locator(
    `[data-article-id="${ARTICLE_20_PARAGRAPH_ID}"]`,
  );
  await expect(paragraph).toContainText("数値に3.0を乗じて得た数値");
  await expect(paragraph).toContainText("数値に0.7を乗じて得た数値");
  await expect(paragraph).not.toContainText("3・〇");
  await expect(paragraph).not.toContainText("〇・7");
});

test("表セルの漢数字小数を3.0と表示する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_20_7_TABLE_CELL_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const tableCell = page.locator(
    `[data-article-id="${ARTICLE_20_7_TABLE_CELL_ID}"]`,
  );
  await expect(tableCell).toHaveText("3.0");
});

test("本文中の小数と単位を記号表記で表示する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_20_9_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await expect(page.locator("main").locator(`[data-article-id="${ARTICLE_20_9_ID}"]`).locator(".."))
    .toContainText("0.1mg以下");

  await page.goto(`/articles/${ARTICLE_21_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await expect(page.locator("main").locator(`[data-article-id="${ARTICLE_21_ID}"]`).locator(".."))
    .toContainText("2.1m以上");
});

test("定義項目の見出し内でも数量と単位を記号表記で表示する", async ({ page }) => {
  await page.goto(`/articles/${ARTICLE_81_DEFINITION_ITEM_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  const item = page.locator(
    `[data-article-id="${ARTICLE_81_DEFINITION_ITEM_ID}"]`,
  );
  await expect(item).toContainText("高さが31m以下の建築物");
  await expect(item).not.toContainText("三十一メートル");
});
