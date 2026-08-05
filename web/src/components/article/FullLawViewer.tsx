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
  const { registerScrollContainer } = useScrollActiveArticle() ?? {};

  // スクロールコンテナ（<main>）を登録し、scroll ベースのハイライト追従を有効化。
  // FullLawViewer は全文を一度に描画するため、章スクロールとは異なり
  // ここで登録しないと scroll-spy が発火しない。
  useEffect(() => {
    const container = mainRef?.current;
    if (!container || !registerScrollContainer) return;
    return registerScrollContainer(container);
  }, [mainRef, registerScrollContainer]);

  useLayoutEffect(() => {
    window.document
      .querySelector<HTMLElement>(fullLawTargetSelector(targetArticleId))
      ?.scrollIntoView({ block: "start" });
  }, [targetArticleId]);

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
