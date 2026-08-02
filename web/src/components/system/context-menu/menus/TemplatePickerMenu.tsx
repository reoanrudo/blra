// Drawing-note template picker submenu.
// Extracted verbatim from ContextMenuProvider's template_picker branch.

import type { UseContextMenuReturn } from "../useContextMenu";
import { MenuButton } from "./MenuButton";

export function TemplatePickerMenu({
  menu,
}: {
  menu: UseContextMenuReturn;
}) {
  const { state, clampedIndex, goBack, handleTemplatePick } = menu;
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
      {state.templates?.map((template, i) => (
        <MenuButton
          key={template.id}
          index={i + 1}
          focused={clampedIndex === i + 1}
          onClick={() => handleTemplatePick(template)}
        >
          {template.title}
        </MenuButton>
      ))}
    </>
  );
}
