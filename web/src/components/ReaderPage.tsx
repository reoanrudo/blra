/**
 * ReaderPage — hourei-rag ArticleLayout + blra API データ取得の統合。
 *
 * ArticleLayout（hourei-rag）のスロットに blra の API データを流し込む。
 */

import ArticleLayout from "./article/ArticleLayout";
import LeftPanel from "./layout/LeftPanel";
import ChapterArticleBlock from "./article/ChapterArticleBlock";
import { ScrollActiveArticleProvider } from "../contexts/ScrollActiveArticleContext";
import type { ProvisionWithVersion, ReferenceEdge } from "../api/types";
import {
  useSource,
  useProvisions,
  useReferences,
} from "../api/queries";

interface ReaderPageProps {
  sourceId: string;
  focusArticle?: string;
}

export function ReaderPage({ sourceId, focusArticle }: ReaderPageProps) {
  const sourceQuery = useSource(sourceId);
  const provisionsQuery = useProvisions(sourceId);

  const provisions: ProvisionWithVersion[] =
    provisionsQuery.data?.ok ? provisionsQuery.data.data : [];

  // フォーカス条の決定
  const articles = provisions.filter((p) => p.provision_type === "ARTICLE");
  const focusPath = focusArticle ?? articles[0]?.canonical_path ?? null;

  const focusBodyProvision = (() => {
    const fp = articles.find((p) => p.canonical_path === focusPath);
    if (!fp) return null;
    if (fp.version.body.trim().length > 0) return fp;
    return provisions.find(
      (p) =>
        p.canonical_path.startsWith(fp.canonical_path + "/") &&
        p.version.body.trim().length > 0,
    ) ?? null;
  })();

  const referencesQuery = useReferences(focusBodyProvision?.provision_id ?? null);
  const references: ReferenceEdge[] = referencesQuery.data?.ok ? referencesQuery.data.data : [];

  const sourceData = sourceQuery.data?.ok ? sourceQuery.data.data : null;

  // 条文を article グループに分割
  const articleGroups = groupProvisionsByArticle(provisions);
  const focusIndex = articleGroups.findIndex((g) => g.article.canonical_path === focusPath);
  const displayGroups = focusIndex >= 0
    ? [...articleGroups.slice(focusIndex), ...articleGroups.slice(0, focusIndex)].slice(0, 5)
    : articleGroups.slice(0, 5);

  if (provisionsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-neutral-500">読み込み中…</p>
      </div>
    );
  }

  if (!provisionsQuery.data?.ok) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">条文データの取得に失敗しました。</p>
      </div>
    );
  }

  return (
    <ScrollActiveArticleProvider>
      <ArticleLayout
          breadcrumb={<div className="text-xs text-neutral-500">{sourceData?.title ?? "法令"}</div>}
          currentArticle={null}
          leftPanel={
            <LeftPanel
              provisions={provisions}
              onSelectArticle={(p) => {
                const el = document.querySelector<HTMLElement>(
                  `[data-scroll-article-id="${CSS.escape(p.canonical_path)}"]`,
                );
                if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            />
          }
          center={
            <div className="p-6">
              <div className="max-w-3xl mx-auto">
                <div className="law-page">
                  {displayGroups.map((group, i) => (
                    <ChapterArticleBlock
                      key={group.article.provision_id}
                      articleRoot={toArticleRow(group.article)}
                      descendantNodes={group.children.map(toArticleRow)}
                      outgoingBySource={new Map()}
                      isFirst={i === 0}
                    />
                  ))}
                </div>
              </div>
            </div>
          }
          rightPanel={
            <div className="p-4 text-xs text-neutral-500">
              {references.length > 0 ? `${references.length}件の関連` : "関連はありません"}
            </div>
          }
        />
      </ScrollActiveArticleProvider>
  );
}

// ── ヘルパー ──────────────────────────────────────────

/** flat provisions → [{ article, children }] */
function groupProvisionsByArticle(provisions: ProvisionWithVersion[]) {
  const groups: { article: ProvisionWithVersion; children: ProvisionWithVersion[] }[] = [];
  let cur: typeof groups[0] | null = null;
  for (const p of provisions) {
    if (p.provision_type === "ARTICLE") {
      if (cur) groups.push(cur);
      cur = { article: p, children: [] };
    } else if (cur) {
      cur.children.push(p);
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

/** ProvisionWithVersion → hourei-rag ArticleRow 型に変換 */
function toArticleRow(p: ProvisionWithVersion) {
  return {
    id: p.provision_id,
    parentId: null,
    level: provisionTypeToLevel(p.provision_type),
    articleNumber: p.stable_label.replace(/^第/, "").replace(/条.*$/, ""),
    articleNumberNormalized: null,
    paragraphNumber: p.provision_type === "PARAGRAPH" ? p.stable_label : null,
    itemNumber: p.provision_type === "ITEM" ? p.stable_label : null,
    subitemNumber: null,
    columnNumber: null,
    tableCoords: null,
    title: p.version.heading,
    caption: p.version.heading,
    text: p.version.body,
    articleCaptionNormalized: null,
    sortOrder: 0,
    depth: 0,
    lawId: p.source_id,
    lawName: "",
    regulationType: null,
    stableNodeKey: p.canonical_path,
    lawRevisionId: "",
  };
}

function provisionTypeToLevel(t: string): string {
  switch (t) {
    case "ARTICLE": return "article";
    case "PARAGRAPH": return "paragraph";
    case "ITEM": return "item";
    case "TABLE": return "table";
    case "SUPPLEMENTARY": return "suppl_provision";
    default: return "paragraph";
  }
}
