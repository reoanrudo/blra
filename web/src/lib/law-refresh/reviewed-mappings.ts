import { readFile } from "node:fs/promises";

/**
 * 人手確認済み Revision pair decision（reviewed mapping / guard approval）。
 *
 * 改番候補（renumbered_candidate / ambiguous）や構造変化保留
 * （STRUCTURE_CHANGE_REVIEW_REQUIRED）を人間が承認した結果を表す。
 * このファイル単体は検証を行わず、schema 違反や checksum/law/revision の
 * 不一致を検出して verifier へ例外を投げる責務を持つ。
 */

/** 現行の decision schema バージョン。将来の互換性確認に使う。 */
export const REVIEWED_DECISION_SCHEMA_VERSION = 1;

/**
 * 承認可能な guard 名の固定集合。
 * 未知の guard 値は schema 違反として拒否する。
 */
export const APPROVED_GUARD_VALUES = [
  "STRUCTURE_CHANGE_REVIEW_REQUIRED",
] as const;
export type ApprovedGuard = (typeof APPROVED_GUARD_VALUES)[number];

const APPROVED_GUARD_SET = new Set<string>(APPROVED_GUARD_VALUES);

/**
 * 1 件の改番対応（旧 durable key -> 新 durable key）。
 * 現状は renumbered のみ許容する。
 */
export interface ReviewedMapping {
  fromDurableNodeKey: string;
  toDurableNodeKey: string;
  kind: "renumbered";
  rationale: string;
}

/**
 * reviewed decision の正規化された型。schemaVersion は常に 1。
 */
export interface ReviewedRevisionDecision {
  schemaVersion: 1;
  lawId: string;
  fromRevisionId: string;
  toRevisionId: string;
  fromXmlChecksum: string;
  toXmlChecksum: string;
  mappings: ReviewedMapping[];
  approvedGuards: ApprovedGuard[];
  verifiedBy: string;
  verifiedAt: string;
  rationale: string;
}

/**
 * 候補 Revision と突き合わせるための期待値。
 * これらのフィールドが reviewed decision と完全一致しなければならない。
 */
export interface ReviewedDecisionExpected {
  lawId: string;
  fromRevisionId: string;
  toRevisionId: string;
  fromXmlChecksum: string;
  toXmlChecksum: string;
}

/**
 * reviewed decision の検証失敗を表す例外。
 * verifier 側でエラーコードを取り出せるよう `code` を持たせる。
 */
export class ReviewedDecisionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewedDecisionError";
    this.code = code;
  }
}

/**
 * 任意の入力（オブジェクト / JSON 文字列）を reviewed decision へ検証付きで変換する。
 *
 * 検証内容:
 * 1. JSON 文字列ならパースする（パース失敗は REVIEW_SCHEMA_UNSUPPORTED）。
 * 2. 必須フィールドの型・値を検証する（schemaVersion == 1、各種文字列、配列）。
 * 3. approvedGuards が既知の値だけを含むことを検証する。
 * 4. mappings の kind が "renumbered" だけであることを検証する。
 * 5. mappings の fromDurableNodeKey が一意であることを検証する
 *    （1 つの旧ノードが複数の新ノードへ割り当てられると曖昧になるため）。
 * 6. `expected` が指定された場合、lawId / fromRevisionId / toRevisionId /
 *    fromXmlChecksum / toXmlChecksum が完全一致することを検証する。
 *
 * 不一致ごとに対応するエラーコードで例外を投げる。
 */
