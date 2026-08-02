"use client";

import { useState, useEffect } from "react";
import { useProject } from "@/lib/practice/project-context";

interface ProjectItem {
  id: string;
  name: string;
  isActive: boolean;
}

export default function ProjectSwitcher() {
  const { activeProjectId, setActiveProjectId, isLoaded } = useProject();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ProjectItem[]) => {
        // Enrich with isActive from context
        setProjects(
          data.map((p) => ({ ...p, isActive: p.id === activeProjectId })),
        );
      })
      .catch(() => {});
  }, [isLoaded, activeProjectId]);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  function handleSelect(id: string) {
    setActiveProjectId(id);
    setOpen(false);
  }

  function handleClear() {
    setActiveProjectId(null);
    setOpen(false);
  }

  if (!isLoaded) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors"
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
        <span className="max-w-[160px] truncate text-gray-700">
          {activeProject ? activeProject.name : "プロジェクト未選択"}
        </span>
        <svg
          className="w-3 h-3 text-gray-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <p className="text-[10px] text-gray-400 font-medium">
                アクティブプロジェクト切替
              </p>
            </div>
            <ul className="max-h-60 overflow-y-auto">
              {projects.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-gray-400">
                  プロジェクトがありません
                </li>
              )}
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                      p.id === activeProjectId
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        p.id === activeProjectId ? "bg-blue-500" : "bg-gray-300"
                      }`}
                    />
                    <span className="truncate">{p.name}</span>
                    {p.id === activeProjectId && (
                      <span className="text-[10px] text-blue-500 flex-shrink-0 ml-auto">
                        アクティブ
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {activeProjectId && (
              <div className="border-t border-gray-100 p-1">
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  選択解除
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
