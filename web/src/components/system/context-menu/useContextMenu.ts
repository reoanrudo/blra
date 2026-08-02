// Custom hook holding all context-menu state, effects, and action handlers.
// Extracted verbatim from ContextMenuProvider — logic is unchanged, only the
// fetch calls now go through the pure functions in context-menu-api.ts.

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/practice/project-context";
import { buildEgovDocumentUrl } from "@/lib/system/e-gov";
import { getSelectionContext } from "@/lib/highlight/text-selection";
import { buildArticleHrefFromSearchParams } from "@/lib/applicability/applicability-context";
import { useApplicability } from "@/contexts/ApplicabilityContext";

import type { ContextMenuState, MenuContext, TemplateItem } from "./types";
import { INITIAL_STATE } from "./constants";
import {
  createCheckItem,
  fetchDrawingNoteTemplates,
  fetchProjects,
  createHighlight,
  createTag,
  deleteHighlight,
  fetchArticlePreview,
} from "./context-menu-api";

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>(INITIAL_STATE);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tagInputRef = useRef<HTMLInputElement>(null);
  const { activeProjectId } = useProject();
  const applicability = useApplicability();
  const router = useRouter();

  const close = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setState((prev) => ({ ...prev, toast: { message, type } }));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, toast: null }));
      }, 3000);
    },
    [],
  );

  // ── Context menu trigger ──────────────────────────────────────

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as Element;

      // 1. Check for link context first
      const linkEl = target.closest("a[data-link-target]");
      if (linkEl) {
        e.preventDefault();
        const targetId = linkEl.getAttribute("data-link-target");
        const articleId =
          linkEl.closest("[data-article-id]")?.getAttribute("data-article-id") ??
          targetId ??
          "";
        const linkText = linkEl.textContent?.trim() ?? "";

        if (targetId) {
          setPositionAndOpen(e, {
            kind: "link",
            articleId,
            targetId,
            linkText,
          });
        }
        return;
      }

      // 2. Check for text selection
      const selCtx = getSelectionContext(e);
      if (selCtx) {
        e.preventDefault();
        setPositionAndOpen(e, {
          kind: "selection",
          ...selCtx,
        });
        return;
      }

      // 2.5. Check for existing user highlight (mark element with data-highlight-id)
      const markEl = target.closest("mark[data-highlight-id]");
      if (markEl) {
        e.preventDefault();
        const highlightId = markEl.getAttribute("data-highlight-id") ?? "";
        const articleId =
          markEl.closest("[data-article-id]")?.getAttribute("data-article-id") ?? "";
        const color = markEl.classList.contains("user-highlight--red") ? "red"
          : markEl.classList.contains("user-highlight--blue") ? "blue"
          : markEl.classList.contains("user-highlight--green") ? "green"
          : markEl.classList.contains("user-highlight--purple") ? "purple"
          : markEl.classList.contains("user-highlight--orange") ? "orange"
          : "yellow";
        const type = markEl.classList.contains("user-highlight--underline") ? "underline"
          : markEl.classList.contains("user-highlight--bracket") ? "bracket"
          : "highlight";
        if (highlightId) {
          setPositionAndOpen(e, {
            kind: "highlight",
            highlightId,
            articleId,
            color,
            type,
          });
        }
        return;
      }

      // 3. Fallback to article context
      const articleEl = target.closest("[data-article-id]");
      if (articleEl) {
        e.preventDefault();
        const articleId = articleEl.getAttribute("data-article-id");
        if (articleId) {
          setPositionAndOpen(e, { kind: "article", articleId });
        }
        return;
      }

      // No match — let native context menu appear
    };

    function setPositionAndOpen(e: MouseEvent, context: MenuContext) {
      let x = e.clientX;
      let y = e.clientY;
      const menuWidth = 220;
      const menuHeight = 280;
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
      }
      if (x < 0) x = 8;
      if (y < 0) y = 8;

      setState({
        ...INITIAL_STATE,
        isOpen: true,
        position: { x, y },
        context,
      });
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close]);

  // ── Keyboard navigation within menu ───────────────────────────

  useEffect(() => {
    if (!state.isOpen) return;

    function handleMenuKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          focusedIndex: prev.focusedIndex + 1,
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          focusedIndex: Math.max(0, prev.focusedIndex - 1),
        }));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const focused = menuRef.current?.querySelector(
          `[data-menu-index="${state.focusedIndex}"]`,
        ) as HTMLElement | null;
        focused?.click();
      }
    }

    window.addEventListener("keydown", handleMenuKey);
    return () => window.removeEventListener("keydown", handleMenuKey);
  }, [state.isOpen, state.focusedIndex]);

  // Focus tag input when tag_input submenu opens
  useEffect(() => {
    if (state.menuType === "tag_input") {
      setTimeout(() => tagInputRef.current?.focus(), 50);
    }
  }, [state.menuType]);

  // ── Action handlers ───────────────────────────────────────────

  const handleAddCheckItem = useCallback(async () => {
    if (!state.context?.articleId) return;
    if (!activeProjectId) {
      showToast("プロジェクトが選択されていません", "error");
      return;
    }
    try {
      await createCheckItem(
        activeProjectId,
        state.context.articleId,
        applicability.snapshot,
      );
      showToast("確認項目を追加しました", "success");
      close();
    } catch {
      showToast("追加に失敗しました", "error");
    }
  }, [
    state.context,
    activeProjectId,
    applicability.snapshot,
    showToast,
    close,
  ]);

  const handleDrawingNoteCopy = useCallback(async () => {
    if (!state.context?.articleId) return;
    try {
      const data = await fetchDrawingNoteTemplates(state.context.articleId);
      if (data.length === 0) {
        showToast("図面注記テンプレートがありません", "error");
        return;
      }
      if (data.length === 1) {
        await navigator.clipboard.writeText(data[0].templateText);
        showToast("コピーしました", "success");
        close();
        return;
      }
      setState((prev) => ({
        ...prev,
        menuType: "template_picker",
        templates: data,
        focusedIndex: 0,
      }));
    } catch {
      showToast("取得に失敗しました", "error");
    }
  }, [state.context, showToast, close]);

  const handleTemplatePick = useCallback(
    async (template: TemplateItem) => {
      try {
        await navigator.clipboard.writeText(template.templateText);
        showToast("コピーしました", "success");
        close();
      } catch {
        showToast("コピーに失敗しました", "error");
      }
    },
    [showToast, close],
  );

  const handleLinkToProject = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setState((prev) => ({
        ...prev,
        menuType: "project_picker",
        projects: data,
        focusedIndex: 0,
      }));
    } catch {
      showToast("プロジェクト一覧の取得に失敗しました", "error");
    }
  }, [showToast]);

  const handleProjectPick = useCallback(
    async (projectId: string) => {
      if (!state.context?.articleId) return;
      try {
        await createCheckItem(
          projectId,
          state.context.articleId,
          applicability.snapshot,
        );
        showToast("プロジェクトに紐付けました", "success");
        close();
      } catch {
        showToast("紐付けに失敗しました", "error");
      }
    },
    [state.context, applicability.snapshot, showToast, close],
  );

  const handleOpenEgov = useCallback(async () => {
    const articleId =
      state.context?.kind === "link"
        ? state.context.targetId
        : state.context?.articleId;
    if (!articleId) return;
    try {
      const data = await fetchArticlePreview(articleId);
      if (data.egovLawId) {
        const url = buildEgovDocumentUrl(
          data.egovLawId,
          data.articleNumberNormalized,
        );
        window.open(url, "_blank", "noopener,noreferrer");
        close();
      } else {
        showToast("e-GovのURLを取得できません", "error");
      }
    } catch {
      showToast("e-Gov情報の取得に失敗しました", "error");
    }
  }, [state.context, showToast, close]);

  // ── Highlight / Tag handlers ──────────────────────────────────

  const handleHighlight = useCallback(
    async (color: string, type: string) => {
      if (state.context?.kind !== "selection") return;
      const { articleId, rangeStart, rangeEnd, selectedText } = state.context;
      try {
        const highlight = await createHighlight({
          articleId,
          rangeStart,
          rangeEnd,
          exactQuote: selectedText,
          color,
          type,
          ...applicability.snapshot,
        });
        // Bridge to UserHighlightContext via custom event (crosses context boundary)
        window.dispatchEvent(
          new CustomEvent("user-highlight-created", {
            detail: { id: highlight.id, articleId, rangeStart, rangeEnd, color, type },
          }),
        );
        showToast("ハイライトを追加しました", "success");
        close();
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "追加に失敗しました",
          "error",
        );
      }
    },
    [state.context, applicability.snapshot, showToast, close],
  );

  const handleUnderline = useCallback(async () => {
    await handleHighlight("yellow", "underline");
  }, [handleHighlight]);

  const handleBracket = useCallback(async () => {
    await handleHighlight("yellow", "bracket");
  }, [handleHighlight]);

  const handleTagSubmit = useCallback(async () => {
    if (state.context?.kind !== "selection" && state.context?.kind !== "article")
      return;
    const tagName = state.tagInput.trim();
    if (!tagName) return;
    try {
      await createTag(state.context.articleId, tagName);
      showToast(`タグ「${tagName}」を追加しました`, "success");
      close();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "タグ追加に失敗しました",
        "error",
      );
    }
  }, [state.context, state.tagInput, showToast, close]);

  const handleCopySelectedText = useCallback(async () => {
    if (state.context?.kind !== "selection") return;
    try {
      await navigator.clipboard.writeText(state.context.selectedText);
      showToast("コピーしました", "success");
      close();
    } catch {
      showToast("コピーに失敗しました", "error");
    }
  }, [state.context, showToast, close]);

  const handleOpenLinkTarget = useCallback(() => {
    if (state.context?.kind !== "link") return;
    router.push(
      buildArticleHrefFromSearchParams(
        state.context.targetId,
        new URLSearchParams(window.location.search),
      ),
    );
    close();
  }, [state.context, router, close]);

  const handleCopyLinkText = useCallback(async () => {
    if (state.context?.kind !== "link") return;
    try {
      await navigator.clipboard.writeText(state.context.linkText);
      showToast("コピーしました", "success");
      close();
    } catch {
      showToast("コピーに失敗しました", "error");
    }
  }, [state.context, showToast, close]);

  // ── Settings event ────────────────────────────────────────────

  const handleOpenSettings = useCallback(() => {
    // Dispatch custom event that SettingsDropdown listens to
    window.dispatchEvent(new CustomEvent("open-settings"));
    close();
  }, [close]);

  // ── Highlight delete handler ─────────────────────────────────

  const handleDeleteHighlight = useCallback(async () => {
    if (state.context?.kind !== "highlight") return;
    const { highlightId, articleId } = state.context;
    try {
      await deleteHighlight(highlightId);

      // Direct DOM cleanup: unwrap <mark> immediately for instant visual feedback
      const marks = document.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`);
      marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        if (parent instanceof HTMLElement) parent.normalize();
      });

      // Also update React state via custom event
      window.dispatchEvent(
        new CustomEvent("user-highlight-deleted", {
          detail: { id: highlightId, articleId },
        }),
      );
      showToast("ハイライトを削除しました", "success");
      close();
    } catch {
      showToast("削除に失敗しました", "error");
    }
  }, [state.context, showToast, close]);

  // ── Helpers ───────────────────────────────────────────────────

  const goBack = useCallback(() => {
    setState((prev) => ({
      ...prev,
      menuType: "main",
      focusedIndex: 0,
      tagInput: "",
    }));
  }, []);

  // Count menu items for keyboard nav
  const menuItemCount = state.menuType === "main"
    ? state.context?.kind === "selection"
      ? 6 // highlight, underline, bracket, tag, copy, separator+settings
      : state.context?.kind === "link"
        ? 4 // open, copy, e-gov, separator+settings
        : state.context?.kind === "highlight"
          ? 3 // delete, copy text, settings
          : 6 // check item, drawing note, project, e-gov, separator, settings
    : state.menuType === "highlight_picker"
      ? 7 // back + 6 colors
      : state.menuType === "tag_input"
        ? 3 // back + input + submit
        : (state.projects?.length ?? 0) + 1; // back + items

  // Clamp focusedIndex
  const clampedIndex = Math.min(state.focusedIndex, menuItemCount - 1);

  const adjustMenuPosition = useCallback(
    (menuWidth: number, menuHeight: number) => {
      let x = state.position.x;
      let y = state.position.y;

      if (state.menuType !== "main") {
        x = state.position.x - menuWidth - 4;
      }

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (x < 0) x = 8;

      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
      }
      if (y < 0) y = 8;

      return { x, y };
    },
    [state.position, state.menuType],
  );

  return {
    state,
    setState,
    menuRef,
    tagInputRef,
    close,
    showToast,
    handleAddCheckItem,
    handleDrawingNoteCopy,
    handleTemplatePick,
    handleLinkToProject,
    handleProjectPick,
    handleOpenEgov,
    handleHighlight,
    handleUnderline,
    handleBracket,
    handleTagSubmit,
    handleCopySelectedText,
    handleOpenLinkTarget,
    handleCopyLinkText,
    handleOpenSettings,
    handleDeleteHighlight,
    goBack,
    menuItemCount,
    adjustMenuPosition,
    clampedIndex,
  };
}

export type UseContextMenuReturn = ReturnType<typeof useContextMenu>;
