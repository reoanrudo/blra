"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  usage: string | null;
  municipality: string | null;
  isActive: boolean;
  updatedAt: string;
  checkItems: { id: string; status: string }[];
}

const statusCounts = (project: Project) => {
  const total = project.checkItems.length;
  const checked = project.checkItems.filter(
    (c) => c.status !== "unchecked",
  ).length;
  return { total, checked };
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", usage: "", municipality: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}`);
      }
    } catch {
      // keep form open
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">物件一覧</h1>
          <button
            type="button"
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "キャンセル" : "新規物件"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-6 bg-white border border-gray-200 rounded-lg p-4"
          >
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              新規物件登録
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  物件名 *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例: 渋谷区 飲食店用途変更"
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    用途
                  </label>
                  <input
                    type="text"
                    value={form.usage}
                    onChange={(e) =>
                      setForm({ ...form, usage: e.target.value })
                    }
                    placeholder="飲食店"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    自治体
                  </label>
                  <input
                    type="text"
                    value={form.municipality}
                    onChange={(e) =>
                      setForm({ ...form, municipality: e.target.value })
                    }
                    placeholder="渋谷区"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !form.name.trim()}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "作成中..." : "作成"}
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">まだ物件が登録されていません</p>
            <p className="text-xs text-gray-400 mt-1">
              新規物件を作成して確認項目を管理しましょう
            </p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <ul className="space-y-2">
            {projects.map((p) => {
              const { total, checked } = statusCounts(p);
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className={`block bg-white border rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-shadow ${
                      p.isActive ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                          {p.name}
                          {p.isActive && (
                            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              アクティブ
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[p.usage, p.municipality]
                            .filter(Boolean)
                            .join(" / ") || "詳細未設定"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-blue-600">
                          {checked}/{total}
                        </span>
                        <p className="text-[10px] text-gray-400">確認済/全項目</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      最終更新:{" "}
                      {new Date(p.updatedAt).toLocaleDateString("ja-JP")}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
