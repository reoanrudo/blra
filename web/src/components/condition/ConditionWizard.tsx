"use client";

import { useState, useCallback } from "react";
import { useHighlight } from "@/contexts/HighlightContext";
import { useProject } from "@/lib/practice/project-context";
import type { ConditionValues } from "@/lib/practice/condition-options";
import ConditionStepZone from "@/components/condition/ConditionStepZone";
import ConditionStepBuilding from "@/components/condition/ConditionStepBuilding";
import ConditionStepScale from "@/components/condition/ConditionStepScale";
import StepCounter from "@/components/article/StepCounter";

const STEPS = ["地域制限", "建築物属性", "規模規制"] as const;

interface ConditionWizardProps {
  open: boolean;
  onClose: () => void;
  initialConditions?: ConditionValues;
}

export default function ConditionWizard({
  open,
  onClose,
  initialConditions,
}: ConditionWizardProps) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ConditionValues>(
    initialConditions ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setConditions, fetchHighlights, toggle } = useHighlight();
  const { activeProjectId } = useProject();

  const handleChange = useCallback((patch: Partial<ConditionValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const canProceed = step === 0 ? !!values.useDistrict : true;

  const handleSave = useCallback(async () => {
    if (!activeProjectId) {
      setError("物件が選択されていません");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${activeProjectId}/conditions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `保存に失敗 (${res.status})`);
      }

      // コンテキストに条件を設定してハイライトON
      setConditions(values);
      await fetchHighlights(values);
      toggle(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存エラー");
    } finally {
      setSaving(false);
    }
  }, [
    activeProjectId,
    values,
    setConditions,
    fetchHighlights,
    toggle,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-neutral-800">
              物件条件を設定
              <StepCounter conditions={values} />
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 text-lg"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
          {/* ステップインジケータ */}
          <div className="flex items-center gap-2 mt-3">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${i === step
                      ? "bg-blue-500 text-white"
                      : i < step
                        ? "bg-blue-200 text-blue-700"
                        : "bg-neutral-200 text-neutral-400"
                    }
                  `}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  className={`text-xs ${i === step ? "text-blue-600 font-medium" : "text-neutral-400"}`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="w-4 h-px bg-neutral-300" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ステップコンテンツ */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {step === 0 && (
            <ConditionStepZone values={values} onChange={handleChange} />
          )}
          {step === 1 && (
            <ConditionStepBuilding values={values} onChange={handleChange} />
          )}
          {step === 2 && (
            <ConditionStepScale values={values} onChange={handleChange} />
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50">
            {error}
          </div>
        )}

        {/* フッター */}
        <div className="px-5 py-4 border-t border-neutral-200 flex items-center justify-between">
          <div>
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                ← 戻る
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <>
                <button
                  onClick={onClose}
                  className="text-sm text-neutral-400 hover:text-neutral-600 px-3 py-1.5"
                >
                  スキップ
                </button>
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed}
                  className={`
                    text-sm px-4 py-1.5 rounded-lg font-medium
                    ${canProceed
                      ? "bg-blue-500 text-white hover:bg-blue-600"
                      : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                    }
                  `}
                >
                  次へ
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="text-sm text-neutral-400 hover:text-neutral-600 px-3 py-1.5"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`
                    text-sm px-4 py-1.5 rounded-lg font-medium
                    ${saving
                      ? "bg-blue-300 text-white cursor-wait"
                      : "bg-blue-500 text-white hover:bg-blue-600"
                    }
                  `}
                >
                  {saving ? "保存中…" : "保存してハイライト"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
