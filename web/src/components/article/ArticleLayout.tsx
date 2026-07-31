
import { useState, useEffect, useRef, type ReactNode } from "react";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";

export default function ArticleLayout({
  breadcrumb,
  currentArticle,
  leftPanel,
  center,
  rightPanel,
}: {
  breadcrumb: ReactNode;
  currentArticle: ReactNode;
  leftPanel: ReactNode;
  center: ReactNode;
  rightPanel: ReactNode;
}) {
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // デスクトップ（lg:）での実務パネル折りたたみ状態
  const [rightCollapsed, setRightCollapsed] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowLeft(false);
        setShowRight(false);
      }
    }
    if (showLeft || showRight) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [showLeft, showRight]);

  return (
    <ScrollContainerProvider containerRef={mainRef}>
    <div className="flex h-screen flex-col bg-neutral-100 text-neutral-950">
      {/* Breadcrumb + mobile toggles */}
      <nav className="flex flex-shrink-0 items-center gap-2 border-b border-neutral-300 bg-[#f9f7f2] px-3 py-1.5 sm:px-4 sm:py-2">
        <div className="flex-1 min-w-0">{breadcrumb}</div>
        {/* デスクトップ用: 実務パネル折りたたみトグル */}
        <button
          type="button"
          onClick={() => setRightCollapsed((prev) => !prev)}
          className={`hidden lg:flex items-center gap-1 px-2 py-1 text-xs rounded flex-shrink-0 ${
            rightCollapsed
              ? "text-neutral-400 hover:bg-white"
              : "bg-[#2b2b2b] text-white"
          }`}
          title={rightCollapsed ? "実務パネルを表示" : "実務パネルを隠す"}
        >
          <span className="text-[10px]">▸▸</span>
          実務
        </button>
        <div className="flex items-center gap-1 lg:hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowLeft(!showLeft);
              if (showRight) setShowRight(false);
            }}
            className={`px-2 py-1 text-xs rounded ${
              showLeft
                ? "bg-[#2b2b2b] text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
          >
            検索
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRight(!showRight);
              if (showLeft) setShowLeft(false);
            }}
            className={`px-2 py-1 text-xs rounded ${
              showRight
                ? "bg-[#2b2b2b] text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
          >
            実務
          </button>
        </div>
      </nav>

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left overlay on mobile */}
        {showLeft && (
          <>
            <div
              className="fixed inset-0 top-[42px] z-10 bg-black/30 lg:hidden"
              onClick={() => setShowLeft(false)}
            />
            <aside className="fixed top-[42px] left-0 bottom-0 z-20 w-72 overflow-y-auto border-r border-neutral-300 bg-[#f9f7f2] p-3 lg:hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-neutral-600">
                  検索パネル
                </span>
                <button
                  type="button"
                  onClick={() => setShowLeft(false)}
                  className="text-xs text-neutral-500 hover:text-neutral-800"
                >
                  閉じる
                </button>
              </div>
              {leftPanel}
            </aside>
          </>
        )}

        {/* Left panel: desktop */}
        <aside className="hidden w-72 flex-shrink-0 overflow-y-auto border-r border-neutral-300 bg-[#f9f7f2] p-3 lg:block">
          {leftPanel}
        </aside>

        {/* Center */}
        <main
          ref={mainRef}
          data-scroll-container="article-main"
          className="min-w-0 flex-1 overflow-y-auto bg-[#eee8dc] px-0 py-4 sm:px-5 lg:px-8"
        >
          {currentArticle}
          {center}
        </main>

        {/* Right overlay on mobile */}
        {showRight && (
          <>
            <div
              className="fixed inset-0 top-[42px] z-10 bg-black/30 lg:hidden"
              onClick={() => setShowRight(false)}
            />
            <aside className="fixed top-[42px] right-0 bottom-0 z-20 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto border-l border-neutral-300 bg-[#f9f7f2] p-3 lg:hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-neutral-600">
                  実務パネル
                </span>
                <button
                  type="button"
                  onClick={() => setShowRight(false)}
                  className="text-xs text-neutral-500 hover:text-neutral-800"
                >
                  閉じる
                </button>
              </div>
              {rightPanel}
            </aside>
          </>
        )}

        {/* Right panel: desktop（実務パネル折りたたみ対応） */}
        {!rightCollapsed && (
          <aside className="hidden w-[22rem] flex-shrink-0 overflow-y-auto border-l border-neutral-300 bg-[#f9f7f2] p-3 lg:block">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
    </ScrollContainerProvider>
  );
}
