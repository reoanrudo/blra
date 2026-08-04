"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { ChapterArticle } from "@/lib/article/article";
import type { ScrollScopeInfo } from "@/lib/article/chapter-window";
import {
  appendNextScopeSegment,
  mergePageIntoLastSegment,
  type LawScrollSegment,
} from "@/lib/article/law-scroll-segments";
import type { OutgoingLinkRow } from "@/lib/link/link";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import { getCachedChapterData, setCachedChapterData } from "@/lib/article/chapter-data-cache";
import ChapterArticleBlock from "@/components/article/ChapterArticleBlock";

/**
 * 章スクロール段階読込ビューア（設計書 §3.2, §5, §7）
 *
 * - SSRから初期ウィンドウ（対象＋前後各5件、最大11件）を受け取り即表示。
 * - useLayoutEffect で対象ルートArticleへ位置合わせしてから Observer を有効化。
 *   sessionStorageを使わず、targetRootId で直接DOM要素を特定する（Effect競合回避）。
 * - 下端へのスクロールで /api/articles/chapter-window へ追加取得。
 *   上方向（before）の自動発火は廃止。明示ボタンのみ。
 * - 上方向追加時は <main> の scrollTop を補正し、閲覧中の文章が動かないようにする。
 * - 取得済みArticleは画面内キャッシュへ保持し、戻ったとき再取得しない。
 * - 下方向は同一法令・Revision・収録範囲内の次scopeへ連結し、別法令へは越えない。
 * - Revision不一致を検知した場合は追加を行わない。
 * - 追加取得失敗時は「再読み込み」導線を表示し、既存本文は保持する。
 * - 利用者データ（リンク・注釈）は chapter-aux API で一括取得（Task C連携）。
 */

const PREFETCH_THRESHOLD_PX = 200;

interface ChapterScrollViewerProps {
  /** SSR取得済みの初期ウィンドウ */
  initialArticles: ChapterArticle[];
  /** 初期ウィンドウの前後cursor */
  initialBeforeCursor: string | null;
  initialAfterCursor: string | null;
  /** SSR初期ウィンドウが属するscope */
  initialScope: ScrollScopeInfo;
  /** 同一法令内で文書順が次の公開scope */
  initialNextScope: ScrollScopeInfo | null;
  /** Revision識別子。Revision不一致検知でキャッシュ破棄 */
  lawRevisionId: string;
  /** 対象Article ID（URL由來） */
  targetArticleId: string;
  /** 解決済み対象ルートArticle ID（項・号URLの場合は親ルート）。位置合わせ基準 */
  targetRootId: string;
  /** リンクマップ（初期ウィンドウ分） */
  outgoingBySource: Map<string, OutgoingLinkRow[]>;
}

interface FetchResult {
  articles: ChapterArticle[];
  beforeCursor: string | null;
  afterCursor: string | null;
  scope: ScrollScopeInfo;
  nextScope: ScrollScopeInfo | null;
  lawRevisionId?: string;
  /** 追加取得Article群のノードID（ルート+子孫）。利用者データ一括取得用 */
  nodeIds?: string[];
}

