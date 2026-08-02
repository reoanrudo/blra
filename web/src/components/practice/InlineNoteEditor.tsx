"use client";

import { useState } from "react";
import { useAnnotation } from "@/contexts/AnnotationContext";

const TAG_OPTIONS = [
  { value: "applicable", label: "該当", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "review", label: "要検討", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "reference", label: "参考", color: "bg-blue-100 text-blue-700 border-blue-300" },
] as const;

export default function InlineNoteEditor() {
  const { state, upsertAnnotation, deleteAnnotation, closeEditor } =
    useAnnotation();
  const articleId = state.activeArticleId;
  const existing = articleId ? state.annotations.get(articleId) : null;

  const [tag, setTag] = useState(existing?.tag ?? "review");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!articleId) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertAnnotation(articleId, tag, note || undefined);
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存エラー");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) {
      closeEditor();
      return;
    }
    setSaving(true);
    try {
      await deleteAnnotation(existing.id, articleId);
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除エラー");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-sm mx-0 sm:mx-4 overflow-hidden">
        {/* ヘッダー */}
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-800">注釈を編集</h3>
          <button
            onClick={closeEditor}
            className="text-neutral-400 hover:text-neutral-600 text-lg leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* 分類タグ */}
        <div className="px-4 py-3 border-b border-neutral-100">
          <p className="text-xs text-neutral-500 mb-2">分類</p>
          <div className="flex gap-2">
            {TAG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTag(opt.value)}
                className={`
                  px-3 py-1 rounded-full text-xs font-medium border transition-colors
                  ${tag === opt.value
                    ? opt.color
                    : "bg-neutral-50 text-neutral-400 border-neutral-200 hover:bg-neutral-100"
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* メモ */}
        <div className="px-4 py-3">
          <p className="text-xs text-neutral-500 mb-2">メモ</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="条文に関するメモを入力..."
            rows={3}
            className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>

        {/* エラー */}
        {error && (
          <div className="px-4 py-1 text-xs text-red-600">{error}</div>
        )}

        {/* フッター */}
        <div className="px-4 py-3 border-t border-neutral-100 flex items-center justify-between">
          <div>
            {existing && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-xs text-red-500 hover:text-red-700"
              >
                削除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeEditor}
              className="text-xs text-neutral-400 hover:text-neutral-600 px-3 py-1.5"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`
                text-xs px-4 py-1.5 rounded-lg font-medium
                ${saving
                  ? "bg-blue-300 text-white cursor-wait"
                  : "bg-blue-500 text-white hover:bg-blue-600"
                }
              `}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
