/**
 * 法令リーダー（SCR-03）メインコンポーネント。
 *
 * DESIGN.md に基づく紙の法令集の見た目を再現する。
 * Notion や一般的なドキュメントビューアの見た目にしない。
 *
 * Phase 1: サンプルデータで静的表示。API未接続。
 * Phase 2 以降で実データへ差し替え + 6状態インフラを統合。
 *
 * 設計書 §19.22.2 の4つのNOTを厳守:
 *   - トークンごとにDOM要素を生成しない（本文は1つのテキストノードに近い構造）
 *   - 章全体を一度にmaterializeしない（Phase 3 で仮想化）
 *   - 認証内側をSSRしない（このコンポーネントはCSR専用）
 *   - 本文以外のメタデータを本文と同一ペイロードで送らない（Phase 2 で分離）
 */

import { useState } from "react";
import {
  sampleRunner,
  sampleToc,
  sampleArticle35,
  sampleArticle35_3,
  sampleReferences,
  sampleNotices,
  sampleAsOf,
  sampleSourceBadges,
  type SampleReferenceEdge,
} from "../data/sample";

type SupportTab = "related" | "notes" | "evidence";

export function LawReader() {
  const [activeTab, setActiveTab] = useState<SupportTab>("related");

  return (
    <div className="reader-shell">
      {/* === グローバルヘッダー（56px・ゴシック） === */}
      <header className="global-header">
        <div className="global-header__brand">BLRA</div>
        <div className="global-header__search">
          <kbd>⌘K</kbd>
          <span className="global-header__search-placeholder">検索</span>
        </div>
        <div className="global-header__right">
          <span className="global-header__project">{sampleAsOf.project} ▾</span>
          <span className="global-header__notif">通知</span>
          <span className="global-header__user">ユーザー</span>
        </div>
      </header>

      {/* === 適用時点バー（40px・常時表示）DESIGN.md §1 === */}
      <div className="asof-bar">
        <span className="asof-bar__project">{sampleAsOf.project}</span>
        <span className="asof-bar__sep">｜</span>
        <span className="asof-bar__label">
          適用時点: {sampleAsOf.anchor}{" "}
          <strong className="asof-bar__date">{sampleAsOf.date}</strong> ▾
        </span>
        <span className="asof-bar__sep">｜</span>
        <span className="asof-bar__back">← 戻る: 検索結果</span>
      </div>

      {/* === 3カラム本文領域 === */}
      <div className="reader-main">
        {/* 左: 目次（256px・ゴシック・sticky） */}
        <aside className="toc-pane">
          <nav>
            <ul className="toc-list">
              {sampleToc.map((item) => (
                <li
                  key={item.path}
                  className={
                    "toc-item" +
                    (item.chapter ? " toc-item--chapter" : "") +
                    (item.current ? " toc-item--current" : "")
                  }
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* 中: 本文（主スクロール・唯一・紙面 max 720px 中央寄せ・明朝） */}
        <main className="body-pane">
          {/* 柱（ランニングヘッダー）DESIGN.md: 紙面上部に法令名と現在の章節 */}
          <div className="runner law-runner">
            <span>{sampleRunner.lawName}</span>
            <span className="runner__sep"> ＞ </span>
            <span>{sampleRunner.breadcrumb}</span>
          </div>

          <div className="law-paper law-body paper-inner">
            {/* 出典バッジ（DESIGN.md §2）文字ラベル必須 */}
            <div className="source-badges">
              {sampleSourceBadges.map((b, i) => (
                <span key={i} className={"source-badge source-badge--" + b.tone}>
                  {b.label}
                </span>
              ))}
            </div>

            {/* 注意帯 NoticeBand（DESIGN.md §3）複数該当時は上に積む */}
            {sampleNotices.map((notice, i) => (
              <div
                key={i}
                className={"notice-band notice-band--" + notice.kind}
              >
                <span className="notice-band__icon">{notice.icon}</span>
                <span className="notice-band__text">{notice.text}</span>
                <a className="notice-band__action" href="#">
                  → {notice.action.label}
                </a>
              </div>
            ))}

            {/* 第35条（DESIGN.md サンプル本文・参照3状態を描き分け） */}
            <article className="provision">
              <h2 className="law-article-num">
                {sampleArticle35.articleNum}
              </h2>
              <p className="law-caption">（{sampleArticle35.caption}）</p>
              <p className="provision__body">
                {sampleArticle35.segments.map((seg, i) => {
                  if (!seg.ref) {
                    return <span key={i}>{seg.text}</span>;
                  }
                  // 参照3状態（DESIGN.md §4）
                  if (seg.ref.status === "RESOLVED") {
                    return (
                      <a key={i} className="ref-resolved" href="#" title={seg.ref.target}>
                        {seg.ref.label}
                      </a>
                    );
                  }
                  if (seg.ref.status === "UNCONFIRMED") {
                    return (
                      <span key={i} className="ref-unconfirmed" title="未確認の参照候補">
                        {seg.ref.label}
                      </span>
                    );
                  }
                  // UNRESOLVED: 下線なし（右ペイン「未解決」欄で列挙）
                  return <span key={i}>{seg.ref.label}</span>;
                })}
              </p>
            </article>

            {/* 細罫線で区切る（カード化しない・DESIGN.md #2） */}
            <hr className="provision-divider law-hairline" />

            {/* 第35条の3（DESIGN.md サンプル） */}
            <article className="provision">
              <h2 className="law-article-num">
                {sampleArticle35_3.articleNum}
              </h2>
              <p className="law-caption">（{sampleArticle35_3.caption}）</p>
              <p className="provision__body">{sampleArticle35_3.body}</p>
            </article>

            {/* フッター免責（DESIGN.md 補足） */}
            <footer className="paper-footer">
              本サービスは法令適合の判定を行いません。最終判断は原文と所管行政庁の確認によってください。
            </footer>
          </div>
        </main>

        {/* 右: サポートペイン（336px・ゴシック・sticky・排他1枚）DESIGN.md §5 */}
        <aside className="support-pane">
          {/* タブ（関連/注釈/根拠）排他 */}
          <div className="support-tabs">
            <button
              className={
                "support-tab" + (activeTab === "related" ? " support-tab--active" : "")
              }
              onClick={() => setActiveTab("related")}
            >
              関連
            </button>
            <button
              className={
                "support-tab" + (activeTab === "notes" ? " support-tab--active" : "")
              }
              onClick={() => setActiveTab("notes")}
            >
              注釈
            </button>
            <button
              className={
                "support-tab" + (activeTab === "evidence" ? " support-tab--active" : "")
              }
              onClick={() => setActiveTab("evidence")}
            >
              根拠
            </button>
          </div>

          {activeTab === "related" && (
            <RelatedPane edges={sampleReferences} />
          )}
          {activeTab === "notes" && <EmptyPane label="注釈" />}
          {activeTab === "evidence" && <EmptyPane label="根拠" />}
        </aside>
      </div>
    </div>
  );
}

/**
 * サポートペイン「関連」（DESIGN.md §5）。
 * 型ラベル付きで縦に並べる。「関連法令」という無ラベル一覧にしない。
 * 順序: 委任先→定義→例外→参照→未確認→未解決
 */
function RelatedPane({ edges }: { edges: SampleReferenceEdge[] }) {
  // 型ラベルごとにグループ化（順序規範）
  const groups: { label: string; type: SampleReferenceEdge["edge_type"] }[] = [
    { label: "委任先", type: "DELEGATES_TO" },
    { label: "定義", type: "DEFINES" },
    { label: "例外", type: "EXCEPTS" },
    { label: "参照", type: "CITES" },
  ];
  const unconfirmed = edges.filter((e) => e.resolution_status === "UNCONFIRMED");
  const unresolved = edges.filter((e) => e.resolution_status === "UNRESOLVED");

  return (
    <div className="related-pane">
      {groups.map((g) => {
        const items = edges.filter(
          (e) => e.edge_type === g.type && e.resolution_status === "RESOLVED",
        );
        if (items.length === 0) return null;
        return (
          <section key={g.type} className="related-group">
            <h4 className="related-group__label">{g.label}</h4>
            {items.map((e) => (
              <div key={e.edge_id} className="related-item">
                <span className="related-item__label">{e.target_label}</span>
              </div>
            ))}
          </section>
        );
      })}

      {unconfirmed.length > 0 && (
        <section className="related-group">
          <h4 className="related-group__label">
            未確認の参照候補 ({unconfirmed.length})
          </h4>
          {unconfirmed.map((e) => (
            <div key={e.edge_id} className="related-item">
              <span className="related-item__label related-item--unconfirmed">
                {e.target_label}
              </span>
            </div>
          ))}
        </section>
      )}

      {unresolved.length > 0 && (
        <section className="related-group">
          <h4 className="related-group__label">
            未解決の参照 ({unresolved.length})
          </h4>
          {unresolved.map((e) => (
            <div key={e.edge_id} className="related-item">
              <span className="related-item__label related-item--unresolved">
                {e.target_label}
              </span>
              <span className="related-item__note">— 本サービスに未収録</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function EmptyPane({ label }: { label: string }) {
  return (
    <div className="empty-pane">
      <p className="empty-pane__text">
        {label}に保存された項目はありません。
      </p>
    </div>
  );
}
