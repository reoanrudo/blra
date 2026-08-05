import type { ParsedLawDocument, ParsedLawNode } from "./types";

/**
 * 法令リビジョン間のノード単位差分種別。
 *
 * - unchanged: 同一 durableNodeKey かつ同一本文
 * - modified: 同一 durableNodeKey で本文が変化
 * - added: 新版だけに存在し、改番候補にも該当しない
 * - removed: 旧版だけに存在し、改番候補にも該当しない
 * - renumbered_candidate: 本文同一で番号だけ変わった可能性が高い組（要レビュー）
 * - ambiguous: 改番候補が複数マッチし一意に対応付けられない（要レビュー）
 *
 * renumbered_candidate / ambiguous は自動公開対象外（hold）とする。
 */
export type LawNodeDiffKind =
  | "unchanged"
  | "modified"
  | "added"
  | "removed"
  | "renumbered_candidate"
  | "ambiguous";

/**
 * 改番保留が必要な差分が1件でもあるとき差分engineが付与する保留理由。
 */
export const RENUMBERING_REVIEW_REQUIRED = "RENUMBERING_REVIEW_REQUIRED";

/** 保留扱い（renumbered_candidate + ambiguous）の差分種別。 */
const HELD_KINDS = new Set<LawNodeDiffKind>([
  "renumbered_candidate",
  "ambiguous",
]);

/**
 * 単一ノードの差分項目。
 * previous/candidate は片方だけ存在するケース（added/removed 等）を許容するため
 * どちらも nullable とする。
 */
export interface LawNodeDiff {
  kind: LawNodeDiffKind;
  previous: ParsedLawNode | null;
  candidate: ParsedLawNode | null;
  /** 人間が判断材料にできる短い理由。renumbered_candidate/ambiguous で意味を持つ。 */
  reason: string | null;
}

export interface LawRevisionDiff {
  items: LawNodeDiff[];
  counts: {
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
    /** renumbered_candidate + ambiguous の合計件数。 */
    held: number;
  };
  /** renumbered_candidate / ambiguous が1件でもあれば false。 */
  publishable: boolean;
  /** publishable=false のときの理由コード一覧。 */
  holdReasons: string[];
}

/** 改番候補のマッチングキー: 同一親 + 同一 level + 同一 bodyChecksum。 */
interface RenumberKey {
  parentDurableKey: string;
  level: ParsedLawNode["level"];
  bodyChecksum: string;
}

const RENUMBER_SEPARATOR = "\u0000";

function renumberKey(node: ParsedLawNode): RenumberKey {
  // 親の durable key はノードの durableNodeKey から最後のセグメントを除いて復元する。
  // parentDurableKey は ParsedLawNode に持たせていないため、durableNodeKey の
  // 構造（"root/seg1/seg2"）を前提とする。ルート直下のノードは空文字を親とする。
  const lastSlash = node.durableNodeKey.lastIndexOf("/");
  const parentDurableKey =
    lastSlash === -1 ? "" : node.durableNodeKey.slice(0, lastSlash);
  return {
    parentDurableKey,
    level: node.level,
    bodyChecksum: node.bodyChecksum,
  };
}

function renumberKeyId(key: RenumberKey): string {
  return [
    key.parentDurableKey,
    key.level,
    key.bodyChecksum,
  ].join(RENUMBER_SEPARATOR);
}

/**
 * 2つの ParsedLawDocument を比較し、ノード単位の差分を分類する。
 *
 * 二段階アルゴリズム:
 * 1. 同一 durableNodeKey 同士を contentChecksum で unchanged / modified に分ける。
 * 2. 残った removed 候補（旧版のみ）と added 候補（新版のみ）のうち、
 *    「同一親 + 同一 level + 同一 bodyChecksum」で 1:1 に対応する組を
 *    renumbered_candidate に昇格させる。1:1 に決まらない（0:多 / 多:0 / 多:多）
 *    組は ambiguous とする。
 *
 * renumbered_candidate / ambiguous が1件でも含まれれば publishable=false となり、
 * holdReasons に RENUMBERING_REVIEW_REQUIRED を含める。
 *
 * 本関数は純粋な計算ロジックであり、DB や副作用には触れない。
 * durable key の番号正規化（漢数字含む）は parser 側の責務であるため、
 * ここでは durableNodeKey の文字列比較のみを行う。
 */
