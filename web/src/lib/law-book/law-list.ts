export interface LawListItem {
  id: string;
  name: string;
  shortName: string | null;
  printedTitle: string;
  displayOrder: number;
  inclusionMode: "full" | "excerpt";
  firstArticleId: string;
  /**
   * 廃止状態（LawSyncState.repealStatus）。未設定時は "None" 扱い。
   * 計画書 Task 14 Step 5: 一覧で廃止法令へ「廃止」ラベルを付ける。
   */
  repealStatus: string | null;
  /** 廃止日（LawSyncState.repealDate, YYYY-MM-DD）。 */
  repealDate: string | null;
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

/** 廃止済み法令かどうか。 */
export function isRepealedLaw(law: LawListItem): boolean {
  return Boolean(law.repealStatus && law.repealStatus !== "None");
}

export function lawSelectLabel(law: LawListItem): string {
  const suffix = isRepealedLaw(law) ? " （廃止）" : "";
  return `${law.displayOrder}. ${law.printedTitle}${suffix}`;
}

/**
 * 120件の (lawId, currentRevisionId) を掲載順で SHA-256 化した corpusVersion を計算する。
 * 法令更新（現行Revisionの切替）時に値が変わり、クライアントのcacheを失効させる。
 *
 * Web Crypto API の subtle.digest を使う。Node 18+ とブラウザの両方で利用可能。
 * 計算は純粋関数なので server/client どちらでも同じ入力で同じ結果になる。
 */
export async function computeCorpusVersion(
  laws: ReadonlyArray<{ id: string; currentRevisionId: string | null }>,
): Promise<string> {
  const text = laws
    .map((law) => `${law.id}:${law.currentRevisionId ?? ""}`)
    .join("\n");
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
