"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import CommandPalette from "@/components/search/CommandPalette";
import ShortcutsModal from "@/components/system/ShortcutsModal";
import { createKeybindingHandler } from "@/lib/system/keybindings";
import { useProject } from "@/lib/practice/project-context";
import {
  parseApplicabilityContext,
  todayInJapan,
} from "@/lib/applicability/applicability-context";

export default function GlobalKeybindingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { activeProjectId } = useProject();
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Global keyboard shortcut handler
  useEffect(() => {
    const handler = createKeybindingHandler({
      onToggleShortcuts: () => setShowShortcuts((v) => !v),
      onEscape: () => setShowShortcuts(false),
    });
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Handle add-check-item custom event
  useEffect(() => {
    function onAddCheckItem() {
      const articleMatch = pathname.match(/^\/articles\/(.+)$/);
      if (!articleMatch) return;
      const articleId = articleMatch[1];

      if (!activeProjectId) {
        alert("プロジェクトが選択されていません。先に物件を選択してください。");
        return;
      }

      const title = window.prompt("確認項目名を入力（省略可）:");
      if (title === null) return; // cancelled

      const currentSearchParams = new URLSearchParams(window.location.search);
      const parsedApplicability = parseApplicabilityContext(
        {
          anchor: currentSearchParams.get("anchor") ?? undefined,
          asOf: currentSearchParams.get("asOf") ?? undefined,
          project: currentSearchParams.get("project") ?? undefined,
        },
        todayInJapan(),
      );
      const applicabilitySnapshot =
        parsedApplicability.kind === "invalid"
          ? {}
          : {
              applicabilityAnchor: parsedApplicability.context.anchor,
              applicabilityDate: parsedApplicability.context.asOf,
            };

      fetch("/api/checkitems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProjectId,
          articleId,
          title: title || undefined,
          ...applicabilitySnapshot,
        }),
      })
        .then((r) => {
          if (r.ok) alert("確認項目を追加しました");
          else alert("追加に失敗しました");
        })
        .catch(() => alert("追加に失敗しました"));
    }

    window.addEventListener("add-check-item", onAddCheckItem);
    return () => window.removeEventListener("add-check-item", onAddCheckItem);
  }, [pathname, activeProjectId]);

  // Handle toggle-check-status custom event (stub — needs project dashboard context)
  useEffect(() => {
    function onToggleCheckStatus() {
      const articleMatch = pathname.match(/^\/articles\/(.+)$/);
      if (!articleMatch) return;
      if (!activeProjectId) return;

      // For now, just notify — full toggle requires project dashboard integration
      alert(
        "条文の確認状態の切り替えはプロジェクトダッシュボードから行えます。",
      );
    }

    window.addEventListener("toggle-check-status", onToggleCheckStatus);
    return () =>
      window.removeEventListener("toggle-check-status", onToggleCheckStatus);
  }, [pathname, activeProjectId]);

  return (
    <>
      {children}
      <CommandPalette />
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </>
  );
}
