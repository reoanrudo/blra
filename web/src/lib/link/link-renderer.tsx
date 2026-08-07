import Link from "next/link";
import type { ReactNode } from "react";
import type { OutgoingLinkRow } from "@/lib/link/link";
import { formatLegalText, type LegalDisplayToken } from "@/lib/article/legal-display-format";
import { renderTokenNode } from "@/lib/article/legal-token-renderer";

type RenderSegment =
  | { kind: "text"; text: string; textOffset: number }
  | { kind: "resolved-link"; text: string; targetId: string; linkId: string; textOffset: number }
  | { kind: "unresolved-link"; text: string; targetText: string; linkId: string; textOffset: number };

/**
 * Split an article's text content into segments interleaving link spans.
 * Links are resolved by sourceRange: "start-end" positions within the text.
 *
 * 各セグメントは textOffset（元テキスト内の絶対開始位置）を保持する。
 * これにより表示トークンの sourceStart/sourceEnd を絶対位置へ変換できる（設計書§6.1）。
 */
export function renderLinkSegments(
  text: string,
  links: OutgoingLinkRow[],
): RenderSegment[] {
  if (!text) return [{ kind: "text", text: "", textOffset: 0 }];

  // Filter links that apply to this text and have valid sourceRange
  const applicableLinks = links
    .filter((l) => l.sourceRange)
    .sort((a, b) => {
      const aStart = parseInt(a.sourceRange!.split("-")[0] ?? "0", 10);
      const bStart = parseInt(b.sourceRange!.split("-")[0] ?? "0", 10);
      return aStart - bStart;
    });

  if (applicableLinks.length === 0) {
    return [{ kind: "text", text, textOffset: 0 }];
  }

  const segments: RenderSegment[] = [];
  let cursor = 0;

  for (const link of applicableLinks) {
    const [startStr, endStr] = link.sourceRange!.split("-");
    const start = parseInt(startStr ?? "0", 10);
    const end = parseInt(endStr ?? "0", 10);

    if (start < cursor || start >= end || end > text.length) continue;

    // Plain text before this link
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start), textOffset: cursor });
    }

    const linkText = text.slice(start, end);
    if (link.isResolved && link.targetId) {
      segments.push({
        kind: "resolved-link",
        text: linkText,
        targetId: link.targetId,
        linkId: link.id,
        textOffset: start,
      });
    } else {
      // Unresolved but has a sourceRange: render as dashed tooltip
      segments.push({
        kind: "unresolved-link",
        text: linkText,
        targetText: link.targetText ?? link.targetLawName ?? "未解決リンク",
        linkId: link.id,
        textOffset: start,
      });
    }

    cursor = end;
  }

  // Remaining text
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor), textOffset: cursor });
  }

  return segments;
}

/**
 * 表示トークンを data-source-start/data-source-end 属性付き span として描画する。
 *
 * 絶対位置は セグメントの textOffset + トークンの相対 sourceStart/sourceEnd で計算する。
 * これによりハイライト・選択が原文座標で動作する（設計書§6.1, §6.2）。
 * 分数トークンは縦分数表示（.law-fraction）として描画される（共通ヘルパーを使用）。
 */
function renderTokensWithSourceAttrs(
  tokens: LegalDisplayToken[],
  textOffset: number,
  keyPrefix: string,
): ReactNode[] {
  return tokens.map((token, i) =>
    renderTokenNode(token, `${keyPrefix}-${i}`, textOffset),
  );
}

/** Render segments as ReactElements for use in server components.
 *  各テキストセグメントを formatLegalText で表示トークン化する（設計書§3）。
 *  全トークン（plain含む）に data-source-* 属性を付与する。
 */
export function renderToElements(
  segments: RenderSegment[],
  onCmdClick?: (articleId: string) => void,
  articleHref: (articleId: string) => string = (articleId) =>
    `/articles/${articleId}`,
): ReactNode[] {
  return segments.map((seg, i) => {
    if (seg.kind === "text") {
      // 表示トークン化して data-source-* 属性付き span で描画（plain含む全トークン）
      const tokens = formatLegalText(seg.text);
      if (tokens.length === 0) return null;
      return (
        <span key={`text-${i}`}>
          {renderTokensWithSourceAttrs(tokens, seg.textOffset, `t${i}`)}
        </span>
      );
    }
    if (seg.kind === "resolved-link") {
      // リンク内テキストも表示トークン化する（plain含む全トークンに属性付与）
      const tokens = formatLegalText(seg.text);
      const linkChildren = renderTokensWithSourceAttrs(tokens, seg.textOffset, `l${i}`);
      return (
        <Link
          key={seg.linkId || i}
          href={articleHref(seg.targetId)}
          data-link-target={seg.targetId}
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {linkChildren}
        </Link>
      );
    }
    // unresolved-link
    const tokens = formatLegalText(seg.text);
    const linkChildren = renderTokensWithSourceAttrs(tokens, seg.textOffset, `u${i}`);
    return (
      <span
        key={seg.linkId || i}
        className="text-gray-500 border-b border-dashed border-gray-400"
        title={`未解決リンク: ${seg.targetText}`}
      >
        {linkChildren}
      </span>
    );
  });
}
