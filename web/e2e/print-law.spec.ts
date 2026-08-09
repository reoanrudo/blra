import { LAW_LAST_ARTICLE_ID, TEST_ARTICLE_ID, expect, test } from "./fixtures";

test.describe("法令全文印刷", () => {
  test("印刷ボタンからブラウザ標準の印刷を呼び出す", async ({ page }) => {
    await page.addInitScript(() => {
      const state = window as Window & { __printCalled?: boolean };
      state.__printCalled = false;
      window.print = () => {
        state.__printCalled = true;
      };
    });

    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    await page.getByRole("button", { name: "印刷", exact: true }).click();

    const printCalled = await page.evaluate(
      () => (window as Window & { __printCalled?: boolean }).__printCalled,
    );
    expect(printCalled).toBe(true);
  });
});
