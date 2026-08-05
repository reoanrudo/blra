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
import type { ConfirmedRelation } from "@/lib/relations/confirmed-relation";
import ConfirmedRelationList from "@/components/article/ConfirmedRelationList";

/**
 * キャプション内の条番号（「第六条」「第二十一条の二」等）を検出する正規表現。
 * 法令の条番号パターンにマッチする。
 */
const ARTICLE_REF_PATTERN = /(?:法?)(第[一二三四五六七八九十百千０-９0-9]+(?:の[一二三四五六七八九十百千０-９0-9]+)*条)/g;

/**
 * 別表キャプション内の条番号をリンク化して描画する。
 * リンク先は by-number API で解決した記事ID（別タブで開く）。
 * 解決中はプレーンテキストとして表示し、解決完了後にリンクに切り替わる。
 */
/**
 * マッチした条参照（「第六条」「第二十一条の二」等）から、
 * DB検索用の articleNumber（「六」「二十一の二」等）を抽出する。
 * 「第」と「条」を取り除き、末尾の「の二」等は保持する。
 */
function extractArticleNumberForSearch(refText: string): string {
  // 「第」を削除
  let s = refText.replace(/^第/, "");
  // 末尾の「条」または「条のX」を処理
  // 「第六条」→「六」、「第二十一条の二」→「二十一の二」
  s = s.replace(/条$/, "");
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
      const display = m[1]!;
      const searchNum = extractArticleNumberForSearch(display);
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
      const num = m[1];
      if (m.index > lastEnd) {
        result.push({ text: text.slice(lastEnd, m.index) });
      }
      result.push({ text: num, articleNumber: num });
      lastEnd = m.index + num.length;
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
function emphasizeCabinetOrder(text: string): ReactNode {
  if (!text.includes("政令")) return text;
  const parts = text.split(/(政令)/g);
  return parts.map((part, i) =>
    part === "政令" ? (
      <strong key={i} style={{ fontWeight: 700 }}>政令</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
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
    <div className="chapter-article-block">
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
        {appdxCaptionText && (
          <p className={`law-article-caption text-sm${isAppdxCaption ? " law-article-caption--appdx" : ""}`}>
            {isAppdxCaption ? (
              <CaptionWithArticleLinks text={appdxCaptionText} lawId={articleRoot.lawId} />
            ) : (
              appdxCaptionText
            )}
          </p>
        )}
        <div className="law-node">
          <p className="law-node__text--article-inline">
            <span className="law-node__label--article-inline">{label}</span>
            <span className="law-node__article-inline-body">
              <span>{"　"}</span>
              {emphasizeCabinetOrder(inlineFirstParaText ?? "")}
            </span>
          </p>
        </div>
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
