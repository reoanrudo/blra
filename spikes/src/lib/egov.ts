/**
 * e-Gov 法令API v2 の最小クライアント。
 *
 * 実測済みのエンドポイント（2026-07-29）:
 *   GET /api/2/laws?law_title=&limit=
 *   GET /api/2/law_revisions/{law_id}
 *   GET /api/2/law_data/{law_revision_id}[?response_format=xml]
 *
 * v1（elaws.e-gov.go.jp/api/1/）は 301 を返すため使用しない。
 */

const BASE = "https://laws.e-gov.go.jp/api/2";

/** 法令標準XML をそのまま写した汎用ノード。 */
export type LawNode = {
  tag: string;
  attr?: Record<string, string>;
  children?: (LawNode | string)[];
};

export type LawInfo = {
  law_type: string;
  law_id: string;
  law_num: string;
  promulgation_date: string;
};

export type RevisionInfo = {
  law_revision_id: string;
  law_title: string;
  /** 施行日。この版が効力を持ち始める日（設計書 §4.2 valid_from） */
  amendment_enforcement_date?: string;
  /** 施行日が未確定の場合にのみ入る（設計書 §4.2 valid_from_status = UNDETERMINED の判定材料） */
  amendment_scheduled_enforcement_date?: string;
  amendment_promulgate_date?: string;
  amendment_law_id?: string;
  amendment_law_num?: string;
  amendment_type?: string;
  current_revision_status?: string;
  repeal_status?: string;
  repeal_date?: string | null;
};

export type LawDataResponse = {
  law_info: LawInfo;
  revision_info: RevisionInfo;
  law_full_text: LawNode;
};

async function getJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function searchLaws(title: string, limit = 10) {
  const q = new URLSearchParams({ law_title: title, limit: String(limit) });
  return getJson<{
    total_count: number;
    laws: { law_info: LawInfo; revision_info: RevisionInfo }[];
  }>(`/laws?${q}`);
}

export function getRevisions(lawId: string) {
  return getJson<{ law_info: LawInfo; revisions: RevisionInfo[] }>(
    `/law_revisions/${lawId}`,
  );
}

export function getLawData(revisionId: string) {
  return getJson<LawDataResponse>(`/law_data/${revisionId}`);
}

/** ノード配下のテキストを全て連結する。抽出漏れ計測の分母に使う。 */
export function textOf(node: LawNode | string): string {
  if (typeof node === "string") return node;
  if (!node.children) return "";
  return node.children.map(textOf).join("");
}

/** 指定タグのノードを深さ優先で探す。 */
export function findFirst(node: LawNode, tag: string): LawNode | undefined {
  if (node.tag === tag) return node;
  for (const c of node.children ?? []) {
    if (typeof c === "string") continue;
    const hit = findFirst(c, tag);
    if (hit) return hit;
  }
  return undefined;
}
