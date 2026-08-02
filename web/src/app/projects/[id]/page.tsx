"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CheckItemList from "@/components/practice/CheckItemList";
import CheckItemEditor from "@/components/practice/CheckItemEditor";
import ArticleInlinePreview from "@/components/article/ArticleInlinePreview";
import QuickSearch from "@/components/search/QuickSearch";
import {
  buildArticleHref,
  todayInJapan,
} from "@/lib/applicability/applicability-context";

interface CheckItem {
  id: string;
  articleId: string;
  title: string | null;
  status: string;
  evidenceText: string | null;
  drawingNote: string | null;
  calculationMemo: string | null;
  consultationMemo: string | null;
  sortOrder: number;
}

interface Project {
  id: string;
  name: string;
  usage: string | null;
  siteArea: number | null;
  buildingArea: number | null;
  totalFloorArea: number | null;
  floors: number | null;
  structure: string | null;
  useDistrict: string | null;
  fireDistrict: string | null;
  roadAccess: string | null;
  municipality: string | null;
  checkItems: CheckItem[];
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "unchecked", label: "未確認" },
  { value: "applicable", label: "該当" },
  { value: "not_applicable", label: "非該当" },
  { value: "ok", label: "OK" },
  { value: "ng", label: "NG" },
  { value: "needs_consultation", label: "要協議" },
] as const;

