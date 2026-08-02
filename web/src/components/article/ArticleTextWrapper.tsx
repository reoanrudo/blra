"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import LinkPreview from "@/components/practice/LinkPreview";
import { getSelectionContext } from "@/lib/highlight/text-selection";

export default function ArticleTextWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onMouseDown(e: MouseEvent) {
      // Cmd+Click (Mac) / Ctrl+Click (Win/Linux) on a link
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement;
      const anchor = target.closest<HTMLAnchorElement>("a[data-link-target]");
      if (!anchor) return;
      const articleId = anchor.getAttribute("data-link-target");
      if (articleId) {
        e.preventDefault();
        e.stopPropagation();
        setPreviewId(articleId);
      }
    }

    // copy イベント: 選択範囲を公式原文へ置換してクリップボードへ設定する（設計書§7）
    function onCopy(e: ClipboardEvent) {
      const ctx = getSelectionContext(new MouseEvent("copy"));
      if (!ctx || !ctx.selectedText) return;
      // 選択範囲が article 内の source span に含まれる場合のみ原文へ置換
      e.preventDefault();
      e.clipboardData?.setData("text/plain", ctx.selectedText);
    }

    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("copy", onCopy);
    return () => {
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("copy", onCopy);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && previewId) {
        setPreviewId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewId]);

  return (
    <div>
      {previewId && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-blue-700">
              条文プレビュー
            </span>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setPreviewId(null)}
            >
              ← 戻る (Esc)
            </button>
          </div>
          <LinkPreview articleId={previewId} />
        </div>
      )}
      <div ref={ref}>{children}</div>
    </div>
  );
}
