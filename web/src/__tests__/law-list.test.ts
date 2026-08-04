import { describe, expect, it } from "vitest";
import {
  chooseActiveLawId,
  isRepealedLaw,
  lawSelectLabel,
  type LawListItem,
} from "@/lib/law-book/law-list";

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
    repealStatus: "None",
    repealDate: null,
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
    repealStatus: null,
    repealDate: null,
  },
];

const repealedLaw: LawListItem = {
  ...laws[0],
  id: "law-repealed",
  printedTitle: "廃止された法",
  displayOrder: 3,
  printedPage: 999,
  repealStatus: "Repealed",
  repealDate: "2026-01-01",
};

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

  it("廃止法令には（廃止）ラベルを付ける", () => {
    expect(lawSelectLabel(repealedLaw)).toBe("3. 廃止された法 — p.999 （廃止）");
  });
});

describe("isRepealedLaw", () => {
  it("repealStatus が None または null なら廃止ではない", () => {
    expect(isRepealedLaw(laws[0])).toBe(false);
    expect(isRepealedLaw(laws[1])).toBe(false);
  });

  it("repealStatus が None 以外なら廃止", () => {
    expect(isRepealedLaw(repealedLaw)).toBe(true);
  });
});
