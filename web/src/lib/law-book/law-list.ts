export interface LawListItem {
  id: string;
  name: string;
  shortName: string | null;
  printedTitle: string;
  displayOrder: number;
  inclusionMode: "full" | "excerpt";
  printedPage: number;
  firstArticleId: string;
  // isCurrent は廃止（設計書§4.1）: クライアント側で currentLawId を別途管理する。
}

/**
 * アクティブな法令IDを決定する。
 * 設計書§4.1: 現在法令の判定を理由に一覧全体を再取得しない。
 * currentLawId が指定されていればそれを優先し、なければ最初の法令。
 */
export function chooseActiveLawId(
  laws: readonly LawListItem[],
  currentLawId: string | null,
): string | null {
  if (currentLawId && laws.some((law) => law.id === currentLawId)) {
    return currentLawId;
  }
  return laws[0]?.id ?? null;
}

export function lawSelectLabel(law: LawListItem): string {
  return `${law.displayOrder}. ${law.printedTitle} — p.${law.printedPage}`;
}