export function diffLawRevisions(
  previous: ParsedLawDocument,
  candidate: ParsedLawDocument,
): LawRevisionDiff {
  const previousByKey = new Map<string, ParsedLawNode>();
  for (const node of previous.nodes) {
    previousByKey.set(node.durableNodeKey, node);
  }
  const candidateByKey = new Map<string, ParsedLawNode>();
  for (const node of candidate.nodes) {
    candidateByKey.set(node.durableNodeKey, node);
  }

  const items: LawNodeDiff[] = [];
  const removedCandidates: ParsedLawNode[] = [];
  const addedCandidates: ParsedLawNode[] = [];

  // Step 1: 同一 durableNodeKey 同士を unchanged / modified に分類する。
  const matchedKeys = new Set<string>();
  for (const [key, previousNode] of previousByKey) {
    const candidateNode = candidateByKey.get(key);
    if (!candidateNode) {
      removedCandidates.push(previousNode);
      continue;
    }
    matchedKeys.add(key);
    if (previousNode.contentChecksum === candidateNode.contentChecksum) {
      items.push({
        kind: "unchanged",
        previous: previousNode,
        candidate: candidateNode,
        reason: null,
      });
    } else {
      items.push({
        kind: "modified",
        previous: previousNode,
        candidate: candidateNode,
        reason: "contentChecksum が変化したため本文変更と判定",
      });
    }
  }
  for (const [key, candidateNode] of candidateByKey) {
    if (!matchedKeys.has(key)) {
      addedCandidates.push(candidateNode);
    }
  }

  // Step 2: removed 候補と added 候補を改番キーで突き合わせる。
  const removedByKey = new Map<string, ParsedLawNode[]>();
  for (const node of removedCandidates) {
    const id = renumberKeyId(renumberKey(node));
    const bucket = removedByKey.get(id);
    if (bucket) bucket.push(node);
    else removedByKey.set(id, [node]);
  }
  const addedByKey = new Map<string, ParsedLawNode[]>();
  for (const node of addedCandidates) {
    const id = renumberKeyId(renumberKey(node));
    const bucket = addedByKey.get(id);
    if (bucket) bucket.push(node);
    else addedByKey.set(id, [node]);
  }

  const consumedRemoved = new Set<ParsedLawNode>();
  const consumedAdded = new Set<ParsedLawNode>();

  // 2a: 同一改番キーで 1:1 の組を renumbered_candidate に昇格させる。
  for (const [keyId, removedBucket] of removedByKey) {
    const addedBucket = addedByKey.get(keyId);
    if (!addedBucket) continue;
    if (removedBucket.length !== 1 || addedBucket.length !== 1) continue;

    const removedNode = removedBucket[0]!;
    const addedNode = addedBucket[0]!;
    consumedRemoved.add(removedNode);
    consumedAdded.add(addedNode);
    items.push({
      kind: "renumbered_candidate",
      previous: removedNode,
      candidate: addedNode,
      reason: buildRenumberReason(removedNode, addedNode),
    });
  }

  // 2b: 1:1 で決まらなかった残りの removed/added のうち、
  //     対応候補（同改番キーで相手側に2件以上、または自分側が複数）が存在すれば ambiguous。
  const ambiguousRemoved = new Set<ParsedLawNode>();
  const ambiguousAdded = new Set<ParsedLawNode>();
  for (const node of removedCandidates) {
    if (consumedRemoved.has(node)) continue;
    const keyId = renumberKeyId(renumberKey(node));
    const addedBucket = addedByKey.get(keyId);
    // 相手側に未消費の対応候補が1件以上あれば曖昧。
    if (addedBucket && addedBucket.some((a) => !consumedAdded.has(a))) {
      ambiguousRemoved.add(node);
    }
  }
  for (const node of addedCandidates) {
    if (consumedAdded.has(node)) continue;
    const keyId = renumberKeyId(renumberKey(node));
    const removedBucket = removedByKey.get(keyId);
    if (removedBucket && removedBucket.some((r) => !consumedRemoved.has(r))) {
      ambiguousAdded.add(node);
    }
  }

  // ambiguous は「1:1 に決まらない」状態なので、対応する相手を推定せず
  // 各ノードを独立した ambiguous 差分として報告する。これにより人間が全候補を
  // 見直せる。参考情報として同じ改番キーの相手ノード番号を列挙した理由を添える。
  const ambiguousPartnerNumbers = (keyId: string, side: "added" | "removed") => {
    const bucket =
      side === "added" ? addedByKey.get(keyId) : removedByKey.get(keyId);
    return (bucket ?? [])
      .filter((n) => side === "added" ? ambiguousAdded.has(n) : ambiguousRemoved.has(n))
      .map((n) => describeNode(n));
  };
  for (const removedNode of ambiguousRemoved) {
    const keyId = renumberKeyId(renumberKey(removedNode));
    items.push({
      kind: "ambiguous",
      previous: removedNode,
      candidate: null,
      reason: buildAmbiguousReason(
        removedNode,
        null,
        ambiguousPartnerNumbers(keyId, "added"),
      ),
    });
  }
  for (const addedNode of ambiguousAdded) {
    const keyId = renumberKeyId(renumberKey(addedNode));
    items.push({
      kind: "ambiguous",
      previous: null,
      candidate: addedNode,
      reason: buildAmbiguousReason(
        null,
        addedNode,
        ambiguousPartnerNumbers(keyId, "removed"),
      ),
    });
  }

  // 2c: ambiguous にもならなかった残りを removed / added として確定する。
  for (const node of removedCandidates) {
    if (
      consumedRemoved.has(node) ||
      ambiguousRemoved.has(node)
    ) {
      continue;
    }
    items.push({
      kind: "removed",
      previous: node,
      candidate: null,
      reason: "旧版のみに存在し、対応する改番候補なし",
    });
  }
  for (const node of addedCandidates) {
    if (
      consumedAdded.has(node) ||
      ambiguousAdded.has(node)
    ) {
      continue;
    }
    items.push({
      kind: "added",
      previous: null,
      candidate: node,
      reason: "新版のみに存在し、対応する改番候補なし",
    });
  }

  return summarize(items);
}

