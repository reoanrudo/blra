"use client";

import { useEffect, useState } from "react";
import type { ConditionValues } from "@/lib/practice/condition-options";

export default function StepCounter({
  conditions,
}: {
  conditions: ConditionValues;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hasAnyValue = Object.values(conditions).some(
      (v) => v !== undefined && v !== null && v !== "",
    );
    if (!hasAnyValue) {
      setCount(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/highlight?conditions=${encodeURIComponent(JSON.stringify(conditions))}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setCount(data.count);
        }
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conditions]);

  if (count === null && !loading) return null;

  return (
    <span className="text-xs text-neutral-500 ml-2">
      {loading ? (
        <span className="inline-block w-3 h-3 border border-neutral-300 border-t-neutral-600 rounded-full animate-spin align-middle" />
      ) : (
        <>
          <span className="font-bold text-blue-600">{count}</span>
          <span className="ml-0.5">件の条文が該当</span>
        </>
      )}
    </span>
  );
}
