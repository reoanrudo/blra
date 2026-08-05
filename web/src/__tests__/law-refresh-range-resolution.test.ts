import { describe, expect, it } from "vitest";
import type { ParsedLawNode } from "@/lib/law-refresh/parse-law-xml";
import { resolveVerifiedRanges } from "@/lib/law-refresh/range-resolution";

/**
 * range-resolution の単体テスト。
 *
 * ParsedLawNode は実パーサーの不変条件を模倣した軽量ビルダーで組み立てる。
 * 本則直下の article は articleNumber/articleNumberNormalized を持ち、
 * parser 側で附則には「附則N_」前置が付くため本則と番号衝突しない前提。
 */

type ArticleLevel = ParsedLawNode["level"];

interface ArticleSeed {
  number: string;
  /** 正規化済み番号。省略時は number と同じ。 */
  normalized?: string;
  /** durableNodeKey。既定は `main/article:${number}`。 */
  durableKey?: string;
  parentSourceIndex?: number | null;
}

function articleNode(seed: ArticleSeed, index: number): ParsedLawNode {
  const level: ArticleLevel = "article";
  return {
    sourceIndex: index,
    parentSourceIndex: seed.parentSourceIndex ?? null,
    level,
    legacyStableNodeKey: `legacy/main/article:${seed.number}@${index + 1}`,
    durableNodeKey: seed.durableKey ?? `main/article:${seed.number}`,
    contentChecksum: `content-${seed.number}`,
    bodyChecksum: `body-${seed.number}`,
    articleNumber: seed.number,
    articleNumberNormalized: seed.normalized ?? seed.number,
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    title: `第${seed.number}条`,
    caption: null,
    text: null,
    sortOrder: index + 1,
    systemTags: null,
    tableCellMeta: null,
  };
}

describe("resolveVerifiedRanges", () => {
  it("検証済み民法範囲が候補Revisionにない場合はblockedにする", () => {
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-206",
          rangeType: "article",
          officialCitationStart: "第206条",
          officialCitationEnd: "第206条",
        },
      ],
      [articleNode({ number: "205" }, 0)],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-206",
        status: "blocked",
        errorCode: "VERIFIED_RANGE_NOT_FOUND",
      }),
    ]);
  });

  it("entire_document は root 全体として resolved になる", () => {
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-entire",
          rangeType: "entire_document",
          officialCitationStart: null,
          officialCitationEnd: null,
        },
      ],
      [articleNode({ number: "1" }, 0)],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-entire",
        status: "resolved",
        errorCode: null,
      }),
    ]);
  });

  it("開始・終了がそれぞれ1件だけ一致する article 範囲は resolved になる", () => {
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-10-12",
          rangeType: "article",
          officialCitationStart: "第十条",
          officialCitationEnd: "第十二条",
        },
      ],
      [
        articleNode({ number: "9" }, 0),
        articleNode({ number: "10" }, 1),
        articleNode({ number: "11" }, 2),
        articleNode({ number: "12" }, 3),
      ],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-10-12",
        status: "resolved",
        startDurableNodeKey: "main/article:10",
        endDurableNodeKey: "main/article:12",
        errorCode: null,
      }),
    ]);
  });

  it("end が省略された範囲は start と同一番号で resolved になる", () => {
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-single",
          rangeType: "article",
          officialCitationStart: "第206条",
          officialCitationEnd: null,
        },
      ],
      [articleNode({ number: "206" }, 0)],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-single",
        status: "resolved",
        startDurableNodeKey: "main/article:206",
        endDurableNodeKey: "main/article:206",
      }),
    ]);
  });

  it("「第213条の2」のような分岐番号も正規化して一致する", () => {
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-branch",
          rangeType: "article",
          officialCitationStart: "第213条の2",
          officialCitationEnd: "第213条の2",
        },
      ],
      [
        articleNode({ number: "213の2", normalized: "213の2" }, 0),
        articleNode({ number: "213" }, 1),
      ],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-branch",
        status: "resolved",
        startDurableNodeKey: "main/article:213の2",
        endDurableNodeKey: "main/article:213の2",
      }),
    ]);
  });

  it("同一番号の article が複数ある場合は ambiguous で blocked になる", () => {
    // 実パーサーでは附則プレフィックスで本則と区別されるが、検証器は入力の
    // articleNumberNormalized を鵜呑みにするため、意図的に重複を作ると ambiguous になる。
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-dup",
          rangeType: "article",
          officialCitationStart: "第5条",
          officialCitationEnd: "第5条",
        },
      ],
      [
        articleNode({ number: "5", durableKey: "main/article:5" }, 0),
        articleNode({
          number: "5",
          durableKey: "supplementary/article:5",
        }, 1),
      ],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-dup",
        status: "blocked",
        errorCode: "VERIFIED_RANGE_AMBIGUOUS",
      }),
    ]);
  });

  it("rangeType が article で citation が両方とも無い場合は blocked になる", () => {
    const result = resolveVerifiedRanges(
      [
        {
          id: "range-empty",
          rangeType: "article",
          officialCitationStart: null,
          officialCitationEnd: null,
        },
      ],
      [articleNode({ number: "1" }, 0)],
    );
    expect(result).toEqual([
      expect.objectContaining({
        rangeId: "range-empty",
        status: "blocked",
        errorCode: "VERIFIED_RANGE_NOT_FOUND",
      }),
    ]);
  });

  it("範囲配列が空の場合は結果も空になる", () => {
    expect(resolveVerifiedRanges([], [articleNode({ number: "1" }, 0)])).toEqual(
      [],
    );
  });
});
