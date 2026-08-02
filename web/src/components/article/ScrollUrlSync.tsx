"use client";

import { useEffect, useRef } from "react";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";

/**
 * スクロール追従URL同期（設計書 §3.3）
 *
 * スクロールで現在条文（アクティブArticle）が変わったとき、
 * ページ再読込を起こさず history.replaceState でURLを /articles/<activeId> へ更新する。
 *
 * - ブラウザの戻る/進むは Next.js のルーティングで処理される。
 * - URLの同期は replaceState のみで行い、push しない（履歴を膨らませない）。
 * - 初期マウント時の対象Article（URL由來）と同じ場合は更新しない。
 */
export default function ScrollUrlSync({ initialArticleId }: { initialArticleId: string }) {
  const ctx = useScrollActiveArticle();
  const activeArticleId = ctx?.activeArticleId ?? null;
  const lastPushedRef = useRef<string>(initialArticleId);

  useEffect(() => {
    if (!activeArticleId || activeArticleId === lastPushedRef.current) return;

    // replaceState でURLを更新（ページ再読込なし・履歴にpushしない）
    const newUrl = `/articles/${encodeURIComponent(activeArticleId)}`;
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", newUrl);
      lastPushedRef.current = activeArticleId;
    }
  }, [activeArticleId]);

  return null;
}
