"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

interface ProjectContextValue {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  isLoaded: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
  isLoaded: false,
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    null,
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load initial active project from server on mount
  useEffect(() => {
    fetch("/api/projects/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) {
          setActiveProjectIdState(data.id);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const setActiveProjectId = useCallback(
    (id: string | null) => {
      setActiveProjectIdState(id);
      // Persist to backend
      if (id) {
        fetch("/api/projects/active", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id }),
        }).catch(() => {});
      }
    },
    [],
  );

  return (
    <ProjectContext.Provider
      value={{ activeProjectId, setActiveProjectId, isLoaded }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
