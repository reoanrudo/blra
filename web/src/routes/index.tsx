/**
 * ルート定義 — hourei-rag ArticleLayout ベース。
 */

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { ReaderPage } from "../components/ReaderPage";
import { apiGet } from "../api/client";
import type { SourceListItem } from "../api/types";

// === ルート ===

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// /sources/:sourceId
interface ReaderSearch { article?: string }
const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources/$sourceId",
  component: () => {
    const { sourceId } = readerRoute.useParams();
    const { article } = readerRoute.useSearch();
    return <ReaderPage sourceId={sourceId} focusArticle={article} />;
  },
  validateSearch: (s: Record<string, unknown>): ReaderSearch => ({
    article: (s.article as string | undefined) ?? undefined,
  }),
});

// / → 最初の法令へリダイレクト
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const result = await apiGet<SourceListItem[]>("/sources");
    if (result.ok && result.data.length > 0) {
      throw redirect({
        to: "/sources/$sourceId",
        params: { sourceId: result.data[0].source_id },
      });
    }
  },
  component: () => (
    <div style={{ padding: 48, textAlign: "center", color: "#6f6a62" }}>
      取込済みの法令がありません。npm run ingest を実行してください。
    </div>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute, readerRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
