"use client";

import { useEffect, useMemo, useRef } from "react";
import { useHighlight } from "@/contexts/HighlightContext";
import { useAnnotation } from "@/contexts/AnnotationContext";
import { useUserHighlights } from "@/contexts/UserHighlightContext";
import { applyUserHighlights } from "@/lib/highlight/user-highlight-renderer";

const CONDITION_CLASS_MAP: Record<string, string> = {
  useDistrict: "highlight-border-use-district highlight-bg-use-district",
  fireDistrict: "highlight-border-fire-district highlight-bg-fire-district",
  heightLimit: "highlight-border-height-limit highlight-bg-height-limit",
  buildingUse: "highlight-border-building-use highlight-bg-building-use",
  structureType: "highlight-border-structure-type highlight-bg-structure-type",
  buildingCoverage: "highlight-border-building-coverage highlight-bg-height-limit",
  floorAreaRatio: "highlight-border-floor-area-ratio highlight-bg-height-limit",
};

const TAG_CLASS_MAP: Record<string, string> = {
  useDistrict: "highlight-tag highlight-tag-use-district",
  fireDistrict: "highlight-tag highlight-tag-fire-district",
  heightLimit: "highlight-tag highlight-tag-height-limit",
  buildingUse: "highlight-tag highlight-tag-building-use",
  structureType: "highlight-tag highlight-tag-structure-type",
  buildingCoverage: "highlight-tag highlight-tag-height-limit",
  floorAreaRatio: "highlight-tag highlight-tag-height-limit",
};

const TAG_LABEL_MAP: Record<string, string> = {
  useDistrict: "用途地域",
  fireDistrict: "防火",
  heightLimit: "高さ",
  buildingUse: "用途",
  structureType: "構造",
  buildingCoverage: "建蔽率",
  floorAreaRatio: "容積率",
};

const ANNOTATION_TAG_LABELS: Record<string, { label: string; cls: string }> = {
  applicable: { label: "該当", cls: "annotation-badge annotation-badge--applicable" },
  review: { label: "要検討", cls: "annotation-badge annotation-badge--review" },
  reference: { label: "参考", cls: "annotation-badge annotation-badge--reference" },
};

export default function HighlightWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state } = useHighlight();
  const { state: annotationState, openEditor } = useAnnotation();
  const userHighlightCtx = useUserHighlights();
  const userHighlights = useMemo(
    () => userHighlightCtx?.highlights ?? new Map(),
    [userHighlightCtx?.highlights],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupUserHighlightsRef = useRef<(() => void) | null>(null);

  // ── Condition highlights + annotations (existing logic) ────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const allNodes = container.querySelectorAll("[data-article-id]");

    // Clear all dynamic classes and elements
    allNodes.forEach((node) => {
      node.classList.remove("highlight-dimmed");
      for (const cls of Object.values(CONDITION_CLASS_MAP)) {
        for (const c of cls.split(" ")) {
          node.classList.remove(c);
        }
      }
      node.querySelectorAll(".highlight-tag-container").forEach((el) => el.remove());
      node.querySelectorAll(".annotation-badge-container").forEach((el) => el.remove());
    });

    if (!state.enabled || state.highlights.size === 0) return;

    const highlightedIds = new Set(state.highlights.keys());

    allNodes.forEach((node) => {
      const articleId = node.getAttribute("data-article-id");
      if (!articleId) return;

      if (highlightedIds.has(articleId)) {
        node.classList.remove("highlight-dimmed");
        const info = state.highlights.get(articleId);
        if (info) {
          for (const ct of info.conditionTypes) {
            const cls = CONDITION_CLASS_MAP[ct];
            if (cls) {
              for (const c of cls.split(" ")) {
                node.classList.add(c);
              }
            }
          }

          // Condition tag badges
          if (info.conditionTypes.length > 0) {
            const tagContainer = document.createElement("span");
            tagContainer.className = "highlight-tag-container";
            tagContainer.style.marginLeft = "4px";
            for (const ct of info.conditionTypes) {
              const tag = document.createElement("span");
              tag.className = TAG_CLASS_MAP[ct] ?? "highlight-tag";
              tag.textContent = TAG_LABEL_MAP[ct] ?? ct;
              tagContainer.appendChild(tag);
            }
            const labelEl = node.querySelector(".law-node__label");
            if (labelEl) {
              labelEl.appendChild(tagContainer);
            } else {
              const textEl = node.querySelector(".law-node__text");
              if (textEl) textEl.prepend(tagContainer);
            }
          }
        }

        // Annotation badge
        const annotation = annotationState.annotations.get(articleId);
        if (annotation) {
          const tagInfo = ANNOTATION_TAG_LABELS[annotation.tag];
          if (tagInfo) {
            const badge = document.createElement("span");
            badge.className = `annotation-badge-container ${tagInfo.cls}`;
            badge.textContent = tagInfo.label;
            badge.style.cursor = "pointer";
            badge.addEventListener("click", (e) => {
              e.stopPropagation();
              openEditor(articleId);
            });
            const labelEl = node.querySelector(".law-node__label");
            if (labelEl) {
              labelEl.appendChild(badge);
            } else {
              const textEl = node.querySelector(".law-node__text");
              if (textEl) textEl.prepend(badge);
            }
          }
        }

        // Add click handler for opening annotation editor on highlighted nodes
        if (!annotation) {
          node.addEventListener("dblclick", () => openEditor(articleId));
        }
      } else {
        node.classList.add("highlight-dimmed");
      }
    });
  }, [state.enabled, state.highlights, annotationState.annotations, openEditor]);

  // ── User highlights (new logic) ────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || userHighlights.size === 0) return;

    // Clean up previous user highlight marks
    if (cleanupUserHighlightsRef.current) {
      cleanupUserHighlightsRef.current();
      cleanupUserHighlightsRef.current = null;
    }

    const allNodes = container.querySelectorAll("[data-article-id]");
    const cleanups: Array<() => void> = [];

    allNodes.forEach((node) => {
      const articleId = node.getAttribute("data-article-id");
      if (!articleId) return;
      const hlList = userHighlights.get(articleId);
      if (!hlList || hlList.length === 0) return;

      const cleanup = applyUserHighlights(node as HTMLElement, hlList);
      cleanups.push(cleanup);
    });

    cleanupUserHighlightsRef.current = () => {
      for (const fn of cleanups) fn();
    };

    return () => {
      if (cleanupUserHighlightsRef.current) {
        cleanupUserHighlightsRef.current();
        cleanupUserHighlightsRef.current = null;
      }
    };
  }, [userHighlights]);

  return <div ref={containerRef}>{children}</div>;
}
