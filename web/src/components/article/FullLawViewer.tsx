"use client";

import { memo, useLayoutEffect, useMemo } from "react";
import ChapterArticleBlock from "@/components/article/ChapterArticleBlock";
import { articleDisplayTitle } from "@/lib/article/article";
import { levelHeadingClass } from "@/lib/article/article-renderer";
import {
  buildFullLawBlocks,
  fullLawAnchorId,
  fullLawTargetSelector,
  type FullLawDocument,
} from "@/lib/article/full-law-document";
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
            {articleDisplayTitle(block.node)}
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
