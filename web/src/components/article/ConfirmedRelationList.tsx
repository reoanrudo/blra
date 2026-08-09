import {
  RELATION_TYPE_LABELS,
  type ConfirmedRelation,
} from "@/lib/relations/confirmed-relation";
import { readerArticleHref } from "@/lib/article/full-law-document";
import { formatStructuredNumber } from "@/lib/article/legal-number-format";

export default function ConfirmedRelationList({
  sourceArticleId,
  relations,
}: {
  sourceArticleId: string;
  relations: ConfirmedRelation[];
}) {
  if (relations.length === 0) return null;

  return (
    <details
      data-confirmed-relations-for={sourceArticleId}
      data-print-hidden="true"
      className="mt-4 rounded border border-neutral-200 bg-neutral-50"
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-neutral-800">
        確認済みの関連 {relations.length}件
      </summary>
      <ul className="space-y-3 border-t border-neutral-200 px-3 py-3">
        {relations.map((relation) => (
          <li key={relation.id} className="text-sm text-neutral-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-bold">
                {RELATION_TYPE_LABELS[relation.relationType]}
              </span>
              <span className="text-xs text-neutral-600">運営確認済み</span>
            </div>
            <a
              href={readerArticleHref(relation.target.articleId)}
              target="_blank"
              rel="noopener noreferrer"
              data-confirmed-relation-target={relation.target.articleId}
              className="mt-1 inline-block font-bold text-[#9d1f58] hover:underline"
            >
              {relation.target.lawShortName ?? relation.target.lawName}
              {relation.target.articleNumber
                ? ` 第${formatStructuredNumber(relation.target.articleNumber)}条`
                : ""}
              {relation.target.caption ? ` ${relation.target.caption}` : ""}
            </a>
            <p className="mt-1 leading-relaxed text-neutral-700">
              {relation.rationale}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
