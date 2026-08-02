"use client";

import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import RightPanel from "@/components/practice/RightPanel";
import type { LinkItem } from "@/components/practice/LinkExplorer";

interface ScrollAwareRightPanelProps {
  fallbackArticleId: string;
  fallbackIncoming: LinkItem[];
  fallbackOutgoing: LinkItem[];
}

export default function ScrollAwareRightPanel({
  fallbackArticleId,
  fallbackIncoming,
  fallbackOutgoing,
}: ScrollAwareRightPanelProps) {
  const ctx = useScrollActiveArticle();

  // No scroll context → use fallback (single article mode)
  if (!ctx) {
    return (
      <RightPanel
        articleId={fallbackArticleId}
        incoming={fallbackIncoming}
        outgoing={fallbackOutgoing}
      />
    );
  }

  const { activeArticleId, linksByArticle } = ctx;
  const displayId = activeArticleId ?? fallbackArticleId;
  const links = linksByArticle.get(displayId);

  return (
    <RightPanel
      articleId={displayId}
      incoming={links?.incoming ?? []}
      outgoing={links?.outgoing ?? []}
    />
  );
}
