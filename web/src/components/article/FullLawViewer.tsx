"use client";

import { useLayoutEffect, useMemo } from "react";
import ChapterArticleBlock from "@/components/article/ChapterArticleBlock";
import { articleDisplayTitle } from "@/lib/article/article";
import {
  buildFullLawBlocks,
  fullLawAnchorId,
  fullLawTargetSelector,
  type FullLawDocument,
} from "@/lib/article/full-law-document";

export default function FullLawViewer({
  document,
  targetArticleId,
}: {
  document: FullLawDocument;
  targetArticleId: string;
}) {
  const blocks = useMemo(
    () => buildFullLawBlocks(document.nodes, document.law.name),
    [document],
  );
  const outgoingBySource = useMemo(
    () => new Map(Object.entries(document.linksBySource)),
    [document.linksBySource],
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
            className="law-heading scroll-mt-20"
          >
            {articleDisplayTitle(block.node)}
          </header>
        ) : (
          <ChapterArticleBlock
            key={block.article.root.id}
            articleRoot={block.article.root}
            descendantNodes={block.article.children}
            outgoingBySource={outgoingBySource}
            isFirst={block.article.root.id === firstArticleId}
          />
        ),
      )}
    </div>
  );
}
