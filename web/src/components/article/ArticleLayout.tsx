"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";

interface ArticleLayoutProps {
  breadcrumb: ReactNode;
  leftPanel: ReactNode;
  center: ReactNode;
}

export default function ArticleLayout({
  breadcrumb,
  leftPanel,
  center,
}: ArticleLayoutProps) {
  const [showLeft, setShowLeft] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!showLeft) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setShowLeft(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLeft]);

  return (
    <ScrollContainerProvider containerRef={mainRef}>
      <div
        data-article-layout="true"
        className="flex h-screen flex-col bg-neutral-100 text-neutral-950"
      >
        <nav
          data-print-hidden="true"
          className="flex flex-shrink-0 items-center gap-2 border-b border-neutral-300 bg-[#f9f7f2] px-3 py-1.5 sm:px-4 sm:py-2"
        >
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <button
            type="button"
            onClick={() => setShowLeft((visible) => !visible)}
            className={`flex-shrink-0 rounded px-2 py-1 text-xs lg:hidden ${
              showLeft
                ? "bg-[#2b2b2b] text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
            aria-expanded={showLeft}
          >
            目次・検索
          </button>
        </nav>

        <div
          data-article-layout-content="true"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          {showLeft && (
            <>
              <button
                type="button"
                aria-label="目次・検索を閉じる"
                data-print-hidden="true"
                className="fixed inset-0 top-[42px] z-10 bg-black/30 lg:hidden"
                onClick={() => setShowLeft(false)}
              />
              <aside
                data-print-hidden="true"
                className="fixed bottom-0 left-0 top-[42px] z-20 w-72 overflow-hidden border-r border-neutral-300 bg-[#f9f7f2] lg:hidden"
              >
                <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-700">
                    目次・検索
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLeft(false)}
                    className="text-xs text-neutral-500 hover:text-neutral-800"
                  >
                    閉じる
                  </button>
                </div>
                <div className="h-[calc(100%-37px)]">{leftPanel}</div>
              </aside>
            </>
          )}

          <aside
            data-print-hidden="true"
            className="hidden w-72 flex-shrink-0 overflow-hidden border-r border-neutral-300 bg-[#f9f7f2] lg:block"
          >
            {leftPanel}
          </aside>

          <main
            ref={mainRef}
            data-scroll-container="article-main"
            className="min-w-0 flex-1 overflow-y-auto bg-[#eee8dc] px-0 py-4 sm:px-5 lg:px-8"
          >
            {center}
          </main>
        </div>
      </div>
    </ScrollContainerProvider>
  );
}
