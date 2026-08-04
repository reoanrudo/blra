import { expect, test } from "./fixtures";

/**
 * Task 13: 旧URLの現行条文転送・履歴表示の E2E。
 *
 * これらのテストは、route resolution の結果として表示されるUI要素（履歴注意書き
 * バナー、編集操作の非表示）を検証する。旧 Revision データの作成自体は
 * integration テスト（src/__tests__/integration/current-law-old-url.test.ts）で
 * カバーしているため、E2E は URL 直叩きで表示される UI に絞る。
 *
 * テスト用 Article ID は環境変数で差し替え可能。既定値は現行法令の条を使うが、
 * removed/historical 解決を検証するには E2E_REMOVED_ARTICLE_ID /
 * E2E_HISTORICAL_ARTICLE_ID に旧 Revision 所属 Article を指定する。
 */

const REMOVED_ARTICLE_ID =
  process.env.E2E_REMOVED_ARTICLE_ID ?? "art_removed_test";

const HISTORICAL_ARTICLE_ID =
  process.env.E2E_HISTORICAL_ARTICLE_ID ?? "art_historical_test";

test.describe("旧URLの現行条文転送・履歴表示", () => {
  test("削除条文URLは履歴表示で削除済みバナーを出す", async ({ page }) => {
    // このテストは E2E_REMOVED_ARTICLE_ID が設定されている前提。
    // 未設定の場合、Article が存在せず 404 になるため skip 扱いとする。
    test.skip(
      !process.env.E2E_REMOVED_ARTICLE_ID,
      "E2E_REMOVED_ARTICLE_ID 未設定のため skip",
    );

    await page.goto(`/articles/${REMOVED_ARTICLE_ID}`);
    await expect(
      page.locator('[data-historical-notice="removed"]'),
    ).toBeVisible();
    // 編集・ハイライト作成操作は出さない
    expect(await page.getByRole("button", { name: "ハイライト" }).count()).toBe(0);
  });

  test("対応未確認条文URLは履歴表示で対応未確認バナーを出す", async ({ page }) => {
    test.skip(
      !process.env.E2E_HISTORICAL_ARTICLE_ID,
      "E2E_HISTORICAL_ARTICLE_ID 未設定のため skip",
    );

    await page.goto(`/articles/${HISTORICAL_ARTICLE_ID}`);
    await expect(
      page.locator('[data-historical-notice="historical"]'),
    ).toBeVisible();
  });
});
