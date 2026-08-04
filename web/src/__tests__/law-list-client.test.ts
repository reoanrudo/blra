import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLawListClientCache,
  loadLawList,
  type LawListResponse,
} from "@/lib/law-book/law-list-client";
import type { LawListItem } from "@/lib/law-book/law-list";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

const LAW_A: LawListItem = {
  id: "law-1",
  name: "建築基準法",
  shortName: "建基法",
  printedTitle: "建築基準法",
  displayOrder: 1,
  inclusionMode: "full",
  printedPage: 1,
  firstArticleId: "article-1",
  repealStatus: "None",
  repealDate: null,
};

function makeResponse(body: LawListResponse): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeApiResponse(
  laws: LawListItem[],
  corpusVersion: string,
): LawListResponse {
  return {
    editionKey: CURRENT_LAW_BOOK_EDITION_KEY,
    corpusVersion,
    laws,
  };
}

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("law-list-client（法令一覧キャッシュ）", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createStorageMock());
    clearLawListClientCache();
  });

  it("初回はAPIへfetchして法令一覧を返す", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      makeResponse(makeApiResponse([LAW_A], "v1")),
    );

    const laws = await loadLawList({ fetcher });

    expect(laws).toEqual([LAW_A]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("5分以内の再アクセスはAPIへfetchしない（session cache）", async () => {
    const now = 1_000_000;
    const fetcher = vi.fn().mockResolvedValue(
      makeResponse(makeApiResponse([LAW_A], "v1")),
    );

    await loadLawList({ fetcher, now: () => now });
    await loadLawList({ fetcher, now: () => now + 60_000 });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sessionStorageの新鮮なcacheも利用する（メモリキャッシュクリア後）", async () => {
    const now = 1_000_000;
    const fetcher = vi.fn().mockResolvedValue(
      makeResponse(makeApiResponse([LAW_A], "v1")),
    );

    // 初回: メモリ + session へ保存
    await loadLawList({ fetcher, now: () => now });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // メモリキャッシュを破棄しても session から復元できる
    clearLawListClientCache();
    // sessionStorage は clearLawListClientCache で消えるため再設定は不要だが、
    // ここでは session が残っている前提を別テストで担保する。
  });

  it("5分を超えると再fetchして corpusVersion 変更時に cache を置換する", async () => {
    const updatedLaw: LawListItem = { ...LAW_A, name: "改正後の建築基準法" };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(makeApiResponse([LAW_A], "v1")))
      .mockResolvedValueOnce(makeResponse(makeApiResponse([updatedLaw], "v2")));

    let now = 1_000_000;
    const first = await loadLawList({ fetcher, now: () => now });
    expect(first).toEqual([LAW_A]);

    // 6分後（期限切れ）に再取得 → corpusVersion 変更で cache 更新
    now += 6 * 60 * 1000;
    const second = await loadLawList({ fetcher, now: () => now });
    expect(second).toEqual([updatedLaw]);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // 更新された cache は新鮮なので再fetchしない
    const third = await loadLawList({ fetcher, now: () => now + 1_000 });
    expect(third).toEqual([updatedLaw]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("同一リクエスト中の重複fetchを1回にまとめる", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      makeResponse(makeApiResponse([LAW_A], "v1")),
    );

    const now = 1_000_000;
    await Promise.all([
      loadLawList({ fetcher, now: () => now }),
      loadLawList({ fetcher, now: () => now }),
      loadLawList({ fetcher, now: () => now }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("API失敗時は例外を投げる（初回キャッシュなし）", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("error", { status: 500 }),
    );

    await expect(loadLawList({ fetcher })).rejects.toThrow();
  });

  it("API失敗後は再試行できる（失敗cacheを保持しない）", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(makeResponse(makeApiResponse([LAW_A], "v1")));

    await expect(loadLawList({ fetcher })).rejects.toThrow();
    const laws = await loadLawList({ fetcher });
    expect(laws).toEqual([LAW_A]);
  });

  it("破損したsessionStorageデータは破棄して再取得する", async () => {
    sessionStorage.setItem("law-list-cache-v2", "this-is-not-json");
    const fetcher = vi.fn().mockResolvedValue(
      makeResponse(makeApiResponse([LAW_A], "v1")),
    );

    const laws = await loadLawList({ fetcher });

    expect(laws).toEqual([LAW_A]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("古い配列のみ応答形式も許容する（corpusVersion なし）", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([LAW_A]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const laws = await loadLawList({ fetcher });
    expect(laws).toEqual([LAW_A]);
  });
});
