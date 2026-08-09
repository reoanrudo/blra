"use client";

import { useMemo, type ReactNode } from "react";
import ArticleLayout from "@/components/article/ArticleLayout";
import FullLawViewer from "@/components/article/FullLawViewer";
import LawChangeNoticeBanner from "@/components/article/LawChangeNoticeBanner";
import OfficialTextCopyBoundary from "@/components/article/OfficialTextCopyBoundary";
import PrintLawButton from "@/components/article/PrintLawButton";
import ScrollUrlSync from "@/components/article/ScrollUrlSync";
import LeftPanel from "@/components/layout/LeftPanel";
import { CurrentLawProvider } from "@/contexts/CurrentLawContext";
import {
  ScrollActiveArticleProvider,
  useScrollActiveArticle,
} from "@/contexts/ScrollActiveArticleContext";
import { useFullLawDocument } from "@/hooks/useFullLawDocument";
import type {
  FullLawDocument,
  FullLawRevisionMetadata,
  LawRefreshDisplayStatus,
} from "@/lib/article/full-law-document";
import {
  useConfirmedRelations,
  type ConfirmedRelationsState,
} from "@/hooks/useConfirmedRelations";

interface FullLawReaderProps {
  lawRevisionId: string;
  initialArticleId: string;
  lawId: string;
  breadcrumb: ReactNode;
}

export default function FullLawReader(props: FullLawReaderProps) {
  return (
    <CurrentLawProvider lawId={props.lawId}>
      <FullLawReaderContent {...props} />
    </CurrentLawProvider>
  );
}

function FullLawReaderContent(props: FullLawReaderProps) {
  const state = useFullLawDocument(props.lawRevisionId);
  const relationsState = useConfirmedRelations(props.lawRevisionId);
  const emptyLinks = useMemo(() => new Map(), []);

  if (state.status === "loading") {
    return (
      <ArticleLayout
        breadcrumb={props.breadcrumb}
        leftPanel={
          <LeftPanel
            toc={[]}
            documentStatus="loading"
            currentArticleId={props.initialArticleId}
          />
        }
        center={<ReaderLoadingState />}
      />
    );
  }

  if (state.status === "error" || !state.document) {
    return (
      <ArticleLayout
        breadcrumb={props.breadcrumb}
        leftPanel={
          <LeftPanel
            toc={[]}
            documentStatus="error"
            currentArticleId={props.initialArticleId}
          />
        }
        center={<ReaderErrorState onRetry={state.retry} />}
      />
    );
  }

  return (
    <ScrollActiveArticleProvider linksByArticle={emptyLinks}>
      <FullLawReadyLayout
        {...props}
        document={state.document}
        relationsState={relationsState}
      />
    </ScrollActiveArticleProvider>
  );
}

type FullLawReadyLayoutProps = FullLawReaderProps & {
  document: FullLawDocument;
  relationsState: ConfirmedRelationsState;
};

function FullLawReadyLayout({
  document,
  initialArticleId,
  breadcrumb,
  relationsState,
}: FullLawReadyLayoutProps) {
  const scrollState = useScrollActiveArticle();
  const currentArticleId =
    scrollState?.activeArticleId ?? initialArticleId;

  return (
    <ArticleLayout
      breadcrumb={breadcrumb}
      leftPanel={
        <LeftPanel
          toc={document.toc}
          documentStatus="ready"
          currentArticleId={currentArticleId}
        />
      }
      center={
        <article className="law-page">
          <LawRunningHeader revision={document.revision} lawName={document.law.name} egovLawId={document.law.egovLawId} />
          <LawChangeNoticeBanner notice={document.revision.changeNotice} egovLawId={document.law.egovLawId} />
          {relationsState.status === "error" && (
            <ConfirmedRelationsPartialError onRetry={relationsState.retry} />
          )}
          <ScrollUrlSync initialArticleId={initialArticleId} />
          <OfficialTextCopyBoundary>
            <FullLawViewer
              document={document}
              targetArticleId={initialArticleId}
              confirmedRelationsBySource={
                relationsState.status === "ready" && relationsState.document
                  ? relationsState.document.relationsBySource
                  : {}
              }
            />
          </OfficialTextCopyBoundary>
        </article>
      }
    />
  );
}

/**
 * ISO 8601 文字列を Asia/Tokyo の "YYYY-MM-DD" へ整形する。
 * タイムゾーン付きでない日付（施行日等）はそのまま日付部を返す。
 * 表示の正確性が最優先のため、解析失敗時は元の文字列をそのまま返す。
 */
function formatTokyoDate(iso: string | null): string | null {
  if (!iso) return null;
  // 既に "YYYY-MM-DD" のみ（施行日）ならそのまま返す
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    // Asia/Tokyo (UTC+9) へ換算して YYYY-MM-DD を得る
    const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const yyyy = tokyo.getUTCFullYear();
    const mm = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(tokyo.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return iso;
  }
}

