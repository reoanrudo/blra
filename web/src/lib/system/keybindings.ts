"use client";

const SEARCH_NAV_EVENT = "search-result-nav";
const SEARCH_SELECT_EVENT = "search-result-select";
const SHORTCUTS_MODAL_EVENT = "shortcuts-modal-toggle";
const ADD_CHECK_ITEM_EVENT = "add-check-item";
const TOGGLE_CHECK_STATUS_EVENT = "toggle-check-status";
const APP_ESCAPE_EVENT = "app-escape";

export function dispatchSearchNav(direction: "next" | "prev") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SEARCH_NAV_EVENT, { detail: { direction } }),
  );
}

export function dispatchSearchSelect() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SEARCH_SELECT_EVENT));
}

export function dispatchShortcutsModalToggle() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHORTCUTS_MODAL_EVENT));
}

export function dispatchAddCheckItem() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADD_CHECK_ITEM_EVENT));
}

export function dispatchToggleCheckStatus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOGGLE_CHECK_STATUS_EVENT));
}

export function dispatchAppEscape() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_ESCAPE_EVENT));
}

function isInputFocused(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
    return true;
  if (el.getAttribute("contenteditable") === "true") return true;
  if (el.tagName === "SELECT") return true;
  return false;
}

let cmdPaletteToggleCallback: (() => void) | null = null;

export function registerCmdPaletteToggle(cb: () => void) {
  cmdPaletteToggleCallback = cb;
}

interface KeybindingOptions {
  onToggleShortcuts?: () => void;
  onEscape?: () => void;
}

export function createKeybindingHandler(
  options?: KeybindingOptions,
): (e: KeyboardEvent) => void {
  return function onKeyDown(e: KeyboardEvent) {
    // Cmd+K / Ctrl+K — always handled, even in inputs
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      cmdPaletteToggleCallback?.();
      return;
    }

    // ? — toggle shortcuts modal (not in input)
    if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
      if (!isInputFocused()) {
        e.preventDefault();
        options?.onToggleShortcuts?.();
        return;
      }
    }

    // Escape — close modals
    if (e.key === "Escape") {
      options?.onEscape?.();
      return;
    }

    // All other shortcuts suppressed in input fields
    if (isInputFocused()) return;

    switch (e.key) {
      case "j":
        e.preventDefault();
        dispatchSearchNav("next");
        break;
      case "k":
        e.preventDefault();
        dispatchSearchNav("prev");
        break;
      case "Enter":
        dispatchSearchSelect();
        break;
      case "a":
        e.preventDefault();
        dispatchAddCheckItem();
        break;
      case "s":
        e.preventDefault();
        dispatchToggleCheckStatus();
        break;
    }
  };
}
