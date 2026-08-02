"use client";

import { USE_DISTRICT_OPTIONS, FIRE_DISTRICT_OPTIONS } from "@/lib/practice/condition-options";
import type { ConditionValues } from "@/lib/practice/condition-options";

interface ConditionStepZoneProps {
  values: ConditionValues;
  onChange: (patch: Partial<ConditionValues>) => void;
}

export default function ConditionStepZone({
  values,
  onChange,
}: ConditionStepZoneProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">
          1. 地域制限
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          用途地域を選択してください（必須は1つのみ）
        </p>
      </div>

      {/* 用途地域チップ選択 */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-2">
          用途地域
        </label>
        <div className="flex flex-wrap gap-1.5">
          {USE_DISTRICT_OPTIONS.map((opt) => {
            const selected = values.useDistrict === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ useDistrict: selected ? undefined : opt.value })}
                className={`
                  px-2.5 py-1 text-xs rounded-full border transition-colors
                  ${selected
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-neutral-600 border-neutral-300 hover:border-blue-300"
                  }
                `}
              >
                {opt.short}
              </button>
            );
          })}
        </div>
        {values.useDistrict && (
          <p className="text-xs text-blue-600 mt-1.5">
            選択中: {values.useDistrict}
          </p>
        )}
      </div>

      {/* 防火地域セレクト */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-2">
          防火地域
        </label>
        <select
          value={values.fireDistrict ?? ""}
          onChange={(e) => onChange({ fireDistrict: e.target.value || undefined })}
          className="w-full text-sm border border-neutral-300 rounded px-3 py-2 bg-white"
        >
          {FIRE_DISTRICT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
