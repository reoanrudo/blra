import Link from "next/link";
import {
  buildArticleHref,
  type ApplicabilityContextValue,
  type ApplicabilityParseResult,
} from "@/lib/applicability/applicability-context";
import type { ApplicableArticleResult } from "@/lib/applicability/resolve-applicable-article";

type UnavailableResult = Exclude<
  ApplicableArticleResult,
  { kind: "resolved" } | { kind: "not_found" }
>;

export default function ApplicabilityStatePanel({
  result,
  articleId,
  todayContext,
}: {
  result:
    | UnavailableResult
    | Extract<ApplicabilityParseResult, { kind: "invalid" }>;
  articleId: string;
  todayContext: ApplicabilityContextValue;
}) {
  let title: string;
  let impact: string;
  let action: string;

  switch (result.kind) {
    case "coverage_out_of_range":
      title = "指定日は収録範囲外です";
      impact = result.coverageStart
        ? `この法令の収録範囲は ${result.coverageStart} 以降です。最寄りの条文版は表示していません。`
        : "この法令には表示可能な条文版がありません。";
      action = "基準日を収録範囲内へ変更してください。";
      break;
    case "ambiguous":
      title = "適用する条文版を一意に決定できません";
      impact = `同じ日付に ${result.revisionIds.length} 件の条文版が重複しているため、本文を表示していません。`;
      action = "データ管理者が版の有効期間を確認する必要があります。";
      break;
    case "article_not_effective":
      title = "指定日にこの条文は存在しません";
      impact = "法令の版は見つかりましたが、同じ条文識別子がその版にありません。";
      action = "別の基準日を指定するか、目次から当時の条文を探してください。";
      break;
    case "invalid":
      title = "適用時点の指定が正しくありません";
      impact = `URLの適用時点を解釈できません（${result.reason}）。本文を表示していません。`;
      action = "本日の条文へ戻るか、正しい日付を指定してください。";
      break;
  }

  return (
    <div className="mx-auto max-w-2xl border border-amber-400 bg-amber-50 p-5 text-neutral-900 shadow-sm">
      <p className="text-xs font-bold text-amber-900">適用時点の確認が必要です</p>
      <h1 className="mt-2 text-lg font-bold">{title}</h1>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="font-bold">本文への影響</dt>
          <dd className="mt-1 text-neutral-700">{impact}</dd>
        </div>
        <div>
          <dt className="font-bold">次の操作</dt>
          <dd className="mt-1 text-neutral-700">{action}</dd>
        </div>
      </dl>
      <Link
        href={buildArticleHref(articleId, todayContext)}
        className="mt-5 inline-flex border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-700"
      >
        本日の条文を開く
      </Link>
    </div>
  );
}
