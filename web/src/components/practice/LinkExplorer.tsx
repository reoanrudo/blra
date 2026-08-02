"use client";

import { useApplicability } from "@/contexts/ApplicabilityContext";

export interface LinkItem {
  id: string;
  articleId: string;
  articleNumberNormalized: string | null;
  caption: string | null;
  lawShortName: string | null;
}

interface LinkExplorerProps {
  incoming: LinkItem[];
  outgoing: LinkItem[];
}

function LinkListItem({ item, badge }: { item: LinkItem; badge: string }) {
  const applicability = useApplicability();
  const articleNumber = item.articleNumberNormalized
    ? `第${item.articleNumberNormalized}条`
    : "条文";

  return (
    <li className="flex items-start gap-2 py-1 text-xs leading-relaxed">
      <span className="law-note-badge mt-0.5">{badge}</span>
      <a
        href={applicability.articleHref(item.articleId)}
        target="_blank"
        rel="noopener noreferrer"
        className="law-note-link min-w-0 flex-1 text-left"
        data-article-id={item.articleId}
        title={
          item.lawShortName
            ? `${item.lawShortName} - ${articleNumber}`
            : articleNumber
        }
      >
        <span className="font-bold">{articleNumber}</span>
        {item.caption && (
          <span className="ml-1 text-neutral-700">{item.caption}</span>
        )}
        {item.lawShortName && (
          <span className="ml-1 text-neutral-500">({item.lawShortName})</span>
        )}
      </a>
    </li>
  );
}

export default function LinkExplorer({ incoming, outgoing }: LinkExplorerProps) {
  return (
    <div className="space-y-4">
      {/* Outgoing links (参照先) */}
      <section className="law-note-section">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-neutral-800">
          <span className="law-note-badge">関</span>
          <span>参照先</span>
          {outgoing.length > 0 && (
            <span className="ml-auto text-[10px] font-bold text-neutral-500">
              {outgoing.length}
            </span>
          )}
        </h4>
        {outgoing.length > 0 ? (
          <ul className="space-y-0">
            {outgoing.map((item) => (
              <LinkListItem key={item.id} item={item} badge="関" />
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500">
            この条文からの参照はありません
          </p>
        )}
      </section>

      {/* Incoming links (逆リンク) */}
      <section className="law-note-section">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-neutral-800">
          <span className="law-note-badge">逆</span>
          <span>逆リンク</span>
          {incoming.length > 0 && (
            <span className="ml-auto text-[10px] font-bold text-neutral-500">
              {incoming.length}
            </span>
          )}
        </h4>
        {incoming.length > 0 ? (
          <ul className="space-y-0">
            {incoming.map((item) => (
              <LinkListItem key={item.id} item={item} badge="逆" />
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500">
            この条文への参照はありません
          </p>
        )}
      </section>
    </div>
  );
}
