"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { getSelectionContext } from "@/lib/highlight/text-selection";

export default function OfficialTextCopyBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const boundaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;

    function onCopy(event: ClipboardEvent) {
      const browserSelection = window.getSelection();
      if (
        !browserSelection?.anchorNode ||
        !browserSelection.focusNode ||
        !boundary?.contains(browserSelection.anchorNode) ||
        !boundary.contains(browserSelection.focusNode)
      ) {
        return;
      }
      const selection = getSelectionContext(new MouseEvent("copy"));
      if (!selection?.selectedText) return;
      event.preventDefault();
      event.clipboardData?.setData("text/plain", selection.selectedText);
    }

    document.addEventListener("copy", onCopy, true);
    return () => document.removeEventListener("copy", onCopy, true);
  }, []);

  return (
    <div ref={boundaryRef} data-official-copy-boundary="true">
      {children}
    </div>
  );
}
