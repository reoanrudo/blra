"use client";

import { useMemo } from "react";
import HistoricalArticleNotice from "@/components/article/HistoricalArticleNotice";
import {
  ArticleNode,
  levelHeadingClass,
} from "@/lib/article/article-renderer";
import {
  articleContextTitle,
  type ArticleRow,
} from "@/lib/article/article";

/**
 * 旧 Revision 条文を読み取り専用で表示するクライアントコンポーネント（Task 13）。
 *
 * removed / historical 解決のとき、page.tsx から現行スコープを迂回して取得した
 * HistoricalArticleDocument を受け取り、ArticleNode を使って本文を描画する。
 * 編集・ハイライト作成操作は出さない（リンク解決も行わない）。
 *
 * HistoricalArticleNotice で「削除済み」または「対応未確認」を先頭に示す。
 */

export interface HistoricalArticleTreeProps {
  /** 旧 Article subtree（root + 子孫）。 */
  tree: ArticleRow[];
  /** 法令名。 */
  lawName: string;
  /** 旧 Revision の公式版キー。 */
  officialVersionKey: string;
  /** 旧 Revision の施行日（ISO 文字列）。 */
  effectiveFrom: string | null;
  /** 表示モード。 */
  kind: "removed" | "historical";
  /** historical の理由。 */
  reason?: "ambiguous" | "unmapped";
}

export default function HistoricalArticleTree({
  tree,
  lawName,
  officialVersionKey,
  effectiveFrom,
  kind,
  reason,
}: HistoricalArticleTreeProps) {
  const root = tree[0];
  const heading = useMemo(
    () => (root ? articleContextTitle([root]) : lawName),
    [root, lawName],
  );

  if (!root) return null;

  const descendants = tree.slice(1);

  return (
    <article className="law-page">
      <header className="law-running-header">
        <div className="min-w-0">
          <p className="law-running-header__law">{lawName}</p>
          <p className="law-running-header__section">
            版本: {officialVersionKey}
            {effectiveFrom ? ` （施行: ${formatDate(effectiveFrom)}）` : ""}
          </p>
        </div>
      </header>

      <HistoricalArticleNotice
        kind={kind}
        reason={reason}
        lawName={lawName}
        officialVersionKey={officialVersionKey}
        effectiveFrom={effectiveFrom}
      />

      <h2 className="law-heading law-heading--article">{heading}</h2>

      <div className="law-nodes">
        {descendants.length === 0
          ? renderRootText(root)
          : descendants.map((row) => (
              <ArticleNode key={row.id} row={row} outgoingLinks={[]} />
            ))}
      </div>
    </article>
  );
}

/**
 * 子孫が無いルート（単独条など）の本文を描画する。
 * ArticleNode は its own indent/label を持つためそのまま使う。
 */
function renderRootText(root: ArticleRow) {
  // ルートが heading 系（chapter/section/subsection）なら見出しとして表示。
  const headingLevels = new Set(["chapter", "section", "subsection"]);
  if (headingLevels.has(root.level)) {
    return (
      <h3 className={levelHeadingClass(root.level)}>
        {root.title && <span>{root.title}</span>}
      </h3>
    );
  }
  return <ArticleNode row={root} outgoingLinks={[]} />;
}

/** ISO 日付文字列を「YYYY年MM月DD日」へ整形する。 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}年${m}月${d}日`;
}
