import { TEST_ARTICLE_ID, expect, test } from "./fixtures";

type FullLawDocumentResponse = {
  nodes: Array<{
    id: string;
    level: string;
  }>;
};

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
    const documentResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        /^\/api\/law-revisions\/[^/]+\/document$/.test(url.pathname)
      );
    });

    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    const documentResponse = await documentResponsePromise;
    expect(documentResponse.ok()).toBe(true);
    const document = (await documentResponse.json()) as FullLawDocumentResponse;
    const articleIds = document.nodes
      .filter((node) => node.level === "article")
      .map((node) => node.id);
    const documentRootIds = document.nodes
      .filter((node) =>
        ["article", "suppl_provision", "appdx_table"].includes(node.level),
      )
      .map((node) => node.id);
    expect(articleIds.length).toBeGreaterThan(1);
    expect(documentRootIds).toEqual(expect.arrayContaining(articleIds));

    const displayedArticleIds = async () =>
      page.locator("[data-scroll-article-id]").evaluateAll((elements) =>
        elements.map((element) => {
          const id = element.getAttribute("data-scroll-article-id");
          if (!id) throw new Error("条文アンカーにIDがありません");
          return id;
        }),
      );

    const expectDisplayedDocument = async () => {
      const displayedIds = await displayedArticleIds();
      expect(
        displayedIds.filter((id) => articleIds.includes(id)),
      ).toEqual(articleIds);
      expect(displayedIds).toEqual(documentRootIds);
    };

    await expectDisplayedDocument();

    const lastArticleId = articleIds.at(-1);
    const lastDocumentRootId = documentRootIds.at(-1);
    expect(lastArticleId).toBeDefined();
    expect(lastDocumentRootId).toBeDefined();

    await page.emulateMedia({ media: "print" });

    await expect(page.locator('nav[data-print-hidden="true"]')).toBeHidden();
    await expect(page.locator(".law-running-header__actions")).toBeHidden();
    await expect(page.locator(".law-running-header__law")).toBeVisible();
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await expectDisplayedDocument();
    await expect(
      page
        .locator(`[data-scroll-article-id="${lastArticleId}"]`)
        .locator(".."),
    ).toBeVisible();
    await expect(
      page
        .locator(`[data-scroll-article-id="${lastDocumentRootId}"]`)
        .locator(".."),
    ).toBeVisible();

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
