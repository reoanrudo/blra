"use client";

import { useMemo, type ReactNode } from "react";
import ArticleLayout from "@/components/article/ArticleLayout";
import FullLawViewer from "@/components/article/FullLawViewer";
import ScrollUrlSync from "@/components/article/ScrollUrlSync";
import LeftPanel from "@/components/layout/LeftPanel";
import { CurrentLawProvider } from "@/contexts/CurrentLawContext";
import {
  ScrollActiveArticleProvider,
  useScrollActiveArticle,
} from "@/contexts/ScrollActiveArticleContext";
import { useFullLawDocument } from "@/hooks/useFullLawDocument";
import type { FullLawDocument } from "@/lib/article/full-law-document";

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
      <FullLawReadyLayout {...props} document={state.document} />
    </ScrollActiveArticleProvider>
  );
}

function FullLawReadyLayout({
  document,
  initialArticleId,
  breadcrumb,
}: FullLawReaderProps & { document: FullLawDocument }) {
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
          <header className="law-running-header">
            <div className="min-w-0">
              <p className="law-running-header__law">{document.law.name}</p>
              <p className="law-running-header__section">
                収録基準日: {document.revision.sourceDate ?? "未設定"}
              </p>
            </div>
            <a
              href={`https://laws.e-gov.go.jp/law/${encodeURIComponent(document.law.egovLawId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-[#9d1f58] hover:underline"
            >
              e-Govで改正・施行情報を確認
            </a>
          </header>
          <ScrollUrlSync initialArticleId={initialArticleId} />
          <FullLawViewer
            document={document}
            targetArticleId={initialArticleId}
          />
        </article>
      }
    />
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
