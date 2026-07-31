/**
 * React エントリポイント（SCR-03 法令リーダー Phase 2）。
 *
 * TanStack Query（サーバ状態管理）+ TanStack Router（URLルーティング）を設定。
 * §19.22.2-(3): 認証内側の法令本文は SSR しない。このアプリは完全な CSR。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./routes/index";
import "./styles/global.css";

// TanStack Query: retry 1、staleTime 60s
// §19.14「300ms 以内に完了する操作にスケルトンを出さない」は
// 各クエリフック側で制御する（isFetching と isLoading の使い分け）
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
