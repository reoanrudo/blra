// Context menu constants.
// Extracted from ContextMenuProvider — initial state and the
// highlight color palette used by the picker menu.

import type { ContextMenuState } from "./types";

export const INITIAL_STATE: ContextMenuState = {
  isOpen: false,
  position: { x: 0, y: 0 },
  context: null,
  menuType: "main",
  projects: null,
  templates: null,
  toast: null,
  focusedIndex: 0,
  tagInput: "",
};

export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "黄", hex: "#facc15" },
  { id: "red", label: "赤", hex: "#ef4444" },
  { id: "blue", label: "青", hex: "#3b82f6" },
  { id: "green", label: "緑", hex: "#22c55e" },
  { id: "purple", label: "紫", hex: "#a855f7" },
  { id: "orange", label: "橙", hex: "#f97316" },
] as const;
