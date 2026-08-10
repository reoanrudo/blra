"use client";

import { useMemo, type ReactNode } from "react";
import ArticleLayout from "@/components/article/ArticleLayout";
import FullLawViewer from "@/components/article/FullLawViewer";
import LawChangeNoticeBanner from "@/components/article/LawChangeNoticeBanner";
import OfficialTextCopyBoundary from "@/components/article/OfficialTextCopyBoundary";
import ContextMenuProvider from "@/components/system/ContextMenuProvider";
import ScrollUrlSync from "@/components/article/ScrollUrlSync";
import LeftPanel from "@/components/layout/LeftPanel";
import { CurrentLawProvider } from "@/contexts/CurrentLawContext";
import {
  ScrollActiveArticleProvider,
  useScrollActiveArticle,
} from "@/contexts/ScrollActiveArticleContext";
import { useFullLawDocument } from "@/hooks/useFullLawDocument";
import type { FullLawDocument } from "@/lib/article/full-law-document";
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
      <ContextMenuProvider>
        <FullLawReaderContent {...props} />
      </ContextMenuProvider>
    </CurrentLawProvider>
  );
}

function FullLawReaderContent(props: FullLawReaderProps) {
  const state = useFullLawDocument(props.lawRevisionId);
  const relationsState = useConfirmedRelations(props.lawRevisionId);
  const emptyLinks = useMemo(() => new Map(), []);

  // loading / error / ready の全状態で ScrollActiveArticleProvider でラップし、
  // ArticleLayout のツリー位置を一定に保つ。
  // これにより loading→ready 遷移で <main> DOMノードが再作成されるのを防ぎ、
  // scrollTop がリセットされないようにする。
  return (
    <ScrollActiveArticleProvider linksByArticle={emptyLinks}>
      {state.status === "loading" ? (
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
      ) : state.status === "error" || !state.document ? (
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
      ) : (
        <FullLawReadyLayout
          {...props}
          document={state.document}
          relationsState={relationsState}
        />
      )}
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
          <LawRunningHeader
            lawName={document.law.name}
            egovLawId={document.law.egovLawId}
          />
          <div data-print-hidden="true">
            <LawChangeNoticeBanner
              notice={document.revision.changeNotice}
              egovLawId={document.law.egovLawId}
            />
          </div>
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

interface LawRunningHeaderProps {
  lawName: string;
  egovLawId: string;
}

function LawRunningHeader({
  lawName,
  egovLawId,
}: LawRunningHeaderProps) {
  return (
    <header className="law-running-header">
      <p className="law-running-header__law">{lawName}</p>
      <div
        data-print-hidden="true"
        className="law-running-header__actions flex items-center gap-3"
      >
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

function ConfirmedRelationsPartialError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      data-print-hidden="true"
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
