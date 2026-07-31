
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
import { consumePendingTocScroll } from "@/lib/article/toc-scroll";

interface ChapterArticleBlockProps {
  articleRoot: ArticleRow;
  descendantNodes: ArticleRow[];
  outgoingBySource: Map<string, OutgoingLinkRow[]>;
  isFirst: boolean;
}

export default function ChapterArticleBlock({
  articleRoot,
  descendantNodes,
  outgoingBySource,
  isFirst,
}: ChapterArticleBlockProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { registerSentinel, unregisterSentinel } = useScrollActiveArticle() ?? {};

  useEffect(() => {
    if (!sentinelRef.current || !registerSentinel) return;
    registerSentinel(articleRoot.id, sentinelRef.current);

    // 目次クリックによる別章遷移後のスクロール: 自分がターゲットなら上端へ即時ジャンプ
    let rafId = 0;
    if (consumePendingTocScroll(articleRoot.id)) {
      // block:"start" で自分の上端へ。後にマウントされる兄弟ブロックは自分より下なので位置ずれしない
      rafId = window.requestAnimationFrame(() => {
        sentinelRef.current?.scrollIntoView({ block: "start" });
      });
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      unregisterSentinel?.(articleRoot.id);
    };
  }, [articleRoot.id, registerSentinel, unregisterSentinel]);

  const segments = buildSegments(descendantNodes);
  const label = articleLabel(articleRoot);

  return (
    <div className="chapter-article-block">
      {/* Sentinel for IntersectionObserver tracking */}
      <div
        ref={sentinelRef}
        data-scroll-article-id={articleRoot.id}
        className="scroll-mt-20"
      />

      {/* Separator between articles */}
      {!isFirst && (
        <div className="chapter-scroll-separator">
          <hr className="border-neutral-200" />
          <span className="chapter-scroll-separator__badge">
            {label || articleRoot.caption || ""}
          </span>
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
          if (seg.type === "table") {
            return <TableBlock key={seg.rows[0]?.row.id ?? "table"} rows={seg.rows} />;
          }
          if (seg.type === "definition") {
            return (
              <DefinitionNode
                key={seg.row.id}
                row={seg.row}
                keyword={seg.keyword}
                body={seg.body}
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
    </div>
  );
}
