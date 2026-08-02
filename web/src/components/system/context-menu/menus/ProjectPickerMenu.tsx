// Project picker submenu — lists projects to link the article to.
// Extracted verbatim from ContextMenuProvider's project_picker branch.

import type { UseContextMenuReturn } from "../useContextMenu";
import { MenuButton } from "./MenuButton";

export function ProjectPickerMenu({
  menu,
}: {
  menu: UseContextMenuReturn;
}) {
  const { state, clampedIndex, goBack, handleProjectPick } = menu;
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
      {state.projects?.length === 0 ? (
        <p className="px-3 py-2 text-xs text-neutral-500">
          プロジェクトがありません
        </p>
      ) : (
        state.projects?.map((project, i) => (
          <MenuButton
            key={project.id}
            index={i + 1}
            focused={clampedIndex === i + 1}
            onClick={() => handleProjectPick(project.id)}
          >
            {project.name}
          </MenuButton>
        ))
      )}
    </>
  );
}
