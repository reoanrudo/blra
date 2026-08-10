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
import { formatRawTableCellText } from "@/lib/article/raw-table-text-format";
import { splitArithFormulaLayout } from "@/lib/article/arith-formula-layout";
import { fullLawAnchorId } from "@/lib/article/full-law-document";
import { renderTokenNode, renderTokenNodes } from "@/lib/article/legal-token-renderer";
import {
  preferredLeadingColumnWidthPx,
  preferredOrderSymbolColumnWidthPx,
  preferredTrailingColumnWidthPx,
  supplementalRoomTypeTableCellLayout,
} from "@/lib/article/table-column-width";
import {
  deriveTableLayout,
  expandTableRows,
  getTableHeaderRowCount,
  usesLegacyLawTableLayout,
} from "@/lib/article/table-layout";
export { buildSegments } from "@/lib/article/article-segments";
import type { TableCellStyle } from "@/lib/law-refresh/types";
import type { ReactNode } from "react";

/**
/** tableMetadataからcolspan/rowspanのみを取り出す軽量パーサー */
function safeParseCellStyle(raw: string | null): { colspan: number; rowspan: number } | null {
  if (!raw) return null;
  try {
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
    return {
      colspan: typeof parsed.colspan === "number" ? parsed.colspan : 1,
      rowspan: typeof parsed.rowspan === "number" ? parsed.rowspan : 1,
    };
  } catch {
    return null;
  }
}

/**
 * tableMetadata JSON 文字列を TableCellStyle へパースする。
 * 不正な JSON や想定外の形式の場合は null（従来の均一罫線へフォールバック）。
 */
