"use client";

import { useState, useEffect } from "react";

interface PreviewData {
  articleNumberNormalized: string | null;
  articleNumber: string | null;
  caption: string | null;
  textExcerpt: string | null;
  lawName: string;
  lawShortName: string | null;
}

export default function ArticleInlinePreview({
  articleId,
}: {
  articleId: string | null;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!articleId) {
      setData(null);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    fetch(`/api/articles/preview?id=${encodeURIComponent(articleId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && !json.error) {
          setData(json as PreviewData);
        } else {
          setData(null);
          setError(true);
        }
      })
      .catch(() => {
        setData(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [articleId]);

  if (!articleId) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        確認項目を選択すると条文の概要が表示されます
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        条文のプレビューを取得できませんでした
      </div>
    );
  }

  // Extract first ~200 chars (~3 lines) from textExcerpt
  const summary =
    data.textExcerpt && data.textExcerpt.length > 200
      ? data.textExcerpt.slice(0, 200) + "…"
      : data.textExcerpt;

  return (
    <div className="text-xs space-y-1">
      <p className="text-[10px] text-gray-500">
        {data.lawShortName ?? data.lawName}
      </p>
      <p className="font-bold text-gray-900">
        {data.articleNumber
          ? `第${data.articleNumber}条`
          : data.articleNumberNormalized}
        {data.caption && (
          <span className="font-normal text-gray-600 ml-1">
            {data.caption}
          </span>
        )}
      </p>
      {summary && (
        <p className="text-gray-700 leading-relaxed line-clamp-3">{summary}</p>
      )}
    </div>
  );
}
