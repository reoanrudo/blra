"use client";

import { createContext, useContext } from "react";

/**
 * 現在閲覧中の法令ID（lawId）を共有するContext。
 * 設計書§4.1: isCurrent をAPIから廃止し、クライアント側で現在法令を選択状態に反映する。
 * page.tsx の初期データ（currentArticle.lawId）を起点とする。
 */
const CurrentLawContext = createContext<string | null>(null);

export function useCurrentLawId(): string | null {
  return useContext(CurrentLawContext);
}

export function CurrentLawProvider({
  children,
  lawId,
}: {
  children: React.ReactNode;
  lawId: string | null;
}) {
  return (
    <CurrentLawContext.Provider value={lawId}>
      {children}
    </CurrentLawContext.Provider>
  );
}
