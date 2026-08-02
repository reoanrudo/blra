"use client";

import { BUILDING_USE_OPTIONS, STRUCTURE_TYPE_OPTIONS } from "@/lib/practice/condition-options";
import type { ConditionValues } from "@/lib/practice/condition-options";

interface ConditionStepBuildingProps {
  values: ConditionValues;
  onChange: (patch: Partial<ConditionValues>) => void;
}

export default function ConditionStepBuilding({
  values,
  onChange,
}: ConditionStepBuildingProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">
          2. 建築物属性
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          建築物の用途と構造を選択してください（スキップ可）
        </p>
      </div>

      {/* 建築物用途チップ選択 */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-2">
          建築物用途
        </label>
        <div className="flex flex-wrap gap-1.5">
          {BUILDING_USE_OPTIONS.map((opt) => {
            const selected = values.buildingUse === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ buildingUse: selected ? undefined : opt })}
                className={`
                  px-2.5 py-1 text-xs rounded-full border transition-colors
                  ${selected
                    ? "bg-green-500 text-white border-green-500"
                    : "bg-white text-neutral-600 border-neutral-300 hover:border-green-300"
                  }
                `}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* 構造種別セレクト */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-2">
          構造種別
        </label>
        <select
          value={values.structureType ?? ""}
          onChange={(e) => onChange({ structureType: e.target.value || undefined })}
          className="w-full text-sm border border-neutral-300 rounded px-3 py-2 bg-white"
        >
          {STRUCTURE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
