"use client";

import { useRef, useEffect } from "react";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import {
  ArticleNode,
  DefinitionNode,
  TableBlock,
  buildSegments,
} from "@/lib/article/article-renderer";
import type { ArticleRow } from "@/lib/article/article";
import type { OutgoingLinkRow } from "@/lib/link/link";
import { articleLabel } from "@/lib/article/article";
import { fullLawAnchorId } from "@/lib/article/full-law-document";
import type { ConfirmedRelation } from "@/lib/relations/confirmed-relation";
import ConfirmedRelationList from "@/components/article/ConfirmedRelationList";

interface ChapterArticleBlockProps {
  articleRoot: ArticleRow;
  descendantNodes: ArticleRow[];
  outgoingBySource: Map<string, OutgoingLinkRow[]>;
  confirmedRelations: ConfirmedRelation[];
  isFirst: boolean;
}

export default function ChapterArticleBlock({
  articleRoot,
  descendantNodes,
  outgoingBySource,
  confirmedRelations,
  isFirst,
}: ChapterArticleBlockProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { registerSentinel, unregisterSentinel } = useScrollActiveArticle() ?? {};

  useEffect(() => {
    if (!sentinelRef.current || !registerSentinel) return;
    registerSentinel(articleRoot.id, sentinelRef.current);

    return () => {
      unregisterSentinel?.(articleRoot.id);
    };
  }, [articleRoot.id, registerSentinel, unregisterSentinel]);

  const segments = buildSegments(descendantNodes);
  const label = articleLabel(articleRoot);

  return (
    <div className="chapter-article-block">
      {/* Sentinel for IntersectionObserver tracking */}
      <div
        id={fullLawAnchorId(articleRoot.id)}
        ref={sentinelRef}
        data-scroll-article-id={articleRoot.id}
        data-article-id={articleRoot.id}
        className="scroll-mt-20"
      />

      {/* Separator between articles */}
      {!isFirst && (
        <div className="chapter-scroll-separator">
          <hr className="border-neutral-200" />
        </div>
      )}

      {/* Article heading */}
      <div className="mb-2">
        <h2 className="law-article-title text-lg">
          {label}
        </h2>
        {articleRoot.caption && (
          <p className="law-article-caption text-sm">{articleRoot.caption}</p>
        )}
      </div>

      {/* Article body */}
      <div className="law-body">
        {segments.map((seg) => {
          if (seg.type === "anchor") {
            return (
              <span
                id={fullLawAnchorId(seg.row.id)}
                key={seg.row.id}
                data-article-id={seg.row.id}
                className="block h-0 scroll-mt-20"
                aria-hidden="true"
              />
            );
          }
          if (seg.type === "table") {
            return (
              <TableBlock
                key={seg.table.id}
                tableNode={seg.table}
                rows={seg.rows}
                anchorRows={seg.anchorRows}
              />
            );
          }
          if (seg.type === "definition") {
            return (
              <DefinitionNode
                key={seg.row.id}
                row={seg.row}
                keyword={seg.keyword}
                body={seg.body}
                anchorRows={seg.anchorRows}
                outgoingLinks={outgoingBySource.get(seg.row.id) ?? []}
              />
            );
          }
          return (
            <ArticleNode
              key={seg.row.id}
              row={seg.row}
              outgoingLinks={outgoingBySource.get(seg.row.id) ?? []}
            />
          );
        })}
      </div>
      <ConfirmedRelationList
        sourceArticleId={articleRoot.id}
        relations={confirmedRelations}
      />
    </div>
  );
}
