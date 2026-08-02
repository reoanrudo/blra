"use client";

import { useState, useEffect } from "react";
import LinkExplorer, { type LinkItem } from "./LinkExplorer";
import RecommendationBar from "./RecommendationBar";

interface PracticeTopic {
  id: string;
  name: string;
  articleCount: number;
}

interface DrawingNoteTemplate {
  id: string;
  title: string;
  templateText: string;
  tags: string[];
}

interface RightPanelProps {
  articleId: string;
  incoming: LinkItem[];
  outgoing: LinkItem[];
}

export default function RightPanel({
  articleId,
  incoming,
  outgoing,
}: RightPanelProps) {
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [notes, setNotes] = useState<DrawingNoteTemplate[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch practice topics for this article
    fetch("/api/topics")
      .then((r) => r.json())
      .then(setTopics)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Fetch drawing note templates for this article
    fetch(`/api/notes?articleId=${encodeURIComponent(articleId)}`)
      .then((r) => r.json())
      .then(setNotes)
      .catch(() => {});
  }, [articleId]);

  async function copyNote(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard not available
    }
  }

  return (
    <div className="law-note-panel space-y-4">
      <h3 className="law-note-heading">
        <span className="law-note-badge">実</span>
        <span>実務パネル</span>
      </h3>

      <LinkExplorer incoming={incoming} outgoing={outgoing} />

      {/* Practice topics for this article */}
      <section className="law-note-section">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-neutral-800">
          <span className="law-note-badge">論</span>
          <span>実務論点</span>
        </h4>
        {topics.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {topics.map((t) => (
              <span
                key={t.id}
                className="inline-block border-b border-[#d92f7e] text-[11px] font-bold leading-5 text-[#9d1f58]"
              >
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500">
            論点紐付けは seed-packs で初期化
          </p>
        )}
      </section>

      {/* Drawing note templates */}
      <section className="law-note-section">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-neutral-800">
          <span className="law-note-badge">図</span>
          <span>図面注記テンプレート</span>
        </h4>
        {notes.length > 0 ? (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="border-b border-neutral-300 pb-3 last:border-b-0 last:pb-0"
              >
                <p className="mb-1 text-xs font-bold text-neutral-900">
                  {n.title}
                </p>
                <p className="mb-2 text-[11px] leading-relaxed text-neutral-700">
                  {n.templateText}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {n.tags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-neutral-300 bg-white px-1 text-[9px] text-neutral-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`border px-2 py-0.5 text-[10px] font-bold ${
                      copiedId === n.id
                        ? "border-[#d92f7e] bg-[#d92f7e] text-white"
                        : "border-neutral-400 bg-white text-neutral-700 hover:border-[#d92f7e] hover:text-[#d92f7e]"
                    }`}
                    onClick={() => copyNote(n.templateText, n.id)}
                  >
                    {copiedId === n.id ? "コピー済" : "コピー"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500">
            この条文の図面注記テンプレートはありません
          </p>
        )}
      </section>

      <RecommendationBar articleId={articleId} />
    </div>
  );
}