export function parseReviewedRevisionDecision(
  content: unknown,
  expected: ReviewedDecisionExpected,
): ReviewedRevisionDecision;
export function parseReviewedRevisionDecision(
  content: unknown,
  expected?: Partial<ReviewedDecisionExpected>,
): ReviewedRevisionDecision;
export function parseReviewedRevisionDecision(
  content: unknown,
  expected?: Partial<ReviewedDecisionExpected>,
): ReviewedRevisionDecision {
  const raw = typeof content === "string" ? safeParseJson(content) : content;

  if (!isRecord(raw)) {
    throw new ReviewedDecisionError(
      "REVIEW_SCHEMA_UNSUPPORTED",
      "reviewed decision は JSON オブジェクトでなければなりません",
    );
  }

  if (raw.schemaVersion !== REVIEWED_DECISION_SCHEMA_VERSION) {
    throw new ReviewedDecisionError(
      "REVIEW_SCHEMA_UNSUPPORTED",
      `schemaVersion は ${REVIEWED_DECISION_SCHEMA_VERSION} でなければなりません（実際: ${String(raw.schemaVersion)}）`,
    );
  }

  requireString(raw.lawId, "lawId");
  requireString(raw.fromRevisionId, "fromRevisionId");
  requireString(raw.toRevisionId, "toRevisionId");
  requireString(raw.fromXmlChecksum, "fromXmlChecksum");
  requireString(raw.toXmlChecksum, "toXmlChecksum");
  requireString(raw.verifiedBy, "verifiedBy");
  requireString(raw.verifiedAt, "verifiedAt");
  requireString(raw.rationale, "rationale");

  if (!Array.isArray(raw.mappings)) {
    throw new ReviewedDecisionError(
      "REVIEW_SCHEMA_UNSUPPORTED",
      "mappings は配列でなければなりません",
    );
  }
  if (!Array.isArray(raw.approvedGuards)) {
    throw new ReviewedDecisionError(
      "REVIEW_SCHEMA_UNSUPPORTED",
      "approvedGuards は配列でなければなりません",
    );
  }

  const mappings: ReviewedMapping[] = [];
  const seenFromKeys = new Set<string>();
  for (const entry of raw.mappings) {
    if (!isRecord(entry)) {
      throw new ReviewedDecisionError(
        "REVIEW_SCHEMA_UNSUPPORTED",
        "mapping 要素はオブジェクトでなければなりません",
      );
    }
    requireString(entry.fromDurableNodeKey, "mapping.fromDurableNodeKey");
    requireString(entry.toDurableNodeKey, "mapping.toDurableNodeKey");
    requireString(entry.rationale, "mapping.rationale");
    if (entry.kind !== "renumbered") {
      throw new ReviewedDecisionError(
        "REVIEW_SCHEMA_UNSUPPORTED",
        `mapping.kind は "renumbered" のみ許容されます（実際: ${String(entry.kind)}）`,
      );
    }
    if (seenFromKeys.has(entry.fromDurableNodeKey)) {
      throw new ReviewedDecisionError(
        "REVIEW_MAPPING_AMBIGUOUS",
        `mapping.fromDurableNodeKey が重複しています: ${entry.fromDurableNodeKey}`,
      );
    }
    seenFromKeys.add(entry.fromDurableNodeKey);
    mappings.push({
      fromDurableNodeKey: entry.fromDurableNodeKey,
      toDurableNodeKey: entry.toDurableNodeKey,
      kind: "renumbered",
      rationale: entry.rationale,
    });
  }

  const approvedGuards: ApprovedGuard[] = [];
  for (const guard of raw.approvedGuards) {
    if (typeof guard !== "string" || !APPROVED_GUARD_SET.has(guard)) {
      throw new ReviewedDecisionError(
        "REVIEW_SCHEMA_UNSUPPORTED",
        `未知の approvedGuards 値です: ${String(guard)}`,
      );
    }
    approvedGuards.push(guard as ApprovedGuard);
  }

  const decision: ReviewedRevisionDecision = {
    schemaVersion: 1,
    lawId: raw.lawId,
    fromRevisionId: raw.fromRevisionId,
    toRevisionId: raw.toRevisionId,
    fromXmlChecksum: raw.fromXmlChecksum,
    toXmlChecksum: raw.toXmlChecksum,
    mappings,
    approvedGuards,
    verifiedBy: raw.verifiedBy,
    verifiedAt: raw.verifiedAt,
    rationale: raw.rationale,
  };

  if (expected) {
    assertExpectedMatch(decision, expected);
  }

  return decision;
}

/**
 * ファイルパスから reviewed decision を読み込んで検証する。
 * ファイルが存在しない・読めない場合は Node の ENOENT 等がそのまま投げられる。
 * 内容の検証は `parseReviewedRevisionDecision` へ委譲する。
 */
export async function loadReviewedRevisionDecision(
  path: string,
  expected: ReviewedDecisionExpected,
): Promise<ReviewedRevisionDecision> {
  const content = await readFile(path, "utf8");
  return parseReviewedRevisionDecision(content, expected);
}

/**
 * 候補 Revision pair / checksum が reviewed decision と一致するか検証する。
 * 1 つでも不一致があれば REVIEW_REVISION_MISMATCH または REVIEW_CHECKSUM_MISMATCH を投げる。
 */
function assertExpectedMatch(
  decision: ReviewedRevisionDecision,
  expected: Partial<ReviewedDecisionExpected>,
): void {
  const revisionFields: Array<{
    key: keyof ReviewedDecisionExpected;
    label: string;
  }> = [
    { key: "lawId", label: "lawId" },
    { key: "fromRevisionId", label: "fromRevisionId" },
    { key: "toRevisionId", label: "toRevisionId" },
  ];
  for (const { key, label } of revisionFields) {
    const expectedValue = expected[key];
    if (expectedValue === undefined) continue;
    if (decision[key] !== expectedValue) {
      throw new ReviewedDecisionError(
        "REVIEW_REVISION_MISMATCH",
        `${label} が候補と一致しません（decision=${decision[key]} expected=${expectedValue}）`,
      );
    }
  }

  const checksumFields: Array<{
    key: "fromXmlChecksum" | "toXmlChecksum";
    label: string;
  }> = [
    { key: "fromXmlChecksum", label: "fromXmlChecksum" },
    { key: "toXmlChecksum", label: "toXmlChecksum" },
  ];
  for (const { key, label } of checksumFields) {
    const expectedValue = expected[key];
    if (expectedValue === undefined) continue;
    if (decision[key] !== expectedValue) {
      throw new ReviewedDecisionError(
        "REVIEW_CHECKSUM_MISMATCH",
        `${label} が候補と一致しません（decision=${decision[key]} expected=${expectedValue}）`,
      );
    }
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new ReviewedDecisionError(
      "REVIEW_SCHEMA_UNSUPPORTED",
      `reviewed decision の JSON パースに失敗しました: ${(error as Error).message}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ReviewedDecisionError(
      "REVIEW_SCHEMA_UNSUPPORTED",
      `${label} は空でない文字列でなければなりません`,
    );
  }
}
