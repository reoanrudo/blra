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

/**
 * テーブルセル用の表示トークン描画。
 * 分数（kind=fraction、または "数字/数字" パターン）を縦表示にする。
 * 法令集（冊子）と同様に、分子を上・分母を下に重ねて表示。
 */
function renderDisplayTokensForTable(text: string): ReactNode {
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  return tokens.map((token, i) => {
    // 分数トークン、または "数字/数字" パターンを縦表示に
    const isFraction = token.kind === "fraction" || /^\d+\/\d+$/.test(token.displayText);
    if (isFraction) {
      const [num, denom] = token.displayText.split("/");
      return (
        <span
          key={`tok-${i}`}
          data-source-start={token.sourceStart}
          data-source-end={token.sourceEnd}
          data-source-kind={token.kind}
          className="law-fraction"
        >
          <span className="law-fraction__num">{num}</span>
          <span className="law-fraction__bar">/</span>
          <span className="law-fraction__denom">{denom}</span>
        </span>
      );
    }
    return (
      <span
        key={`tok-${i}`}
        data-source-start={token.sourceStart}
        data-source-end={token.sourceEnd}
        data-source-kind={token.kind}
      >
        {token.displayText}
      </span>
    );
  });
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
    // タイトルを番号部分（「第1節」等）と名前部分（「総則」等）に分割。
    // 節・款の名前部分はピンク色（law-accent）で表示。
    let headingNumber: string | null = null;
    let headingTitle: string | null = null;
    if (row.title) {
      const m = row.title.match(/^(第[^\s　]+[節款章編部])(?:[\s　]+(.+))?$/);
      if (m) {
        headingNumber = m[1]!;
        headingTitle = m[2] ?? null;
      } else {
        headingTitle = row.title;
      }
    }

    return (
      <h3
        id={fullLawAnchorId(row.id)}
        data-article-id={row.id}
        className={levelHeadingClass(row.level)}
      >
        {headingNumber && <span>{headingNumber}</span>}
        {headingTitle && (
          <>
            {"　"}
            <span className="law-heading__title">{headingTitle}</span>
          </>
        )}
        {row.articleNumber && <span>（第{formatStructuredNumber(row.articleNumber)}条）</span>}
      </h3>
    );
  }

  // Column-level nodes are definition-keyword metadata — rendered via definition segments.
  if (row.level === "column") return null;

  const label = articleLabel(row);
  const indent = levelIndent(row.level);
  // text の先頭のラベル重複を削除。
  // text も半角変換してから比較（label は toHalfWidth 済みのため）。
  const halfWidthText = (row.text ?? "").replace(/（/g, "(").replace(/）/g, ")").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const displayText = stripDuplicatedLeadingLabel(halfWidthText, label);

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
        {label && (
          <span className={["subitem1", "subitem2", "subitem3"].includes(row.level) ? "law-node__label law-node__label--sub" : "law-node__label"}>
            {label}
          </span>
        )}
        {renderedText && (
          <span>
            {/* ラベルがある場合、ラベルと本文の間に全角1字のスペース。
                ラベルがない段落（第1項等）は本文先頭に全角1字のインデント。 */}
            {label ? (
              ["paragraph", "item", "subitem1", "subitem2", "subitem3"].includes(row.level) ? <span>{"　"}</span> : null
            ) : (
              <span>{"　"}</span>
            )}
            {renderedText}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * 各列の最長テキスト長から列幅の比率（パーセント）を計算する。
 *
 * 法令集（冊子）の別表レイアウトを再現するため、列幅を内容の長さに
 * 比例して配分する。短い見出し列（「（い）」「（ろ）」等）は狭く、
 * 長い説明列は広くなる。
 *
 * ただし、テキスト長ゼロの列にも最低幅を保証し、極端に長い列が
 * 全体を占有しないよう上限も設ける。
 */
function computeColWidths(
  rows: { row: ArticleRow; cells: ArticleRow[] }[],
): string[] {
  // colspan 等でセル数が異なる場合、最大セル数の行のみを使って
  // 列幅を計算する（ヘッダー行の colspan を除外するため）。
  const maxCells = rows.reduce((max, tr) => Math.max(max, tr.cells.length), 0);
  const uniformRows = rows.filter((tr) => tr.cells.length === maxCells);
  const colCount = maxCells;
  if (colCount === 0) return [];

  // 各列の最長テキスト長
  const maxLens: number[] = new Array(colCount).fill(0);
  // 各列の全テキストが短い見出し（4文字以下、ただし分数「1/5」等は除外）かどうか
  const isShortCol: boolean[] = new Array(colCount).fill(true);
  // 分数列（全行が分数パターン or 空）かどうか
  const isFractionCol: boolean[] = new Array(colCount).fill(true);
  for (const tr of uniformRows) {
    tr.cells.forEach((cell, ci) => {
      const text = (cell.text ?? "").trim();
      const len = text.length;
      if (len > maxLens[ci]!) maxLens[ci] = len;
      // 分数（/ を含む）や5文字以上は短い見出し扱いしない
      if (len > 4 || text.includes("/")) isShortCol[ci] = false;
      // 空でなく分数パターンでなければ分数列ではない。
      // DB上は漢数字分数（「五分の一」等）、表示時は算用数字（「1/5」）。
      const isFractionText = /^\d+\/\d+$/.test(text) || /^[一二三四五六七八九十百]+分の[一二三四五六七八九十百]+$/.test(text);
      if (text && !isFractionText) isFractionCol[ci] = false;
    });
  }

  // 短い見出し列（(1)（い）等、全行4文字以下）は固定ピクセル幅。
  // table-layout:auto でも px 指定の col は尊重されやすい。
  // それ以外の列は内容に応じたパーセント配分。
  const weights = maxLens.map((len, ci) => {
    if (isShortCol[ci] || isFractionCol[ci]) return 0; // 固定px列は重み計算から除外
    return Math.sqrt(Math.max(len, 2));
  });
  const total = weights.reduce((a, b) => a + b, 0);

  return maxLens.map((len, ci) => {
    if (isFractionCol[ci]) {
      // 分数列は固定幅（縦分数+padding）
      return "48px";
    }
    if (isShortCol[ci]) {
      // 内容幅 + padding(8px) を概算。3文字まで対応。
      return "32px";
    }
    const pct = total > 0 ? (weights[ci]! / total) * 100 : 100 / colCount;
    return `${pct.toFixed(1)}%`;
  });
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
  const colWidths = computeColWidths(rows);

  // 全行中の最大セル数を求める。
  // セル数が最大に満たない行（ヘッダー行等）は、最初のセルに
  // colspan を付けて列を合わせる。法令集（冊子）と同様に、
  // 「居室の種類」が2列分をカバーし「割合」が最終列に揃うようにする。
  const maxCells = rows.reduce((max, tr) => Math.max(max, tr.cells.length), 0);

  // 最終列の空セルを上の非空セルと縦結合（rowspan）するための事前計算。
  // 法令集（冊子）では、割合が空の行が上の分数セルと結合されて表示される。
  // 対象: 全行が同じセル数（maxCells）の表のみ。
  const lastColIndex = maxCells - 1;
  const skipCells = new Set<string>(); // スキップするセルID
  const rowSpans = new Map<string, number>(); // セルID → rowspan数
  // rowspan 対象: 最大セル数の行のみで計算（colspan行は除外）
  const uniformRowsForSpan = rows.filter((tr) => tr.cells.length === maxCells);
  if (lastColIndex > 0 && uniformRowsForSpan.length > 1) {
    let i = 0;
    while (i < uniformRowsForSpan.length) {
      const cell = uniformRowsForSpan[i]!.cells[lastColIndex];
      const text = (cell?.text ?? "").trim();
      if (text) {
        // 非空セル: 連続する空セルを数える
        let span = 1;
        let j = i + 1;
        while (j < uniformRowsForSpan.length) {
          const nextCell = uniformRowsForSpan[j]!.cells[lastColIndex];
          const nextText = (nextCell?.text ?? "").trim();
          if (nextText) break;
          skipCells.add(nextCell!.id);
          span++;
          j++;
        }
        if (span > 1) rowSpans.set(cell!.id, span);
        i = j;
      } else {
        i++;
      }
    }
  }

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
        {colWidths.length > 0 && (
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        <tbody>
          {rows.map((tr, ri) => {
            // 1行目が全て短い見出し（（い）（ろ）等、4文字以下）の場合のみ
            // header-row として中央配置・背景色を付ける。
            // 表1のように1行目が既に実質データ（地域名+用途リスト）の場合は
            // header-row にせず、通常データ行と同様に左寄せにする。
            const hasHeaderFirstRow =
              rows.length > 0 &&
              rows[0]!.cells.length > 0 &&
              rows[0]!.cells.every(
                (c) => (c.text ?? "").trim().length <= 4,
              );
            const isHeaderRow = ri === 0 && hasHeaderFirstRow;
            const isSubHeaderRow = ri === 1 && hasHeaderFirstRow;
            const rowClass = isHeaderRow
              ? "law-table__header-row"
              : isSubHeaderRow
                ? "law-table__sub-header-row"
                : "";
            return (
            <tr
              id={fullLawAnchorId(tr.row.id)}
              key={tr.row.id}
              data-article-id={tr.row.id}
              className={rowClass}
            >
              {tr.cells.map((td, ci) => {
                // 縦結合でスキップ対象のセルはレンダリングしない
                if (skipCells.has(td.id)) return null;

                // 短い見出しセル（「（い）」「（ろ）」「（1）」等、4文字以下）
                // は折り返さず1行で収める。列幅を最小化して説明列に幅を譲る。
                const isShortLabel = (td.text ?? "").trim().length <= 4;
                // 分数セル（漢数字分数「五分の一」等）かどうか
                const isFractionCell = /^[一二三四五六七八九十百]+分の[一二三四五六七八九十百]+$/.test((td.text ?? "").trim());
                // テキスト内に改行（\n）を含むセルは pre-line で改行を保持。
                // 法令集（冊子）と同様に、番号付き項目を数字で改行して表示。
                const hasLineBreaks = (td.text ?? "").includes("\n");

                // セル数が最大列数に満たない場合、最初のセルに colspan を付けて
                // 列を合わせる（残りのセルは右端に揃える）。
                const cellCount = tr.cells.length;
                const colspan = cellCount < maxCells && ci === 0
                  ? maxCells - cellCount + 1
                  : undefined;

                // 最終列の縦結合（rowspan）
                const rowspan = rowSpans.get(td.id);

                const cellClass = `law-table__cell border border-neutral-400 px-2 py-1.5 align-top leading-relaxed${isShortLabel ? " law-table__cell--nowrap" : ""}${hasLineBreaks ? " law-table__cell--preline" : ""}${ri === 0 ? (colspan ? " law-table__cell--header-wide" : " law-table__cell--header") : ""}${isFractionCell ? " law-table__cell--fraction" : ""}`;

                return (
                  <td
                    key={td.id}
                    id={fullLawAnchorId(td.id)}
                    data-article-id={td.id}
                    className={cellClass}
                    colSpan={colspan}
                    rowSpan={rowspan}
                    style={{
                      ...(isShortLabel && !colspan ? { width: "1%" } : {}),
                      ...(isFractionCell ? { width: "48px" } : {}),
                      ...(colspan ? { textAlign: "center", verticalAlign: "middle" } : {}),
                      ...(rowspan ? { verticalAlign: "middle" } : {}),
                      ...(ri === 0 ? { textAlign: "center", verticalAlign: "middle" } : {}),
                    }}
                  >
                    {td.text && renderDisplayTokensForTable(td.text)}
                  </td>
                );
              })}
            </tr>
            );
          })}
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

  // body も半角変換してから描画（articleLabel と同じ変換）。
  const halfWidthBody = body
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

  const renderedBody =
    outgoingLinks.length > 0
      ? renderToElements(
          renderLinkSegments(halfWidthBody, outgoingLinks),
          undefined,
          (articleId) => `/articles/${encodeURIComponent(articleId)}`,
        )
      : renderDisplayTokens(halfWidthBody);

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
      <p className="law-node__text law-node__text--definition">
        {label && <span className="law-node__label">{label}</span>}
        <span className="law-node__definition-body">
          {/* 定義語の前に全角1字のスペース */}
          <span>{"　"}</span>
          <strong
            style={{
              fontFamily: '"Hiragino Sans", "Yu Gothic", system-ui, sans-serif',
              fontWeight: 600,
            }}
          >
            {keyword}
          </strong>
          {/* 定義語の後に全角1字のインデント */}
          <span>{"　"}</span>
          {renderedBody}
        </span>
      </p>
    </div>
  );
}
