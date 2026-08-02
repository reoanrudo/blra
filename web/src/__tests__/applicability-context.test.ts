import { describe, expect, it } from "vitest";
import {
  APPLICABILITY_ANCHOR_LABELS,
  APPLICABILITY_ANCHORS,
  buildArticleHref,
  buildArticleHrefFromSearchParams,
  formatRevisionPeriod,
  parseApplicabilityContext,
  todayInJapan,
} from "@/lib/applicability/applicability-context";

describe("parseApplicabilityContext", () => {
  it("省略時は日本時間のTODAYへ正規化を要求する", () => {
    expect(parseApplicabilityContext({}, "2026-07-31")).toEqual({
      kind: "redirect",
      context: {
        anchor: "TODAY",
        asOf: "2026-07-31",
        projectId: null,
      },
    });
  });

  it("明示されたCUSTOMとプロジェクトを保持する", () => {
    expect(
      parseApplicabilityContext(
        {
          anchor: "CUSTOM",
          asOf: "2026-04-01",
          project: "project-1",
        },
        "2026-07-31",
      ),
    ).toEqual({
      kind: "valid",
      context: {
        anchor: "CUSTOM",
        asOf: "2026-04-01",
        projectId: "project-1",
      },
    });
  });

  it("存在しない日付を拒否する", () => {
    expect(
      parseApplicabilityContext(
        { anchor: "CUSTOM", asOf: "2026-02-30" },
        "2026-07-31",
      ),
    ).toEqual({ kind: "invalid", reason: "INVALID_AS_OF" });
  });

  it("未知のアンカーを拒否する", () => {
    expect(
      parseApplicabilityContext(
        { anchor: "UNKNOWN", asOf: "2026-07-31" },
        "2026-07-31",
      ),
    ).toEqual({ kind: "invalid", reason: "INVALID_ANCHOR" });
  });

  it("TODAYの過去日指定を当日へ正規化する", () => {
    expect(
      parseApplicabilityContext(
        { anchor: "TODAY", asOf: "2025-01-01" },
        "2026-07-31",
      ),
    ).toEqual({
      kind: "redirect",
      context: {
        anchor: "TODAY",
        asOf: "2026-07-31",
        projectId: null,
      },
    });
  });

  it("TODAY以外の日付省略を拒否する", () => {
    expect(
      parseApplicabilityContext(
        { anchor: "CONSTRUCTION_START" },
        "2026-07-31",
      ),
    ).toEqual({ kind: "invalid", reason: "MISSING_AS_OF" });
  });

  it("5種類のアンカーを受理する", () => {
    expect(APPLICABILITY_ANCHORS).toEqual([
      "TODAY",
      "CONFIRMATION_APPLICATION",
      "CONSTRUCTION_START",
      "EXISTING_BUILDING_ORIGIN",
      "CUSTOM",
    ]);

    for (const anchor of APPLICABILITY_ANCHORS) {
      expect(
        parseApplicabilityContext(
          { anchor, asOf: "2026-07-31" },
          "2026-07-31",
        ).kind,
      ).toBe("valid");
    }
  });
});

describe("todayInJapan", () => {
  it("UTCでは前日でも日本時間の日付を返す", () => {
    expect(todayInJapan(new Date("2026-07-30T15:30:00.000Z"))).toBe(
      "2026-07-31",
    );
  });
});

describe("buildArticleHref", () => {
  it("適用文脈を固定順で条文URLへ明示する", () => {
    expect(
      buildArticleHref("article-1", {
        anchor: "CONSTRUCTION_START",
        asOf: "2026-04-01",
        projectId: "project-1",
      }),
    ).toBe(
      "/articles/article-1?anchor=CONSTRUCTION_START&asOf=2026-04-01&project=project-1",
    );
  });

  it("プロジェクト未選択時はprojectを出力しない", () => {
    expect(
      buildArticleHref("article / 1", {
        anchor: "CUSTOM",
        asOf: "2026-04-01",
        projectId: null,
      }),
    ).toBe("/articles/article%20%2F%201?anchor=CUSTOM&asOf=2026-04-01");
  });

  it("現在の検索パラメータから適用文脈を引き継ぐ", () => {
    expect(
      buildArticleHrefFromSearchParams(
        "article-2",
        new URLSearchParams(
          "anchor=CONFIRMATION_APPLICATION&asOf=2026-03-15&project=project-1",
        ),
        "2026-07-31",
      ),
    ).toBe(
      "/articles/article-2?anchor=CONFIRMATION_APPLICATION&asOf=2026-03-15&project=project-1",
    );
  });

  it("現在の検索パラメータが不正なら本日を明示する", () => {
    expect(
      buildArticleHrefFromSearchParams(
        "article-2",
        new URLSearchParams("anchor=UNKNOWN&asOf=broken"),
        "2026-07-31",
      ),
    ).toBe("/articles/article-2?anchor=TODAY&asOf=2026-07-31");
  });
});

describe("適用時点の表示", () => {
  it("5アンカーを日本語の意味付きで表示する", () => {
    expect(APPLICABILITY_ANCHOR_LABELS).toEqual({
      TODAY: "本日",
      CONFIRMATION_APPLICATION: "確認申請日",
      CONSTRUCTION_START: "着工日",
      EXISTING_BUILDING_ORIGIN: "既存建築物の基準日",
      CUSTOM: "任意指定日",
    });
  });

  it("終了日なしの版を現行と明示する", () => {
    expect(formatRevisionPeriod("2026-01-01", null)).toBe(
      "2026-01-01 から現行",
    );
  });

  it("終了日が半開区間であることを表示する", () => {
    expect(formatRevisionPeriod("2025-01-01", "2026-04-01")).toBe(
      "2025-01-01 以上、2026-04-01 未満",
    );
  });
});
