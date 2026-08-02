"use client";

import {
  articleLabel,
  isHeadingLevel,
  type ArticleRow,
} from "@/lib/article/article";
import {
  type OutgoingLinkRow,
} from "@/lib/link/link";
import { renderLinkSegments, renderToElements } from "@/lib/link/link-renderer";
import { formatLegalText } from "@/lib/article/legal-display-format";
import { formatStructuredNumber } from "@/lib/article/legal-number-format";
import { fullLawAnchorId } from "@/lib/article/full-law-document";
import type { ReactNode } from "react";

/**
 * リンクのない本文テキストを表示トークン化して描画する（設計書§3）。
 *
 * 全トークン（plain含む）に data-source-start/data-source-end 属性を付与した span で囲む。
 * これにより任意の文字列選択が原文座標へ逆変換でき、ハイライトが機能する（設計書§6.2, §6.3）。
 */
function renderDisplayTokens(text: string): ReactNode {
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  // 全トークンを span で囲む（plainトークンも含む）
  // data-source-kind は選択座標計算で使用: plain は表示テキスト=原文のため offset 直接計算、
  // number/unit/fraction は変換トークンのため一部選択でも全体へ拡張する。
  return tokens.map((token, i) => (
    <span
      key={`tok-${i}`}
      data-source-start={token.sourceStart}
      data-source-end={token.sourceEnd}
      data-source-kind={token.kind}
    >
      {token.displayText}
    </span>
  ));
}

export function levelIndent(level: string): string {
  switch (level) {
    case "paragraph":
      return "ml-4 sm:ml-6";
    case "item":
      return "ml-8 sm:ml-10";
    case "subitem1":
      return "ml-12 sm:ml-14";
    case "subitem2":
      return "ml-16 sm:ml-20";
    case "subitem3":
      return "ml-20 sm:ml-24";
    case "column":
      return "ml-4 sm:ml-6";
    default:
      return "";
  }
}

export function levelHeadingClass(level: string): string {
  switch (level) {
    case "chapter":
      return "law-heading law-heading--chapter";
    case "section":
      return "law-heading law-heading--section";
    case "subsection":
      return "law-heading law-heading--subsection";
    default:
      return "";
  }
}

