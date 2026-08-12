"use client";

import { memo, useLayoutEffect, useMemo, useEffect } from "react";
import ChapterArticleBlock from "@/components/article/ChapterArticleBlock";
import { articleDisplayTitle } from "@/lib/article/article";
import { levelHeadingClass } from "@/lib/article/article-renderer";
import {
  buildFullLawBlocks,
  fullLawAnchorId,
  fullLawTargetSelector,
  type FullLawDocument,
} from "@/lib/article/full-law-document";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import type { ConfirmedRelation } from "@/lib/relations/confirmed-relation";

function FullLawViewerImpl({
  document,
  targetArticleId,
  confirmedRelationsBySource,
}: {
  document: FullLawDocument;
  targetArticleId: string;
  confirmedRelationsBySource: Record<string, ConfirmedRelation[]>;
}) {
  const blocks = useMemo(
    () => buildFullLawBlocks(document.nodes, document.law.name),
    [document],
  );
  const outgoingBySource = useMemo(
    () => new Map(Object.entries(document.linksBySource)),
    [document.linksBySource],
  );
  const confirmedBySource = useMemo(
    () => new Map(Object.entries(confirmedRelationsBySource)),
    [confirmedRelationsBySource],
  );
  const firstArticleId = blocks.find(
    (block) => block.kind === "article",
  )?.article.root.id;

  const mainRef = useScrollContainer();
  const { registerScrollContainer, suppressScrollSyncOneFrame, activateArticle } =
    useScrollActiveArticle() ?? {};

  // スクロールコンテナ（<main>）を登録し、scroll ベースのハイライト追従を有効化。
  // FullLawViewer は全文を一度に描画するため、章スクロールとは異なり
  // ここで登録しないと scroll-spy が発火しない。
  useEffect(() => {
    const container = mainRef?.current;
    if (!container || !registerScrollContainer) return;
    return registerScrollContainer(container);
  }, [mainRef, registerScrollContainer]);

  // リロード時にブラウザのデフォルトscroll restorationが
  // 「第一条へ戻る」挙動で上書きされるのを防ぐ。
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = "manual";
      return () => {
        window.history.scrollRestoration = prev;
      };
    }
  }, []);

  // リロード時に targetArticleId（URLのarticleId）に対応する条文へスクロール。
  // scroll-spy が DOM 描画完了後に最新の activeArticleId を URL に反映しているので、
  // リロード時は必ず URL の articleId = 最後に見ていた条文になる。
  //
  // scrollIntoView ではなく scrollTop を直接設定する：
  // useLayoutEffect（ペイント前）の段階でスクロール位置を確定できるため、
  // リロード時に第一条が一瞬表示されるフラッシュを防げる。
  //
  // URL がターゲット条文からズレるのを防ぐ3つの対策：
  // 1. suppressScrollSyncOneFrame で scroll イベントによる scroll-spy を一時停止
  // 2. activateArticle でターゲット条文をアクティブ固定（ScrollUrlSync が URL を維持）
  // 3. computeActiveFor の `<=` 比較で triggerY と同じ位置のセンチネルを「越えていない」と扱う
  useLayoutEffect(() => {
    const scrollToArticle = () => {
      const container = mainRef?.current;
      const el = window.document.querySelector<HTMLElement>(
        fullLawTargetSelector(targetArticleId),
      );
      if (container && el) {
        suppressScrollSyncOneFrame?.();
        // scrollTop 直接設定：ターゲット条文を <main> の最上部にピッタリ表示
        const containerTop = container.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        container.scrollTop += elTop - containerTop;
        activateArticle?.(targetArticleId);
      }
    };
    // 同期的に1回（ペイント前にスクロール位置を確定）+ rAF で1回（レイアウト確定後の微調整）
    scrollToArticle();
    requestAnimationFrame(scrollToArticle);
  }, [targetArticleId, suppressScrollSyncOneFrame, activateArticle, mainRef]);

  // HMR（開発時のホットリロード）後の再マウントで、scroll-spy が別の条文を
  // アクティブ判定して URL を書き換えてしまうのを防ぐ。
  // useEffect（ペイント後）で activateArticle を呼び、computeActiveFor の結果を
  // 上書きして確実にターゲット条文をアクティブにする。
  useEffect(() => {
    activateArticle?.(targetArticleId);
  }, [targetArticleId, activateArticle]);

  return (
    <div data-full-law-ready="true">
      {blocks.map((block) =>
        block.kind === "heading" ? (
          <header
            id={fullLawAnchorId(block.node.id)}
            key={block.node.id}
            data-article-id={block.node.id}
            className={`${levelHeadingClass(block.node.level)} scroll-mt-20`}
          >
            {(() => {
              // タイトルを番号部分（「第1節」等）と名前部分（「総則」等）に分割。
              // 節・款の名前部分はピンク色（law-accent）で表示。
              const title = articleDisplayTitle(block.node);
              const m = title.match(/^(第[^\s　]+[節款章編部])(?:[\s　]+(.+))?$/);
              if (m) {
                return (
                  <>
                    <span>{m[1]}</span>
                    {m[2] && <>
                      {"　"}
                      <span className="law-heading__title">{m[2]}</span>
                    </>}
                  </>
                );
              }
              return title;
            })()}
          </header>
        ) : (
          <ChapterArticleBlock
            key={block.article.root.id}
            articleRoot={block.article.root}
            descendantNodes={block.article.children}
            outgoingBySource={outgoingBySource}
            confirmedRelations={
              confirmedBySource.get(block.article.root.id) ?? []
            }
            isFirst={block.article.root.id === firstArticleId}
          />
        ),
      )}
    </div>
  );
}

// memo でラップし、activeArticleId 変化による親の再描画が
// FullLawViewer（全条文レンダリング）に波及するのを防ぐ。
const FullLawViewer = memo(FullLawViewerImpl);
export default FullLawViewer;
