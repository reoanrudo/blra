import { describe, expect, it } from "vitest";
import { chooseActiveLawId, lawSelectLabel, type LawListItem } from "@/lib/law-book/law-list";

const laws: LawListItem[] = [
  {
    id: "law-1",
    name: "建築基準法",
    shortName: "建基法",
    printedTitle: "建築基準法",
    displayOrder: 1,
    inclusionMode: "full",
    printedPage: 1,
    firstArticleId: "article-1",
  },
  {
    id: "law-2",
    name: "建築基準法施行令",
    shortName: "建基令",
    printedTitle: "建築基準法施行令（抄）",
    displayOrder: 2,
    inclusionMode: "excerpt",
    printedPage: 165,
    firstArticleId: "article-2",
  },
];

describe("chooseActiveLawId", () => {
  it("currentLawId が一覧に存在すればそれを返す", () => {
    expect(chooseActiveLawId(laws, "law-2")).toBe("law-2");
    expect(chooseActiveLawId(laws, "law-1")).toBe("law-1");
  });

  it("currentLawId が null または一覧にない場合は先頭法令を返す", () => {
    expect(chooseActiveLawId(laws, null)).toBe("law-1");
    expect(chooseActiveLawId(laws, "unknown")).toBe("law-1");
    expect(chooseActiveLawId([], null)).toBeNull();
  });
});

describe("lawSelectLabel", () => {
  it("掲載順・印刷名称・頁を一覧で識別できる", () => {
    expect(lawSelectLabel(laws[1])).toBe("2. 建築基準法施行令（抄） — p.165");
  });
});
