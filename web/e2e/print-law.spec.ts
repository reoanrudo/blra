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
  for (const [label, articleId] of [
    ["施行令第82条", "art_325co0000000338_20260101_000945"],
    ["施行規則本文表", "art_325m50004000040_20260101_000015"],
    ["指定検定機関等省令第16条", "art_411m50004000013_20260101_000143"],
  ] as const) {
    test(`${label} は表を含めて現在の条文だけを印刷する`, async ({ page }) => {
      await page.goto(`/articles/${articleId}`);
      await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

      await page.evaluate((id) => {
        document
          .querySelector("[data-full-law-ready='true']")
          ?.setAttribute("data-print-current-article", "true");
        document
          .querySelector(`[data-print-article-id="${id}"]`)
          ?.setAttribute("data-print-current", "true");
      }, articleId);
      await page.emulateMedia({ media: "print" });

      const target = page.locator(`[data-print-article-id="${articleId}"]`);
      const tables = target.locator(".law-table-wrapper");
      const tableDisplays = await tables.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).display),
      );
      expect(tableDisplays.length).toBeGreaterThan(0);
      expect(tableDisplays).not.toContain("none");

      const headers = target.locator("thead");
      const headerDisplays = await headers.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).display),
      );
      expect(headerDisplays.length).toBeGreaterThan(0);
      expect(
        headerDisplays.every((display) => display === "table-header-group"),
      ).toBe(true);

      const otherArticles = page.locator(
        `[data-print-article-id]:not([data-print-article-id="${articleId}"])`,
      );
      const visibleOtherArticleIds = await otherArticles.evaluateAll((elements) =>
        elements
          .filter((element) => getComputedStyle(element).display !== "none")
          .map((element) => element.getAttribute("data-print-article-id")),
      );
      expect(visibleOtherArticleIds).toEqual([]);
    });
  }
    await page.route("**/api/law-revisions/*/confirmed-relations", async (route) => {
      const revisionId = new URL(route.request().url()).pathname.split("/").at(-2);
      if (!revisionId) throw new Error("法令改正IDを取得できません");

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          revisionId,
          relationsBySource: {
            [TEST_ARTICLE_ID]: [
              {
                id: "print-confirmed-relation",
                relationType: "CITES",
                rationale: "印刷対象外を検証するための確認済み関連です。",
                confirmedAt: "2026-08-09T00:00:00.000Z",
                target: {
                  articleId: "art_print_target",
                  lawName: "印刷テスト法",
                  lawShortName: null,
                  articleNumber: "1",
                  caption: null,
                },
              },
            ],
          },
        }),
      });
    });

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
    const confirmedRelations = page.locator(
      `[data-confirmed-relations-for="${TEST_ARTICLE_ID}"]`,
    );
    const desktopToc = page.locator(
      'aside[data-print-hidden="true"][class*="lg:block"]',
    );
    await expect(confirmedRelations).toBeVisible();
    await expect(desktopToc).toBeVisible();

    const lastArticleId = articleIds.at(-1);
    const lastDocumentRootId = documentRootIds.at(-1);
    expect(lastArticleId).toBeDefined();
    expect(lastDocumentRootId).toBeDefined();

    await page.emulateMedia({ media: "print" });

    await expect(page.locator('nav[data-print-hidden="true"]')).toBeHidden();
    await expect(page.locator(".law-running-header__actions")).toBeHidden();
    await expect(confirmedRelations).toBeHidden();
    await expect(desktopToc).toBeHidden();
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
