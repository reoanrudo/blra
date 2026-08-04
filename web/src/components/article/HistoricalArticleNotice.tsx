/**
 * 旧 Revision 条文を表示する際の注意書きバナー（Task 13）。
 *
 * removed と historical(unmapped/ambiguous) の2状態を扱う:
 * - removed: 「この条文は改正で削除されました」
 * - historical: 「この条文は現行版と対応が未確認です（旧版のまま表示）」
 *
 * いずれの場合も、現行版の施行日・公式版番号を併記し、読者が古い情報であることを
 * 認識できるようにする。編集・ハイライト作成操作は出さない読み取り専用表示の前提。
 */

export type HistoricalArticleNoticeKind = "removed" | "historical";

export interface HistoricalArticleNoticeProps {
  kind: HistoricalArticleNoticeKind;
  /** historical の理由（ambiguous のみ意味を持つ。removed では無視）。 */
  reason?: "ambiguous" | "unmapped";
  /** 法令名。 */
  lawName: string;
  /** 旧 Revision の公式版キー。 */
  officialVersionKey: string;
  /** 旧 Revision の施行日（ISO 文字列、未設定時は null）。 */
  effectiveFrom: string | null;
}

export default function HistoricalArticleNotice({
  kind,
  reason,
  lawName,
  officialVersionKey,
  effectiveFrom,
}: HistoricalArticleNoticeProps) {
  const isRemoved = kind === "removed";
  const title = isRemoved
    ? "この条文は改正で削除されました"
    : "この条文は現行版との対応が未確認です";
  const description = isRemoved
    ? "過去の版本に基づき旧本文を読み取り専用で表示しています。現行法令ではご注意ください。"
    : reason === "ambiguous"
      ? "改正対応の確認中のため、旧版本の本文をそのまま表示しています。現行条文への置き換えは未確定です。"
      : "改正対応の mapping が未作成のため、旧版本の本文をそのまま表示しています。現行条文への置き換えは未確認です。";

  const containerClass = isRemoved
    ? "border-rose-300 bg-rose-50 text-rose-950"
    : "border-amber-300 bg-amber-50 text-amber-950";

  return (
    <section
      role="status"
      aria-label={title}
      className={`mb-4 rounded border px-4 py-3 text-sm ${containerClass}`}
      data-historical-notice={kind}
    >
      <p className="font-bold">{title}</p>
      <p className="mt-1">{description}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs opacity-80">
        <dt className="font-medium">法令</dt>
        <dd>{lawName}</dd>
        <dt className="font-medium">版本</dt>
        <dd>{officialVersionKey}</dd>
        <dt className="font-medium">施行日</dt>
        <dd>{effectiveFrom ? formatDate(effectiveFrom) : "未設定"}</dd>
      </dl>
    </section>
  );
}

/** ISO 日付文字列を「YYYY年MM月DD日」へ整形する簡易ヘルパー。 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}年${m}月${d}日`;
}
