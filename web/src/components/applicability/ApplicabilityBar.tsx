"use client";

import { useRouter } from "next/navigation";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import { useApplicability } from "@/contexts/ApplicabilityContext";
import {
  APPLICABILITY_ANCHOR_LABELS,
  APPLICABILITY_ANCHORS,
  buildArticleHref,
  formatRevisionPeriod,
  type ApplicabilityAnchorType,
} from "@/lib/applicability/applicability-context";

export default function ApplicabilityBar({
  fallbackArticleId,
  effectiveFrom,
  effectiveTo,
  projectName,
}: {
  fallbackArticleId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  projectName?: string | null;
}) {
  const router = useRouter();
  const applicability = useApplicability();
  const scrollContext = useScrollActiveArticle();
  const articleId = scrollContext?.activeArticleId ?? fallbackArticleId;

  function replaceContext(
    anchor: ApplicabilityAnchorType,
    asOf: string,
  ): void {
    router.replace(
      buildArticleHref(articleId, {
        anchor,
        asOf,
        projectId: applicability.context.projectId,
      }),
    );
  }

  return (
    <section
      aria-label="適用時点"
      className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-300 bg-white px-3 py-2 sm:px-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-neutral-800">適用時点</span>
        <select
          aria-label="適用アンカー"
          value={applicability.context.anchor}
          onChange={(event) => {
            const anchor = event.target.value as ApplicabilityAnchorType;
            replaceContext(
              anchor,
              anchor === "TODAY"
                ? applicability.today
                : applicability.context.asOf,
            );
          }}
          className="border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 focus:border-[#d92f7e] focus:outline-none"
        >
          {APPLICABILITY_ANCHORS.map((anchor) => (
            <option key={anchor} value={anchor}>
              {APPLICABILITY_ANCHOR_LABELS[anchor]}
            </option>
          ))}
        </select>
        <input
          aria-label="基準日"
          type="date"
          value={applicability.context.asOf}
          disabled={applicability.context.anchor === "TODAY"}
          onInput={(event) => {
            if (event.currentTarget.value) {
              replaceContext(
                applicability.context.anchor,
                event.currentTarget.value,
              );
            }
          }}
          className="border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-600"
        />
      </div>

      <p className="text-[11px] text-neutral-600">
        条文版:{" "}
        {effectiveFrom
          ? formatRevisionPeriod(effectiveFrom, effectiveTo)
          : "指定日に表示可能な版なし"}
      </p>

      {projectName && (
        <p className="text-[11px] text-neutral-600">
          プロジェクト: {projectName}
        </p>
      )}
    </section>
  );
}
