// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findPrintableArticleId,
  printCurrentArticle,
} from "@/lib/article/current-article-print";

describe("current article print", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-full-law-ready="true">
        <section data-print-article-id="article-1"><span id="cell">表セル</span></section>
        <section data-print-article-id="article-2">第二条</section>
      </div>`;
    vi.stubGlobal("print", vi.fn());
  });

  it("子要素から条ルートのIDを取得する", () => {
    expect(findPrintableArticleId(document.getElementById("cell")!)).toBe(
      "article-1",
    );
  });

  it("印刷後に対象属性を復元する", () => {
    expect(printCurrentArticle("article-1")).toBe(true);
    expect(window.print).toHaveBeenCalledOnce();
    expect(
      document
        .querySelector("[data-full-law-ready]")
        ?.hasAttribute("data-print-current-article"),
    ).toBe(false);
    expect(
      document
        .querySelector("[data-print-article-id='article-1']")
        ?.hasAttribute("data-print-current"),
    ).toBe(false);
  });
});
