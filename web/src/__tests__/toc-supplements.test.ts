import { describe, expect, it } from "vitest";
import {
  isExpandableTocLevel,
  nodeLabel,
  shouldExpandTocNodeByDefault,
  type TocNode,
} from "@/lib/article/toc-tree";
import { groupSupplementaryProvisions } from "@/lib/article/toc-supplements";

function node(overrides: Partial<TocNode> & Pick<TocNode, "id" | "level" | "sortOrder" | "depth" | "path">): TocNode {
  return {
    parentId: null,
    title: null,
    articleNumber: null,
    caption: null,
    textFirstLine: null,
    paragraphNumber: null,
    ...overrides,
  };
}

describe("附則目次グループ", () => {
  it("複数の附則ルートだけを単一グループへまとめて順序と子階層を保つ", () => {
    const input: TocNode[] = [
      node({ id: "main", level: "chapter", sortOrder: 1, depth: 0, path: [1], title: "第一章" }),
      node({ id: "sup-1", level: "suppl_provision", sortOrder: 2, depth: 0, path: [2], title: "制定時附則" }),
      node({ id: "sup-1-p", parentId: "sup-1", level: "paragraph", sortOrder: 1, depth: 1, path: [2, 1] }),
      node({ id: "sup-2", level: "suppl_provision", sortOrder: 3, depth: 0, path: [3], title: "附則（平成一六年法律第六七号・抄）" }),
      node({ id: "appendix", level: "appdx_table", sortOrder: 4, depth: 0, path: [4], title: "別表" }),
    ];

    const result = groupSupplementaryProvisions(input, "law-1");

    expect(result.map((item) => item.id)).toEqual([
      "main",
      "supplement-group:law-1",
      "sup-1",
      "sup-1-p",
      "sup-2",
      "appendix",
    ]);
    expect(result[1]).toMatchObject({
      level: "supplement_group",
      title: "附則・経過措置（2件）",
      depth: 0,
      path: [2],
    });
    expect(result[2]).toMatchObject({
      parentId: "supplement-group:law-1",
      depth: 1,
      path: [2, 1],
    });
    expect(result[3]).toMatchObject({
      parentId: "sup-1",
      depth: 2,
      path: [2, 1, 1],
    });
    expect(result[4]).toMatchObject({
      parentId: "supplement-group:law-1",
      depth: 1,
      path: [2, 2],
    });
  });

  it("附則がなければ元の配列を変更しない", () => {
    const input = [
      node({ id: "main", level: "chapter", sortOrder: 1, depth: 0, path: [1] }),
    ];

    expect(groupSupplementaryProvisions(input, "law-1")).toEqual(input);
  });

  it("附則の出所名を表示し、合成グループだけ初期状態で閉じる", () => {
    const supplement = node({
      id: "sup-1",
      level: "suppl_provision",
      sortOrder: 2,
      depth: 1,
      path: [2, 1],
      title: "附則（平成一六年法律第六七号・抄）",
    });
    const group = node({
      id: "supplement-group:law-1",
      level: "supplement_group",
      sortOrder: 2,
      depth: 0,
      path: [2],
      title: "附則・経過措置（2件）",
    });

    expect(nodeLabel(supplement)).toBe("附則（平成一六年法律第六七号・抄）");
    expect(nodeLabel(group)).toBe("附則・経過措置（2件）");
    expect(isExpandableTocLevel("supplement_group")).toBe(true);
    expect(shouldExpandTocNodeByDefault(group)).toBe(false);
    expect(shouldExpandTocNodeByDefault(node({
      id: "chapter-1",
      level: "chapter",
      sortOrder: 1,
      depth: 0,
      path: [1],
    }))).toBe(true);
  });
});