export function stripDuplicatedLeadingLabel(
  text: string | null,
  label: string,
): string | null {
  if (!text || !label) return text;

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^${escapedLabel}[\\s　]+`), "");
}

export function ArticleNode({
  row,
  outgoingLinks,
}: {
  row: ArticleRow;
  outgoingLinks: OutgoingLinkRow[];
}) {
  if (isHeadingLevel(row.level)) {
    return (
      <h3
        id={fullLawAnchorId(row.id)}
        data-article-id={row.id}
        className={levelHeadingClass(row.level)}
      >
        {row.title && <span>{row.title}</span>}
        {row.articleNumber && <span>（第{formatStructuredNumber(row.articleNumber)}条）</span>}
      </h3>
    );
  }

  // Column-level nodes are definition-keyword metadata — rendered via definition segments.
  if (row.level === "column") return null;

  const label = articleLabel(row);
  const indent = levelIndent(row.level);
  const displayText = stripDuplicatedLeadingLabel(row.text, label);

  const renderedText =
    displayText && outgoingLinks.length > 0
      ? renderToElements(
          renderLinkSegments(displayText, outgoingLinks),
          undefined,
          (articleId) => `/articles/${encodeURIComponent(articleId)}`,
        )
      : displayText
        ? renderDisplayTokens(displayText)
        : null;

  return (
    <div
      id={fullLawAnchorId(row.id)}
      className={`${indent} law-node scroll-mt-20`}
      data-article-id={row.id}
      data-original-text={displayText ?? ""}
    >
      {row.level === "article" && row.caption && (
        <p className="law-node__caption">{row.caption}</p>
      )}
      <p className="law-node__text">
        {label && <span className="law-node__label">{label}</span>}
        {renderedText && <span>{renderedText}</span>}
      </p>
    </div>
  );
}

export type RenderSegment =
  | { type: "node"; row: ArticleRow }
  | { type: "definition"; row: ArticleRow; keyword: string; body: string }
  | {
      type: "table";
      table: ArticleRow;
      rows: { row: ArticleRow; cells: ArticleRow[] }[];
    };

export function buildSegments(children: ArticleRow[]): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let i = 0;

  while (i < children.length) {
    const row = children[i];

    if (row.level === "table_struct") {
      i++;
      continue;
    }

    if (row.level === "table") {
      const tableDepth = row.depth;
      const tableDescendants: ArticleRow[] = [];
      i++;
      while (i < children.length && children[i].depth > tableDepth) {
        tableDescendants.push(children[i]);
        i++;
      }

      // Build parent→children map for proper row/cell grouping
      const byParent = new Map<string, ArticleRow[]>();
      for (const d of tableDescendants) {
        if (!d.parentId) continue;
        const list = byParent.get(d.parentId);
        if (list) list.push(d);
        else byParent.set(d.parentId, [d]);
      }
      Array.from(byParent.values()).forEach((list) => {
        list.sort((a, b) => a.sortOrder - b.sortOrder);
      });

      const tableRows = (byParent.get(row.id) ?? [])
        .filter((r) => r.level === "table_row")
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const structuredRows = tableRows.map((tr) => ({
        row: tr,
        cells: (byParent.get(tr.id) ?? []).filter(
          (c) => c.level === "table_column",
        ),
      }));

      if (structuredRows.length > 0) {
        segments.push({ type: "table", table: row, rows: structuredRows });
      }
      continue;
    }

    if (row.level === "table_row" || row.level === "table_column" || row.level === "column") {
      i++;
      continue;
    }

    // Detect definition items: item with column(keyword) + column(body) children
    if (row.level === "item") {
      let colIdx = i + 1;
      let keyword: string | null = null;
      let body: string | null = null;
      while (colIdx < children.length && children[colIdx].level === "column" && children[colIdx].parentId === row.id) {
        const col = children[colIdx];
        if (col.articleNumber === "1") keyword = col.text?.trim() ?? null;
        if (col.articleNumber === "2") body = col.text?.trim() ?? null;
        colIdx++;
      }
      if (keyword && body) {
        segments.push({ type: "definition", row, keyword, body });
        i = colIdx;
        continue;
      }
    }

    segments.push({ type: "node", row });
    i++;
  }

  return segments;
}

export function TableBlock({
  tableNode,
  rows,
}: {
  tableNode: ArticleRow;
  rows: { row: ArticleRow; cells: ArticleRow[] }[];
}) {
  if (rows.length === 0) return null;

  return (
    <div
      id={fullLawAnchorId(tableNode.id)}
      data-article-id={tableNode.id}
      className="law-table-wrapper my-4 scroll-mt-20 overflow-x-auto"
    >
      <table className="law-table w-full border-collapse text-xs">
        <tbody>
          {rows.map((tr, ri) => (
            <tr
              id={fullLawAnchorId(tr.row.id)}
              key={tr.row.id}
              data-article-id={tr.row.id}
              className={ri === 0 ? "law-table__header-row" : ""}
            >
              {tr.cells.map((td) => (
                <td
                  key={td.id}
                  id={fullLawAnchorId(td.id)}
                  data-article-id={td.id}
                  className="law-table__cell border border-neutral-400 px-2 py-1.5 align-top leading-relaxed"
                >
                  {td.text && renderDisplayTokens(td.text)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DefinitionNode({
  row,
  keyword,
  body,
  outgoingLinks,
}: {
  row: ArticleRow;
  keyword: string;
  body: string;
  outgoingLinks: OutgoingLinkRow[];
}) {
  const indent = levelIndent(row.level);
  const label = articleLabel(row);

  const renderedBody =
    outgoingLinks.length > 0
      ? renderToElements(
          renderLinkSegments(body, outgoingLinks),
          undefined,
          (articleId) => `/articles/${encodeURIComponent(articleId)}`,
        )
      : renderDisplayTokens(body);

  return (
    <div
      id={fullLawAnchorId(row.id)}
      className={`${indent} law-node scroll-mt-20`}
      data-article-id={row.id}
      data-original-text={body}
    >
      <p className="law-node__text">
        {label && <span className="law-node__label">{label}</span>}
        <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <strong className="mr-3" style={{ fontWeight: 700 }}>{keyword}</strong>
          {renderedBody}
        </span>
      </p>
    </div>
  );
}
