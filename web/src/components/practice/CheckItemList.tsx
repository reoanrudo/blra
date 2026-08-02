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

const STATUS_OPTIONS = [
  { value: "unchecked", label: "未確認" },
  { value: "applicable", label: "該当" },
  { value: "not_applicable", label: "非該当" },
  { value: "ok", label: "OK" },
  { value: "ng", label: "NG" },
  { value: "needs_consultation", label: "要協議" },
] as const;

const STATUS_COLOR: Record<string, string> = {
  unchecked: "bg-gray-100 text-gray-600",
  applicable: "bg-blue-100 text-blue-700",
  not_applicable: "bg-gray-100 text-gray-500",
  ok: "bg-green-100 text-green-700",
  ng: "bg-red-100 text-red-700",
  needs_consultation: "bg-yellow-100 text-yellow-700",
};

interface CheckItemListProps {
  items: CheckItemData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function CheckItemList({
  items,
  selectedId,
  onSelect,
  onStatusChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: CheckItemListProps) {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400">
          確認項目がまだ登録されていません。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          下のクイック検索から条文を確認項目に追加してください。
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {sorted.map((item) => {
        const isSelected = item.id === selectedId;
        const isFirst = sorted[0].id === item.id;
        const isLast = sorted[sorted.length - 1].id === item.id;
        return (
          <li
            key={item.id}
            className={`border rounded cursor-pointer transition-colors ${
              isSelected
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
            onClick={() => onSelect(item.id)}
          >
            <div className="flex items-start gap-1 p-2">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 pt-0.5">
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp(item.id);
                  }}
                  className={`text-[10px] leading-none px-0.5 rounded ${
                    isFirst
                      ? "text-gray-200 cursor-not-allowed"
                      : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  aria-label="上に移動"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown(item.id);
                  }}
                  className={`text-[10px] leading-none px-0.5 rounded ${
                    isLast
                      ? "text-gray-200 cursor-not-allowed"
                      : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  aria-label="下に移動"
                >
                  ▼
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {item.title && (
                  <p className="text-xs font-medium text-gray-800 line-clamp-2">
                    {item.title}
                  </p>
                )}
                {item.evidenceText && (
                  <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                    {item.evidenceText}
                  </p>
                )}
                <div className="flex gap-2 text-[9px] text-gray-400 mt-1">
                  {item.drawingNote && <span>図面注記あり</span>}
                  {item.calculationMemo && <span>計算メモあり</span>}
                  {item.consultationMemo && <span>協議メモあり</span>}
                </div>
              </div>

              {/* Status + Delete */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <select
                  value={item.status}
                  onChange={(e) => {
                    e.stopPropagation();
                    onStatusChange(item.id, e.target.value);
                  }}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border-0 cursor-pointer ${STATUS_COLOR[item.status] ?? ""}`}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="text-[10px] text-red-400 hover:text-red-600 hover:underline"
                >
                  削除
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