const STATUS_COLOR: Record<string, string> = {
  unchecked: "bg-gray-100 text-gray-600",
  applicable: "bg-blue-100 text-blue-700",
  not_applicable: "bg-gray-100 text-gray-500",
  ok: "bg-green-100 text-green-700",
  ng: "bg-red-100 text-red-700",
  needs_consultation: "bg-yellow-100 text-yellow-700",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setProject)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const refreshProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = (await res.json()) as Project;
        setProject(data);
      }
    } catch {
      // keep current state
    }
  }, [id]);

  async function toggleStatus(itemId: string, currentStatus: string) {
    try {
      const res = await fetch("/api/checkitems", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, status: currentStatus }),
      });
      if (res.ok) {
        const updated = (await res.json()) as CheckItem;
        setProject((prev) =>
          prev
            ? {
                ...prev,
                checkItems: prev.checkItems.map((c) =>
                  c.id === itemId ? { ...c, status: updated.status } : c,
                ),
              }
            : prev,
        );
      }
    } catch {
      // keep going
    }
  }

  async function updateField(field: string, value: string) {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]:
            field.endsWith("Area") || field === "floors"
              ? Number(value)
              : value,
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Project;
        setProject(updated);
        setEditingField(null);
      }
    } catch {
      // keep editing
    }
  }

  async function handleMoveUp(itemId: string) {
    if (!project) return;
    const sorted = [...project.checkItems].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const idx = sorted.findIndex((c) => c.id === itemId);
    if (idx <= 0) return;
    const current = sorted[idx];
    const above = sorted[idx - 1];

    try {
      const res1 = fetch(`/api/checkitems/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: above.sortOrder }),
      });
      const res2 = fetch(`/api/checkitems/${above.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: current.sortOrder }),
      });
      await Promise.all([res1, res2]);
      await refreshProject();
    } catch {
      // keep current state
    }
  }

  async function handleMoveDown(itemId: string) {
    if (!project) return;
    const sorted = [...project.checkItems].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const idx = sorted.findIndex((c) => c.id === itemId);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const current = sorted[idx];
    const below = sorted[idx + 1];

    try {
      const res1 = fetch(`/api/checkitems/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: below.sortOrder }),
      });
      const res2 = fetch(`/api/checkitems/${below.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: current.sortOrder }),
      });
      await Promise.all([res1, res2]);
      await refreshProject();
    } catch {
      // keep current state
    }
  }

  async function handleDelete(itemId: string) {
    try {
      await fetch(`/api/checkitems/${itemId}`, { method: "DELETE" });
      setProject((prev) =>
        prev
          ? {
              ...prev,
              checkItems: prev.checkItems.filter((c) => c.id !== itemId),
            }
          : prev,
      );
      if (selectedItemId === itemId) {
        setSelectedItemId(null);
      }
    } catch {
      // keep current state
    }
  }

  async function handleUpdateItemField(field: string, value: string) {
    if (!selectedItemId) return;
    // Optimistic update
    setProject((prev) =>
      prev
        ? {
            ...prev,
            checkItems: prev.checkItems.map((c) =>
              c.id === selectedItemId ? { ...c, [field]: value } : c,
            ),
          }
        : prev,
    );

    try {
      await fetch(`/api/checkitems/${selectedItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch {
      // keep current state (revert on next refresh)
    }
  }

  function handleNavigate(articleId: string) {
    router.push(
      buildArticleHref(articleId, {
        anchor: "TODAY",
        asOf: todayInJapan(),
        projectId: id,
      }),
    );
  }

  function handleQuickSearchAdd() {
    refreshProject();
  }

  const selectedItem = project
    ? project.checkItems.find((c) => c.id === selectedItemId) ?? null
    : null;

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">物件が見つかりません</p>
          <Link
            href="/projects"
            className="text-sm text-blue-600 hover:underline mt-2 inline-block"
          >
            一覧に戻る
          </Link>
        </div>
      </main>
    );
  }

  const fields: { key: string; label: string; value: unknown }[] = [
    { key: "usage", label: "用途", value: project.usage },
    { key: "municipality", label: "自治体", value: project.municipality },
    { key: "siteArea", label: "敷地面積 (㎡)", value: project.siteArea },
    { key: "buildingArea", label: "建築面積 (㎡)", value: project.buildingArea },
    { key: "totalFloorArea", label: "延べ面積 (㎡)", value: project.totalFloorArea },
    { key: "floors", label: "階数", value: project.floors },
    { key: "structure", label: "構造", value: project.structure },
    { key: "useDistrict", label: "用途地域", value: project.useDistrict },
    { key: "fireDistrict", label: "防火地域", value: project.fireDistrict },
    { key: "roadAccess", label: "接道状況", value: project.roadAccess },
  ];

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link
            href="/projects"
            className="text-xs text-gray-500 hover:text-blue-600 hover:underline"
          >
            ← 物件一覧に戻る
          </Link>
        </div>

        {/* Header / Project Profile */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 mb-6">
          <h1 className="text-lg font-bold text-gray-900 mb-4">
            {project.name}
          </h1>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                <dt className="text-[10px] text-gray-400">{f.label}</dt>
                <dd className="text-xs text-gray-800 mt-0.5">
                  {editingField === f.key ? (
                    <input
                      type={typeof f.value === "number" ? "number" : "text"}
                      defaultValue={f.value?.toString() ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (f.value?.toString() ?? "")) {
                          updateField(f.key, e.target.value);
                        } else {
                          setEditingField(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          updateField(
                            f.key,
                            (e.target as HTMLInputElement).value,
                          );
                        if (e.key === "Escape") setEditingField(null);
                      }}
                      autoFocus
                      className="w-full px-1 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                  ) : (
                    <button
                      type="button"
                      className="hover:text-blue-600 cursor-text w-full text-left"
                      onClick={() => {
                        setEditingField(f.key);
                        setEditValue(f.value?.toString() ?? "");
                      }}
                    >
                      {f.value?.toString() || (
                        <span className="text-gray-300">未設定</span>
                      )}
                    </button>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 2-Pane Dashboard */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left Pane: CheckItemList + QuickSearch */}
          <div className="w-full md:w-[40%]">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-3">
                確認項目
              </h2>

              <CheckItemList
                items={project.checkItems}
                selectedId={selectedItemId}
                onSelect={setSelectedItemId}
                onStatusChange={toggleStatus}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDelete={handleDelete}
              />

              {/* QuickSearch */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-medium text-gray-500 mb-2">
                  条文を検索して追加
                </p>
                <QuickSearch
                  projectId={project.id}
                  onAdd={handleQuickSearchAdd}
                />
              </div>
            </div>
          </div>

          {/* Right Pane: ArticlePreview + Editor */}
          <div className="w-full md:w-[60%]">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-3">
                条文プレビュー
              </h2>
              <ArticleInlinePreview
                articleId={selectedItem?.articleId ?? null}
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
              <h2 className="text-sm font-bold text-gray-700 mb-3">
                確認項目編集
              </h2>
              <CheckItemEditor
                item={selectedItem}
                onUpdate={handleUpdateItemField}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
