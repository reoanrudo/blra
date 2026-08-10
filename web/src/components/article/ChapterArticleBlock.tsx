"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
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
import { fullLawAnchorId } from "@/lib/article/full-law-document";
import { formatLegalText } from "@/lib/article/legal-display-format";
import { renderTokenNode } from "@/lib/article/legal-token-renderer";
import type { ConfirmedRelation } from "@/lib/relations/confirmed-relation";
import ConfirmedRelationList from "@/components/article/ConfirmedRelationList";

/**
 * キャプション内の条番号（「第六条」「第三十五条の三」等）を検出する正規表現。
 * 「条のX」まで含めて完全にマッチする。
 */
const ARTICLE_REF_PATTERN = /(?:法?)(第[一二三四五六七八九十百千０-９0-9]+条(?:の[一二三四五六七八九十百千０-９0-9]+)?)/g;

/**
 * 漢数字を算用数字に変換する（簡易版）。
 */
function kanjiToArabicSimple(s: string): string {
  const map: Record<string, string> = {
    "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
    "六": "6", "七": "7", "八": "8", "九": "9", "十": "10",
    "十一": "11", "十二": "12", "十三": "13", "十四": "14", "十五": "15",
    "十六": "16", "十七": "17", "十八": "18", "十九": "19", "二十": "20",
    "二十一": "21", "二十二": "22", "二十三": "23", "二十四": "24", "二十五": "25",
    "二十六": "26", "二十七": "27", "二十八": "28", "二十九": "29", "三十": "30",
    "三十一": "31", "三十二": "32", "三十三": "33", "三十四": "34", "三十五": "35",
    "三十六": "36", "三十七": "37", "三十八": "38", "三十九": "39", "四十": "40",
    "四十一": "41", "四十二": "42", "四十三": "43", "四十四": "44", "四十五": "45",
    "四十六": "46", "四十七": "47", "四十八": "48", "四十九": "49", "五十": "50",
    "五十一": "51", "五十二": "52", "五十三": "53", "五十四": "54", "五十五": "55",
    "五十六": "56", "五十七": "57", "五十八": "58", "五十九": "59", "六十": "60",
    "六十一": "61", "六十二": "62", "六十三": "63", "六十四": "64", "六十五": "65",
    "六十六": "66", "六十七": "67", "六十八": "68", "六十九": "69", "七十": "70",
    "七十一": "71", "七十二": "72", "七十三": "73", "七十四": "74", "七十五": "75",
    "七十六": "76", "七十七": "77", "七十八": "78", "七十九": "79", "八十": "80",
    "八十一": "81", "八十二": "82", "八十三": "83", "八十四": "84", "八十五": "85",
    "八十六": "86", "八十七": "87", "八十八": "88", "八十九": "89", "九十": "90",
    "九十一": "91", "九十二": "92", "九十三": "93", "九十四": "94", "九十五": "95",
    "九十六": "96", "九十七": "97", "九十八": "98", "九十九": "99", "百": "100",
  };
  return map[s] ?? s;
}

/**
 * 条参照（「第三十五条の三」等）を算用数字（「第35条の3」）に変換。
 */
function formatArticleRef(refText: string): string {
  return refText.replace(
    /第([一二三四五六七八九十百]+)条(の([一二三四五六七八九十百]+))?/,
    (_match, num: string, _suffix?: string, subNum?: string) => {
      const arabic = kanjiToArabicSimple(num);
      const subArabic = subNum ? `の${kanjiToArabicSimple(subNum)}` : "";
      return `第${arabic}条${subArabic}`;
    },
  );
}

/**
 * マッチした条参照から、DB検索用の articleNumber を抽出。
 * 「第三十五条の三」→「三十五の三」（DBは漢数字で格納されている）
 * 「第九十条の三」→「九十の三」
 */
function extractArticleNumberForSearch(refText: string): string {
  let s = refText.replace(/^第/, "");
  // 「条」または「条のX」を処理
  // 「三十五条の三」→「三十五の三」
  // 「六条」→「六」
  s = s.replace(/条(の.+)?$/, "$1");
  return s;
}

