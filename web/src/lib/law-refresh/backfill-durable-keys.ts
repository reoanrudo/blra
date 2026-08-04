/**
 * 現行120法令の Article へ durable key と bodyChecksum を安全に backfill するための
 * 純粋関数と型。
 *
 * 計画書 Task 9 Step 3 のアルゴリズム:
 * 1. 既存Article（DB）とparser node（XML）を legacyStableNodeKey で1対1照合する。
 * 2. 件数、contentChecksum、親子数（各親の子供数）がすべて一致した法令だけ更新対象にする。
 * 3. 同じ legacyStableNodeKey で contentChecksum が1件でも違えば法令全体を
 *    BACKFILL_CHECKSUM_MISMATCH で拒否（throw）する。これは原本XMLがDB取込時と
 *    異なることを意味し、durable key の付与が安全でないため。
 *
 * 本モジュールはDB接続を持たない純粋関数のみで構成する。
 * DB読み書きは CLI（scripts/backfill-current-law-durable-keys.ts）が行う。
 */

// ─── 入力型（DBノード） ───

/**
 * DB側 Article の backfill 計画に必要な最小の情報。
 * CLI側で Prisma から select してこの形へ詰め替える。
 */
export interface BackfillDbNode {
  /** Article.id（更新対象の主キー）。 */
  id: string;
  /** Article.stableNodeKey。parser の legacyStableNodeKey と同一概念。 */
  stableNodeKey: string;
  /** Article.contentChecksum。parser の contentChecksum と一致検証に使う。 */
  contentChecksum: string;
  /**
   * 親Articleの stableNodeKey。root 直属の場合は null または省略。
   * 親子構造の一致検証（各親の子供数がDB側・XML側で同じか）に使う。
   * CLI側で parentId を経由して親の stableNodeKey を解決して詰める。
   * 計画書 Step 1 の指定テストケースが省略形で呼ぶため optional にする。
   */
  parentStableNodeKey?: string | null;
}

// ─── 入力型（parserノード） ───

/**
 * XML 側ノードの backfill 計画に必要な最小の情報。
 * ParsedLawNode から詰め替える。
 */
export interface BackfillParsedNode {
  /** parser の legacyStableNodeKey。DB の stableNodeKey と対応する。 */
  legacyStableNodeKey: string;
  /** parser の durableNodeKey。DB の Article.durableNodeKey へ書き込む値。 */
  durableNodeKey: string;
  /** parser の contentChecksum。DB の contentChecksum と一致検証に使う。 */
  contentChecksum: string;
  /** parser の bodyChecksum。DB の Article.bodyChecksum へ書き込む値。省略時は contentChecksum を使う。 */
  bodyChecksum?: string;
  /** 親ノードの legacyStableNodeKey。root 直属の場合は null または省略。 */
  parentLegacyStableNodeKey?: string | null;
}

// ─── 出力型 ───

/**
 * 1ノード分の更新計画。CLI側で Article をこの情報で更新する。
 */
export interface DurableKeyBackfillUpdate {
  /** 更新対象 Article.id。 */
  articleId: string;
  /** 新たに設定する durableNodeKey。 */
  durableNodeKey: string;
  /** 新たに設定する bodyChecksum。 */
  bodyChecksum: string;
}

/**
 * 1法令分の backfill 計画。
 * ready=true のときだけ updates が意味を持ち、本実行してよい。
 * ready=false のときは errorCode にブロック理由が入る。
 */
export interface DurableKeyBackfillPlan {
  /** 更新対象かどうか。 */
  ready: boolean;
  /** ready=false のときのブロック理由コード。ready=true なら null。 */
  errorCode: string | null;
  /** 更新計画。ready=false のときは空配列。 */
  updates: DurableKeyBackfillUpdate[];
}

/**
 * dry-run / 本実行後に CLI が集計して表示する法令群の報告。
 */
export interface DurableKeyBackfillReport {
  lawsChecked: number;
  lawsReady: number;
  lawsBlocked: number;
  nodesReady: number;
  blocked: Array<{ lawId: string; errorCode: string }>;
}

// ─── エラー ───

/**
 * 同じ legacyStableNodeKey で DB と XML の contentChecksum が異なるときの例外。
 * 原本XMLがDB取込時から変更されていることを意味し、durable key の付与が安全でないため
 * 法令全体をただちに拒否する。計画書 Step 1 の指定要件。
 */
export class BackfillChecksumMismatchError extends Error {
  readonly code = "BACKFILL_CHECKSUM_MISMATCH" as const;
  readonly lawId?: string;
  readonly stableNodeKey: string;
  readonly dbChecksum: string;
  readonly xmlChecksum: string;

  constructor(detail: {
    stableNodeKey: string;
    dbChecksum: string;
    xmlChecksum: string;
    lawId?: string;
  }) {
    super(
      `BACKFILL_CHECKSUM_MISMATCH: stableNodeKey=${detail.stableNodeKey} ` +
        `dbChecksum=${detail.dbChecksum} xmlChecksum=${detail.xmlChecksum}` +
        (detail.lawId ? ` lawId=${detail.lawId}` : ""),
    );
    this.name = "BackfillChecksumMismatchError";
    this.stableNodeKey = detail.stableNodeKey;
    this.dbChecksum = detail.dbChecksum;
    this.xmlChecksum = detail.xmlChecksum;
    this.lawId = detail.lawId;
  }
}

