import { TEST_ARTICLE_ID, expect, test } from "./fixtures";

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

  test("印刷時は操作UIを隠し法令の末尾まで出力対象にする", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const articles = page.locator("[data-scroll-article-id]");
    const articleCount = await articles.count();
    expect(articleCount).toBeGreaterThan(1);
    const lastArticle = articles.nth(articleCount - 1);
    const lastArticleBlock = lastArticle.locator("..");

    await page.emulateMedia({ media: "print" });

    await expect(page.locator('nav[data-print-hidden="true"]')).toBeHidden();
    await expect(page.locator(".law-running-header__actions")).toBeHidden();
    await expect(page.locator(".law-running-header__law")).toBeVisible();
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    expect(await articles.count()).toBe(articleCount);
    await expect(lastArticle).toBeAttached();
    await expect(lastArticleBlock).toBeVisible();

    const overflowY = await page
      .locator('main[data-scroll-container="article-main"]')
      .evaluate((element) => getComputedStyle(element).overflowY);
    expect(overflowY).toBe("visible");

    const lawPageStyle = await page.locator(".law-page").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect(lawPageStyle).toEqual({
      backgroundColor: "rgb(255, 255, 255)",
      borderTopWidth: "0px",
      boxShadow: "none",
    });
  });
});
