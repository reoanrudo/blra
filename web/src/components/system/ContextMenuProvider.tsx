"use client";

// Global right-click context menu provider.
// Refactored from a 996-line god component into a thin shell that delegates
// state/logic to useContextMenu and rendering to the per-menuType components.
// Behavior and markup are unchanged.

import type { ReactNode } from "react";
import { useContextMenu } from "./context-menu/useContextMenu";
import { MainMenu } from "./context-menu/menus/MainMenu";
import { HighlightPickerMenu } from "./context-menu/menus/HighlightPickerMenu";
import { TagInputMenu } from "./context-menu/menus/TagInputMenu";
import { ProjectPickerMenu } from "./context-menu/menus/ProjectPickerMenu";
import { TemplatePickerMenu } from "./context-menu/menus/TemplatePickerMenu";

export default function ContextMenuProvider({
  children,
}: {
  children: ReactNode;
}) {
  const menu = useContextMenu();
  const { state, menuRef, close, adjustMenuPosition } = menu;

  return (
    <>
      {children}
      {state.isOpen && state.context && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className="fixed inset-0 z-50"
          onClick={close}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            ref={menuRef}
            role="menu"
            className="fixed bg-white rounded-lg shadow-xl border border-neutral-200 py-1 min-w-[220px] max-h-[80vh] overflow-y-auto"
            style={{
              top: adjustMenuPosition(220, 280).y,
              left: adjustMenuPosition(220, 280).x,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Main menu ── */}
            {state.menuType === "main" && <MainMenu menu={menu} />}

            {/* ── Highlight color picker ── */}
            {state.menuType === "highlight_picker" && (
              <HighlightPickerMenu menu={menu} />
            )}

            {/* ── Tag input ── */}
            {state.menuType === "tag_input" && <TagInputMenu menu={menu} />}

            {/* ── Project picker ── */}
            {state.menuType === "project_picker" && state.projects && (
              <ProjectPickerMenu menu={menu} />
            )}

            {/* ── Template picker ── */}
            {state.menuType === "template_picker" && state.templates && (
              <TemplatePickerMenu menu={menu} />
            )}

            {/* ── Toast ── */}
            {state.toast && (
              <div
                className={`px-3 py-2 text-xs border-t border-neutral-200 ${
                  state.toast.type === "success"
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                {state.toast.message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
