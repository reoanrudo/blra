/**
 * TocPanel — blra 版。provisions データを直接受け取って目次表示する。
 * hourei-rag の TocTree + TocTreeNode はそのまま使用。
 */

import { useState, useMemo } from "react";
import TocTree from "./TocTree";
import type { ProvisionWithVersion } from "../../api/types";
import type { TocNode } from "../../lib/article/toc-tree";

interface TocPanelProps {
  provisions: ProvisionWithVersion[];
  currentArticleId: string | null;
  onSelect: (provision: ProvisionWithVersion) => void;
}

export default function TocPanel({ provisions, currentArticleId, onSelect }: TocPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // provisions → TocNode ツリー構築
  const nodes = useMemo(() => buildTocNodes(provisions), [provisions]);
  const ancestorIds = useMemo(() => getAncestorIds(nodes, currentArticleId), [nodes, currentArticleId]);

  if (nodes.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <p className="text-xs text-neutral-500">法令データがありません</p>
      </div>
    );
  }

  return (
    <TocTree
      nodes={nodes}
      expandedIds={expandedIds}
      onToggle={(id) => setExpandedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      })}
      currentArticleId={currentArticleId}
      ancestorIds={ancestorIds}
      onArticleClick={(node) => {
        // 条ノードの場合、本文へスクロール
        const prov = provisions.find((p) => p.canonical_path === node.id);
        if (prov) onSelect(prov);
      }}
    />
  );
}

// ARTICLE → TocNode
function buildTocNodes(provisions: ProvisionWithVersion[]): TocNode[] {
  const articles = provisions.filter((p) => p.provision_type === "ARTICLE");
  if (articles.length === 0) return [];

  const nodes: TocNode[] = [];
  let chapterNum = 0;
  let prevParent: number | null = null;

  for (const a of articles) {
    const num = extNum(a.stable_label);
    if (num !== null && num !== prevParent) {
      chapterNum++;
      const cid = `ch-${chapterNum}`;
      nodes.push({
        id: cid, parentId: null, level: "chapter", title: `第${chapterNum}章`,
        articleNumber: null, caption: null, sortOrder: chapterNum,
        depth: 0, path: [chapterNum], textFirstLine: null, paragraphNumber: null,
      });
      prevParent = num;
    }

    const cap = a.version.heading?.replace(/^[（(]/, "").replace(/[）)]$/, "") ?? "";
    nodes.push({
      id: a.canonical_path,
      parentId: prevParent !== null ? `ch-${chapterNum}` : null,
      level: "article",
      title: cap ? `${a.stable_label} ${cap}` : a.stable_label,
      articleNumber: extNumStr(a.stable_label),
      caption: cap || null,
      sortOrder: nodes.length,
      depth: prevParent !== null ? 1 : 0,
      path: [chapterNum, nodes.length],
      textFirstLine: null,
      paragraphNumber: null,
    });
  }
  return nodes;
}

function extNum(label: string): number | null {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extNumStr(label: string): string | null {
  const m = label.match(/(\d+)/);
  return m ? m[1] : null;
}

function getAncestorIds(nodes: TocNode[], targetId: string | null): Set<string> {
  const set = new Set<string>();
  if (!targetId) return set;
  const map = new Map(nodes.map((n) => [n.id, n]));
  let cur = map.get(targetId);
  while (cur?.parentId) {
    set.add(cur.parentId);
    cur = map.get(cur.parentId);
  }
  return set;
}
