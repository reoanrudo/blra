"use client";

interface CheckItemData {
  id: string;
  articleId: string;
  title: string | null;
  status: string;
  evidenceText: string | null;
  drawingNote: string | null;
  calculationMemo: string | null;
  consultationMemo: string | null;
  sortOrder: number;
}

interface CheckItemEditorProps {
  item: CheckItemData | null;
  onUpdate: (field: string, value: string) => void;
  onNavigate: (articleId: string) => void;
}

export default function CheckItemEditor({
  item,
  onUpdate,
  onNavigate,
}: CheckItemEditorProps) {
  if (!item) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-gray-400">
        確認項目を選択してください
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Article link */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate(item.articleId)}
          className="text-xs text-blue-600 hover:underline"
        >
          条文を開く → /articles/{item.articleId}
        </button>
      </div>

      {/* Evidence text (readonly citation) */}
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-1">
          根拠条文
        </label>
        <div className="w-full min-h-[2.5rem] px-2 py-1.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded">
          {item.evidenceText || (
            <span className="text-gray-300">引用テキストはありません</span>
          )}
        </div>
      </div>

      {/* Drawing note */}
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-1">
          図面注記
        </label>
        <textarea
          value={item.drawingNote ?? ""}
          onChange={(e) => onUpdate("drawingNote", e.target.value)}
          rows={3}
          placeholder="図面への注記を入力..."
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 resize-vertical"
        />
      </div>

      {/* Calculation memo */}
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-1">
          計算メモ
        </label>
        <textarea
          value={item.calculationMemo ?? ""}
          onChange={(e) => onUpdate("calculationMemo", e.target.value)}
          rows={3}
          placeholder="計算に関するメモを入力..."
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 resize-vertical"
        />
      </div>

      {/* Consultation memo */}
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-1">
          協議メモ
        </label>
        <textarea
          value={item.consultationMemo ?? ""}
          onChange={(e) => onUpdate("consultationMemo", e.target.value)}
          rows={3}
          placeholder="審査機関との協議内容を入力..."
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 resize-vertical"
        />
      </div>
    </div>
  );
}
