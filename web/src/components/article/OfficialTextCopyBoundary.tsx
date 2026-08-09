import type { ReactNode } from "react";

export default function OfficialTextCopyBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div data-official-copy-boundary="true">
      {children}
    </div>
  );
}
