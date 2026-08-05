import { createHash } from "node:crypto";

/**
 * e-Gov 法令API v2（https://laws.e-gov.go.jp/api/2）のベースURL。
 * テスト・ローカル上書きを許すため定数化しているが、本番では未設定で既定値を使う。
 */
const DEFAULT_EGOV_API_BASE =
  process.env.EGOV_API_BASE ?? "https://laws.e-gov.go.jp/api/2";

/**
 * 指定日のasof時点で施行済みの法令revision情報。
 * `current_revision_info`（将来版）は絶対に採用せず、`revision_info` のみを正とする。
 */
export interface EgovLawVersion {
  lawId: string;
  revisionId: string;
  title: string;
  effectiveFrom: string;
  sourceUpdatedAt: string;
  repealStatus: string;
  repealDate: string | null;
}

/**
 * e-Govから取得した公式XMLとその不変性証明。
 * checksumはXML正文のSHA-256。revisionIdは直前のgetLawVersionAtで検証済みの値を記録する。
 */
export interface FetchedLawXml {
  lawId: string;
  revisionId: string;
  xml: string;
  checksum: string;
  sourceUrl: string;
  fetchedAt: Date;
}

interface LawRecord {
  law_info?: { law_id?: unknown };
  revision_info?: RevisionInfo;
  current_revision_info?: { law_revision_id?: unknown } | null;
}

interface RevisionInfo {
  law_revision_id?: unknown;
  law_title?: unknown;
  amendment_enforcement_date?: unknown;
  updated?: unknown;
  repeal_status?: unknown;
  repeal_date?: unknown;
}

interface LawsResponse {
  laws?: LawRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`e-Gov API: ${field} が文字列ではありません`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function buildLawsUrl(
  lawId: string,
  asOf: string,
  base: string = DEFAULT_EGOV_API_BASE,
): string {
  const url = new URL(`${base}/laws`);
  url.searchParams.set("law_id", lawId);
  url.searchParams.set("asof", asOf);
  url.searchParams.set("response_format", "json");
  return url.toString();
}

function buildLawXmlUrl(
  lawId: string,
  asOf: string,
  base: string = DEFAULT_EGOV_API_BASE,
): string {
  const url = new URL(`${base}/law_file/xml/${encodeURIComponent(lawId)}`);
  url.searchParams.set("asof", asOf);
  return url.toString();
}

function ensureOk(response: Response, context: string): void {
  if (!response.ok) {
    throw new Error(
      `e-Gov API ${context}がHTTP ${response.status}で失敗しました`,
    );
  }
}

function toLawVersion(lawId: string, info: RevisionInfo): EgovLawVersion {
  return {
    lawId,
    revisionId: requireString(info.law_revision_id, "revision_info.law_revision_id"),
    title: requireString(info.law_title, "revision_info.law_title"),
    effectiveFrom: requireString(
      info.amendment_enforcement_date,
      "revision_info.amendment_enforcement_date",
    ),
    sourceUpdatedAt: requireString(info.updated, "revision_info.updated"),
    repealStatus: requireString(
      info.repeal_status,
      "revision_info.repeal_status",
    ),
    repealDate: optionalString(info.repeal_date),
  };
}

/**
 * 指定日（asOf）時点で施行済みの法令revisionを1件だけ返す。
 *
 * 制約:
 * - asOfは必須。APIへ必ずasofクエリパラメータを渡す。
 * - `current_revision_info`（将来版）は絶対に選ばない。`revision_info` のみを正とする。
 * - law_idは完全一致で1件だけ許可する。
 * - revision_info.amendment_enforcement_date が asOf より未来の場合は採用しない。
 */
export async function getLawVersionAt(
  lawId: string,
  asOf: string,
  fetcher: typeof fetch = fetch,
): Promise<EgovLawVersion> {
  const url = buildLawsUrl(lawId, asOf);
  const response = await fetcher(url);
  ensureOk(response, "laws");
  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.laws)) {
    throw new Error("e-Gov API: laws配列を取得できませんでした");
  }
  const body = payload as LawsResponse;

  // law_id 完全一致で厳密に絞る
  const matched = body.laws!.filter((law) => {
    const id = law.law_info?.law_id;
    return typeof id === "string" && id === lawId;
  });

  if (matched.length === 0) {
    throw new Error(
      `e-Gov API: law_id=${lawId} asof=${asOf} の法令が見つかりません (0件)`,
    );
  }
  if (matched.length > 1) {
    throw new Error(
      `e-Gov API: law_id=${lawId} で単一の法令を取得できません (${matched.length}件)`,
    );
  }

  const law = matched[0];
  const revisionInfo = law.revision_info;
  if (!revisionInfo || !isRecord(revisionInfo)) {
    // revision_infoがない＝asof時点で未施行。将来版へフォールバックしない。
    throw new Error(
      `e-Gov API: law_id=${lawId} asof=${asOf} に revision_info が存在しません（未施行の可能性）`,
    );
  }

  // 施行日が asOf より未来なら採用しない（二重防御）
  const enforcementDate = optionalString(
    revisionInfo.amendment_enforcement_date,
  );
  if (enforcementDate && enforcementDate > asOf) {
    throw new Error(
      `e-Gov API: law_id=${lawId} の revision_info は ${enforcementDate} 施行で asof=${asOf} より未来です`,
    );
  }

  return toLawVersion(lawId, revisionInfo);
}

function hasMainProvision(xml: string): boolean {
  // 軽量な構成チェック: <Law ...> と <MainProvision ...> が両方存在すること
  return /<Law[\s>]/i.test(xml) && /<MainProvision[\s>]/i.test(xml);
}

/**
 * 直前に getLawVersionAt で検証済みの version を使って公式XMLを取得する。
 *
 * 制約:
 * - revisionId はレスポンス由来ではなく入力 version の値を記録する（改竄耐性）。
 * - XMLに <Law> と <MainProvision> が必須。
 * - checksum はXML正文のSHA-256。
 */
export async function getLawXmlAt(
  version: EgovLawVersion,
  asOf: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchedLawXml> {
  const sourceUrl = buildLawXmlUrl(version.lawId, asOf);
  const response = await fetcher(sourceUrl);
  ensureOk(response, "law_file/xml");
  const xml = await response.text();
  if (!xml || xml.trim().length === 0) {
    throw new Error("e-Gov API: XML本文が空です");
  }
  if (!/<Law[\s>]/i.test(xml)) {
    throw new Error("e-Gov API: 取得XMLに <Law> 要素が存在しません");
  }
  if (!hasMainProvision(xml)) {
    throw new Error("e-Gov API: 取得XMLに <MainProvision> 要素が存在しません");
  }

  const checksum = createHash("sha256").update(xml).digest("hex");

  return {
    lawId: version.lawId,
    // 入力 version の revisionId を強制的に記録する（レスポンス由来の値は使わない）
    revisionId: version.revisionId,
    xml,
    checksum,
    sourceUrl,
    fetchedAt: new Date(),
  };
}
