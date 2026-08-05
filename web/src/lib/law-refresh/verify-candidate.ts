import type { LawRevisionDiff } from "./diff-law-revisions";
import type { ParsedLawDocument, ParsedLawNode } from "./types";
import {
  resolveVerifiedRanges,
  type LawBookEntryRangeInput,
  type RangeResolutionResult,
} from "./range-resolution";
import type { ReviewedRevisionDecision } from "./reviewed-mappings";

/**
 * 候補 Revision の構造・改番・範囲・公開整合を検証する純粋ゲート。
 *
 * このモジュールは DB や副作用に触れない。入力は parser/diff/range の結果と
 * 旧版ノード件数のみ。検証結果は `CandidateVerificationReport` として返し、
 * refresh service 側で activate 可否の判定に使う。
 *
 * 検証は恒久拒否（errors）と保留扱い（warnings + errors の一部）に分かれる。
 * 保留扱いは reviewed decision で上書き解除可能なもの（STRUCTURE_CHANGE_REVIEW_REQUIRED、
 * RENUMBERING_REVIEW_REQUIRED 由来の UNRESOLVED_DIFF）とする。
 */

/** 構造変化の保留しきい値（旧版件数に対する増減比の絶対値）。 */
export const STRUCTURE_CHANGE_THRESHOLD = 0.2;

/** 構造変化保留のガード名。reviewed decision の approvedGuards で解除できる。 */
export const STRUCTURE_CHANGE_GUARD = "STRUCTURE_CHANGE_REVIEW_REQUIRED";

/** 差分engine が付与する改番保留理由コード（diff-law-revisions.ts と同じ値）。 */
const RENUMBERING_HOLD_REASON = "RENUMBERING_REVIEW_REQUIRED";

/** 自動公開対象外の差分種別。renumbered_candidate / ambiguous を含む。 */
const HELD_DIFF_KINDS = new Set(["renumbered_candidate", "ambiguous"]);

/**
 * verifier への入力。
 * - `document`: 候補 Revision の ParsedLawDocument（Task 2 出力）
 * - `diff`: 旧版 vs 候補の LawRevisionDiff（Task 4 出力）
 * - `ranges`: 書籍収載範囲の一覧（LawBookEntryRange 形状）
 * - `previousNodeCount`: 旧版のノード件数。構造変化検出の基準。0 のときは初回導入扱い。
 * - `reviewedDecision`: 人手確認済み decision（任意）。保留の上書き解除に使う。
 */
export interface CandidateVerificationInput {
  document: ParsedLawDocument;
  diff: LawRevisionDiff;
  ranges: LawBookEntryRangeInput[];
  previousNodeCount: number;
  reviewedDecision?: ReviewedRevisionDecision;
}

export interface VerificationError {
  code: string;
  nodeKey?: string;
  detail: string;
}

export interface VerificationWarning {
  code: string;
  detail: string;
}

export interface CandidateVerificationMetrics {
  /** 候補 Revision のノード件数。 */
  nodeCount: number;
  /** level === "article" のノード件数。 */
  articleCount: number;
  /**
   * 旧版件数に対する増減比。
   *   (newCount - previousNodeCount) / previousNodeCount
   * previousNodeCount === 0 のときは 0 とする（初回導入は比較基準がないため）。
   */
  nodeDeltaRatio: number;
}

export interface CandidateVerificationReport {
  /** 全ての errors が解決（保留含む）されていれば true。 */
  publishable: boolean;
  errors: VerificationError[];
  warnings: VerificationWarning[];
  rangeResolutions: RangeResolutionResult[];
  metrics: CandidateVerificationMetrics;
}

/**
 * 候補 Revision を検証し、公開可否と問題一覧を返す。
 *
 * 検査順序は短絡的ではない（全カテゴリを走査して一覧を返す）が、
 * publishable は「未解決の error が1件もない」ときのみ true になる。
 */
