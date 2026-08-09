"use client";

export default function PrintLawButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 hover:bg-neutral-50"
    >
      印刷
    </button>
  );
}
