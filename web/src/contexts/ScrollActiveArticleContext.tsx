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

/** 判定帯のコンテナ上端からのオフセット（固定ヘッダ回避） */
const ACTIVATION_OFFSET_PX = 80;
/** 判定帯の許容誤差 */
const ACTIVATION_TOLERANCE_PX = 5;

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
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastEntryRef = useRef<Map<string, number>>(new Map());

  // 追加取得Articleのリンクを統合するstate
  const [auxLinksByArticle, setAuxLinksByArticle] = useState<
    Map<string, LinksForArticle>
  >(new Map());

  useEffect(() => {
    let rafId: number | null = null;

    const flushActive = () => {
      rafId = null;
      if (lastEntryRef.current.size > 0) {
        let latest: string | null = null;
        let latestTime = 0;
        lastEntryRef.current.forEach((time, id) => {
          if (time > latestTime) {
            latestTime = time;
            latest = id;
          }
        });
        // 同一条文なら setState を発火させず再描画カスケードを防ぐ
        if (latest && latest !== activeArticleIdRef.current) {
          activeArticleIdRef.current = latest;
          setActiveArticleId(latest);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        let needsFlush = false;
        for (const entry of entries) {
          const articleId = entry.target.getAttribute("data-scroll-article-id");
          if (!articleId) continue;
          if (entry.isIntersecting) {
            lastEntryRef.current.set(articleId, now);
            needsFlush = true;
          } else {
            // 退出した条文が直前のアクティブだった場合、即座に再計算が必要
            if (lastEntryRef.current.delete(articleId)) {
              needsFlush = true;
            }
          }
        }
        if (needsFlush && rafId === null) {
          rafId = requestAnimationFrame(flushActive);
        }
      },
      {
        // ビューポート上部の狭い帯（上部オフセット〜画面中央）を判定域にする。
        // threshold を極小にして微小な交差でも即検出する。
        threshold: 0,
        rootMargin: "0px 0px -50% 0px",
      },
    );

    observerRef.current = observer;

    sentinelMapRef.current.forEach((el) => {
      observer.observe(el);
    });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const registerSentinel = useCallback(
    (articleId: string, element: HTMLDivElement) => {
      sentinelMapRef.current.set(articleId, element);
      observerRef.current?.observe(element);
    },
    [],
  );

  const unregisterSentinel = useCallback((articleId: string) => {
    const el = sentinelMapRef.current.get(articleId);
    if (el) {
      observerRef.current?.unobserve(el);
      sentinelMapRef.current.delete(articleId);
    }
    lastEntryRef.current.delete(articleId);
  }, []);

  const activateArticle = useCallback((articleId: string) => {
    if (articleId !== activeArticleIdRef.current) {
      activeArticleIdRef.current = articleId;
      setActiveArticleId(articleId);
    }
  }, []);

  // スクロールコンテナを登録し、scroll ベースでアクティブ条文を計算する。
  // IntersectionObserver 単体では高速スクロールに遅延するため、
  // scroll イベントで判定帯（コンテナ上部）に最も近い条文を直接特定する。
  const registerScrollContainer = useCallback((el: HTMLElement) => {
    let ticking = false;

    const computeActive = () => {
      ticking = false;
      const containerTop = el.getBoundingClientRect().top + ACTIVATION_OFFSET_PX;
      let bestId: string | null = null;
      let bestDist = Infinity;
      sentinelMapRef.current.forEach((sentinel, id) => {
        const rect = sentinel.getBoundingClientRect();
        // 判定帯より下にある条文のうち、最も近いものを選ぶ
        const dist = rect.top - containerTop;
        if (dist <= ACTIVATION_TOLERANCE_PX && dist > -bestDist) {
          if (Math.abs(dist) < bestDist || (dist >= 0 && bestId === null)) {
            // 判定帯を過ぎた直近の条文（dist に最も近い0以下）を優先
          }
        }
        // シンプルに: 判定帯に最も近い条文（上から順）
        if (dist <= 0 && Math.abs(dist) < bestDist) {
          bestDist = Math.abs(dist);
          bestId = id;
        }
      });
      // 判定帯より前に条文が無い（ページ先頭付近）場合は最初の条文
      if (!bestId && sentinelMapRef.current.size > 0) {
        let topMost: string | null = null;
        let topY = Infinity;
        sentinelMapRef.current.forEach((sentinel, id) => {
          const y = sentinel.getBoundingClientRect().top;
          if (y < topY) {
            topY = y;
            topMost = id;
          }
        });
        bestId = topMost;
      }
      if (bestId && bestId !== activeArticleIdRef.current) {
        activeArticleIdRef.current = bestId;
        setActiveArticleId(bestId);
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(computeActive);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    // 初回計算
    computeActive();

    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

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

  return (
    <ScrollActiveArticleContext.Provider
      value={{
        activeArticleId,
        linksByArticle: mergedLinksByArticle,
        registerSentinel,
        unregisterSentinel,
        activateArticle,
        registerScrollContainer,
        registerAuxData,
      }}
    >
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
