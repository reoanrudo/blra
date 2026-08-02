"use client";

interface ConditionChipsProps {
  conditions: Record<string, unknown>;
}

const CHIP_CONFIG: Record<string, { color: string; label: string; keys: string[] }> = {
  useDistrict: { color: "bg-blue-500", label: "用途地域", keys: ["useDistrict"] },
  fireDistrict: { color: "bg-red-500", label: "防火", keys: ["fireDistrict"] },
  buildingUse: { color: "bg-green-500", label: "用途", keys: ["buildingUse"] },
  structureType: { color: "bg-purple-500", label: "構造", keys: ["structureType"] },
  scale: {
    color: "bg-amber-500",
    label: "規模",
    keys: ["floors", "height", "totalFloorArea", "buildingCoverageRatio", "floorAreaRatio"],
  },
};

export default function ConditionChips({ conditions }: ConditionChipsProps) {
  const activeChips = Object.entries(CHIP_CONFIG).filter(([, cfg]) =>
    cfg.keys.some((k) => {
      const v = conditions[k];
      if (v === undefined || v === null || v === "") return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }),
  );

  if (activeChips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {activeChips.map(([key, cfg]) => (
        <span
          key={key}
          className={`${cfg.color} text-white text-[10px] font-semibold px-2 py-0.5 rounded-full leading-tight`}
        >
          {cfg.label}
        </span>
      ))}
    </div>
  );
}