// ─── 純粋関数 ───

/**
 * DBノード配列とparserノード配列から1法令分の backfill 計画を作成する。
 *
 * アルゴリズム（計画書 Step 3）:
 * 1. 件数が一致しなければ BACKFILL_NODE_COUNT_MISMATCH（blocked）。
 * 2. legacyStableNodeKey の集合が一致しなければ BACKFILL_KEY_SET_MISMATCH（blocked）。
 * 3. 同じキーで contentChecksum が1件でも違えば BACKFILL_CHECKSUM_MISMATCH（throw）。
 *    checksum 不一致は「原本が変わった」ことを意味し、安全のため法令全体を拒否する。
 * 4. 各親（root 含む）の子供数がDB側・XML側で一致しなければ
 *    BACKFILL_PARENT_CHILD_MISMATCH（blocked）。
 * 5. すべて通れば ready=true で updates を返す。
 *
 * この関数は副作用を持たず、DB接続も行わない。
 *
 * @param dbNodes DB側ノード（active な Revision に属する Article 群）
 * @param parsedNodes XML側ノード（同じ Revision の原本XMLを parse した結果）
 */
export function planDurableKeyBackfill(
  dbNodes: readonly BackfillDbNode[],
  parsedNodes: readonly BackfillParsedNode[],
): DurableKeyBackfillPlan {
  // Step 1: 件数チェック
  if (dbNodes.length !== parsedNodes.length) {
    return blockedPlan("BACKFILL_NODE_COUNT_MISMATCH");
  }

  // 両方空なら成功（更新なし）
  if (dbNodes.length === 0) {
    return { ready: true, errorCode: null, updates: [] };
  }

  // Step 2: キー集合チェック
  // DB 側は stableNodeKey で一意（@@unique([lawRevisionId, stableNodeKey])）。
  // XML 側も parser の不変条件で legacyStableNodeKey が一意。
  const dbByKey = new Map<string, BackfillDbNode>();
  for (const node of dbNodes) {
    dbByKey.set(node.stableNodeKey, node);
  }
  const xmlByKey = new Map<string, BackfillParsedNode>();
  for (const node of parsedNodes) {
    xmlByKey.set(node.legacyStableNodeKey, node);
  }

  // 集合の差を検出（件数が同じなので、片方にしかないキーがあれば反対側にも無い）
  for (const key of dbByKey.keys()) {
    if (!xmlByKey.has(key)) {
      return blockedPlan("BACKFILL_KEY_SET_MISMATCH");
    }
  }
  for (const key of xmlByKey.keys()) {
    if (!dbByKey.has(key)) {
      return blockedPlan("BACKFILL_KEY_SET_MISMATCH");
    }
  }

  // Step 3: checksum チェック（1件でも違えば throw）
  for (const [key, dbNode] of dbByKey) {
    const xmlNode = xmlByKey.get(key)!;
    if (dbNode.contentChecksum !== xmlNode.contentChecksum) {
      throw new BackfillChecksumMismatchError({
        stableNodeKey: key,
        dbChecksum: dbNode.contentChecksum,
        xmlChecksum: xmlNode.contentChecksum,
      });
    }
  }

  // Step 4: 親子構造チェック
  // 各親キー（null=root直属）ごとの小孩数がDB側・XML側で一致するか。
  // optional フィールドを null へ正規化してから数える。
  const dbChildCounts = countChildrenByParent(dbNodes, (n) =>
    n.parentStableNodeKey === undefined ? null : n.parentStableNodeKey,
  );
  const xmlChildCounts = countChildrenByParent(parsedNodes, (n) =>
    n.parentLegacyStableNodeKey === undefined ? null : n.parentLegacyStableNodeKey,
  );
  if (dbChildCounts.size !== xmlChildCounts.size) {
    return blockedPlan("BACKFILL_PARENT_CHILD_MISMATCH");
  }
  for (const [parentKey, dbCount] of dbChildCounts) {
    const xmlCount = xmlChildCounts.get(parentKey);
    if (xmlCount !== dbCount) {
      return blockedPlan("BACKFILL_PARENT_CHILD_MISMATCH");
    }
  }

  // Step 5: すべて通れば更新計画を作成
  // bodyChecksum が省略されたノード（計画書指定テストケース等）は
  // 安全のため contentChecksum をフォールバック値として使う。
  // 実運用の CLI は常に parser の bodyChecksum を渡すため影響しない。
  const updates: DurableKeyBackfillUpdate[] = parsedNodes.map((node) => {
    const dbNode = dbByKey.get(node.legacyStableNodeKey)!;
    return {
      articleId: dbNode.id,
      durableNodeKey: node.durableNodeKey,
      bodyChecksum: node.bodyChecksum ?? node.contentChecksum,
    };
  });

  return { ready: true, errorCode: null, updates };
}

// ─── 内部ヘルパー ───

function blockedPlan(errorCode: string): DurableKeyBackfillPlan {
  return { ready: false, errorCode, updates: [] };
}

/**
 * 親キー（null 含む）ごとの子供数を数える。
 * null は親無し（root 直属）を表す。Map のキーには特別な sentinel を使う。
 */
function countChildrenByParent<T>(
  nodes: readonly T[],
  getParent: (node: T) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const parent = getParent(node);
    // null は特別な sentinel 文字列へ射影してMapキーにする
    const key = parent ?? "\u0000__ROOT__";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