function parseTableCellStyle(raw: string | null): TableCellStyle | null {
  if (!raw) return null;
  try {
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<TableCellStyle>;
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
 * 分数トークンは縦分数表示（.law-fraction）として描画される。
 */
function renderDisplayTokens(text: string, textOffset: number = 0): ReactNode {
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  return renderTokenNodes(tokens, "tok", textOffset);
}

function renderArithFormula(text: string): ReactNode | null {
  const layout = splitArithFormulaLayout(text);
  if (!layout) return null;

  return (
    <span className="law-arith-formula">
      <span className="law-arith-formula__introduction">
        {renderDisplayTokens(layout.introduction, layout.introductionStart)}
      </span>
      <span className="law-arith-formula__expression">
        {renderDisplayTokens(layout.formula, layout.formulaStart)}
      </span>
      <span className="law-arith-formula__definitions">
        <span className="law-arith-formula__definitions-text">
          {renderDisplayTokens(layout.definitions, layout.definitionsStart)}
        </span>
      </span>
    </span>
  );
}

/**
 * テーブルセル用の表示トークン描画。
 * 分数（"数字/数字" パターン）を縦表示にする。
 * renderTokenNodes と同じロジックを使用（共通化）。
 */
function renderDisplayTokensForTable(text: string): ReactNode {
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  return renderTokenNodes(tokens, "ttok");
}

function renderTableCellContent(text: string, raw?: boolean): ReactNode {
  // raw=true の場合は formatLegalText（半角変換等）をスキップして元のテキストを表示。
  // ただし法令番号（「昭和二十三年法律第百二十二号」等）の漢数字は
  // アラビア数字（「昭和23年法律第122号」）に変換する。
  if (raw) {
    const converted = formatRawTableCellText(text);
    // 行ごとに分割して、号番号（一　二　三　…）で始まる行をインデント付きで改行表示
    const lines = converted.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      // 単一行の場合は従来通り（左寄せ）
      const parts = converted.split(/(政令)/g);
      return (
        <span style={{ textAlign: "left" }}>
          {parts.map((part, j) =>
            part === "政令" ? (
              <strong key={`b-${j}`} style={{ fontWeight: 700 }}>政令</strong>
            ) : (
              <span key={`p-${j}`}>{part}</span>
            ),
          )}
        </span>
      );
    }
    // 複数行: 各行をブロックとして描画し、2行目以降にインデント
    return lines.map((line, idx) => {
      const parts = line.split(/(政令)/g);
      const isFirst = idx === 0;
      return (
        <span
          key={`line-${idx}`}
          style={{
            display: "block",
            textAlign: "left",
            paddingLeft: isFirst ? 0 : "1.5em",
            textIndent: isFirst ? 0 : "-1.5em",
          }}
        >
          {parts.map((part, j) =>
            part === "政令" ? (
              <strong key={`b-${idx}-${j}`} style={{ fontWeight: 700 }}>政令</strong>
            ) : (
              <span key={`p-${idx}-${j}`}>{part}</span>
            ),
          )}
        </span>
      );
    });
  }
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  return tokens.map((token, i) => {
    // 分数（"数字/数字" パターン）は縦表示（共通ヘルパーを使用）
    const isFraction = token.kind === "fraction" || /^\d+\/\d+$/.test(token.displayText);
    if (isFraction) {
      return renderTokenNode(token, `tok-${i}`);
    }
    // 数字トークン間の「・」を小数点「.」に置換
    const displayText = token.displayText === "・" ? "." : token.displayText;
    const parts = displayText.split(/(政令)/g);
    return (
      <span
        key={`tok-${i}`}
        data-source-start={token.sourceStart}
        data-source-end={token.sourceEnd}
        data-source-kind={token.kind}
      >
        {parts.map((part, j) =>
          part === "政令" ? (
            <strong key={`b-${j}`} style={{ fontWeight: 700 }}>政令</strong>
          ) : (
            <span key={`p-${j}`}>{part}</span>
          ),
        )}
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

  const arithFormula = displayText && outgoingLinks.length === 0
    ? renderArithFormula(displayText)
    : null;
  const renderedText = arithFormula ?? (
    displayText && outgoingLinks.length > 0
      ? renderToElements(
          renderLinkSegments(displayText, outgoingLinks),
          undefined,
          (articleId) => `/articles/${encodeURIComponent(articleId)}`,
        )
      : displayText
        ? renderDisplayTokens(displayText)
        : null
  );

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
      <p className={`law-node__text${arithFormula ? " law-node__text--arith-formula" : ""}`}>
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
              arithFormula
                ? null
                : ["paragraph", "item", "subitem1", "subitem2", "subitem3"].includes(row.level)
                  ? <span>{"　"}</span>
                  : null
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

export function TableBlock({
  tableNode,
  rows,
  anchorRows,
}: {
  tableNode: ArticleRow;
  rows: { row: ArticleRow; cells: ArticleRow[] }[];
  anchorRows: ArticleRow[];
}) {
  const tableCellLayoutRows = rows.map(({ cells }, rowIndex) =>
      cells.flatMap((cell, cellIndex) => {
        const supplementalLayout = supplementalRoomTypeTableCellLayout({
          lawName: tableNode.lawName,
          stableNodeKey: tableNode.stableNodeKey,
          rows,
          rowIndex,
          cellIndex,
        });
        if (supplementalLayout?.hidden) return [];
        const metadata = safeParseCellStyle(cell.tableMetadata);
        return [{
          text: cell.text ?? "",
          colspan: supplementalLayout?.colSpan ?? metadata?.colspan ?? 1,
          rowspan: supplementalLayout?.rowSpan ?? metadata?.rowspan ?? 1,
        }];
      }),
    );
  const tableLayoutRows = expandTableRows(tableCellLayoutRows);
  const tableLayout = deriveTableLayout({
    rows: tableLayoutRows,
  });
  const headerRowCount = getTableHeaderRowCount(tableCellLayoutRows);
  // 建築基準法・施行令・施行規則の表は既存の法令集レイアウトを維持する。
  // 対象外の法令表だけ、情報量に応じた均等配分を適用する。
  const useLegacyLawTableLayout = usesLegacyLawTableLayout({
    lawName: tableNode.lawName,
    stableNodeKey: tableNode.stableNodeKey,
  });
  const useBalancedLayout = !useLegacyLawTableLayout;
  const headerRows = rows.slice(0, headerRowCount);

  return (
    <div
      id={fullLawAnchorId(tableNode.id)}
      data-article-id={tableNode.id}
      className={`law-table-wrapper my-4 scroll-mt-20${useLegacyLawTableLayout ? " law-table-wrapper--legacy" : ""}`}
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
      <table className={`law-table border-collapse text-xs${useLegacyLawTableLayout ? " law-table--legacy" : ""}`}>
        <colgroup>
          {useBalancedLayout
            ? tableLayout.columns.map((column, index) => (
              <col key={index} style={{ width: `${column.widthPercent}%` }} />
            ))
            : (() => {
            if (!rows[0]) return null;
            // colspanを展開した実際のグリッド列数を計算
            const numCols = useLegacyLawTableLayout
              ? rows[0].cells.reduce((sum, cell) => {
                const meta = cell.tableMetadata
                  ? safeParseCellStyle(cell.tableMetadata)
                  : null;
                return sum + (meta?.colspan ?? 1);
              }, 0)
              : Math.max(
                ...rows.map(({ cells }) =>
                  cells.reduce((sum, cell) => {
                    const meta = cell.tableMetadata
                      ? safeParseCellStyle(cell.tableMetadata)
                      : null;
                    return sum + (meta?.colspan ?? 1);
                  }, 0),
                ),
              );
            // 各列のデータ行（3行目以降）の最長テキスト長を計算。
            // データ行がない場合は全行から計算。
            const colDataLens: number[] = [];
            for (let c = 0; c < numCols; c++) {
              let maxLen = 0;
              for (let r = 0; r < rows.length; r++) {
                const t = (rows[r].cells[c]?.text ?? "").trim();
                if (!t) continue;
                const lines = t.split("\n");
                const longestLine = Math.max(...lines.map((l) => l.trim().length));
                if (longestLine > maxLen) maxLen = longestLine;
              }
              colDataLens.push(maxLen);
            }
            // 別表ごとに欄記号列の幅を個別設定。
            // tableNode.stableNodeKey から appdx_table 番号で識別。
            const appdxMatch = (tableNode.stableNodeKey ?? "").match(/appdx_table:(\d+)/);
            const appdxNum = appdxMatch ? parseInt(appdxMatch[1], 10) : null;
            // 列幅: 列0=35px固定（全表共通）
            // すべてパーセンテージ指定（画面サイズが変わっても列幅比率を維持）
            const isTable1 = appdxNum === 128;
            const isTable2 = appdxNum === 129;
            const isTable3 = appdxNum === 130;
            const isTable4 = appdxNum === 131;
            // 別表第一: 列0=4%、列2=14%、列1=36%、列3=23%、列4=23%
            // スマホ(640px以下)は列0・列2を広めに設定
            // それ以外: 列0=4%、残りはテキスト長で比率配分
            const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
            const preferredLeadingWidthPx = preferredLeadingColumnWidthPx({
              lawName: tableNode.lawName,
              stableNodeKey: tableNode.stableNodeKey,
              isMobile,
            });
            const preferredTrailingWidthPx = preferredTrailingColumnWidthPx({
              lawName: tableNode.lawName,
              stableNodeKey: tableNode.stableNodeKey,
              isMobile,
            });
            const preferredOrderSymbolWidths = Array.from(
              { length: numCols },
              (_, index) => preferredOrderSymbolColumnWidthPx({
                lawName: tableNode.lawName,
                stableNodeKey: tableNode.stableNodeKey,
                isSymbolColumn: tableLayout.columns[index]?.kind === "symbol",
                hasParenthesizedItem: tableLayoutRows.some((row) =>
                  /^[(（][^()（）]{1,8}[)）]$/.test((row[index] ?? "").trim()),
                ),
              }),
            );
            const colPcts: number[] = [];
            if (isTable1 && numCols === 5) {
              colPcts.push(...(isMobile ? [8, 32, 18, 21, 21] : [4, 36, 14, 23, 23]));
            } else if (isTable2 && numCols === 3) {
              colPcts.push(...(isMobile ? [8, 35, 57] : [4, 28, 68]));
            } else {
              // 汎用: 列0=4%、残りをテキスト長で配分
              const narrowPct = 4;
              const wideWeights = colDataLens.map((len) => len <= 4 ? 0 : Math.sqrt(len));
              const wideTotal = wideWeights.reduce((a, b) => a + b, 0);
              const remaining = 100 - narrowPct * colDataLens.filter((l) => l <= 4).length;
              for (let i = 0; i < numCols; i++) {
                if (colDataLens[i] <= 4) {
                  colPcts.push(narrowPct);
                } else {
                  colPcts.push((wideWeights[i] / wideTotal) * remaining);
                }
              }
            }
            return colPcts.map((pct, i) => {
              if (preferredOrderSymbolWidths[i] !== null) {
                return <col key={i} style={{ width: `${preferredOrderSymbolWidths[i]}px` }} />;
              }
              if (i === 0 && preferredLeadingWidthPx !== null) {
                return <col key={i} style={{ width: `${preferredLeadingWidthPx}px` }} />;
              }
              if (i === numCols - 1 && preferredTrailingWidthPx !== null) {
                return <col key={i} style={{ width: `${preferredTrailingWidthPx}px` }} />;
              }
              // 列0（欄記号）は全表共通で35px固定
              // 別表第三はrowspanで長文が列0に入るため強制的に35px
              if (i === 0 && (colDataLens[0] <= 4 || isTable3 || isTable4)) {
                return <col key={i} style={{ width: "35px" }} />;
              }
              // 別表第四: PCのみ列幅固定、スマホは比率配分
              if (isTable4 && !isMobile && i === 1) {
                return <col key={i} style={{ width: "100px" }} />;
              }
              if (isTable4 && i === 2) {
                return <col key={i} style={{ width: "35px" }} />;
              }
              if (isTable4 && !isMobile && i === 3) {
                return <col key={i} style={{ width: "95px" }} />;
              }
              if (isTable4 && !isMobile && i === 4) {
                return <col key={i} style={{ width: "70px" }} />;
              }
              if (isTable4 && i === 5) {
                return <col key={i} style={{ width: "35px" }} />;
              }
              // 別表第一の列2（中程度テキスト）はPCのみ120px固定
              if (isTable1 && i === 2 && !isMobile) {
                return <col key={i} style={{ width: "120px" }} />;
              }
              // 別表第二の列1（地域名）はPCのみ270px固定
              if (isTable2 && i === 1 && !isMobile) {
                return <col key={i} style={{ width: "270px" }} />;
              }
              // 別表第三の列3・4（距離・数値）はPCのみ120px固定
              if (isTable3 && (i === 3 || i === 4) && !isMobile) {
                return <col key={i} style={{ width: "120px" }} />;
              }
              // 残り列はテーブル幅から固定列を引いて比率配分
              const orderSymbolFixedTotal = preferredOrderSymbolWidths.reduce<number>(
                (total, width) => total + (width ?? 0),
                0,
              );
              const fixedTotal = orderSymbolFixedTotal
                + (preferredOrderSymbolWidths[0] === null
                  ? (preferredLeadingWidthPx ?? ((colDataLens[0] <= 4 || isTable3 || isTable4) ? 35 : 0))
                  : 0)
                + (preferredTrailingWidthPx ?? 0)
                + (isTable1 && !isMobile && numCols > 2 ? 120 : 0)
                + (isTable2 && !isMobile && numCols > 1 ? 270 : 0)
                + (isTable3 && !isMobile && numCols > 4 ? 240 : 0)
                + (isTable4 && !isMobile ? 265 : 0)
                + (isTable4 ? 70 : 0);
              const widePcts = colPcts.map((p, j) => {
                if (preferredOrderSymbolWidths[j] !== null) return 0;
                if (j === 0 && preferredLeadingWidthPx !== null) return 0;
                if (j === numCols - 1 && preferredTrailingWidthPx !== null) return 0;
                if (j === 0 && (colDataLens[0] <= 4 || isTable3 || isTable4)) return 0;
                if (isTable4 && (j === 2 || j === 5)) return 0;
                if (isTable4 && !isMobile && (j === 1 || j === 2 || j === 3 || j === 4)) return 0;
                if (isTable1 && !isMobile && j === 2) return 0;
                if (isTable2 && !isMobile && j === 1) return 0;
                if (isTable3 && !isMobile && (j === 3 || j === 4)) return 0;
                return p;
              });
              const wideSum = widePcts.reduce((a, b) => a + b, 0);
              const ratio = (widePcts[i] / wideSum).toFixed(4);
              return (
                <col key={i} style={{ width: `calc((100% - ${fixedTotal}px) * ${ratio})` }} />
              );
            });
            })()}
        </colgroup>
        {headerRows.length > 0 && (
          <thead>
            {headerRows.map((headerRow, rowIdx) => (
              <tr
                id={fullLawAnchorId(headerRow.row.id)}
                key={headerRow.row.id}
                data-article-id={headerRow.row.id}
                className="law-table__header-row"
              >
              {headerRow.cells.map((td, cellIdx) => {
                const supplementalLayout = supplementalRoomTypeTableCellLayout({
                  lawName: tableNode.lawName,
                  stableNodeKey: tableNode.stableNodeKey,
                  rows,
                  rowIndex: rowIdx,
                  cellIndex: cellIdx,
                });
                if (supplementalLayout?.hidden) return null;
                const style = parseTableCellStyle(td.tableMetadata);
                const isTable2 = (tableNode.stableNodeKey ?? "").includes("appdx_table:129");
                const trimmedText = (td.text ?? "").trim();
                const isEmptyCell = trimmedText === "";
                const hasRefText = trimmedText.includes("項") || trimmedText.includes("号");
                const isNumeric = useLegacyLawTableLayout && !hasRefText && !isTable2 && (
                  /[０-９0-9㎡²%]/.test(trimmedText) ||
                  trimmedText.includes("平方メートル") ||
                  trimmedText.includes("立方メートル") ||
                  trimmedText.includes("キロワット") ||
                  trimmedText.includes("時間") ||
                  /^[一二三四五六七八九十百千万・]+メートル$/.test(trimmedText) ||
                  /^[一二三四五六七八九十百千万・]+メートル以上$/.test(trimmedText)
                );
                const isSymbol = useLegacyLawTableLayout && (
                  /^[（(].+[）)]$/.test(trimmedText) || trimmedText.length <= 4
                );
                const cellAlign = supplementalLayout?.textAlign === "center"
                  ? "text-center"
                  : isNumeric
                    ? "text-right"
                    : isSymbol
                      ? "text-center"
                      : "text-left";
                const legacyCellClass = isEmptyCell
                  ? " px-2 py-1.5 leading-relaxed law-table__cell--empty"
                  : ` px-2 py-1.5 leading-relaxed align-middle ${cellAlign}`;
                const cellClassName = style
                  ? `law-table__cell ${borderClasses(style)}${useLegacyLawTableLayout ? legacyCellClass : " law-table__cell--body"}`
                  : `law-table__cell border border-neutral-400${useLegacyLawTableLayout ? legacyCellClass : " law-table__cell--body"}`;
                return (
                  <td
                    key={td.id}
                    id={fullLawAnchorId(td.id)}
                    data-article-id={td.id}
                    className={cellClassName}
                    colSpan={supplementalLayout?.colSpan ?? (style?.colspan && style.colspan > 1 ? style.colspan : undefined)}
                    rowSpan={supplementalLayout?.rowSpan ?? (style?.rowspan && style.rowspan > 1 ? style.rowspan : undefined)}
                    style={useLegacyLawTableLayout && isEmptyCell ? { width: "1%" } : undefined}
                  >
                    {td.text && renderTableCellContent(
                      isNumeric && typeof window !== "undefined" && window.innerWidth <= 640
                        ? td.text.replace(/（/g, "\n（").replace(/）/g, "）\n")
                        : td.text,
                      isTable2,
                    )}
                  </td>
                );
              })}
              </tr>
            ))}
          </thead>
        )}
        <tbody>
          {rows.slice(headerRowCount).map((tr, bodyRowIdx) => {
            const rowIdx = bodyRowIdx + headerRowCount;
            const isHeaderRow = false;
            return (
            <tr
              id={fullLawAnchorId(tr.row.id)}
              key={tr.row.id}
              data-article-id={tr.row.id}
              className={isHeaderRow ? "law-table__header-row" : undefined}
            >
              {tr.cells.map((td, cellIdx) => {
                const supplementalLayout = supplementalRoomTypeTableCellLayout({
                  lawName: tableNode.lawName,
                  stableNodeKey: tableNode.stableNodeKey,
                  rows,
                  rowIndex: rowIdx,
                  cellIndex: cellIdx,
                });
                if (supplementalLayout?.hidden) return null;

                const isDataCell = !isHeaderRow;
                const style = parseTableCellStyle(td.tableMetadata);
                const cellIsMobile = typeof window !== "undefined" && window.innerWidth <= 640;
                const trimmedText = (td.text ?? "").trim();
                const isEmptyCell = trimmedText === "";
                const columnKind = tableLayout.columns[cellIdx]?.kind ?? "body";
                // 数値セル判定（括弧前改行の適用条件でも使用）
                const hasRefText = trimmedText.includes("項") || trimmedText.includes("号");
                // 別表第二（appdx_table:129）のセルは本文テキストを含むため数値判定から除外
                const isTable2 = (tableNode.stableNodeKey ?? "").includes("appdx_table:129");
                const isNumeric = !hasRefText && !isTable2 && (
                  useLegacyLawTableLayout
                    ? (
                      /[０-９0-9㎡²%]/.test(trimmedText) ||
                      trimmedText.includes("平方メートル") ||
                      trimmedText.includes("立方メートル") ||
                      trimmedText.includes("キロワット") ||
                      trimmedText.includes("時間") ||
                      /^[一二三四五六七八九十百千万・]+メートル$/.test(trimmedText) ||
                      /^[一二三四五六七八九十百千万・]+メートル以上$/.test(trimmedText)
                    )
                    : columnKind === "numeric"
                );
                // テキスト内に改行（\n）を含むセルは pre-line で改行を保持。
                const hasLineBreaks = (td.text ?? "").includes("\n") || (isNumeric && cellIsMobile);
                const preLine = hasLineBreaks ? " whitespace-pre-line" : "";
                // セルの水平配置をテキスト内容で判定
                const isSymbol = useLegacyLawTableLayout
                  ? /^[（(].+[）)]$/.test(trimmedText) || trimmedText.length <= 4
                  : columnKind === "symbol";
                // 旧レイアウトは幅の狭い列で本文・数値セルが表の横幅を
                // 押し広げないよう、短い括弧付き欄記号だけを非折返しにする。
                // 対象外の法令表は従来どおり短いテキストを1行に保つ。
                const isNoWrap = useLegacyLawTableLayout
                  ? isDataCell &&
                    trimmedText !== "" &&
                    /^[（(].+[）)]$/.test(trimmedText) &&
                    trimmedText.length <= 4 &&
                    !trimmedText.includes("\n")
                  : isDataCell &&
                    trimmedText !== "" &&
                    trimmedText.length <= 10 &&
                    !trimmedText.includes("\n");
                // 「階」を含む短いテキスト（三階以上の階 等）は中央揃え
                // ※データ行のみ適用（ヘッダー行は除外）
                // 「階」判定は先頭行のみ（長文の途中に「階」が含まれていても無視）
                const firstLine = trimmedText.split("\n")[0] ?? "";
                const isFloorText = isDataCell && firstLine.includes("階") && !isNumeric && firstLine.length <= 10;
                const shouldCenter = isSymbol || isFloorText;
                // 数値セルは右揃え、欄記号は中央、本文は左揃え
                const cellAlign = supplementalLayout?.textAlign === "center"
                  ? "text-center"
                  : isNumeric
                    ? "text-right"
                    : shouldCenter
                      ? "text-center"
                      : "text-left";
                // 別表第二の列1は左揃え・上下中央
                const isTable2Col1 = (tableNode.stableNodeKey ?? "").includes("appdx_table:129") && cellIdx === 1;
                // 別表第三・別表第四は全セル上下中央（rowspan構造のためcellIdxが信頼できない）
                const isTable3Cell = (tableNode.stableNodeKey ?? "").includes("appdx_table:130");
                const isTable4Cell = (tableNode.stableNodeKey ?? "").includes("appdx_table:131");
                const cellVAlign = (isNoWrap || shouldCenter || isNumeric || isHeaderRow || isTable2Col1 || isTable3Cell || isTable4Cell) ? "align-middle" : "align-top";
                const cellNoWrap = isNoWrap;
                // 別表第二の列2で番号ごとの改行「\n」を含む場合のみインデント
                const hasManualLineBreaks = (td.text ?? "").includes("\n");
                const isTable2Col2Indent = false;
                const indentClass = isTable2Col2Indent ? " law-table__cell--indent" : "";
                const cellModifier = cellNoWrap
                  ? ` law-table__cell--nowrap ${cellVAlign} ${cellAlign}${indentClass}`
                  : isEmptyCell
                    ? " law-table__cell--empty"
                    : ` ${cellVAlign} ${cellAlign}${indentClass}`;
                const roleClass = ` law-table__cell--${columnKind}`;
                const legacyCellClass = ` px-2 py-1.5 leading-relaxed${preLine}${cellModifier}`;
                const cellClassName = style
                  ? `law-table__cell ${borderClasses(style)}${useLegacyLawTableLayout ? legacyCellClass : `${roleClass}${preLine}${cellModifier}`}`
                  : `law-table__cell border border-neutral-400${useLegacyLawTableLayout ? legacyCellClass : `${roleClass}${preLine}${cellModifier}`}`;
                return (
                  <td
                    key={td.id}
                    id={fullLawAnchorId(td.id)}
                    data-article-id={td.id}
                    className={cellClassName}
                    colSpan={supplementalLayout?.colSpan ?? (style?.colspan && style.colspan > 1 ? style.colspan : undefined)}
                    rowSpan={supplementalLayout?.rowSpan ?? (style?.rowspan && style.rowspan > 1 ? style.rowspan : undefined)}
                    style={useLegacyLawTableLayout && isEmptyCell ? { width: "1%" } : undefined}
                  >
                    {td.text && renderTableCellContent(
                      (() => {
                        let text = td.text;
                        // スマホの数値セル内は括弧で改行
                        if (isNumeric && cellIsMobile) {
                          text = text.replace(/（/g, "\n（").replace(/）/g, "）\n");
                        }
                        return text;
                      })(),
                      // 別表第二は元の漢数字テキストをそのまま表示
                      (tableNode.stableNodeKey ?? "").includes("appdx_table:129")
                    )}
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
  // ラベル重複を削除（ArticleNode と同じ処理）。
  // さらに body 先頭の keyword（定義語）も削除（keyword は別途太字表示されるため）。
  const halfWidthBody = body
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const labelStripped = stripDuplicatedLeadingLabel(halfWidthBody, label) ?? halfWidthBody;
  // 先頭の keyword を削除（「建築物土地に…」→「土地に…」）
  const strippedBody = keyword && labelStripped.startsWith(keyword)
    ? labelStripped.slice(keyword.length)
    : labelStripped;

  const renderedBody =
    outgoingLinks.length > 0
      ? renderToElements(
          renderLinkSegments(strippedBody, outgoingLinks),
          undefined,
          (articleId) => `/articles/${encodeURIComponent(articleId)}`,
        )
      : renderDisplayTokens(strippedBody);

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
            {renderDisplayTokens(keyword)}
          </strong>
          {/* 定義語の後に全角1字のインデント */}
          <span>{"　"}</span>
          {renderedBody}
        </span>
      </p>
    </div>
  );
}