export function verifyCandidate(
  input: CandidateVerificationInput,
): CandidateVerificationReport {
  const { document, diff, ranges, previousNodeCount, reviewedDecision } = input;
  const nodes = document.nodes;

  const errors: VerificationError[] = [];
  const warnings: VerificationWarning[] = [];

  // 1. ノード存在
  if (nodes.length === 0) {
    errors.push({
      code: "EMPTY_DOCUMENT",
      detail: "候補 Revision にノードが1件も存在しません",
    });
  }

  // 2〜5. 構造検査（durable key 一意・親存在・循環・兄弟番号重複）
  errors.push(...checkStructure(nodes));

  // 6. 差分の公開可否
  const unresolvedDiffCodes = checkDiffPublishable(diff, reviewedDecision);
  errors.push(...unresolvedDiffCodes);

  // 7. 範囲解決
  const rangeResolutions = resolveVerifiedRanges(ranges, nodes);
  errors.push(...checkRanges(rangeResolutions));

  // 構造変化保留（恒久拒否ではなく reviewed decision で解除可能）
  const metrics = computeMetrics(nodes, previousNodeCount);
  const structureChange = isStructureChange(metrics, previousNodeCount);
  if (structureChange) {
    warnings.push({
      code: STRUCTURE_CHANGE_GUARD,
      detail: `ノード件数が旧版から ${formatPercent(metrics.nodeDeltaRatio)} 変化しました（旧版 ${previousNodeCount} 件 -> 新版 ${metrics.nodeCount} 件）`,
    });
    const approved = isGuardApproved(reviewedDecision, STRUCTURE_CHANGE_GUARD);
    if (!approved) {
      errors.push({
        code: STRUCTURE_CHANGE_GUARD,
        detail: "構造変化がしきい値を超えました。reviewed decision で承認が必要です",
      });
    }
  }

  const publishable = errors.length === 0;

  return {
    publishable,
    errors,
    warnings,
    rangeResolutions,
    metrics,
  };
}

/**
 * ノード群の構造不変条件を検査する:
 * - durableNodeKey の一意性
 * - parentSourceIndex の妥当性（範囲内・自分自身を指さない）
 * - 親子関係の循環なし
 * - 同一親・同一 level・同一公式番号の重複なし
 */
function checkStructure(nodes: readonly ParsedLawNode[]): VerificationError[] {
  const errors: VerificationError[] = [];
  const indexById = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    indexById.set(nodes[i]!.sourceIndex, i);
  }

  // 2. durable key 一意
  const seenKeys = new Set<string>();
  for (const node of nodes) {
    if (seenKeys.has(node.durableNodeKey)) {
      errors.push({
        code: "DUPLICATE_DURABLE_KEY",
        nodeKey: node.durableNodeKey,
        detail: `durableNodeKey が重複しています: ${node.durableNodeKey}`,
      });
    } else {
      seenKeys.add(node.durableNodeKey);
    }
  }

  // 3. parent 存在
  for (const node of nodes) {
    if (node.parentSourceIndex === null) continue;
    if (!indexById.has(node.parentSourceIndex)) {
      errors.push({
        code: "ORPHAN_NODE",
        nodeKey: node.durableNodeKey,
        detail: `parentSourceIndex(${node.parentSourceIndex}) が候補ノード群に存在しません: ${node.durableNodeKey}`,
      });
    }
  }

  // 4. 循環検出
  errors.push(...detectCycles(nodes, indexById));

  // 5. 同一親・同一 level・同一公式番号の重複
  errors.push(...detectSiblingNumberCollisions(nodes, indexById));

  return errors;
}

/**
 * 各ノードから parentSourceIndex を辿り、循環がないか検査する。
 * parentSourceIndex が自分自身を指す場合も循環とみなす。
 * 最大でも nodes.length+1 歩でルートに到達するはずなので、それを超えたら循環。
 */
