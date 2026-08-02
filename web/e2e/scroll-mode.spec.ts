import {
  ARTICLE_107_ID,
  LAW_LAST_ARTICLE_ID,
  TEST_ARTICLE_ID,
  expect,
  test,
} from "./fixtures";

test.describe("全文スクロール表示", () => {
  test("冒頭から法令末尾まで最初からDOMに存在する", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await expect(
      page.locator(`[data-scroll-article-id="${LAW_LAST_ARTICLE_ID}"]`),
    ).toHaveCount(1);
  });

  test("深い条文の直URLへ追加取得なしで位置合わせする", async ({ page }) => {
    let chapterRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/articles/chapter-")) {
        chapterRequests += 1;
      }
    });

    await page.goto(`/articles/${ARTICLE_107_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await expect(page.locator(`#law-node-${ARTICLE_107_ID}`)).toBeInViewport();
    expect(chapterRequests).toBe(0);
  });

  test("遠方の目次移動で追加通信しない", async ({ page }) => {
    let chapterRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/articles/chapter-")) {
        chapterRequests += 1;
      }
    });

    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const article107 = page
      .getByRole("tree")
      .getByRole("button", { name: /第107条/ });
    await expect(article107).toHaveCount(1);
    await article107.click();

    await expect(page.locator(`#law-node-${ARTICLE_107_ID}`)).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`/articles/${ARTICLE_107_ID}$`));
    expect(chapterRequests).toBe(0);
  });

  test("全文ノードの固定アンカーが重複しない", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const counts = await page.locator('[data-full-law-ready="true"]').evaluate(
      (root) => {
        const ids = Array.from(root.querySelectorAll('[id^="law-node-"]')).map(
          (element) => element.id,
        );
        return { total: ids.length, unique: new Set(ids).size };
      },
    );
    expect(counts.total).toBeGreaterThan(2_000);
    expect(counts.unique).toBe(counts.total);
  });
});