function buildRenumberReason(
  previous: ParsedLawNode,
  candidate: ParsedLawNode,
): string {
  return [
    `bodyChecksum が同一のため改番候補（要レビュー）。`,
    `durableNodeKey: ${previous.durableNodeKey} -> ${candidate.durableNodeKey}`,
  ].join(" ");
}

/** ノードの人間可読な短縮表現（理由文の参考情報用）。 */
function describeNode(node: ParsedLawNode): string {
  const num =
    node.articleNumber ??
    node.paragraphNumber ??
    node.itemNumber ??
    node.subitemNumber ??
    "?";
  return `${node.level}:${num}`;
}

function buildAmbiguousReason(
  previous: ParsedLawNode | null,
  candidate: ParsedLawNode | null,
  partners: string[],
): string {
  const left = previous?.durableNodeKey ?? "(なし)";
  const right = candidate?.durableNodeKey ?? "(なし)";
  const partnerList = partners.length > 0 ? partners.join(", ") : "(なし)";
  return [
    "同一親/level/bodyChecksum で複数候補が存在し対応付けが一意でない（要レビュー）。",
    `durableNodeKey: ${left} / ${right}`,
    `対応候補参考: ${partnerList}`,
  ].join(" ");
}

function summarize(items: LawNodeDiff[]): LawRevisionDiff {
  const counts = {
    unchanged: 0,
    modified: 0,
    added: 0,
    removed: 0,
    held: 0,
  };
  let hasHold = false;
  for (const item of items) {
    if (item.kind === "unchanged") counts.unchanged++;
    else if (item.kind === "modified") counts.modified++;
    else if (item.kind === "added") counts.added++;
    else if (item.kind === "removed") counts.removed++;
    if (HELD_KINDS.has(item.kind)) {
      counts.held++;
      hasHold = true;
    }
  }
  const holdReasons = hasHold ? [RENUMBERING_REVIEW_REQUIRED] : [];
  return {
    items,
    counts,
    publishable: !hasHold,
    holdReasons,
  };
}
