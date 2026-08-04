"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { LinkItem } from "@/components/practice/LinkExplorer";
import type { OutgoingLinkRow, IncomingLinkRow } from "@/lib/link/link";

interface LinksForArticle {
  incoming: LinkItem[];
  outgoing: LinkItem[];
}

interface ScrollActiveArticleContextValue {
  activeArticleId: string | null;
  linksByArticle: Map<string, LinksForArticle>;
  registerSentinel: (articleId: string, element: HTMLDivElement) => void;
  unregisterSentinel: (articleId: string) => void;
  /** スクロール末尾など、Observerだけでは判定できない位置のArticleを確定する */
  activateArticle: (articleId: string) => void;
  /** スクロールコンテナ（<main>）を登録し、scroll追従を有効化する */
  registerScrollContainer: (el: HTMLElement) => () => void;
  /** 追加取得Articleのリンク・注釈を実行時に統合する（Task C連携） */
  registerAuxData: (aux: {
    articleIds: string[];
    outgoing: Record<string, OutgoingLinkRow[]>;
    incoming: Record<string, IncomingLinkRow[]>;
  }) => void;
}

const ScrollActiveArticleContext =
  createContext<ScrollActiveArticleContextValue | null>(null);

/** 判定帯のコンテナ上端からのオフセット（固定ヘッダ回避・scroll-mt-20相当） */
const ACTIVATION_OFFSET_PX = 80;

export function useScrollActiveArticle(): ScrollActiveArticleContextValue | null {
  return useContext(ScrollActiveArticleContext);
}

interface ProviderProps {
  children: ReactNode;
  linksByArticle: Map<string, LinksForArticle>;
}

export function ScrollActiveArticleProvider({
  children,
  linksByArticle,
}: ProviderProps) {
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const activeArticleIdRef = useRef<string | null>(null);
  const sentinelMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // センチネルを文書順に保持する配列（二分探索用）
  const sentinelOrderRef = useRef<{ id: string; el: HTMLDivElement }[]>([]);
  const containerRef = useRef<HTMLElement | null>(null);

  // 追加取得Articleのリンクを統合するstate
  const [auxLinksByArticle, setAuxLinksByArticle] = useState<
    Map<string, LinksForArticle>
  >(new Map());

  const setActiveSafe = useCallback((id: string) => {
    if (id !== activeArticleIdRef.current) {
      activeArticleIdRef.current = id;
      setActiveArticleId(id);
    }
  }, []);

  // センチネル配列を文書順（DOM順）に再構築する
  const rebuildSentinelOrder = useCallback(() => {
    sentinelOrderRef.current = Array.from(sentinelMapRef.current.entries())
      .map(([id, el]) => ({ id, el }))
      .sort((a, b) => {
        // DOM 文書順でソート（Node.compareDocumentPosition）
        if (a.el === b.el) return 0;
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
  }, []);

  // センチネル配列から判定帯に最も近い条文を二分探索で特定する。
  // 文書順ソート済みなので getBoundingClientRect().top は単調増加する。
  const computeActiveFor = useCallback(
    (el: HTMLElement) => {
      const ordered = sentinelOrderRef.current;
      if (ordered.length === 0) return;

      const triggerY = el.getBoundingClientRect().top + ACTIVATION_OFFSET_PX;

      // 判定帯を越えた最初の条文を二分探索で見つける
      let lo = 0;
      let hi = ordered.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ordered[mid].el.getBoundingClientRect().top < triggerY) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      // lo は判定帯を越えた最初の条文。アクティブなのはその1つ前。
      // ただし先頭条文が判定帯より下にある（ページ先頭）場合は lo=0 を使う。
      const activeIndex = lo > 0 ? lo - 1 : 0;
      setActiveSafe(ordered[activeIndex].id);
    },
    [setActiveSafe],
  );

  const registerSentinel = useCallback(
    (articleId: string, element: HTMLDivElement) => {
      sentinelMapRef.current.set(articleId, element);
      rebuildSentinelOrder();
      // コンテナが既に登録済みなら即座に再計算
      if (containerRef.current) {
        computeActiveFor(containerRef.current);
      }
    },
    [rebuildSentinelOrder, computeActiveFor],
  );

  const unregisterSentinel = useCallback(
    (articleId: string) => {
      sentinelMapRef.current.delete(articleId);
      rebuildSentinelOrder();
    },
    [rebuildSentinelOrder],
  );

  const activateArticle = useCallback(
    (articleId: string) => setActiveSafe(articleId),
    [setActiveSafe],
  );

  // スクロールコンテナを登録し、scroll ベースでアクティブ条文を計算する。
  const registerScrollContainer = useCallback((el: HTMLElement) => {
    containerRef.current = el;
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          computeActiveFor(el);
        });
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    computeActiveFor(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      containerRef.current = null;
    };
  }, [computeActiveFor]);

  const registerAuxData = useCallback(
    (aux: {
      articleIds: string[];
      outgoing: Record<string, OutgoingLinkRow[]>;
      incoming: Record<string, IncomingLinkRow[]>;
    }) => {
      setAuxLinksByArticle((prev) => {
        const next = new Map(prev);
        for (const articleId of aux.articleIds) {
          next.set(articleId, {
            outgoing: toLinkItemsFromRows(
              aux.outgoing[articleId] ?? [],
              "outgoing",
            ),
            incoming: toLinkItemsFromRows(
              aux.incoming[articleId] ?? [],
              "incoming",
            ),
          });
        }
        return next;
      });
    },
    [],
  );

  // 初期 + 追加統合済みのリンクマップ
  const mergedLinksByArticle = useMemo(() => {
    const merged = new Map(linksByArticle);
    auxLinksByArticle.forEach((v, k) => merged.set(k, v));
    return merged;
  }, [linksByArticle, auxLinksByArticle]);

  const value = useMemo<ScrollActiveArticleContextValue>(
    () => ({
      activeArticleId,
      linksByArticle: mergedLinksByArticle,
      registerSentinel,
      unregisterSentinel,
      activateArticle,
      registerScrollContainer,
      registerAuxData,
    }),
    [
      activeArticleId,
      mergedLinksByArticle,
      registerSentinel,
      unregisterSentinel,
      activateArticle,
      registerScrollContainer,
      registerAuxData,
    ],
  );

  return (
    <ScrollActiveArticleContext.Provider value={value}>
      {children}
    </ScrollActiveArticleContext.Provider>
  );
}

/** OutgoingLinkRow/IncomingLinkRow を表示用 LinkItem へ変換 */
function toLinkItemsFromRows(
  links: OutgoingLinkRow[] | IncomingLinkRow[],
  direction: "outgoing" | "incoming",
): LinkItem[] {
  return links.map((l): LinkItem => {
    if (direction === "outgoing") {
      const ol = l as OutgoingLinkRow;
      return {
        id: ol.id,
        articleId: ol.targetId ?? ol.sourceId,
        articleNumberNormalized: ol.targetArticleNumberNormalized ?? null,
        caption: ol.targetCaption ?? null,
        lawShortName: ol.targetLawShortName ?? null,
      };
    }
    const il = l as IncomingLinkRow;
    return {
      id: il.id,
      articleId: il.sourceId,
      articleNumberNormalized: il.sourceArticleNumberNormalized ?? null,
      caption: il.sourceCaption ?? null,
      lawShortName: il.sourceLawShortName ?? null,
    };
  });
}
