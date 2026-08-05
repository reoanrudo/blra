import { TEST_ARTICLE_ID, expect, test } from "./fixtures";

const SECOND_ARTICLE_ID = "art_325ac0000000201_20260101_000004";

const FORBIDDEN_READER_APIS = [
  "/api/projects/active",
  "/api/glossary",
  "/api/recommendations",
  "/api/notes",
  "/api/user-highlights/batch",
  "/api/topics",
  "/api/articles/chapter-window",
  "/api/articles/chapter-aux",
];

test.describe("Phase 1 全文法令リーダー", () => {
  test("非先頭の条でも条番号を見出しの1回だけ表示する", async ({ page }) => {
    await page.goto(`/articles/${SECOND_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const articleBlock = page
      .locator(`[data-scroll-article-id="${SECOND_ARTICLE_ID}"]`)
      .locator("..");

    await expect(articleBlock.getByText("第2条", { exact: true })).toHaveCount(1);
  });

  test("読者画面を2列UIに限定し不要APIを呼ばない", async ({ page }) => {
    const forbiddenRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (FORBIDDEN_READER_APIS.includes(pathname)) {
        forbiddenRequests.push(pathname);
      }
    });

    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await expect(page.getByRole("combobox", { name: "収録法令" })).toBeVisible();

    expect(await page.getByText("実務", { exact: true }).count()).toBe(0);
    expect(await page.getByText("適用時点", { exact: false }).count()).toBe(0);
    expect(await page.getByText("閲覧履歴", { exact: true }).count()).toBe(0);
    expect(await page.getByText("確認項目", { exact: true }).count()).toBe(0);
    expect(forbiddenRequests).toEqual([]);
  });

  test("e-Govの公式改正情報へ新しいタブで案内する", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const source = page.getByRole("link", {
      name: "e-Govで改正・施行情報を確認",
    });
    await expect(source).toHaveAttribute(
      "href",
      "https://laws.e-gov.go.jp/law/325AC0000000201",
    );
    await expect(source).toHaveAttribute("target", "_blank");
  });

  test("現行版の施行日・確認状態を running header へ表示する", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    // 計画書 Task 14 Step 4: verified なら見出し「e-Gov現行施行版」
    await expect(
      page.getByText("e-Gov現行施行版", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/施行日: 2026-/)).toBeVisible();
    await expect(page.getByText(/最終確認:/)).toBeVisible();

    // 従来の固定収録基準日は表示しない
    await expect(page.getByText(/収録基準日:/)).toHaveCount(0);
  });

  test("検索結果を比較用の新しいタブで開く", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    await page.getByRole("button", { name: "検索", exact: true }).click();
    const search = page.getByPlaceholder("条文を検索...");
    await search.fill("排煙設備");

    const result = page
      .getByRole("complementary")
      .locator('a[href^="/articles/"]');
    await expect(result.first()).toBeVisible();
    const originalUrl = page.url();
    const popupPromise = page.waitForEvent("popup");
    await result.first().click();
    const popup = await popupPromise;

    await popup.waitForLoadState();
    expect(page.url()).toBe(originalUrl);
    expect(popup.url()).toContain("/articles/");
    await popup.close();
  });
});