function CaptionWithArticleLinks({
  text,
  lawId,
}: {
  text: string;
  lawId: string;
}) {
  // テキストから条番号を抽出（表示用テキスト + API検索用番号）
  const refs = useMemo(() => {
    const results: { display: string; searchNum: string }[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(ARTICLE_REF_PATTERN);
    while ((m = re.exec(text)) !== null) {
      const display = formatArticleRef(m[1]!);
      const searchNum = extractArticleNumberForSearch(m[1]!);
      if (!results.some((r) => r.display === display)) {
        results.push({ display, searchNum });
      }
    }
    return results;
  }, [text]);

  // by-number API で条番号 → 記事ID を解決
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (refs.length === 0) return;
    let cancelled = false;

    (async () => {
      const newMap = new Map<string, string>();
      await Promise.all(
        refs.map(async (ref) => {
          try {
            const res = await fetch(
              `/api/articles/by-number?q=${encodeURIComponent(ref.searchNum)}&lawId=${encodeURIComponent(lawId)}`,
            );
            if (!res.ok) return;
            const data = await res.json();
            // 同じ法令の記事を優先して選択
            const articles: { id: string; lawId: string }[] = data.articles ?? [];
            const match =
              articles.find((a) => a.lawId === lawId) ?? articles[0];
            if (match && !cancelled) {
              newMap.set(ref.display, match.id);
            }
          } catch {
            // 解決失敗時はリンク化しない
          }
        }),
      );
      if (!cancelled) setResolved(newMap);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.map((r) => r.searchNum).join(",")]);

  // テキストを分割してリンク化
  const parts = useMemo(() => {
    const result: { text: string; articleNumber?: string }[] = [];
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    const re = new RegExp(ARTICLE_REF_PATTERN);
    while ((m = re.exec(text)) !== null) {
      const originalNum = m[1]!;
      const displayNum = formatArticleRef(originalNum);
      if (m.index > lastEnd) {
        result.push({ text: text.slice(lastEnd, m.index) });
      }
      result.push({ text: displayNum, articleNumber: displayNum });
      lastEnd = m.index + originalNum.length;
    }
    if (lastEnd < text.length) {
      result.push({ text: text.slice(lastEnd) });
    }
    return result;
  }, [text]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.articleNumber) {
          const targetId = resolved.get(part.articleNumber);
          if (targetId) {
            return (
              <Link
                key={i}
                href={`/articles/${encodeURIComponent(targetId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {part.text}
              </Link>
            );
          }
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

/**
 * 本文中の「政令」という単語を太字にする。
 * 法令集（冊子）では「政令」が強調表示されることが多い。
 */
function renderInlineFirstParagraph(text: string): ReactNode {
  const parts = text.split(/(政令)/g);
  let textOffset = 0;

  return parts.map((part, i) => {
    const partOffset = textOffset;
    textOffset += part.length;

    if (part === "政令") {
      return <strong key={i} style={{ fontWeight: 700 }}>政令</strong>;
    }

    return formatLegalText(part).map((token, tokenIndex) =>
      renderTokenNode(token, `inline-${i}-${tokenIndex}`, partOffset),
    );
  });
}

interface ChapterArticleBlockProps {
  articleRoot: ArticleRow;
  descendantNodes: ArticleRow[];
  outgoingBySource: Map<string, OutgoingLinkRow[]>;
  confirmedRelations: ConfirmedRelation[];
  isFirst: boolean;
}

export default function ChapterArticleBlock({
  articleRoot,
  descendantNodes,
  outgoingBySource,
  confirmedRelations,
  isFirst,
}: ChapterArticleBlockProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { registerSentinel, unregisterSentinel } = useScrollActiveArticle() ?? {};

  useEffect(() => {
    if (!sentinelRef.current || !registerSentinel) return;
    registerSentinel(articleRoot.id, sentinelRef.current);

    return () => {
      unregisterSentinel?.(articleRoot.id);
    };
  }, [articleRoot.id, registerSentinel, unregisterSentinel]);

  const segments = buildSegments(descendantNodes);
  const label = articleLabel(articleRoot);

  // appdx_table（別表）の場合、text に「別表第X\nタイトル（関係条文）」が
  // 入っている。caption/title カラムには "null" が入っているため、
  // text の2行目以降をキャプションとして抽出して表示する。
  const appdxCaptionText =
    articleRoot.level === "appdx_table" && articleRoot.text
      ? articleRoot.text.split("\n").slice(1).join("\n").trim() || null
      : articleRoot.caption && articleRoot.caption !== "null"
        ? articleRoot.caption
        : null;

  // 別表キャプションの場合、条番号をリンク化して描画。
  // 通常条のキャプション（「（目的）」等）はプレーンテキストのまま。
  const isAppdxCaption = articleRoot.level === "appdx_table" && !!appdxCaptionText;

  // 第1項（ラベルなし paragraph）の本文を条見出しと同じ行に表示するため、
  // segments の最初の node セグメントがラベルなし paragraph の場合、
  // その本文テキストを取り出して見出し行に組み込む。
  const firstParaSeg = segments.find((s) => s.type === "node");
  const isFirstParaInline =
    firstParaSeg &&
    firstParaSeg.type === "node" &&
    firstParaSeg.row.level === "paragraph" &&
    !articleLabel(firstParaSeg.row);
  // インライン表示する第1項の本文（segments から除外して重複を防ぐ）
  const inlineFirstParaText =
    isFirstParaInline && firstParaSeg.type === "node"
      ? firstParaSeg.row.text
      : null;
  const filteredSegments = isFirstParaInline
    ? segments.filter((s) => s !== firstParaSeg)
    : segments;

  return (
    <div
      className="chapter-article-block"
      data-print-article-id={articleRoot.id}
    >
      {/* Sentinel for IntersectionObserver tracking */}
      <div
        id={fullLawAnchorId(articleRoot.id)}
        ref={sentinelRef}
        data-scroll-article-id={articleRoot.id}
        data-article-id={articleRoot.id}
        className="scroll-mt-20"
      />

      {/* Separator between articles */}
      {!isFirst && (
        <div className="chapter-scroll-separator">
          <hr className="border-neutral-200" />
        </div>
      )}

      {/* Article heading */}
      <div className="mb-2 law-body">
        {isAppdxCaption ? (
          /* 別表の場合: 見出し「別表第1」とキャプションを1行に並べる */
          <div className="law-node">
            <p className="law-node__text--article-inline">
              <span className="law-node__label--article-inline">{label}</span>
              <span className="law-node__article-inline-body">
                <span>{"　"}</span>
                <CaptionWithArticleLinks text={appdxCaptionText ?? ""} lawId={articleRoot.lawId} />
              </span>
            </p>
          </div>
        ) : (
          <>
            {appdxCaptionText && (
              <p className="law-article-caption text-sm">
                {appdxCaptionText}
              </p>
            )}
            <div className="law-node">
              <p className="law-node__text--article-inline">
                <span className="law-node__label--article-inline">{label}</span>
                <span className="law-node__article-inline-body">
                  <span>{"　"}</span>
                  {renderInlineFirstParagraph(inlineFirstParaText ?? "")}
                </span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Article body */}
      <div className="law-body">
        {filteredSegments.map((seg) => {
          if (seg.type === "anchor") {
            return (
              <span
                id={fullLawAnchorId(seg.row.id)}
                key={seg.row.id}
                data-article-id={seg.row.id}
                className="block h-0 scroll-mt-20"
                aria-hidden="true"
              />
            );
          }
          if (seg.type === "table") {
            return (
              <TableBlock
                key={seg.table.id}
                tableNode={seg.table}
                rows={seg.rows}
                anchorRows={seg.anchorRows}
              />
            );
          }
          if (seg.type === "definition") {
            return (
              <DefinitionNode
                key={seg.row.id}
                row={seg.row}
                keyword={seg.keyword}
                body={seg.body}
                anchorRows={seg.anchorRows}
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
      <ConfirmedRelationList
        sourceArticleId={articleRoot.id}
        relations={confirmedRelations}
      />
    </div>
  );
}
