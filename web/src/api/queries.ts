/**
 * TanStack Query フック集（法令リーダー SCR-03 用）。
 *
 * 各クエリは独立しており、§19.14「部分失敗」を実現する:
 *   provisions（本文）と references（関連）を別クエリ化し、
 *   片方の失敗がもう片方に影響しない。
 *
 * §19.22.2-(4): 本文以外のメタデータを本文と同一ペイロードで送らない。
 * → provisions と references は別 API エンドポイントで遅延取得。
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";
import type {
  CurrentUser,
  ProvisionWithVersion,
  ReferenceEdge,
  SourceDetail,
  SourceListItem,
  SourceVersion,
} from "./types";

// === Query Key 工場（キャッシュ粒度の統一） ===

export const queryKeys = {
  sources: ["sources"] as const,
  source: (id: string) => ["sources", id] as const,
  sourceVersions: (id: string) => ["sources", id, "versions"] as const,
  provisions: (sourceId: string) => ["sources", sourceId, "provisions"] as const,
  references: (provisionId: string) =>
    ["provisions", provisionId, "references"] as const,
  me: ["me"] as const,
};

// === /sources ===

/** 取込済み法令一覧（GET /sources） */
export function useSources() {
  return useQuery({
    queryKey: queryKeys.sources,
    queryFn: () => apiGet<SourceListItem[]>("/sources"),
    // ApiResult をそのまま返す（ok/error パターンマッチをコンポーネントで行う）
  });
}

/** 法令1件のメタデータ（GET /sources/:id） */
export function useSource(sourceId: string | null | undefined) {
  return useQuery({
    queryKey: sourceId ? queryKeys.source(sourceId) : ["sources", "__none__"],
    queryFn: () => apiGet<SourceDetail>(`/sources/${sourceId}`),
    enabled: sourceId != null,
  });
}

// === /sources/:id/versions ===

/** 版履歴（GET /sources/:id/versions） */
export function useSourceVersions(sourceId: string | null | undefined) {
  return useQuery({
    queryKey: sourceId
      ? queryKeys.sourceVersions(sourceId)
      : ["sources", "__none__", "versions"],
    queryFn: () => apiGet<SourceVersion[]>(`/sources/${sourceId}/versions`),
    enabled: sourceId != null,
  });
}

// === /sources/:id/provisions ===

/**
 * source 配下の条文一覧（GET /sources/:id/provisions）。
 * §19.22.2-(4): 本文テキストのみ。参照等のメタデータは別ペイロード。
 */
export function useProvisions(sourceId: string | null | undefined) {
  return useQuery({
    queryKey: sourceId
      ? queryKeys.provisions(sourceId)
      : ["sources", "__none__", "provisions"],
    queryFn: () =>
      // limit=1000 で建築基準法（2264セグメント・292条）を全件取得。
      // Phase 3 で章単位の遅延ロード + 仮想化に移行する（§19.22.2-2・§19.10.8）。
      apiGet<ProvisionWithVersion[]>(
        `/sources/${sourceId}/provisions?limit=1000`,
      ),
    enabled: sourceId != null,
  });
}

// === /provisions/:id/references ===

/**
 * 参照エッジ一覧（GET /provisions/:id/references）。
 * §19.5 規範順（委任先→定義→例外→参照→未確認→未解決）でバックエンドがソート済み。
 * provisions クエリとは独立 → 部分失敗可能（§19.14）。
 */
export function useReferences(provisionId: string | null | undefined) {
  return useQuery({
    queryKey: provisionId
      ? queryKeys.references(provisionId)
      : ["provisions", "__none__", "references"],
    queryFn: () =>
      apiGet<ReferenceEdge[]>(`/provisions/${provisionId}/references`),
    enabled: provisionId != null,
  });
}

// === /me ===

/**
 * 現在のユーザ（GET /me）。
 * 401 は「未ログイン」として扱い、エラー扱いしない。
 * 返り値 data は CurrentUser | null（未ログイン時 null）。
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const result = await apiGet<CurrentUser>("/me");
      if (result.ok) {
        return { user: result.data, loggedIn: true as const };
      }
      if (result.error.status === 401) {
        return { user: null, loggedIn: false as const };
      }
      // 401 以外のエラーは throw して TanStack Query のエラー状態へ
      throw new Error(result.error.message);
    },
    retry: false,
    staleTime: 60_000,
  });
}