function detectCycles(
  nodes: readonly ParsedLawNode[],
  indexById: Map<number, number>,
): VerificationError[] {
  const errors: VerificationError[] = [];
  const maxSteps = nodes.length + 1;

  for (const start of nodes) {
    const visited = new Set<number>();
    let cursor: ParsedLawNode | undefined = start;
    let steps = 0;
    while (cursor && cursor.parentSourceIndex !== null) {
      steps++;
      if (cursor.parentSourceIndex === cursor.sourceIndex) {
        errors.push({
          code: "CYCLE_DETECTED",
          nodeKey: start.durableNodeKey,
          detail: `ノードが自分自身を親にしています: ${cursor.durableNodeKey}`,
        });
        break;
      }
      if (visited.has(cursor.sourceIndex)) {
        errors.push({
          code: "CYCLE_DETECTED",
          nodeKey: start.durableNodeKey,
          detail: `親子関係に循環があります: ${start.durableNodeKey}`,
        });
        break;
      }
      visited.add(cursor.sourceIndex);
      if (steps > maxSteps) {
        errors.push({
          code: "CYCLE_DETECTED",
          nodeKey: start.durableNodeKey,
          detail: `親子 chain が長すぎます（循環の疑い）: ${start.durableNodeKey}`,
        });
        break;
      }
      const parentIndex = indexById.get(cursor.parentSourceIndex);
      cursor = parentIndex === undefined ? undefined : nodes[parentIndex];
    }
  }

  return errors;
}

/**
 * 同一親・同一 level・同一 articleNumberNormalized の重複を検査する。
 * parser 側で durableNodeKey は一意になるが、番号だけ見たときの矛盾を
 * 検出する（例: 同じ親の下に article:5 が2つある等）。
 * articleNumberNormalized が null のノード（非 article 系の一部）は
 * 比較基準がないため検査対象外とする。
 */
function detectSiblingNumberCollisions(
  nodes: readonly ParsedLawNode[],
  indexById: Map<number, number>,
): VerificationError[] {
  const errors: VerificationError[] = [];
  const siblingBuckets = new Map<string, number>();

  for (const node of nodes) {
    const number =
      node.level === "article"
        ? node.articleNumberNormalized
        : node.level === "paragraph"
          ? node.paragraphNumber
          : node.level === "item"
            ? node.itemNumber
            : node.level.startsWith("subitem")
              ? node.subitemNumber
              : null;
    if (number === null || number === undefined || number === "") continue;

    const parentKey =
      node.parentSourceIndex === null
        ? "<root>"
        : indexById.has(node.parentSourceIndex)
          ? String(node.parentSourceIndex)
          : "<missing>";
    const bucketKey = `${parentKey}\u0000${node.level}\u0000${number}`;
    const count = siblingBuckets.get(bucketKey) ?? 0;
    siblingBuckets.set(bucketKey, count + 1);
    if (count >= 1) {
      errors.push({
        code: "COLLISION_SIBLING_NUMBER",
        nodeKey: node.durableNodeKey,
        detail: `同一親の下に ${node.level}:${number} が複数存在します: ${node.durableNodeKey}`,
      });
    }
  }

  return errors;
}

/**
 * diff.publishable === false のとき、reviewed decision で全ての
 * renumbered_candidate / ambiguous が覆われていなければ UNRESOLVED_DIFF を返す。
 */
