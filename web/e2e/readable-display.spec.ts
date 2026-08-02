import { TEST_ARTICLE_ID, expect, test } from "./fixtures";

test.describe("全文法令の読みやすい表示", () => {
  test("算用数字の目次と本文を初回から表示する", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const toc = page.getByRole("tree");
    await expect(toc).toContainText("第1条");
    await expect(toc).toContainText("第1章");
    await expect(page.locator(".law-node").first()).toBeVisible();
  });

  test("本文へ原文座標を保持する", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    expect(await page.locator("[data-source-start]").count()).toBeGreaterThan(0);
    expect(
      await page.locator(".law-node[data-original-text]").count(),
    ).toBeGreaterThan(0);
  });

  test("表示変換した文字をコピーしても公式原文を得る", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    const token = page.locator('[data-source-kind="number"]').first();
    await expect(token).toBeVisible();
    await token.evaluate((element) => {
      const textNode = element.firstChild;
      if (!textNode) throw new Error("copy target has no text node");
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    const sourceStart = Number(await token.getAttribute("data-source-start"));
    const sourceEnd = Number(await token.getAttribute("data-source-end"));
    const lawNode = token.locator("xpath=ancestor::*[@data-original-text][1]");
    const originalText = await lawNode.getAttribute("data-original-text");
    expect(originalText).toBeTruthy();
    const expectedOriginal = originalText!.slice(sourceStart, sourceEnd);
    expect(await token.textContent()).not.toBe(expectedOriginal);

    await page.keyboard.press("Meta+c");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(expectedOriginal);
  });

  test("確定済み本文参照は新しいタブ用リンクになる", async ({ page }) => {
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const links = page.locator("a[data-link-target]");
    expect(await links.count()).toBeGreaterThan(0);
    await expect(links.first()).toHaveAttribute("target", "_blank");
    await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
  });
});
