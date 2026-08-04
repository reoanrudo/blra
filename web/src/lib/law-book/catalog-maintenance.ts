/**
 * 固定書籍版（catalog）保守コマンドと現行 Revision（Law.currentRevisionId）の
 * 整合性を保つための判定ヘルパー。
 *
 * 不変要件 (Invariant):
 *   catalog seed/ingest/scope は非収録 law を除き `Law.currentRevisionId` を変更しない。
 *   現行 Revision は刷新プロセス（Tasks 4-8）だけが管理し、
 *   固定書籍版の再実行で旧版 baseline へ巻き戻さない。
 */

/**
 * catalog ingest が Article を投入すべき Revision を返す。
 *
 * catalog は常に Entry.lawRevisionId（固定書籍版の baseline Revision）へ
 * Article を投入する。Law.currentRevisionId は刷新プロセスが別途管理するため、
 * ingest の対象にはしない。Entry の Revision が未設定（seed 前）の呼び出しは
 * 呼び出し側で弾く前提であり、ここでは受領した Revision をそのまま返す。
 */
export function catalogRevisionForIngest(entryRevisionId: string): string {
  return entryRevisionId;
}

/**
 * 書籍 seed が `Law.currentRevisionId` を初期化してよいか判定する。
 *
 * `currentRevisionId` が null（初回導入時）だけ true を返す。
 * 既に現行 Revision が設定されている場合は書籍 baseline で上書きせず、
 * 刷新プロセスの管理下に置いたままにする。
 */
export function shouldInitializeCurrentRevision(
  currentRevisionId: string | null,
): boolean {
  return currentRevisionId === null;
}
