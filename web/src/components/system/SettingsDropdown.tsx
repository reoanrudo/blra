"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import HighlightToggle from "@/components/highlight/HighlightToggle";

export default function SettingsDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Listen for "open-settings" custom event from context menu
  useEffect(() => {
    function onOpenSettings() {
      setOpen(true);
    }
    window.addEventListener("open-settings", onOpenSettings);
    return () => window.removeEventListener("open-settings", onOpenSettings);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center justify-center w-7 h-7 rounded-full
          text-[#6f6a62] hover:text-[#d92f7e] hover:bg-neutral-100
          transition-colors cursor-pointer
          ${open ? "bg-neutral-100 text-[#d92f7e]" : ""}
        `}
        aria-label="設定"
        title="設定"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="2.5" />
          <path d="M13.3 10a1.2 1.2 0 0 0 .24 1.32l.04.04a1.45 1.45 0 1 1-2.06 2.06l-.04-.04a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.73 1.1v.11a1.45 1.45 0 0 1-2.9 0v-.06a1.2 1.2 0 0 0-.79-1.1 1.2 1.2 0 0 0-1.32.24l-.04.04a1.45 1.45 0 1 1-2.06-2.06l.04-.04a1.2 1.2 0 0 0 .24-1.32 1.2 1.2 0 0 0-1.1-.73h-.11a1.45 1.45 0 0 1 0-2.9h.06a1.2 1.2 0 0 0 1.1-.79 1.2 1.2 0 0 0-.24-1.32l-.04-.04a1.45 1.45 0 1 1 2.06-2.06l.04.04a1.2 1.2 0 0 0 1.32.24h.06a1.2 1.2 0 0 0 .73-1.1v-.11a1.45 1.45 0 0 1 2.9 0v.06a1.2 1.2 0 0 0 .73 1.1 1.2 1.2 0 0 0 1.32-.24l.04-.04a1.45 1.45 0 1 1 2.06 2.06l-.04.04a1.2 1.2 0 0 0-.24 1.32v.06a1.2 1.2 0 0 0 1.1.73h.11a1.45 1.45 0 0 1 0 2.9h-.06a1.2 1.2 0 0 0-1.1.73z" />
        </svg>
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-full mt-1
            bg-white rounded-lg shadow-xl border border-neutral-200
            py-3 px-4 min-w-[240px] z-50
          "
        >
          <p className="text-xs font-bold text-neutral-800 mb-3">表示設定</p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-neutral-600">条件ハイライト</span>
              <HighlightToggle />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
