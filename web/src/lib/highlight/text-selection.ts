/**
 * Text selection utilities for mapping browser Selection API positions
 * to original-text character offsets within article DOM elements.
 *
 * 表示トークン化（formatLegalText）により DOM の textContent は原文と異なるため、
 * data-source-start/data-source-end/data-source-kind 属性から原文座標を復元する（設計書§6.3）。
 *
 * 各 law-node は data-original-text 属性に本文原文（label除く）を保持し、
 * 本文スパン内の子要素に data-source-start/data-source-end/data-source-kind 属性が付与されている。
 *
 * 座標計算ルール（設計書§6.3）:
 * - plain トークン: 表示テキストと原文が1:1で同じ長さ。選択オフセットを直接原文座標へ加算できる。
 * - number/unit/fraction トークン: 表示テキストと原文で長さが異なる可能性がある。
 *   一部が選択された場合は、そのトークン全体の原文範囲へ拡張する（アトミック扱い）。
 */

export interface SelectionContext {
  articleId: string;
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
}

/**
 * source span のメタ情報。
 */
interface SourceSpanInfo {
  element: HTMLElement;
  sourceStart: number;
  sourceEnd: number;
  /** トークン種別: plain, number, unit, fraction */
  kind: string;
  /** この span 内の先頭 Text node */
  firstTextNode: Text;
  /** この span 内の末尾 Text node */
  lastTextNode: Text;
}

/**
 * article要素内の全 source span を文書順で収集する。
 */
function collectSourceSpans(rootEl: HTMLElement): SourceSpanInfo[] {
  const spans = Array.from(
    rootEl.querySelectorAll<HTMLElement>("[data-source-start]"),
  );
  const result: SourceSpanInfo[] = [];

  for (const element of spans) {
    const sourceStart = parseInt(
      element.getAttribute("data-source-start") ?? "",
      10,
    );
    const sourceEnd = parseInt(
      element.getAttribute("data-source-end") ?? "",
      10,
    );
    if (Number.isNaN(sourceStart) || Number.isNaN(sourceEnd)) continue;

    const kind = element.getAttribute("data-source-kind") ?? "plain";

    const firstTextNode = getFirstTextNode(element);
    const lastTextNode = getLastTextNode(element);
    if (!firstTextNode || !lastTextNode) continue;

    result.push({ element, sourceStart, sourceEnd, kind, firstTextNode, lastTextNode });
  }

  return result;
}

function getFirstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  return (walker.nextNode() as Text) ?? null;
}

function getLastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  let last: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    last = current as Text;
    current = walker.nextNode();
  }
  return last;
}

/**
 * 2つのノードの文書順を比較する。
 * nodeA が nodeB より前または同じ位置の場合 true、後の場合 false。
 *
 * Node.compareDocumentPosition を使用し、contains/following ビットで判定する。
 * これにより Range の境界操作に依存せず、正確に文書順序を判定できる。
 */
