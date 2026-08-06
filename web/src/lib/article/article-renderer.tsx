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
 */
function renderDisplayTokens(text: string): ReactNode {
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

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
 * 分数（"数字/数字" パターン）を縦表示にする。
 */
function renderDisplayTokensForTable(text: string): ReactNode {
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  return tokens.map((token, i) => {
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

/**
 * テーブルセル用の表示トークン描画。
 * 「政令」を太字にする。
 */
/**
 * 法令番号・条項番号・階数・数量の漢数字をアラビア数字に変換し、
 * 単位を記号化する（formatLegalText相当の変換をrawモードで実行）。
 */
function convertLawNumber(text: string): string {
  let result = text;

  // 全角括弧を半角に変換
  result = result.replace(/（/g, "(").replace(/）/g, ")");

  // 法令番号: 元号+漢数字+年法律第+漢数字+号
  result = result.replace(
    /([明治大正昭和平成令和])([一二三四五六七八九十百千零〇]+)年法律第([一二三四五六七八九十百千零〇]+)号/g,
    (_m, era, year, num) => `${era}${kanjiToNumber(year)}年法律第${kanjiToNumber(num)}号`,
  );

  // 条項号: 第+漢数字+(条|項|号|章|節|款|編|部)
  result = result.replace(
    /第([一二三四五六七八九十百千零〇]+)(条|項|号|章|節|款|編|部)/g,
    (_m, num, unit) => `第${kanjiToNumber(num)}${unit}`,
  );

  // 括弧付き番号: （一）（二）（四の二）… → (1)(2)(4-2)…
  result = result.replace(
    /（([一二三四五六七八九十百零〇]+(?:の[一二三四五六七八九十百零〇]+)?)）/g,
    (_m, num) => {
      const parts = num.split("の");
      const converted = parts.map((p: string) => String(kanjiToNumber(p))).join("の");
      return `(${converted})`;
    },
  );

  // 単独の小数表記: 一・五→1.5、一・二五→1.25、〇・七五→0.75
  const decMap: Record<string, string> = {
    "〇": "0", "零": "0", "一": "1", "二": "2", "三": "3",
    "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
  };
  result = result.replace(
    /([〇零一二三四五六七八九])[・.]([〇零一二三四五六七八九]+)/g,
    (_m, intPart: string, decPart: string) => {
      return (decMap[intPart] ?? "0") + "." + decPart.split("").map((ch: string) => decMap[ch] ?? ch).join("");
    },
  );

  // 階数: 漢数字+階 → 数字+階
  result = result.replace(
    /([一二三四五六七八九十百零〇]+)階/g,
    (_m, num) => `${kanjiToNumber(num)}階`,
  );

  // 単位の記号化（長い順に処理して部分置換を防ぐ）
  const unitMap: [string, string][] = [
    ["平方メートル", "m²"],
    ["立方メートル", "m³"],
    ["ミリメートル", "mm"],
    ["センチメートル", "cm"],
    ["キロワット", "kW"],
    ["リットル", "L"],
    ["メートル", "m"],
  ];
  for (const [from, to] of unitMap) {
    result = result.replaceAll(from, to);
  }

  // 数量+単位: 漢数字または「〇・七五」等の小数表記+(m²|m³|kW|L|m) → 数字+単位
  // 「〇・七五」→0.75、「一・五」→1.5
  // 10000以上は「万」表記（10000→1万、15000→1.5万）
  result = result.replace(
    /([一二三四五六七八九十百千万零〇・]+)(m²|m³|kW|L|m)/g,
    (_m, num: string, unit: string) => {
      // 小数表記（「〇・七五」等）の処理
      if (num.includes("・")) {
        const [intPart, decPart] = num.split("・");
        const intNum = kanjiToNumber(intPart);
        // 小数部の各桁を数字に変換
        const decMap: Record<string, string> = {
          "零": "0", "〇": "0", "一": "1", "二": "2", "三": "3",
          "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
        };
        const decStr = decPart.split("").map((ch: string) => decMap[ch] ?? ch).join("");
        return `${intNum}.${decStr}${unit}`;
      }
      const n = kanjiToNumber(num);
      if (n >= 10000) {
        const man = n / 10000;
        return `${Number.isInteger(man) ? man : man.toFixed(1)}万${unit}`;
      }
      return `${n}${unit}`;
    },
  );

  return result;
}

function kanjiToNumber(kanji: string): number {
  // 「万」で区切って下位・上位に分けて処理
  const parts = kanji.split("万");
  if (parts.length === 2) {
    const lower = parseKanjiSmall(parts[1] || "");
    const upper = parseKanjiSmall(parts[0] || "一");
    return upper * 10000 + lower;
  }
  return parseKanjiSmall(kanji);
}

function parseKanjiSmall(kanji: string): number {
  const digitMap: Record<string, number> = {
    "零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
  };
  const unitMap: Record<string, number> = { "十": 10, "百": 100, "千": 1000 };
  let result = 0;
  let current = 0;
  for (const ch of kanji) {
    if (digitMap[ch] !== undefined) {
      current = digitMap[ch];
    } else if (unitMap[ch] !== undefined) {
      if (current === 0) current = 1;
      result += current * unitMap[ch];
      current = 0;
    }
  }
  return result + current;
}

function renderTableCellContent(text: string, raw?: boolean): ReactNode {
  // raw=true の場合は formatLegalText（半角変換等）をスキップして元のテキストを表示。
  // ただし法令番号（「昭和二十三年法律第百二十二号」等）の漢数字は
  // アラビア数字（「昭和23年法律第122号」）に変換する。
  if (raw) {
    // 法令番号パターン: 「（元号XX年法律第YY号）」→「（元号XX年法律第YY号）」
    const converted = convertLawNumber(text);
    const parts = converted.split(/(政令)/g);
    return parts.map((part, j) =>
      part === "政令" ? (
        <strong key={`b-${j}`} style={{ fontWeight: 700 }}>政令</strong>
      ) : (
        <span key={`p-${j}`}>{part}</span>
      ),
    );
  }
  const tokens = formatLegalText(text);
  if (tokens.length === 0) return null;

  return tokens.map((token, i) => {
    // 分数（"数字/数字" パターン）は縦表示
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
      className="law-table-wrapper my-4 scroll-mt-20"
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
      <table className="law-table border-collapse text-xs">
        <colgroup>
          {(() => {
            if (!rows[0]) return null;
            // colspanを展開した実際のグリッド列数を計算
            const numCols = rows[0].cells.reduce((sum, cell) => {
              const meta = cell.tableMetadata ? safeParseCellStyle(cell.tableMetadata) : null;
              return sum + (meta?.colspan ?? 1);
            }, 0);
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
            // 欄記号列の幅（全別表共通）
            const NARROW_COL_PX = 35;
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
              // 列0（欄記号）は全表共通で35px固定
              // 別表第三はrowspanで長文が列0に入るため強制的に35px
              if (i === 0 && (colDataLens[0] <= 4 || isTable3 || isTable4)) {
                return <col key={i} style={{ width: "35px" }} />;
              }
              // 別表第四: PCのみ列幅固定、スマホは比率配分
              if (isTable4 && !isMobile && i === 1) {
                return <col key={i} style={{ width: "100px" }} />;
              }
              if (isTable4 && !isMobile && i === 2) {
                return <col key={i} style={{ width: "40px" }} />;
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
              const fixedTotal = ((colDataLens[0] <= 4 || isTable3 || isTable4) ? 35 : 0)
                + (isTable1 && !isMobile && numCols > 2 ? 120 : 0)
                + (isTable2 && !isMobile && numCols > 1 ? 270 : 0)
                + (isTable3 && !isMobile && numCols > 4 ? 240 : 0)
                + (isTable4 && !isMobile ? 305 : 0)
                + (isTable4 ? 35 : 0);
              const widePcts = colPcts.map((p, j) => {
                if (j === 0 && (colDataLens[0] <= 4 || isTable3 || isTable4)) return 0;
                if (isTable4 && j === 5) return 0;
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
        <tbody>
          {rows.map((tr, rowIdx) => {
            const isHeaderRow = rowIdx < 2;
            return (
            <tr
              id={fullLawAnchorId(tr.row.id)}
              key={tr.row.id}
              data-article-id={tr.row.id}
              className={isHeaderRow ? "law-table__header-row" : undefined}
            >
              {tr.cells.map((td, cellIdx) => {
                const isDataCell = !isHeaderRow;
                const style = parseTableCellStyle(td.tableMetadata);
                const cellIsMobile = typeof window !== "undefined" && window.innerWidth <= 640;
                const trimmedText = (td.text ?? "").trim();
                // 空セルは幅を最小限に圧縮する。
                const isEmptyCell = trimmedText === "";
                // 数値セル判定（括弧前改行の適用条件でも使用）
                const hasRefText = trimmedText.includes("項") || trimmedText.includes("号");
                const isNumeric = !hasRefText && (
                  /[０-９0-9㎡²%]/.test(trimmedText) ||
                  trimmedText.includes("平方メートル") ||
                  trimmedText.includes("立方メートル") ||
                  trimmedText.includes("キロワット") ||
                  trimmedText.includes("時間") ||
                  /^[一二三四五六七八九十百千万・]+メートル$/.test(trimmedText) ||
                  /^[一二三四五六七八九十百千万・]+メートル以上$/.test(trimmedText)
                );
                // テキスト内に改行（\n）を含むセルは pre-line で改行を保持。
                const hasLineBreaks = (td.text ?? "").includes("\n") || (isNumeric && cellIsMobile);
                const preLine = hasLineBreaks ? " whitespace-pre-line" : "";
                // 改行なし・10文字以内のテキスト（「（い）」「三階以上の階」等）は
                // 折り返さず1行で収める。
                const isNoWrap =
                  isDataCell &&
                  trimmedText !== "" &&
                  trimmedText.length <= 10 &&
                  !trimmedText.includes("\n");
                // セルの水平配置をテキスト内容で判定
                const isSymbol = /^[（(].+[）)]$/.test(trimmedText) || trimmedText.length <= 4;
                // 「階」を含む短いテキスト（三階以上の階 等）は中央揃え
                // ※データ行のみ適用（ヘッダー行は除外）
                // 「階」判定は先頭行のみ（長文の途中に「階」が含まれていても無視）
                const firstLine = trimmedText.split("\n")[0] ?? "";
                const isFloorText = isDataCell && firstLine.includes("階") && !isNumeric && firstLine.length <= 10;
                const shouldCenter = isSymbol || isFloorText;
                // 数値セルは右揃え、欄記号は中央、本文は左揃え
                const cellAlign = isNumeric ? "text-right" : shouldCenter ? "text-center" : "text-left";
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
                const cellClassName = style
                  ? `law-table__cell ${borderClasses(style)} px-2 py-1.5 leading-relaxed${preLine}${cellModifier}`
                  : `law-table__cell border border-neutral-400 px-2 py-1.5 leading-relaxed${preLine}${cellModifier}`;
                return (
                  <td
                    key={td.id}
                    id={fullLawAnchorId(td.id)}
                    data-article-id={td.id}
                    className={cellClassName}
                    colSpan={style?.colspan && style.colspan > 1 ? style.colspan : undefined}
                    rowSpan={style?.rowspan && style.rowspan > 1 ? style.rowspan : undefined}
                    style={
                      isEmptyCell ? { width: "1%" } : undefined
                    }
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
