"use client";

import { useArticlePreview } from "@/hooks/useArticlePreview";
import type { PreviewData } from "@/types/preview";

export function ArticlePreview({ articleId }: { articleId: string }) {
  const { data, loading } = useArticlePreview(articleId);

  if (loading) {
    return <p className="text-xs text-neutral-500 animate-pulse">読み込み中…</p>;
  }
  if (!data) {
    return <p className="text-xs text-neutral-500">プレビューを取得できません</p>;
  }

  return (
    <div className="text-xs space-y-1">
      <p className="text-neutral-500">{data.lawShortName ?? data.lawName}</p>
      <p className="font-bold text-neutral-950">
        {data.articleNumber ? `第${data.articleNumber}条` : data.articleNumberNormalized}
        {data.caption && (
          <span className="font-normal text-neutral-700 ml-1">{data.caption}</span>
        )}
      </p>
      {data.textExcerpt && (
        <p className="text-neutral-700 leading-relaxed line-clamp-6">
          {data.textExcerpt}
          {data.textExcerpt.length >= 300 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

export default function LinkPreview({ articleId }: { articleId: string | null }) {
  if (!articleId) return null;
  return (
    <div className="mb-3 border border-neutral-300 bg-white p-3">
      <ArticlePreview articleId={articleId} />
    </div>
  );
}
