import type { ArticleRow, ChapterArticle } from "@/lib/article/article";
import { groupSupplementaryProvisions } from "@/lib/article/toc-supplements";
import type { TocNode } from "@/lib/article/toc-tree";
import type { OutgoingLinkRow } from "@/lib/link/link";

export interface FullLawNode extends Omit<ArticleRow, "lawName"> {
  path: number[];
}

/**
 * 現行法令の表示用更新状態。
 *
 * - verified       : 最新の確認が成功した現行施行版
 * - check_failed   : 最新の確認が失敗し、最後に成功した版を表示している
 * - never_checked  : e-Govとの最新確認が一度も完了していない
 *
 * 内部のエラー詳細（lastErrorCode/lastErrorDetail）はDTOへ含めない。
 */
export type LawRefreshDisplayStatus =
  | "verified"
  | "check_failed"
  | "never_checked";

/**
 * 現行版の施行日・出典・同期状態を含むRevisionメタデータ。
 *
 * 計画書 Task 14 Step 3 に基づき、従来の `sourceDate`（固定収録基準日）を廃止し、
 * e-Gov現行施行版の鮮度情報へ置き換える。
 */
export interface FullLawRevisionMetadata {
  id: string;
  editionKey: string;
  /** 施行日（LawRevision.effectiveAsOf）。公開版が施行された日。 */
  effectiveFrom: string;
  /** e-Gov側のXML更新日時（LawRevision.sourceUpdatedAt）。未取得の場合は null。 */
  sourceUpdatedAt: string | null;
  /** 取得日時（LawRevision.fetchedAt）。 */
  fetchedAt: string;
  /** 最後に成功した確認日時（LawSyncState.lastSuccessfulCheckAt）。未確認なら null。 */
  lastSuccessfulCheckAt: string | null;
  /** 最後の確認試行日時（LawSyncState.lastAttemptAt）。未試行なら null。 */
  lastAttemptAt: string | null;
  /** 表示用更新状態。 */
  refreshStatus: LawRefreshDisplayStatus;
  /**
   * 更新確認の内部エラーコード（LawSyncState.lastErrorCode）。
   * 詳細メッセージは含まず、カテゴリ識別のみ。正常時は null。
   */
  refreshErrorCode: string | null;
  /** 廃止状態（LawSyncState.repealStatus）。未設定時は "None" 扱い。 */
  repealStatus: string | null;
  /** 廃止日（LawSyncState.repealDate）。 */
  repealDate: string | null;
  /**
   * 変更通知バナー用データ（設計書 §13.2）。
   * 直近の更新で変更があった場合のみ非 null。
   * null の場合はバナーを表示しない（unchanged, 初回導入, 未施行等）。
   */
  changeNotice: LawChangeNotice | null;
}

/**
 * 変更通知バナーの表示データ（設計書 §13.2）。
 */
export interface LawChangeNotice {
  /** 変更された条番号のリスト（例: ["第6条", "第12条", "第48条"]）。 */
  changedArticleNumbers: string[];
  /** 変更件数（modified + added + removed の合計）。 */
  changeCount: number;
}

export interface FullLawDocument {
  law: {
    id: string;
    egovLawId: string;
    name: string;
    shortName: string | null;
  };
  revision: FullLawRevisionMetadata;
  toc: TocNode[];
  nodes: FullLawNode[];
  linksBySource: Record<string, OutgoingLinkRow[]>;
}

export type FullLawBlock =
  | { kind: "heading"; node: ArticleRow }
  | { kind: "article"; article: ChapterArticle };

const headingLevels = new Set(["chapter", "section", "subsection"]);
const articleRootLevels = new Set([
  "article",
  "suppl_provision",
  "appdx_table",
]);
const tocLevels = new Set([
  "chapter",
  "section",
  "subsection",
  "article",
  "appdx_table",
  "table_struct",
  "table",
  "suppl_provision",
]);

export function fullLawAnchorId(articleId: string): string {
  return `law-node-${articleId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

export function fullLawTargetSelector(articleId: string): string {
  return `#${fullLawAnchorId(articleId)}`;
}

export function readerArticleHref(articleId: string): string {
  return `/articles/${encodeURIComponent(articleId)}`;
}

export function buildFullLawBlocks(
  nodes: FullLawNode[],
  lawName: string,
): FullLawBlock[] {
  const blocks: FullLawBlock[] = [];
  let currentArticle: ChapterArticle | null = null;

  const flushArticle = () => {
    if (!currentArticle) return;
    blocks.push({ kind: "article", article: currentArticle });
    currentArticle = null;
  };

  for (const node of nodes) {
    const articleRow: ArticleRow = { ...node, lawName };

    if (headingLevels.has(node.level)) {
      flushArticle();
      blocks.push({ kind: "heading", node: articleRow });
      continue;
    }

    if (articleRootLevels.has(node.level)) {
      flushArticle();
      currentArticle = { root: articleRow, children: [] };
      continue;
    }

    currentArticle?.children.push(articleRow);
  }

  flushArticle();
  return blocks;
}

export function buildFullLawToc(nodes: FullLawNode[]): TocNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const toc = nodes
    .filter((node) => {
      if (tocLevels.has(node.level)) return true;
      if (node.level !== "paragraph" || !node.parentId) return false;
      return nodeById.get(node.parentId)?.level === "suppl_provision";
    })
    .map<TocNode>((node) => ({
      id: node.id,
      parentId: node.parentId,
      level: node.level,
      title: node.title,
      articleNumber: node.articleNumber,
      caption: node.caption,
      sortOrder: node.sortOrder,
      depth: node.depth,
      path: node.path,
      textFirstLine: node.text?.split("\n", 1)[0] ?? null,
      paragraphNumber: node.paragraphNumber,
    }));

  return groupSupplementaryProvisions(toc, nodes[0]?.lawId ?? "law");
}
