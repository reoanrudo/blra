
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
  /** 追加取得Articleのリンク・注釈を実行時に統合する（Task C連携） */
  registerAuxData: (aux: {
    articleIds: string[];
    outgoing: Record<string, OutgoingLinkRow[]>;
    incoming: Record<string, IncomingLinkRow[]>;
  }) => void;
}

const ScrollActiveArticleContext =
  createContext<ScrollActiveArticleContextValue | null>(null);

export function useScrollActiveArticle(): ScrollActiveArticleContextValue | null {
  return useContext(ScrollActiveArticleContext);
}

interface ProviderProps {
  children: ReactNode;
  linksByArticle?: Map<string, LinksForArticle>;
}

export function ScrollActiveArticleProvider({
  children,
  linksByArticle,
}: ProviderProps) {
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastEntryRef = useRef<Map<string, number>>(new Map());

  // 追加取得Articleのリンクを統合するstate
  const [auxLinksByArticle, setAuxLinksByArticle] = useState<
    Map<string, LinksForArticle>
  >(new Map());

  const baseLinksByArticle = linksByArticle ?? new Map<string, LinksForArticle>();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          const articleId = entry.target.getAttribute("data-scroll-article-id");
          if (!articleId) continue;
          if (entry.isIntersecting) {
            lastEntryRef.current.set(articleId, now);
          } else {
            lastEntryRef.current.delete(articleId);
          }
        }

        if (lastEntryRef.current.size > 0) {
          let latest: string | null = null;
          let latestTime = 0;
          lastEntryRef.current.forEach((time, id) => {
            if (time > latestTime) {
              latestTime = time;
              latest = id;
            }
          });
          if (latest) {
            setActiveArticleId(latest);
          }
        }
      },
      {
        threshold: 0.05,
        rootMargin: "-60px 0px -60% 0px",
      },
    );

    observerRef.current = observer;

    sentinelMapRef.current.forEach((el) => {
      observer.observe(el);
    });

    return () => {
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
    setActiveArticleId(articleId);
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
    const merged = new Map(baseLinksByArticle);
    auxLinksByArticle.forEach((v, k) => merged.set(k, v));
    return merged;
  }, [baseLinksByArticle, auxLinksByArticle]);

  return (
    <ScrollActiveArticleContext.Provider
      value={{
        activeArticleId,
        linksByArticle: mergedLinksByArticle,
        registerSentinel,
        unregisterSentinel,
        activateArticle,
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