/**
 * ISO 8601 文字列を Asia/Tokyo の "YYYY-MM-DD HH:mm" へ整形する。
 */
function formatTokyoDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const yyyy = tokyo.getUTCFullYear();
    const mm = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(tokyo.getUTCDate()).padStart(2, "0");
    const hh = String(tokyo.getUTCHours()).padStart(2, "0");
    const min = String(tokyo.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

interface LawRunningHeaderProps {
  revision: FullLawRevisionMetadata;
  lawName: string;
  egovLawId: string;
}

/**
 * 現行版の施行日・確認状態を running header へ表示する（計画書 Task 14 Step 4）。
 *
 * verified       : 見出し「e-Gov現行施行版」
 * check_failed   : 見出し「最終検証済みe-Gov版」+ 注意文
 * never_checked  : 見出し「e-Gov版（最新確認未完了）」+ 注意文
 *
 * repealStatus !== "None" の場合は「廃止: YYYY-MM-DD」を表示する。
 * 既存の e-Gov 公式ページへのリンクは維持する。
 */
function LawRunningHeader({
  revision,
  lawName,
  egovLawId,
}: LawRunningHeaderProps) {
  const effectiveFrom = formatTokyoDate(revision.effectiveFrom);
  const sourceUpdatedAt = formatTokyoDateTime(revision.sourceUpdatedAt);
  const lastCheck = formatTokyoDateTime(revision.lastSuccessfulCheckAt);
  const repealed = revision.repealStatus && revision.repealStatus !== "None";
  const repealDate = formatTokyoDate(revision.repealDate);

  const heading = resolveHeadingLabel(revision.refreshStatus);
  const caution = resolveCautionText(revision.refreshStatus);

  return (
    <header className="law-running-header">
      <div className="min-w-0">
        <p className="law-running-header__law">{lawName}</p>
        <p className="law-running-header__section">{heading}</p>
        <dl className="law-running-header__meta mt-1 space-y-0.5 text-[11px] text-neutral-600">
          {effectiveFrom && (
            <div className="flex gap-1">
              <dt>施行日:</dt>
              <dd>{effectiveFrom}</dd>
            </div>
          )}
          {sourceUpdatedAt && (
            <div className="flex gap-1">
              <dt>e-Gov更新:</dt>
              <dd>{sourceUpdatedAt}</dd>
            </div>
          )}
          {lastCheck && (
            <div className="flex gap-1">
              <dt>最終確認:</dt>
              <dd>{lastCheck}</dd>
            </div>
          )}
          {repealed && repealDate && (
            <div className="flex gap-1 font-bold text-[#9d1f58]">
              <dt>廃止:</dt>
              <dd>{repealDate}</dd>
            </div>
          )}
        </dl>
        {caution && (
          <p
            data-law-refresh-caution={revision.refreshStatus}
            className="mt-1 text-[11px] text-amber-700"
          >
            {caution}
          </p>
        )}
      </div>
      <div
        data-print-hidden="true"
        className="law-running-header__actions flex items-center gap-3"
      >
        <PrintLawButton />
        <a
          href={`https://laws.e-gov.go.jp/law/${encodeURIComponent(egovLawId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-[#9d1f58] hover:underline"
        >
          e-Govで改正・施行情報を確認
        </a>
      </div>
    </header>
  );
}

function resolveHeadingLabel(status: LawRefreshDisplayStatus): string {
  switch (status) {
    case "verified":
      return "e-Gov現行施行版";
    case "check_failed":
      return "最終検証済みe-Gov版";
    case "never_checked":
      return "e-Gov版（最新確認未完了）";
  }
}

function resolveCautionText(
  status: LawRefreshDisplayStatus,
): string | null {
  switch (status) {
    case "check_failed":
      return "更新確認に失敗しました。表示中の版は最終検証済み版です。";
    case "never_checked":
      return "e-Govとの最新確認が完了していません。";
    default:
      return null;
  }
}

function ConfirmedRelationsPartialError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      role="status"
      className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <p className="font-bold">確認済みの関連を取得できませんでした</p>
      <p>法令本文は表示できます。</p>
      <button type="button" onClick={onRetry} className="mt-2 underline">
        関連だけ再試行
      </button>
    </section>
  );
}

function ReaderLoadingState() {
  return (
    <section
      className="law-page space-y-4"
      aria-live="polite"
      aria-label="法令本文を読み込み中"
    >
      <div className="h-5 w-1/3 animate-pulse rounded bg-neutral-200" />
      <div className="h-8 w-1/2 animate-pulse rounded bg-neutral-200" />
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="h-4 animate-pulse rounded bg-neutral-200"
          style={{ width: `${88 - (index % 3) * 12}%` }}
        />
      ))}
    </section>
  );
}

function ReaderErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="law-page py-12 text-center" role="alert">
      <h1 className="text-lg font-bold text-neutral-900">
        全文を取得できません
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        法令本文を表示できません
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded bg-[#2b2b2b] px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        再試行
      </button>
    </section>
  );
}