function isBeforeOrEqual(nodeA: Node, nodeB: Node): boolean {
  if (nodeA === nodeB) return true;
  const result = nodeA.compareDocumentPosition(nodeB);
  // nodeB が nodeA に含まれる (CONTAINS) または nodeA に続く (FOLLOWING) 場合、
  // nodeA は nodeB と同じか前にある
  return (result & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ||
    (result & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0;
}

/**
 * 選択された source span と、その span 内での選択の有無を表す。
 */
interface SelectedSpan {
  info: SourceSpanInfo;
  /** 選択開始がこの span 内にあるか */
  startsHere: boolean;
  /** 選択終了がこの span 内にあるか */
  endsHere: boolean;
  /** span の先頭 Text node 内での選択開始オフセット（startsHere時のみ有効） */
  startOffsetInSpan: number;
  /** span の末尾 Text node 内での選択終了オフセット（endsHere時のみ有効） */
  endOffsetInSpan: number;
}

/**
 * 選択範囲と交差する source span を特定し、各 span 内での選択位置を計算する。
 *
 * 設計書§6.3: 置換トークン（number/unit/fraction）の一部だけが選択された場合は、
 * そのトークンに対応する原文範囲全体を保存する。plain トークンの場合は実際の選択範囲を保存する。
 */
function resolveSelectedSpans(
  spans: SourceSpanInfo[],
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
): SelectedSpan[] {
  // anchor/focus の文書順を正規化
  let startNode: Node = anchorNode;
  let startOffset: number = anchorOffset;
  let endNode: Node = focusNode;
  let endOffset: number = focusOffset;

  // 同一ノード内での右から左への選択（anchorOffset > focusOffset）に対応するため、
  // 同一ノードの場合は offset の数値比較で正規化する。
  // isBeforeOrEqual は同一ノードの場合 true を返すため、これだけでは不十分。
  if (anchorNode === focusNode) {
    if (anchorOffset > focusOffset) {
      startOffset = focusOffset;
      endOffset = anchorOffset;
    }
  } else if (!isBeforeOrEqual(anchorNode, focusNode)) {
    startNode = focusNode;
    startOffset = focusOffset;
    endNode = anchorNode;
    endOffset = anchorOffset;
  }

  const selected: SelectedSpan[] = [];

  for (const info of spans) {
    // この span が選択範囲に含まれるか判定
    // span の先頭〜末尾が選択の start〜end と交差するか
    const spanStartBeforeSelectionEnd = isBeforeOrEqual(info.firstTextNode, endNode);
    const selectionStartBeforeSpanEnd = isBeforeOrEqual(startNode, info.lastTextNode);

    if (!spanStartBeforeSelectionEnd || !selectionStartBeforeSpanEnd) {
      continue; // 交差なし
    }

    // 選択開始がこの span 内にあるか
    const startsHere =
      isBeforeOrEqual(info.firstTextNode, startNode) &&
      isBeforeOrEqual(startNode, info.lastTextNode);
    // 選択終了がこの span 内にあるか
    const endsHere =
      isBeforeOrEqual(info.firstTextNode, endNode) &&
      isBeforeOrEqual(endNode, info.lastTextNode);

    // span 内でのローカルオフセットを計算
    let startOffsetInSpan = 0;
    let endOffsetInSpan = 0;

    if (startsHere) {
      if (startNode === info.firstTextNode) {
        startOffsetInSpan = startOffset;
      } else if (startNode.nodeType === Node.TEXT_NODE) {
        // span 内の別の Text node の場合、その Text node の先頭から
        startOffsetInSpan = startOffset;
      }
    }

    if (endsHere) {
      if (endNode === info.lastTextNode) {
        endOffsetInSpan = endOffset;
      } else if (endNode.nodeType === Node.TEXT_NODE) {
        endOffsetInSpan = endOffset;
      }
    }

    selected.push({
      info,
      startsHere,
      endsHere,
      startOffsetInSpan,
      endOffsetInSpan,
    });
  }

  return selected;
}

/**
 * Extract selection context from a mouse event (typically contextmenu).
 * Returns null if no valid text selection within an article element.
 *
 * 選択範囲を原文座標へ逆変換する（設計書§6.3）:
 * - 選択された source span の data-source-start/data-source-end/data-source-kind から原文範囲を復元
 * - selectedText には data-original-text 属性から復元した公式原文を設定
 * - plain トークンの場合は実際の選択位置で正確に範囲を計算
 * - 変換トークン（number/unit/fraction）の一部が選択された場合は全体へ拡張
 *
 * source span が選択範囲に含まれない場合（label部分のみ等）は null を返す。
 */
export function getSelectionContext(_e: MouseEvent): SelectionContext | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return null;

  // Find the closest article element that contains the selection
  const anchorEl = (sel.anchorNode instanceof HTMLElement
    ? sel.anchorNode
    : sel.anchorNode.parentElement
  )?.closest("[data-article-id]");
  const focusEl = (sel.focusNode instanceof HTMLElement
    ? sel.focusNode
    : sel.focusNode.parentElement
  )?.closest("[data-article-id]");

  if (!anchorEl || !focusEl || anchorEl !== focusEl) return null;

  const articleId = anchorEl.getAttribute("data-article-id");
  if (!articleId) return null;

  // article要素内の全 source span を収集
  const spans = collectSourceSpans(anchorEl as HTMLElement);
  if (spans.length === 0) return null;

  // 選択範囲と交差する span を特定
  const selectedSpans = resolveSelectedSpans(
    spans,
    sel.anchorNode,
    sel.anchorOffset,
    sel.focusNode,
    sel.focusOffset,
  );

  if (selectedSpans.length === 0) return null;

  // 原文範囲を計算
  const firstSpan = selectedSpans[0]!;
  const lastSpan = selectedSpans[selectedSpans.length - 1]!;

  let rangeStart = firstSpan.info.sourceStart;
  let rangeEnd = lastSpan.info.sourceEnd;

  // plain トークンのみ、表示テキストと原文が1:1で同じ長さのため、
  // 選択オフセットを直接原文座標へ加算して正確な範囲を計算できる。
  // 変換トークン（number/unit/fraction）は表示テキスト長 ≠ 原文長の可能性があるため、
  // 一部選択でもトークン全体の原文範囲へ拡張する（アトミック扱い、設計書§6.3）。
  if (firstSpan.startsHere && firstSpan.info.kind === "plain") {
    rangeStart = firstSpan.info.sourceStart + firstSpan.startOffsetInSpan;
  }
  if (lastSpan.endsHere && lastSpan.info.kind === "plain") {
    rangeEnd = lastSpan.info.sourceStart + lastSpan.endOffsetInSpan;
  }

  if (rangeStart >= rangeEnd) return null;

  // data-original-text から公式原文を復元（設計書§6.3）
  const originalText = anchorEl.getAttribute("data-original-text") ?? "";
  const clampedStart = Math.min(rangeStart, originalText.length);
  const clampedEnd = Math.min(rangeEnd, originalText.length);
  const selectedText = originalText.slice(clampedStart, clampedEnd);

  return { articleId, rangeStart, rangeEnd, selectedText };
}
