// Context menu type definitions.
// Extracted from ContextMenuProvider — shapes shared across the
// hook, API layer, and menu components.

export interface TemplateItem {
  id: string;
  title: string;
  templateText: string;
}

export interface ProjectItem {
  id: string;
  name: string;
}

export type MenuContext =
  | {
      kind: "article";
      articleId: string;
      printableArticleId: string | null;
    }
  | {
      kind: "selection";
      articleId: string;
      rangeStart: number;
      rangeEnd: number;
      selectedText: string;
    }
  | {
      kind: "link";
      articleId: string;
      targetId: string;
      linkText: string;
    }
  | {
      kind: "highlight";
      highlightId: string;
      articleId: string;
      color: string;
      type: string;
    };

export type MenuType =
  | "main"
  | "project_picker"
  | "template_picker"
  | "highlight_picker"
  | "tag_input";

export interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  context: MenuContext | null;
  menuType: MenuType;
  projects: ProjectItem[] | null;
  templates: TemplateItem[] | null;
  toast: { message: string; type: "success" | "error" } | null;
  focusedIndex: number;
  tagInput: string;
}
