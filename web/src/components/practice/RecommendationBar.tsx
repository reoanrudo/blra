"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { RecommendationsResponse, RecommendationItem } from "@/types/recommendations";
import { useApplicability } from "@/contexts/ApplicabilityContext";

interface RecommendationBarProps {
  articleId: string | null;
}

const REGULATION_TYPE_LABELS: Record<string, string> = {
  individual: "個別",
  collective: "集団",
  procedure: "手続",
  penalty: "罰則",
  supplementary: "附則",
};

export default function RecommendationBar({ articleId }: RecommendationBarProps) {
  const applicability = useApplicability();
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!articleId) return;

    setLoading(true);
    setError(false);
    setData(null);

    fetch(`/api/recommendations?articleId=${encodeURIComponent(articleId)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json() as Promise<RecommendationsResponse>;
      })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [articleId]);

  if (!articleId) return null;

  // Loading: show skeleton
  if (loading) {
    return (
      <section className="law-note-section">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-neutral-800">
          <span className="law-note-badge">推</span>
          <span>関連条文レコメンド</span>
        </h4>
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-3/4 rounded bg-neutral-300" />
          <div className="h-3 w-1/2 rounded bg-neutral-300" />
          <div className="h-3 w-2/3 rounded bg-neutral-300" />
        </div>
      </section>
    );
  }

  // Error or empty: show nothing
  if (error || !data || data.data.length === 0) return null;

  return (
    <section className="law-note-section">
      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-neutral-800">
        <span className="law-note-badge">推</span>
        <span>関連条文レコメンド</span>
      </h4>

      {data.isColdStart && (
        <p className="mb-2 text-[10px] leading-relaxed text-amber-700">
          利用データが蓄積されるまでプリセット関連条文を表示しています
        </p>
      )}

      <p className="mb-2 text-[10px] leading-relaxed text-neutral-600">
        この条文を確認した人は次にこれらの条文も確認しています
      </p>

      <ul className="space-y-2">
        {data.data.map((item: RecommendationItem) => (
          <li key={item.articleId}>
            <Link
              href={applicability.articleHref(item.articleId)}
              target="_blank"
              rel="noopener noreferrer"
              className="law-note-link block"
            >
              <div className="flex items-start gap-1">
                <span className="text-[11px] font-bold leading-5 text-[#9d1f58]">
                  {item.articleNumberNormalized
                    ? `第${item.articleNumberNormalized}条`
                    : "条文"}
                </span>
                {item.regulationType && REGULATION_TYPE_LABELS[item.regulationType] && (
                  <span className="border border-[#9d1f58] px-1 text-[9px] leading-4 text-[#9d1f58]">
                    {REGULATION_TYPE_LABELS[item.regulationType]}
                  </span>
                )}
              </div>
              {item.caption && (
                <p className="text-[10px] leading-relaxed text-neutral-600 line-clamp-1">
                  {item.caption}
                </p>
              )}
              {item.lawShortName && (
                <p className="text-[9px] leading-relaxed text-neutral-400">
                  {item.lawShortName}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
