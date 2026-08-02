import { prisma } from "@/lib/db";
import {
  getOutgoingLinksForTree,
  getIncomingLinksForTree,
  type OutgoingLinkRow,
  type IncomingLinkRow,
} from "@/lib/link/link";
import { getOrCreateDefaultUser } from "@/lib/system/user";

export interface AnnotationRow {
  id: string;
  articleId: string;
  tag: string | null;
  note: string | null;
}

export interface ChapterAuxResponse {
  outgoingBySource: Record<string, OutgoingLinkRow[]>;
  incomingByTarget: Record<string, IncomingLinkRow[]>;
  annotations: AnnotationRow[];
}

/**
 * 指定ノードID集合に対する注釈・リンクを一括取得（設計書§4.3, §5）
 * 利用者データは表示中Article ID集合に対して必要分だけ取得する。
 *
 * @param nodeIds Article ルート + 子孫のノードID集合
 */
export async function getAuxDataForArticles(
  nodeIds: string[],
): Promise<ChapterAuxResponse> {
  if (nodeIds.length === 0) {
    return { outgoingBySource: {}, incomingByTarget: {}, annotations: [] };
  }
  const userId = await getOrCreateDefaultUser();

  const [outgoing, incoming, annotations] = await Promise.all([
    getOutgoingLinksForTree(nodeIds),
    getIncomingLinksForTree(nodeIds),
    prisma.articleAnnotation.findMany({
      where: { userId, articleId: { in: nodeIds } },
      select: { id: true, articleId: true, tag: true, note: true },
    }),
  ]);

  const outgoingBySource: Record<string, OutgoingLinkRow[]> = {};
  for (const link of outgoing) {
    if (!outgoingBySource[link.sourceId]) outgoingBySource[link.sourceId] = [];
    outgoingBySource[link.sourceId].push(link);
  }
  const incomingByTarget: Record<string, IncomingLinkRow[]> = {};
  for (const link of incoming) {
    const targetId = link.targetId ?? "";
    if (!incomingByTarget[targetId]) incomingByTarget[targetId] = [];
    incomingByTarget[targetId].push(link);
  }

  return {
    outgoingBySource,
    incomingByTarget,
    annotations: annotations.map((a) => ({
      id: a.id,
      articleId: a.articleId,
      tag: a.tag,
      note: a.note,
    })),
  };
}
