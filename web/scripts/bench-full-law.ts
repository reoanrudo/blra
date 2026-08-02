import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const fixtures = [
  {
    law: "建築基準法",
    articleId: "art_325ac0000000201_20260101_000002",
  },
  {
    law: "建築基準法施行令",
    articleId: "art_325co0000000338_20260101_000003",
  },
  {
    law: "建築基準法施行規則",
    articleId: "art_325m50004000040_20260101_000001",
  },
  {
    law: "労働安全衛生規則",
    articleId: "art_347m50002000032_20260101_000002",
  },
] as const;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    for (const fixture of fixtures) {
      const page = await context.newPage();
      let countRequestsAfterReady = false;
      let requestsAfterReady = 0;

      page.on("request", () => {
        if (countRequestsAfterReady) requestsAfterReady += 1;
      });

      const startedAt = Date.now();
      await page.goto(`${baseUrl}/articles/${fixture.articleId}`);
      await page.locator('[data-full-law-ready="true"]').waitFor({
        state: "visible",
        timeout: 60_000,
      });
      await page.getByRole("combobox", { name: "収録法令" }).waitFor({
        state: "visible",
        timeout: 30_000,
      });
      const readyMs = Date.now() - startedAt;

      const beforeMove = await page.evaluate(() => ({
        domElements: document.querySelectorAll("*").length,
        fixedAnchors: document.querySelectorAll('[id^="law-node-"]').length,
        articleRoots: document.querySelectorAll("[data-scroll-article-id]").length,
        documentBytes:
          (
            performance
              .getEntriesByType("resource")
              .filter((entry) => entry.name.includes("/api/law-revisions/"))
              .at(-1) as PerformanceResourceTiming | undefined
          )?.decodedBodySize ?? 0,
      }));

      countRequestsAfterReady = true;
      const move = await page.evaluate(async () => {
        const roots = document.querySelectorAll<HTMLElement>(
          "[data-scroll-article-id]",
        );
        const last = roots.item(roots.length - 1);
        const started = performance.now();
        last?.scrollIntoView({ block: "start" });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return {
          moveMs: performance.now() - started,
          lastArticleId: last?.dataset.scrollArticleId ?? null,
        };
      });

      console.log(
        JSON.stringify({
          law: fixture.law,
          readyMs,
          ...beforeMove,
          ...move,
          requestsAfterReady,
        }),
      );
      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