function checkDiffPublishable(
  diff: LawRevisionDiff,
  reviewedDecision: ReviewedRevisionDecision | undefined,
): VerificationError[] {
  if (diff.publishable) return [];

  // 改番保留以外の理由で publishable=false の場合は恒久拒否として扱う。
  // 現状の差分 engine は RENUMBERING_REVIEW_REQUIRED 以外の holdReason を出さないため、
  // 未知の holdReason が含まれる場合は保留対象外の致命的エラーとする。
  const hasOnlyRenumberingHold = diff.holdReasons.every(
    (reason) => reason === RENUMBERING_HOLD_REASON,
  );
  if (!hasOnlyRenumberingHold && diff.holdReasons.length > 0) {
    return [
      {
        code: "UNRESOLVED_DIFF",
        detail: `解決不可能な差分保留理由があります: ${diff.holdReasons.join(", ")}`,
      },
    ];
  }

  if (!reviewedDecision) {
    return [
      {
        code: "UNRESOLVED_DIFF",
        detail: "改番保留差分が未解決です。reviewed decision が必要です",
      },
    ];
  }

  const heldItems = diff.items.filter((item) => HELD_DIFF_KINDS.has(item.kind));
  const mappingPairs = new Set(
    reviewedDecision.mappings.map(
      (m) => `${m.fromDurableNodeKey}\u0000${m.toDurableNodeKey}`,
    ),
  );
  const mappingFromKeys = new Set(
    reviewedDecision.mappings.map((m) => m.fromDurableNodeKey),
  );
  const mappingToKeys = new Set(
    reviewedDecision.mappings.map((m) => m.toDurableNodeKey),
  );

  for (const item of heldItems) {
    const fromKey = item.previous?.durableNodeKey;
    const toKey = item.candidate?.durableNodeKey;
    let covered = false;
    if (fromKey !== undefined && toKey !== undefined) {
      // renumbered_candidate: from->to の対が完全一致する mapping が必要。
      // 片側だけの一致（多対一や一対多）は曖昧対応とみなして覆わない。
      covered = mappingPairs.has(`${fromKey}\u0000${toKey}`);
    } else {
      // ambiguous: previous または candidate が null のため、存在する側の
      // 単独キーで覆われているかで判断する。
      covered =
        (fromKey !== undefined && mappingFromKeys.has(fromKey)) ||
        (toKey !== undefined && mappingToKeys.has(toKey));
    }
    if (!covered) {
      return [
        {
          code: "UNRESOLVED_DIFF",
          nodeKey: fromKey ?? toKey,
          detail: `改番候補が reviewed decision で覆われていません: ${fromKey ?? "(なし)"} -> ${toKey ?? "(なし)"}`,
        },
      ];
    }
  }

  return [];
}

function checkRanges(
  rangeResolutions: readonly RangeResolutionResult[],
): VerificationError[] {
  const errors: VerificationError[] = [];
  for (const resolution of rangeResolutions) {
    if (resolution.status !== "resolved") {
      errors.push({
        code: "RANGE_UNRESOLVED",
        nodeKey: resolution.rangeId,
        detail: `書籍範囲 ${resolution.rangeId} が解決できません（errorCode=${resolution.errorCode}）`,
      });
    }
  }
  return errors;
}

function computeMetrics(
  nodes: readonly ParsedLawNode[],
  previousNodeCount: number,
): CandidateVerificationMetrics {
  const articleCount = nodes.filter((n) => n.level === "article").length;
  const nodeDeltaRatio =
    previousNodeCount > 0
      ? (nodes.length - previousNodeCount) / previousNodeCount
      : 0;
  return {
    nodeCount: nodes.length,
    articleCount,
    nodeDeltaRatio,
  };
}

function isStructureChange(
  metrics: CandidateVerificationMetrics,
  previousNodeCount: number,
): boolean {
  if (previousNodeCount <= 0) return false;
  return Math.abs(metrics.nodeDeltaRatio) >= STRUCTURE_CHANGE_THRESHOLD;
}

function isGuardApproved(
  reviewedDecision: ReviewedRevisionDecision | undefined,
  guard: string,
): boolean {
  if (!reviewedDecision) return false;
  return reviewedDecision.approvedGuards.some((g) => g === guard);
}

function formatPercent(ratio: number): string {
  const sign = ratio > 0 ? "+" : "";
  return `${sign}${(ratio * 100).toFixed(1)}%`;
}
