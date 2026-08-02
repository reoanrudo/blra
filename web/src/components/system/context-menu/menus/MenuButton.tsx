// Shared menu item button used by every context menu variant.
// Extracted verbatim from ContextMenuProvider — keyboard nav reads
// data-menu-index to focus/click items.

import type { ReactNode } from "react";

interface MenuButtonProps {
  index: number;
  focused: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function MenuButton({
  index,
  focused,
  onClick,
  children,
  className = "",
}: MenuButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-index={index}
      className={`
        w-full text-left px-3 py-2 text-sm flex items-center gap-2 cursor-pointer
        ${focused ? "bg-neutral-100 ring-2 ring-inset ring-[#d92f7e]" : "hover:bg-neutral-100"}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