export default function ChapterScrollViewer({
  initialArticles,
  initialBeforeCursor,
  initialAfterCursor,
  initialScope,
  initialNextScope,
  lawRevisionId,
  targetArticleId,
  targetRootId,
  outgoingBySource,
}: ChapterScrollViewerProps) {
  const mainRef = useScrollContainer();
  const { registerAuxData, activateArticle, registerScrollContainer } =
    useScrollActiveArticle() ?? {};

  const [segments, setSegments] = useState<LawScrollSegment[]>([
    {
      scope: initialScope,
      articles: initialArticles,
      beforeCursor: initialBeforeCursor,
      afterCursor: initialAfterCursor,
      nextScope: initialNextScope,
    },
  ]);
  const articles = useMemo(
    () => segments.flatMap((segment) => segment.articles),
    [segments],
  );
  const firstSegment = segments[0];
  const lastSegment = segments.at(-1);
  const beforeCursor = firstSegment?.beforeCursor ?? null;
  const afterCursor = lastSegment?.afterCursor ?? null;
  const nextScope = lastSegment?.nextScope ?? null;
  const canFetchAfter = Boolean(afterCursor || nextScope);

  const [loadingBefore, setLoadingBefore] = useState(false);
  const [loadingAfter, setLoadingAfter] = useState(false);
  const [errorBefore, setErrorBefore] = useState(false);
  const [errorAfter, setErrorAfter] = useState(false);

  // 位置合わせ完了フラグ。trueになるまでObserverを有効化しない。
  const [isAligned, setIsAligned] = useState(false);

  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // 追加取得中の重複防止
  const fetchingBeforeRef = useRef(false);
  const fetchingAfterRef = useRef(false);

  // 上方向追加時のスクロール位置補正用: 追加前の scrollHeight を記録
  const prevScrollHeightRef = useRef<number | null>(null);
  const isPrependingRef = useRef(false);

  // ── 対象Article位置合わせ（設計書§3.3） ──
  // useLayoutEffect でObserver有効化前に位置合わせを行い、意図せぬ前方読込を防ぐ。
  // sessionStorageを使わず、targetRootId で直接DOM要素を特定する。
  useLayoutEffect(() => {
    if (!targetRootId || isAligned) return;
    const container = mainRef?.current;
    if (!container) return;

    const targetEl = container.querySelector<HTMLElement>(
      `[data-scroll-article-id="${CSS.escape(targetRootId)}"]`,
    );
    if (targetEl) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const offset = targetRect.top - containerRect.top + container.scrollTop;
      container.scrollTop = Math.max(0, offset - 20);
    }
    setIsAligned(true);
  }, [targetRootId, isAligned, mainRef]);

  // ── 章データキャッシュ（設計書§4.3: 同じ章の取得済みArticleは保持） ──
  // 初期マウント時にキャッシュがあれば初期ウィンドウより多く保持済みのArticleを使用。
  // articles更新時にキャッシュへ反映し、同じ章へ戻ったとき再取得しない。
  useEffect(() => {
    const chapterKey = initialScope.stableNodeKey;
    const cached = getCachedChapterData(lawRevisionId, chapterKey);
    if (cached && cached.length >= initialArticles.length) {
      setSegments((current) => {
        const first = current[0];
        if (!first) return current;
        return [{ ...first, articles: cached }, ...current.slice(1)];
      });
    } else {
      setCachedChapterData(lawRevisionId, chapterKey, initialArticles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    for (const segment of segments) {
      if (segment.articles.length > 0) {
        setCachedChapterData(
          lawRevisionId,
          segment.scope.stableNodeKey,
          segment.articles,
        );
      }
    }
  }, [segments, lawRevisionId]);

  // ── 下方向（after）追加取得 ──
  const fetchAfter = useCallback(async () => {
    const currentLast = lastSegment;
    if (fetchingAfterRef.current || !currentLast) return;

    const isCrossingScope = !currentLast.afterCursor && !!currentLast.nextScope;
    const requestScope = isCrossingScope
      ? currentLast.nextScope
      : currentLast.scope;
    const requestCursor = isCrossingScope
      ? currentLast.nextScope?.firstCursor
      : currentLast.afterCursor;
    if (!requestScope || !requestCursor) return;

    fetchingAfterRef.current = true;
    setLoadingAfter(true);
    setErrorAfter(false);
    try {
      const url =
        `/api/articles/chapter-window?articleId=${encodeURIComponent(targetArticleId)}` +
        `&direction=after&cursor=${encodeURIComponent(requestCursor)}` +
        `&scopeId=${encodeURIComponent(requestScope.id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch after failed: ${res.status}`);
      const data: FetchResult = await res.json();

      if (data.lawRevisionId && data.lawRevisionId !== lawRevisionId) return;

      const newArticleIds = data.articles.map((a) => a.root.id);
      setSegments((current) => {
        if (isCrossingScope) {
          return appendNextScopeSegment(current, {
            scope: data.scope,
            articles: data.articles,
            beforeCursor: data.beforeCursor,
            afterCursor: data.afterCursor,
            nextScope: data.nextScope,
          });
        }
        return mergePageIntoLastSegment(
          current,
          data.articles,
          data.afterCursor,
          data.nextScope,
        );
      });

      // 利用者データ（リンク・注釈）一括取得（設計書§4.3, §5・Task C連携）
      if (data.nodeIds && data.nodeIds.length > 0 && registerAuxData) {
        void (async () => {
          try {
            const auxRes = await fetch("/api/articles/chapter-aux", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nodeIds: data.nodeIds }),
            });
            if (auxRes.ok) {
              const aux = await auxRes.json();
              registerAuxData({
                articleIds: newArticleIds,
                outgoing: aux.outgoingBySource ?? {},
                incoming: aux.incomingByTarget ?? {},
              });
            }
          } catch {
            // 利用者データ取得失敗は本文表示を止めない（設計書§7）
          }
        })();
      }
    } catch {
      setErrorAfter(true);
    } finally {
      fetchingAfterRef.current = false;
      setLoadingAfter(false);
    }
  }, [lastSegment, targetArticleId, lawRevisionId, registerAuxData]);

  // ── 上方向（before）追加取得（明示ボタンのみ・自動発火なし） ──
  const fetchBefore = useCallback(async () => {
    const currentFirst = segments[0];
    if (fetchingBeforeRef.current || !beforeCursor || !currentFirst) return;
    fetchingBeforeRef.current = true;
    setLoadingBefore(true);
    setErrorBefore(false);

    // 追加前の scrollHeight を記録（補正用・<main>基準）
    const container = mainRef?.current;
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight;
    }
    isPrependingRef.current = true;

    try {
      const url =
        `/api/articles/chapter-window?articleId=${encodeURIComponent(targetArticleId)}` +
        `&direction=before&cursor=${encodeURIComponent(beforeCursor)}` +
        `&scopeId=${encodeURIComponent(currentFirst.scope.id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch before failed: ${res.status}`);
      const data: FetchResult = await res.json();

      if (data.lawRevisionId && data.lawRevisionId !== lawRevisionId) return;

      const newArticleIds = data.articles.map((a) => a.root.id);
      setSegments((current) => {
        const first = current[0];
        if (!first) return current;
        return [
          {
            ...first,
            articles: mergeArticles(first.articles, data.articles, "before"),
            beforeCursor: data.beforeCursor,
          },
          ...current.slice(1),
        ];
      });

      // 利用者データ一括取得
      if (data.nodeIds && data.nodeIds.length > 0 && registerAuxData) {
        void (async () => {
          try {
            const auxRes = await fetch("/api/articles/chapter-aux", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nodeIds: data.nodeIds }),
            });
            if (auxRes.ok) {
              const aux = await auxRes.json();
              registerAuxData({
                articleIds: newArticleIds,
                outgoing: aux.outgoingBySource ?? {},
                incoming: aux.incomingByTarget ?? {},
              });
            }
          } catch {
            // 利用者データ取得失敗は本文表示を止めない
          }
        })();
      }
    } catch {
      setErrorBefore(true);
    } finally {
      fetchingBeforeRef.current = false;
      setLoadingBefore(false);
    }
  }, [beforeCursor, segments, targetArticleId, lawRevisionId, registerAuxData, mainRef]);

  // ── 上方向追加後のスクロール位置補正（設計書§3.2） ──
  // 実際のスクロール要素は <main>（ArticleLayout.tsx）。
  // prepend で新しいArticleが上に挿入されると、閲覧中の位置が下にずれる。
  // scrollHeight の増分だけ scrollTop を戻して、見た目の位置を維持する。
  useEffect(() => {
    if (!isPrependingRef.current) return;
    isPrependingRef.current = false;

    const container = mainRef?.current;
    const prevHeight = prevScrollHeightRef.current;
    if (!container || prevHeight === null) return;

    // DOM更新後に実行するためダブルraf
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const newHeight = container.scrollHeight;
        const delta = newHeight - prevHeight;
        if (delta > 0) {
          container.scrollTop += delta;
        }
        prevScrollHeightRef.current = null;
      });
    });
  }, [articles, mainRef]);

  // ── IntersectionObserver で下端到達を検知（設計書§3.2） ──
  // isAligned=true（位置合わせ完了）後にのみ有効化。
  // 上方向（before）の自動取得は廃止。明示ボタンのみ。
  useEffect(() => {
    // 取得中は監視を外し、本文追加後に必ず監視し直す。
    // 末尾が画面内に残ったままでも、次ページの取得通知を再発火できる。
    if (!isAligned || loadingAfter || errorAfter) return;
    const bottomEl = bottomSentinelRef.current;
    if (!bottomEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target === bottomEl) {
            void fetchAfter();
          }
        }
      },
      // root は <main> 要素。rootMargin は手前200px到達で取得開始。
      {
        root: mainRef?.current ?? null,
        rootMargin: `0px 0px ${PREFETCH_THRESHOLD_PX}px 0px`,
      },
    );

    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, [isAligned, loadingAfter, errorAfter, fetchAfter, mainRef]);

  // 法令末尾では最後のArticle先頭がObserverの判定帯まで上がらない場合がある。
  // 実スクロール下端へ到達した時だけ、最後のArticleを現在位置として明示確定する。
  useEffect(() => {
    const container = mainRef?.current;
    const lastArticleId = articles.at(-1)?.root.id;
    if (!container || !lastArticleId || canFetchAfter || !activateArticle) {
      return;
    }

    const handleScrollEnd = () => {
      const remaining =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remaining <= 2) {
        activateArticle(lastArticleId);
      }
    };

    container.addEventListener("scroll", handleScrollEnd, { passive: true });
    handleScrollEnd();
    return () => container.removeEventListener("scroll", handleScrollEnd);
  }, [mainRef, articles, canFetchAfter, activateArticle]);

  // スクロールコンテナを登録し、scroll ベースのハイライト追従を有効化。
  // IntersectionObserver 単体では高速スクロールに遅延するため。
  useEffect(() => {
    const container = mainRef?.current;
    if (!container || !registerScrollContainer) return;
    return registerScrollContainer(container);
  }, [mainRef, registerScrollContainer]);

  return (
    <div className="chapter-scroll-viewer">
      {/* 上端: before取得（明示ボタンのみ・自動発火なし・設計書§3.2） */}
      {beforeCursor && (
        <div className="chapter-scroll-edge chapter-scroll-edge--top">
          {loadingBefore && <EdgeIndicator label="前の条文を読み込み中…" />}
          {errorBefore && (
            <EdgeRetry
              onRetry={() => void fetchBefore()}
              label="前の条文の再読み込み"
            />
          )}
          {!loadingBefore && !errorBefore && (
            <button
              type="button"
              onClick={() => void fetchBefore()}
              className="text-[10px] text-neutral-500 hover:text-[#d92f7e] hover:underline"
            >
              ↑ 前の条文を読み込む
            </button>
          )}
        </div>
      )}

      {/* Article群（scopeごとの文書順） */}
      {segments.map((segment, segmentIndex) => (
        <div key={segment.scope.id}>
          {segmentIndex > 0 && (
            <header
              data-scroll-scope-id={segment.scope.id}
              className="mx-auto mb-5 mt-8 max-w-3xl border-b border-neutral-400 pb-2"
            >
              <p className="text-sm font-bold text-neutral-700">
                {segment.scope.label}
              </p>
            </header>
          )}
          {segment.articles.map((ca, articleIndex) => (
            <ChapterArticleBlock
              key={ca.root.id}
              articleRoot={ca.root}
              descendantNodes={ca.children}
              outgoingBySource={outgoingBySource}
              confirmedRelations={[]}
              isFirst={
                segmentIndex === 0 && articleIndex === 0 && !beforeCursor
              }
            />
          ))}
        </div>
      ))}

      {/* 下端: after取得状態 */}
      {canFetchAfter && (
        <div
          ref={bottomSentinelRef}
          className="chapter-scroll-edge chapter-scroll-edge--bottom"
        >
          {loadingAfter && <EdgeIndicator label="次の条文を読み込み中…" />}
          {errorAfter && (
            <EdgeRetry
              onRetry={() => void fetchAfter()}
              label="次の条文の再読み込み"
            />
          )}
          {!loadingAfter && !errorAfter && (
            <span className="text-[10px] text-neutral-400">
              {afterCursor ? "↓ 次の条文" : "↓ 次の区分を読み込む"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── ヘルパ ──

/** Articleリストの前後マージ。重複IDを除外し、文書順を維持する。 */
function mergeArticles(
  current: ChapterArticle[],
  incoming: ChapterArticle[],
  direction: "before" | "after",
): ChapterArticle[] {
  if (incoming.length === 0) return current;

  const currentIds = new Set(current.map((a) => a.root.id));
  const dedupedIncoming = incoming.filter((a) => !currentIds.has(a.root.id));
  if (dedupedIncoming.length === 0) return current;

  const combined =
    direction === "before"
      ? [...dedupedIncoming, ...current]
      : [...current, ...dedupedIncoming];

  return combined.sort(
    (a, b) => (a.root.sortOrder ?? 0) - (b.root.sortOrder ?? 0),
  );
}

function EdgeIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-[#d92f7e]" />
      <span className="text-[11px] text-neutral-500">{label}</span>
    </div>
  );
}

function EdgeRetry({
  onRetry,
  label,
}: {
  onRetry: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="text-[11px] text-[#d92f7e] hover:underline py-1"
    >
      ⟳ {label}
    </button>
  );
}
