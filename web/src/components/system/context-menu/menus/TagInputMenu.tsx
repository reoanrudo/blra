// Tag input submenu.
// Extracted verbatim from ContextMenuProvider's tag_input branch.

import type { UseContextMenuReturn } from "../useContextMenu";
import { MenuButton } from "./MenuButton";

export function TagInputMenu({ menu }: { menu: UseContextMenuReturn }) {
  const { state, setState, clampedIndex, tagInputRef, goBack, handleTagSubmit } =
    menu;
  return (
    <>
      <MenuButton
        index={0}
        focused={clampedIndex === 0}
        onClick={goBack}
        className="text-xs text-neutral-500"
      >
        ← 戻る
      </MenuButton>
      <div className="border-t border-neutral-100" />
      <div className="px-3 py-2">
        <input
          ref={tagInputRef}
          type="text"
          value={state.tagInput}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              tagInput: e.target.value,
            }))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleTagSubmit();
            }
          }}
          placeholder="タグ名を入力"
          maxLength={50}
          className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:border-[#d92f7e]"
        />
        <button
          type="button"
          disabled={!state.tagInput.trim()}
          onClick={handleTagSubmit}
          className="mt-1.5 w-full px-2 py-1 text-xs bg-neutral-900 text-white rounded hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          追加
        </button>
      </div>
    </>
  );
}
