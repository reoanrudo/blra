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
export { buildSegments } from "@/lib/article/article-segments";
import type { TableCellStyle } from "@/lib/law-refresh/types";
import type { ReactNode } from "react";

/**
 * tableMetadata JSON 文字列を TableCellStyle へパースする。
 * 不正な JSON や想定外の形式の場合は null（従来の均一罫線へフォールバック）。
 */
function parseTableCellStyle(raw: string | null): TableCellStyle | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TableCellStyle>;
    if (
      typeof parsed.borderTop !== "string" ||
      typeof parsed.borderBottom !== "string" ||
      typeof parsed.borderLeft !== "string" ||
      typeof parsed.borderRight !== "string"
    ) {
      return null;
    }
    return {
      borderTop: parsed.borderTop,
      borderRight: parsed.borderRight,
      borderBottom: parsed.borderBottom,
      borderLeft: parsed.borderLeft,
      colspan: typeof parsed.colspan === "number" ? parsed.colspan : 1,
      rowspan: typeof parsed.rowspan === "number" ? parsed.rowspan : 1,
    };
  } catch {
    return null;
  }
}

/**
 * TableCellStyle から各辺の罫線クラスを生成する。
 */
function borderClasses(style: TableCellStyle): string {
  return [
    style.borderTop === "solid" ? "border-t border-neutral-400" : "border-t-0",
    style.borderRight === "solid" ? "border-r border-neutral-400" : "border-r-0",
    style.borderBottom === "solid" ? "border-b border-neutral-400" : "border-b-0",
    style.borderLeft === "solid" ? "border-l border-neutral-400" : "border-l-0",
  ].join(" ");
}

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

export function TableBlock({
  tableNode,
  rows,
  anchorRows,
}: {
  tableNode: ArticleRow;
  rows: { row: ArticleRow; cells: ArticleRow[] }[];
  anchorRows: ArticleRow[];
}) {
  return (
    <div
      id={fullLawAnchorId(tableNode.id)}
      data-article-id={tableNode.id}
      className="law-table-wrapper my-4 scroll-mt-20 overflow-x-auto"
    >
      {anchorRows.map((anchor) => (
        <span
          id={fullLawAnchorId(anchor.id)}
          key={anchor.id}
          data-article-id={anchor.id}
          className="block h-0 scroll-mt-20"
          aria-hidden="true"
        />
      ))}
      <table className="law-table w-full border-collapse text-xs">
        <tbody>
          {rows.map((tr) => (
            <tr
              id={fullLawAnchorId(tr.row.id)}
              key={tr.row.id}
              data-article-id={tr.row.id}
            >
              {tr.cells.map((td) => {
                const style = parseTableCellStyle(td.tableMetadata);
                const cellClassName = style
                  ? `law-table__cell ${borderClasses(style)} px-2 py-1.5 align-top leading-relaxed`
                  : "law-table__cell border border-neutral-400 px-2 py-1.5 align-top leading-relaxed";
                return (
                  <td
                    key={td.id}
                    id={fullLawAnchorId(td.id)}
                    data-article-id={td.id}
                    className={cellClassName}
                    colSpan={style?.colspan && style.colspan > 1 ? style.colspan : undefined}
                    rowSpan={style?.rowspan && style.rowspan > 1 ? style.rowspan : undefined}
                  >
                    {td.text && renderDisplayTokens(td.text)}
                  </td>
                );
              })}
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
  anchorRows,
  outgoingLinks,
}: {
  row: ArticleRow;
  keyword: string;
  body: string;
  anchorRows: ArticleRow[];
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
      {anchorRows.map((anchor) => (
        <span
          id={fullLawAnchorId(anchor.id)}
          key={anchor.id}
          data-article-id={anchor.id}
          className="block h-0 scroll-mt-20"
          aria-hidden="true"
        />
      ))}
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
