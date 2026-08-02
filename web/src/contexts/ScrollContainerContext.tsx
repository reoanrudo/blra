"use client";

import { createContext, useContext, type RefObject } from "react";

/**
 * スクロールコンテナ（<main>）のrefを共有するContext。
 *
 * ArticleLayout の <main> 要素が actual scroll container（overflow-y-auto）のため、
 * ChapterScrollViewer の位置合わせ・補正・Observer はすべてこの要素を基準とする。
 * 設計書§3.2, §3.3: スクロール位置合わせと上方向補正は <main> へ行う。
 */
const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(
  null,
);

export function useScrollContainer(): RefObject<HTMLElement | null> | null {
  return useContext(ScrollContainerContext);
}

export function ScrollContainerProvider({
  children,
  containerRef,
}: {
  children: React.ReactNode;
  containerRef: RefObject<HTMLElement | null>;
}) {
  return (
    <ScrollContainerContext.Provider value={containerRef}>
      {children}
    </ScrollContainerContext.Provider>
  );
}
