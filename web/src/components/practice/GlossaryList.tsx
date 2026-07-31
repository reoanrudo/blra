
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../../lib/navigation-stub";

interface GlossaryTerm {
  id: string;
  term: string;
  reading: string;
  category: string;
  definitionArticleId: string | null;
  description: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  legal_definition: "法定定義語",
  technical_term: "技術用語",
  zone_name: "用途地域名称",
  building_type: "建築物分類",
  procedure: "手続用語",
};

const CATEGORY_ORDER = ["legal_definition", "technical_term", "zone_name", "building_type", "procedure"];

export default function GlossaryList() {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [activeCategory, setActiveCategory] = useState("legal_definition");
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/glossary?category=${encodeURIComponent(activeCategory)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: GlossaryTerm[]) => {
        setTerms(data);
      })
      .catch(() => setTerms([]))
      .finally(() => setLoading(false));
  }, [activeCategory]);

  const filteredTerms = useMemo(() => {
    if (!filterText.trim()) return terms;
    const q = filterText.trim().toLowerCase();
    return terms.filter((t) => t.term.toLowerCase().includes(q));
  }, [terms, filterText]);

  const handleFilterChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilterText(value), 150);
  };

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-neutral-600 hover:text-neutral-900"
      >
        <span className="font-medium">📝 関連用語</span>
        <span className="text-neutral-400">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-neutral-200">
          <div className="flex flex-wrap border-b border-neutral-200">
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  setFilterText("");
                }}
                className={`px-2 py-1 text-[10px] font-medium ${
                  activeCategory === cat
                    ? "text-[#9d1f58] border-b border-[#d92f7e]"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>

          <div className="px-2 py-1">
            <input
              type="text"
              placeholder="用語をフィルタ..."
              onChange={(e) => handleFilterChange(e.target.value)}
              className="w-full border border-neutral-300 bg-white px-2 py-0.5 text-[10px] outline-none focus:border-[#d92f7e] placeholder:text-neutral-400"
            />
          </div>

          <div className="max-h-[150px] overflow-y-auto px-2 pb-1">
            {loading && (
              <div className="flex justify-center py-2">
                <div className="h-3 w-3 animate-spin rounded-full border border-[#d92f7e] border-t-transparent" />
              </div>
            )}
            {!loading && filteredTerms.length === 0 && (
              <p className="py-2 text-center text-[10px] text-neutral-500">
                該当する用語がありません
              </p>
            )}
            {!loading &&
              filteredTerms.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => {
                    if (term.definitionArticleId) {
                      router.push(`/articles/${term.definitionArticleId}`);
                    }
                  }}
                  className={`w-full truncate px-1 py-0.5 text-left text-[10px] ${
                    term.definitionArticleId
                      ? "text-[#9d1f58] hover:underline"
                      : "text-neutral-600"
                  }`}
                >
                  {term.term}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
