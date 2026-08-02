"use client";

import { useState, useEffect } from "react";
import type { PreviewData } from "@/types/preview";

export function useArticlePreview(articleId: string | null): {
  data: PreviewData | null;
  loading: boolean;
  error: boolean;
} {
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

    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetch(`/api/articles/preview?id=${encodeURIComponent(articleId)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && !json.error) setData(json as PreviewData);
        else setData(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData(null);
        setError(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [articleId]);

  return { data, loading, error };
}
