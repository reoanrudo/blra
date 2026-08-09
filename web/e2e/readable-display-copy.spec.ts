import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const LAW_ENTRY_ID = "art_325co0000000338_20260101_000341";
const DECIMAL_NODE_ID = "art_325co0000000338_20260101_000357";
const RATE_UNIT_NODE_ID = "art_325co0000000338_20260101_000325";

async function copyRenderedRange(
  page: Page,
  first: Locator,
  last: Locator,
): Promise<string> {
  const lastHandle = await last.elementHandle();
  if (!lastHandle) throw new Error("copy range target is missing");

  await first.evaluate((firstElement, lastElement) => {
    const range = document.createRange();
    range.setStartBefore(firstElement);
    range.setEndAfter(lastElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, lastHandle);

  await page.keyboard.press("Meta+c");
  return page.evaluate(() => navigator.clipboard.readText());
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/articles/${LAW_ENTRY_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("複数桁小数と時間単位を表示する", async ({ page }) => {
  const decimalNode = page.locator(`[data-article-id="${DECIMAL_NODE_ID}"]`);
  const rateNode = page.locator(`[data-article-id="${RATE_UNIT_NODE_ID}"]`);

  await expect(decimalNode).toContainText("20.5%以上");
  await expect(decimalNode).not.toContainText("20・5%");
  await expect(rateNode).toContainText("m³/時間で表した量");
  await expect(rateNode).not.toContainText("立方メートル毎時");
});

test("小数・時間単位・縦分数を画面表示どおりコピーする", async ({ page }) => {
  const decimalNode = page.locator(`[data-article-id="${DECIMAL_NODE_ID}"]`);
  const decimal = decimalNode.locator('[data-source-kind="number"]')
    .filter({ hasText: /^20\.5$/ });
  const percent = decimalNode.locator('[data-source-kind="unit"]')
    .filter({ hasText: /^%$/ });
  expect(await copyRenderedRange(page, decimal, percent)).toBe("20.5%");

  const rateUnit = page.locator(`[data-article-id="${RATE_UNIT_NODE_ID}"]`)
    .locator('[data-source-kind="unit"]')
    .filter({ hasText: /^m³\/時間$/ });
  expect(await copyRenderedRange(page, rateUnit, rateUnit)).toBe("m³/時間");

  const fraction = page.locator(".law-fraction").first();
  expect(await copyRenderedRange(page, fraction, fraction))
    .toBe(await fraction.textContent());
});
