"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  buildArticleHref,
  type ApplicabilityContextValue,
} from "@/lib/applicability/applicability-context";

export interface ApplicabilitySnapshot {
  applicabilityAnchor: ApplicabilityContextValue["anchor"];
  applicabilityDate: string;
  snapshotLawRevisionId: string | null;
}

interface ApplicabilityClientContextValue {
  context: ApplicabilityContextValue;
  today: string;
  lawRevisionId: string | null;
  articleHref: (articleId: string) => string;
  snapshot: ApplicabilitySnapshot;
}

const ApplicabilityContext =
  createContext<ApplicabilityClientContextValue | null>(null);

export function ApplicabilityProvider({
  children,
  context,
  today,
  lawRevisionId,
}: {
  children: ReactNode;
  context: ApplicabilityContextValue;
  today: string;
  lawRevisionId: string | null;
}) {
  const value = useMemo<ApplicabilityClientContextValue>(
    () => ({
      context,
      today,
      lawRevisionId,
      articleHref: (articleId) => buildArticleHref(articleId, context),
      snapshot: {
        applicabilityAnchor: context.anchor,
        applicabilityDate: context.asOf,
        snapshotLawRevisionId: lawRevisionId,
      },
    }),
    [context, lawRevisionId, today],
  );

  return (
    <ApplicabilityContext.Provider value={value}>
      {children}
    </ApplicabilityContext.Provider>
  );
}

export function useApplicability(): ApplicabilityClientContextValue {
  const value = useContext(ApplicabilityContext);
  if (!value) {
    throw new Error(
      "useApplicability must be used within ApplicabilityProvider",
    );
  }
  return value;
}

export function useOptionalApplicability(): ApplicabilityClientContextValue | null {
  return useContext(ApplicabilityContext);
}
