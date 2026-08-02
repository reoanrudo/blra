/**
 * Imperative DOM utilities for rendering user highlights (colored marks,
 * underlines, brackets) on article text nodes.
 *
 * 表示トークン化（formatLegalText）により DOM の textContent は原文と異なるため、
 * data-source-start/data-source-end/data-source-kind 属性から原文座標を逆引きしてハイライトを適用する（設計書§6.2）。
 *
 * ハイライトの rangeStart/rangeEnd は body テキスト内の原文座標。
 *
 * 着色ルール（設計書§6.2）:
 * - plain トークン: 表示テキストと原文が1:1で同じ長さ。ハイライト範囲と重なる部分のみ着色する。
 *   例: 原文「の点検」(3文字) をハイライト → 表示「の点検」の3文字分だけ着色。
 *   同一 span 内に複数ハイライトがある場合、すべて統合してから一度に DOM を再構築する。
 * - number/unit/fraction トークン: 表示テキストと原文で長さが異なる可能性がある。
 *   ハイライト範囲と少しでも重なる場合、トークン全体を着色する（アトミック扱い）。
 */

import type { UserHighlightData } from "@/contexts/UserHighlightContext";

/**
 * Color map for highlight CSS classes.
 */
const COLOR_CLASSES: Record<string, string> = {
  yellow: "user-highlight--yellow",
  red: "user-highlight--red",
  blue: "user-highlight--blue",
  green: "user-highlight--green",
  purple: "user-highlight--purple",
  orange: "user-highlight--orange",
};

/**
 * ハイライト適用後にmark要素の状態を記録し、cleanupで元に戻せるようにする。
 */
interface MarkRecord {
  /** 作成された mark 要素 */
  mark: HTMLElement;
  /** mark が挿入された元の親 span（plain の場合は span 自身、変換トークンの場合は span） */
  parentSpan: HTMLElement;
}

/**
 * plain トークン span に対するハイライト適用計画。
 * span 内の表示テキスト（=原文、1:1）を複数の区間へ分割する。
 */
interface PlainSegment {
  /** 区間の開始オフセット（span 内、0ベース） */
  start: number;
  /** 区間の終了オフセット（span 内） */
  end: number;
  /** この区間に適用するハイライト（null の場合は通常テキスト） */
  highlight: UserHighlightData | null;
}

/**
 * Apply user highlights to a single article element's DOM.
 * Returns a cleanup function that removes all injected <mark> elements.
 *
 * ハイライト範囲（rangeStart/rangeEnd、原文座標）と交差する source span を特定し、
 * トークン種別に応じて着色する（設計書§6.2）。
 *
 * 同一 plain span に複数ハイライトがかかる場合、すべてのハイライト範囲を
 * 統合した分割計画を作ってから一度に DOM を再構築する。
 * これにより、1件目のハイライトで Text node が分割された後に
 * 2件目が元の Text node を見失い消失する問題を防ぐ。
 */
export function applyUserHighlights(
  articleEl: HTMLElement,
  highlights: UserHighlightData[],
): () => void {
  if (highlights.length === 0) return () => {};

  // data-source-start を持つ全 span を取得
  const sourceSpans = Array.from(
    articleEl.querySelectorAll<HTMLElement>("[data-source-start]"),
  );

  if (sourceSpans.length === 0) return () => {};

  const markRecords: MarkRecord[] = [];

  for (const span of sourceSpans) {
    const spanStart = parseInt(
      span.getAttribute("data-source-start") ?? "0",
      10,
    );
    const spanEnd = parseInt(
      span.getAttribute("data-source-end") ?? "0",
      10,
    );
    const kind = span.getAttribute("data-source-kind") ?? "plain";

    // この span と交差するハイライトを収集
    const overlapping = highlights.filter(
      (hl) => spanStart < hl.rangeEnd && spanEnd > hl.rangeStart,
    );

    if (overlapping.length === 0) continue;

    if (kind === "plain") {
      // plain トークン: 表示テキスト === 原文（1:1）。
      // 複数ハイライトを統合した分割計画を作り、一度に DOM を再構築する。
      renderPlainSpanHighlights(span, spanStart, spanEnd, overlapping, markRecords);
    } else {
      // 変換トークン（number/unit/fraction）: トークン全体を着色する（アトミック扱い）
      // 同一 span に複数ハイライトがある場合は最初の1件の色で着色
      const hl = overlapping[0]!;
      wrapEntireSpan(span, hl, markRecords);
    }
  }

  // Return cleanup function
  return () => {
    for (const record of markRecords) {
      const parent = record.mark.parentNode;
      if (!parent) continue;
      // mark の中身を親へ戻す
      while (record.mark.firstChild) {
        parent.insertBefore(record.mark.firstChild, record.mark);
      }
      parent.removeChild(record.mark);
      if (parent instanceof HTMLElement) {
        parent.normalize();
      }
    }
  };
}

