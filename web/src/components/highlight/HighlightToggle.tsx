"use client";

import { useEffect, useState, useCallback } from "react";
import { useHighlight } from "@/contexts/HighlightContext";
import { useProject } from "@/lib/practice/project-context";
import ConditionChips from "@/components/condition/ConditionChips";
import ConditionWizard from "@/components/condition/ConditionWizard";
import type { ConditionValues } from "@/lib/practice/condition-options";

interface ProjectConditions {
  id: string;
  name: string;
  conditions: Record<string, unknown>;
}

export default function HighlightToggle() {
  const { state, toggle, setConditions, fetchHighlights } = useHighlight();
  const { activeProjectId } = useProject();
  const [projectConditions, setProjectConditions] =
    useState<ProjectConditions | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // 物件選択時に conditions を自動ロード
  const loadConditions = useCallback(async () => {
    if (!activeProjectId) {
      setProjectConditions(null);
      return;
    }

    setLoadingProject(true);
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/conditions`);
      if (res.ok) {
        const data: ProjectConditions = await res.json();
        setProjectConditions(data);
        const conds = data.conditions;
        if (conds && Object.keys(conds).length > 0) {
          setConditions(conds as Parameters<typeof setConditions>[0]);
        }
      }
    } catch {
      // 物件条件の取得に失敗（非致命的）
    } finally {
      setLoadingProject(false);
    }
  }, [activeProjectId, setConditions]);

  useEffect(() => {
    loadConditions();
  }, [loadConditions]);

  // トグル切替
  const handleToggle = useCallback(() => {
    const newEnabled = !state.enabled;
    toggle(newEnabled);
    if (newEnabled && state.conditions) {
      fetchHighlights(state.conditions);
    }
  }, [state.enabled, state.conditions, toggle, fetchHighlights]);

  const hasConditions =
    projectConditions?.conditions &&
    Object.keys(projectConditions.conditions).length > 0;

  // ウィザード完了後に条件を再ロード
  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    loadConditions();
  }, [loadConditions]);

  return (
    <div className="flex items-center gap-3">
      {/* トグルスイッチ */}
      <button
        onClick={handleToggle}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${state.enabled ? "bg-blue-500" : "bg-neutral-300"}
          ${state.loading ? "opacity-50 cursor-wait" : "cursor-pointer"}
        `}
        disabled={state.loading}
        aria-label="条件ハイライト切替"
        title={
          !activeProjectId
            ? "物件を選択してください"
            : !hasConditions
              ? "条件を設定してください"
              : state.enabled
                ? "ハイライトOFF"
                : "ハイライトON"
        }
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow
            ${state.enabled ? "translate-x-6" : "translate-x-1"}
          `}
        />
      </button>

      {/* 条件チップ or ガイド */}
      {state.enabled && state.conditions && (
        <ConditionChips conditions={state.conditions as Record<string, unknown>} />
      )}

      {/* 条件設定ボタン */}
      {activeProjectId && (
        <button
          onClick={() => setWizardOpen(true)}
          className="text-[10px] text-blue-500 hover:text-blue-700 underline"
        >
          {hasConditions ? "条件を編集" : "条件を設定"}
        </button>
      )}

      {/* ローディング */}
      {state.loading && (
        <span className="text-[10px] text-neutral-400">読込中…</span>
      )}

      {/* ウィザード */}
      <ConditionWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        initialConditions={
          projectConditions?.conditions as ConditionValues | undefined
        }
      />
    </div>
  );
}
