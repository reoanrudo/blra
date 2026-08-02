"use client";

import { useEffect, useRef } from "react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const groups: ShortcutGroup[] = [
  {
    title: "基本操作",
    shortcuts: [
      { keys: "Cmd+K", description: "コマンドパレットを開く / 閉じる" },
      { keys: "Esc", description: "モーダル / ドロップダウンを閉じる" },
      { keys: "?", description: "このショートカット一覧を表示" },
    ],
  },
  {
    title: "検索結果ナビゲーション",
    shortcuts: [
      { keys: "j", description: "次の検索結果に移動" },
      { keys: "k", description: "前の検索結果に移動" },
      { keys: "Enter", description: "選択中の結果を開く" },
    ],
  },
  {
    title: "条文ページ",
    shortcuts: [
      { keys: "a", description: "確認項目に追加" },
    ],
  },
  {
    title: "コマンドパレット内",
    shortcuts: [
      { keys: "↑↓", description: "候補を移動" },
      { keys: "Enter", description: "候補を選択" },
      { keys: "Esc", description: "コマンドパレットを閉じる" },
    ],
  },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="mx-4 w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            キーボードショートカット
          </h2>
        </div>

        <div className="max-h-96 overflow-y-auto px-5 py-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-xs font-medium text-gray-500">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-700">
                      {item.description}
                    </span>
                    <kbd className="ml-3 inline-flex items-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 px-5 py-2.5 text-center text-xs text-gray-400">
          Esc で閉じる
        </div>
      </div>
    </div>
  );
}
