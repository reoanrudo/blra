// Highlight color picker submenu.
// Extracted verbatim from ContextMenuProvider's highlight_picker branch.

import type { UseContextMenuReturn } from "../useContextMenu";
import { HIGHLIGHT_COLORS } from "../constants";
import { MenuButton } from "./MenuButton";

export function HighlightPickerMenu({
  menu,
}: {
  menu: UseContextMenuReturn;
}) {
  const { clampedIndex, goBack, handleHighlight } = menu;
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
      <div className="px-3 py-2 flex items-center gap-2">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            className="w-7 h-7 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
            style={{ backgroundColor: c.hex }}
            onClick={() => handleHighlight(c.id, "highlight")}
          />
        ))}
      </div>
    </>
  );
}
