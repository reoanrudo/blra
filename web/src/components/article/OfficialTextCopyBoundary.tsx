"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
      const selection = window.getSelection();
      if (
        !selection?.anchorNode ||
        !selection.focusNode ||
        !boundary?.contains(selection.anchorNode) ||
        !boundary.contains(selection.focusNode)
      ) {
        return;
      }

      let displayText = "";
      for (let index = 0; index < selection.rangeCount; index++) {
        displayText += selection.getRangeAt(index).cloneContents().textContent ?? "";
      }
      if (!displayText) return;

      event.preventDefault();
      event.clipboardData?.setData("text/plain", displayText);
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
