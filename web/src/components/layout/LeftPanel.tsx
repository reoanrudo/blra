/**
 * LeftPanel — blra 版。provisions を TocPanel に渡す。
 */

import { useState } from "react";
import TocPanel from "@/components/toc/TocPanel";
import GlossaryList from "@/components/practice/GlossaryList";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import type { ProvisionWithVersion } from "../../api/types";

type MainView = "toc" | "search";
const VIEW_STORAGE_KEY = "left-panel-view";

interface LeftPanelProps {
  provisions: ProvisionWithVersion[];
  onSelectArticle: (provision: ProvisionWithVersion) => void;
}

export default function LeftPanel({ provisions, onSelectArticle }: LeftPanelProps) {
  const scrollCtx = useScrollActiveArticle();
  const currentArticleId = scrollCtx?.activeArticleId ?? null;

  const [view, setViewState] = useState<MainView>(() => {
    try {
      const s = sessionStorage.getItem(VIEW_STORAGE_KEY);
      if (s === "toc" || s === "search") return s;
    } catch { /* ignore */ }
    return "toc";
  });

  function setView(v: MainView) {
    setViewState(v);
    try { sessionStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-neutral-300 shrink-0">
        <button type="button" onClick={() => setView("toc")}
          className={`flex-1 py-1.5 text-xs font-medium ${view === "toc" ? "text-[#9d1f58] border-b-2 border-[#d92f7e]" : "text-neutral-500 hover:text-neutral-800"}`}>
          📑 目次
        </button>
        <button type="button" onClick={() => setView("search")}
          className={`flex-1 py-1.5 text-xs font-medium ${view === "search" ? "text-[#9d1f58] border-b-2 border-[#d92f7e]" : "text-neutral-500 hover:text-neutral-800"}`}>
          🔍 検索・実務
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === "toc" && (
          <TocPanel provisions={provisions} currentArticleId={currentArticleId} onSelect={onSelectArticle} />
        )}
        {view === "search" && (
          <div className="p-3 text-xs text-neutral-500">検索は準備中です</div>
        )}
      </div>

      <div className="shrink-0 border-t border-neutral-300">
        <GlossaryList />
      </div>
    </div>
  );
}