/**
 * plain トークン span に対する複数ハイライトを統合して一度に DOM を再構築する。
 *
 * 1. この span に交差する全ハイライトのローカル範囲を計算
 * 2. 重複するハイライト区間を統合し、全区間の分割計画を作成
 * 3. 元の Text node を破棄し、分割計画に従って新しい Text node / mark 要素を構築
 */
function renderPlainSpanHighlights(
  span: HTMLElement,
  spanStart: number,
  spanEnd: number,
  highlights: UserHighlightData[],
  markRecords: MarkRecord[],
): void {
  // span 内の最初の Text node を取得（plain トークンは単一 Text node を想定）
  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null);
  const textNode = walker.nextNode() as Text | null;
  if (!textNode) return;

  const fullText = textNode.data;
  const spanLength = spanEnd - spanStart;

  // 各ハイライトのローカル範囲（span 内オフセット）を計算
  const highlightRanges: { start: number; end: number; highlight: UserHighlightData }[] = [];
  for (const hl of highlights) {
    const localStart = Math.max(0, hl.rangeStart - spanStart);
    const localEnd = Math.min(spanLength, hl.rangeEnd - spanStart);
    if (localStart < localEnd) {
      highlightRanges.push({ start: localStart, end: localEnd, highlight: hl });
    }
  }

  if (highlightRanges.length === 0) return;

  // 開始位置でソート
  highlightRanges.sort((a, b) => a.start - b.start);

  // 分割計画を作成: 通常区間とハイライト区間を交互に並べる
  const segments: PlainSegment[] = [];
  let cursor = 0;

  for (const range of highlightRanges) {
    // ハイライト前の通常区間
    if (range.start > cursor) {
      segments.push({ start: cursor, end: range.start, highlight: null });
    }
    // ハイライト区間
    segments.push({ start: range.start, end: range.end, highlight: range.highlight });
    cursor = range.end;
  }

  // 最後のハイライト後の通常区間
  if (cursor < fullText.length) {
    segments.push({ start: cursor, end: fullText.length, highlight: null });
  }

  // DOM を再構築
  const fragment = document.createDocumentFragment();

  for (const seg of segments) {
    const segText = fullText.slice(seg.start, seg.end);
    if (segText.length === 0) continue;

    if (seg.highlight) {
      const colorClass = COLOR_CLASSES[seg.highlight.color] ?? "user-highlight--yellow";
      const typeClass =
        seg.highlight.type === "underline"
          ? "user-highlight--underline"
          : seg.highlight.type === "bracket"
            ? "user-highlight--bracket"
            : "";

      const mark = document.createElement("mark");
      mark.className = `user-highlight ${colorClass} ${typeClass}`.trim();
      mark.dataset.highlightId = seg.highlight.id;
      mark.textContent = segText;
      fragment.appendChild(mark);
      markRecords.push({ mark, parentSpan: span });
    } else {
      fragment.appendChild(document.createTextNode(segText));
    }
  }

  // 元の Text node を置き換える
  span.replaceChild(fragment, textNode);
}

/**
 * 変換トークン span 全体を <mark> で囲む。
 */
function wrapEntireSpan(
  span: HTMLElement,
  hl: UserHighlightData,
  markRecords: MarkRecord[],
): void {
  const colorClass = COLOR_CLASSES[hl.color] ?? "user-highlight--yellow";
  const typeClass =
    hl.type === "underline"
      ? "user-highlight--underline"
      : hl.type === "bracket"
        ? "user-highlight--bracket"
        : "";

  const mark = document.createElement("mark");
  mark.className = `user-highlight ${colorClass} ${typeClass}`.trim();
  mark.dataset.highlightId = hl.id;

  // span の子ノードを mark へ移動
  while (span.firstChild) {
    mark.appendChild(span.firstChild);
  }
  span.appendChild(mark);
  markRecords.push({ mark, parentSpan: span });
}
