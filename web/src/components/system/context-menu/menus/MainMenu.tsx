// Main context menu — branches on context.kind (selection / article / link / highlight).
// Extracted verbatim from ContextMenuProvider's render block.

import type { UseContextMenuReturn } from "../useContextMenu";
import { MenuButton } from "./MenuButton";

export function MainMenu({ menu }: { menu: UseContextMenuReturn }) {
  const { state, setState, clampedIndex, showToast, close } = menu;
  const ctx = state.context;
  if (!ctx) return null;

  if (ctx.kind === "selection") {
    return (
      <>
        <MenuButton
          index={0}
          focused={clampedIndex === 0}
          onClick={() =>
            setState((prev) => ({
              ...prev,
              menuType: "highlight_picker",
              focusedIndex: 0,
            }))
          }
        >
          🖍 ハイライト（色選択）
        </MenuButton>
        <MenuButton
          index={1}
          focused={clampedIndex === 1}
          onClick={menu.handleUnderline}
        >
          〰 下線
        </MenuButton>
        <MenuButton
          index={2}
          focused={clampedIndex === 2}
          onClick={menu.handleBracket}
        >
          ⟦ ⟧ 囲み線
        </MenuButton>
        <MenuButton
          index={3}
          focused={clampedIndex === 3}
          onClick={() =>
            setState((prev) => ({
              ...prev,
              menuType: "tag_input",
              focusedIndex: 0,
              tagInput: "",
            }))
          }
        >
          🏷 タグ追加
        </MenuButton>
        <MenuButton
          index={4}
          focused={clampedIndex === 4}
          onClick={menu.handleCopySelectedText}
        >
          📋 コピー
        </MenuButton>
        <div className="border-t border-neutral-100 my-1" />
        <MenuButton
          index={5}
          focused={clampedIndex === 5}
          onClick={menu.handleOpenSettings}
        >
          ⚙ 設定
        </MenuButton>
      </>
    );
  }

  if (ctx.kind === "article") {
    const itemOffset = ctx.printableArticleId ? 1 : 0;

    return (
      <>
        {ctx.printableArticleId && (
          <MenuButton
            index={0}
            focused={clampedIndex === 0}
            onClick={menu.handlePrintCurrentArticle}
          >
            🖨 この条を印刷
          </MenuButton>
        )}
        <MenuButton
          index={itemOffset}
          focused={clampedIndex === itemOffset}
          onClick={menu.handleAddCheckItem}
        >
          確認項目に追加
        </MenuButton>
        <MenuButton
          index={itemOffset + 1}
          focused={clampedIndex === itemOffset + 1}
          onClick={menu.handleDrawingNoteCopy}
        >
          図面注記コピー
        </MenuButton>
        <MenuButton
          index={itemOffset + 2}
          focused={clampedIndex === itemOffset + 2}
          onClick={menu.handleLinkToProject}
        >
          プロジェクトに紐付け
        </MenuButton>
        <MenuButton
          index={itemOffset + 3}
          focused={clampedIndex === itemOffset + 3}
          onClick={menu.handleOpenEgov}
        >
          e-Govで開く
        </MenuButton>
        <div className="border-t border-neutral-100 my-1" />
        <MenuButton
          index={itemOffset + 4}
          focused={clampedIndex === itemOffset + 4}
          onClick={() =>
            setState((prev) => ({
              ...prev,
              menuType: "tag_input",
              focusedIndex: 0,
              tagInput: "",
            }))
          }
        >
          🏷 タグ追加
        </MenuButton>
        <MenuButton
          index={itemOffset + 5}
          focused={clampedIndex === itemOffset + 5}
          onClick={menu.handleOpenSettings}
        >
          ⚙ 設定
        </MenuButton>
      </>
    );
  }

  if (ctx.kind === "link") {
    return (
      <>
        <MenuButton
          index={0}
          focused={clampedIndex === 0}
          onClick={menu.handleOpenLinkTarget}
        >
          リンク先を開く
        </MenuButton>
        <MenuButton
          index={1}
          focused={clampedIndex === 1}
          onClick={menu.handleCopyLinkText}
        >
          📋 リンクテキストコピー
        </MenuButton>
        <MenuButton
          index={2}
          focused={clampedIndex === 2}
          onClick={menu.handleOpenEgov}
        >
          e-Govで開く
        </MenuButton>
        <div className="border-t border-neutral-100 my-1" />
        <MenuButton
          index={3}
          focused={clampedIndex === 3}
          onClick={menu.handleOpenSettings}
        >
          ⚙ 設定
        </MenuButton>
      </>
    );
  }

  // ctx.kind === "highlight"
  return (
    <>
      <MenuButton
        index={0}
        focused={clampedIndex === 0}
        onClick={menu.handleDeleteHighlight}
      >
        🗑 ハイライトを削除
      </MenuButton>
      <MenuButton
        index={1}
        focused={clampedIndex === 1}
        onClick={async () => {
          if (state.context?.kind !== "highlight") return;
          const markEl = document.querySelector(
            `mark[data-highlight-id="${state.context.highlightId}"]`,
          );
          const text = markEl?.textContent ?? "";
          try {
            await navigator.clipboard.writeText(text);
            showToast("コピーしました", "success");
            close();
          } catch {
            showToast("コピーに失敗しました", "error");
          }
        }}
      >
        📋 テキストをコピー
      </MenuButton>
      <div className="border-t border-neutral-100 my-1" />
      <MenuButton
        index={2}
        focused={clampedIndex === 2}
        onClick={menu.handleOpenSettings}
      >
        ⚙ 設定
      </MenuButton>
    </>
  );
}
