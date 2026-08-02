"use client";

import type { ConditionValues } from "@/lib/practice/condition-options";

interface ConditionStepScaleProps {
  values: ConditionValues;
  onChange: (patch: Partial<ConditionValues>) => void;
}

function NumberInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-neutral-600 w-20 shrink-0">
        {label}
      </label>
      <input
        type="number"
        min={0}
        step="any"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : parseFloat(v));
        }}
        className="flex-1 text-sm border border-neutral-300 rounded px-3 py-1.5 bg-white w-24"
        placeholder="—"
      />
      <span className="text-xs text-neutral-400 shrink-0">{unit}</span>
    </div>
  );
}

export default function ConditionStepScale({
  values,
  onChange,
}: ConditionStepScaleProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">
          3. 規模規制
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          規模情報を入力してください（全項目任意）
        </p>
      </div>

      <div className="space-y-3">
        <NumberInput
          label="階数"
          unit="階"
          value={values.floors}
          onChange={(v) => onChange({ floors: v })}
        />
        <NumberInput
          label="高さ"
          unit="m"
          value={values.height}
          onChange={(v) => onChange({ height: v })}
        />
        <NumberInput
          label="延べ面積"
          unit="㎡"
          value={values.totalFloorArea}
          onChange={(v) => onChange({ totalFloorArea: v })}
        />
        <NumberInput
          label="建蔽率"
          unit="%"
          value={values.buildingCoverageRatio}
          onChange={(v) => onChange({ buildingCoverageRatio: v })}
        />
        <NumberInput
          label="容積率"
          unit="%"
          value={values.floorAreaRatio}
          onChange={(v) => onChange({ floorAreaRatio: v })}
        />
      </div>
    </div>
  );
}
