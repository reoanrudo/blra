"use client";

import { useState } from "react";
import type { LawChangeNotice } from "@/lib/article/full-law-document";

/**
 * 変更通知バナー（設計書 §13.2）。
 *
 * 直近の更新で変更があった法令のリーダー画面上部に表示する。
 * 変更された条番号リストを提示し、詳細は e-Gov 公式ページへ誘導する。
 *
 * バナーは読み取り専用・折りたたみ可能。条番号クリックで該当条文へスクロールする。
 */
export interface LawChangeNoticeBannerProps {
  /** 変更通知データ。null の場合は何も描画しない。 */
  notice: LawChangeNotice | null;
  /** e-Gov 法令 ID（リンク生成に使用）。 */
  egovLawId: string;
}

export default function LawChangeNoticeBanner({
  notice,
  egovLawId,
}: LawChangeNoticeBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (!notice || notice.changedArticleNumbers.length === 0) return null;

  const egovUrl = `https://laws.e-gov.go.jp/law/${encodeURIComponent(egovLawId)}`;
  const articleList = notice.changedArticleNumbers.join("、");

  return (
    <section
      role="status"
      aria-label="法令の変更通知"
      className="mb-4 rounded border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950"
      data-law-change-notice
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">
            この法令は最近更新されました（{notice.changeCount}件の変更）
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-xs text-sky-700 underline hover:text-sky-900"
            aria-expanded={expanded}
          >
            {expanded ? "折りたたむ" : "変更箇所を表示"}
          </button>
        </div>
        <a
          href={egovUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-bold text-[#9d1f58] hover:underline"
        >
          e-Govで詳細を確認
        </a>
      </div>
      {expanded && (
        <div className="mt-2 border-t border-sky-200 pt-2">
          <p className="text-xs text-sky-800">変更された条:</p>
          <p className="mt-0.5 text-sm">{articleList}</p>
          <p className="mt-2 text-xs text-sky-600">
            詳細な変更内容は e-Gov 法令検索の公式ページでご確認ください。
          </p>
        </div>
      )}
    </section>
  );
}
