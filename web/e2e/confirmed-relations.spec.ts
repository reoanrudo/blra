import {
  ARTICLE_107_ID,
  TEST_ARTICLE_ID,
  expect,
  test,
} from "./fixtures";

test.describe("確認済みの関連", () => {
  test("本文外の閉じた一覧から新しいタブ用リンクを表示する", async ({ page }) => {
    await page.route(
      "**/api/law-revisions/*/confirmed-relations",
      (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          revisionId: "test-revision",
          relationsBySource: {
            [TEST_ARTICLE_ID]: [{
              id: "confirmed-e2e-1",
              relationType: "DEFINES",
              rationale: "用語定義をあわせて確認するため",
              confirmedAt: "2026-08-02T00:00:00.000Z",
              target: {
                articleId: ARTICLE_107_ID,
                lawName: "建築基準法",
                lawShortName: "建基法",
                articleNumber: "百七",
                caption: "（特殊建築物の内装）",
              },
            }],
          },
        }),
      }),
    );
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    const details = page.locator(
      `[data-confirmed-relations-for="${TEST_ARTICLE_ID}"]`,
    );
    await expect(details).toBeVisible();
    await expect(details).not.toHaveAttribute("open", "");
    await expect(details.getByText("確認済みの関連 1件")).toBeVisible();
    await details.locator("summary").click();
    await expect(details).toContainText("定義");
    await expect(details).toContainText("運営確認済み");
    await expect(details).toContainText("用語定義をあわせて確認するため");
    const link = details.locator("a[data-confirmed-relation-target]");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("関連API失敗時も全文を表示して関連だけ再試行できる", async ({ page }) => {
    await page.route(
      "**/api/law-revisions/*/confirmed-relations",
      (route) => route.fulfill({ status: 500, body: "error" }),
    );
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await expect(
      page.getByText("確認済みの関連を取得できませんでした"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "関連だけ再試行" })).toBeVisible();
  });
});
