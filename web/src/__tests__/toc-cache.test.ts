import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCachedToc, setCachedToc, invalidateCachedToc } from "@/lib/article/toc-cache";
import type { TocNode } from "@/lib/article/toc-tree";

const EDITION = "ksk-2026";
const LAW_ID = "law-test-1";
const REV_2026 = "rev-2026";
const REV_2027 = "rev-2027";

function makeNode(id: string): TocNode {
  return {
    id,
    parentId: null,
    level: "chapter",
    title: `テスト章 ${id}`,
    articleNumber: "1",
    caption: null,
    sortOrder: 1,
    depth: 0,
    path: [1],
    textFirstLine: null,
    paragraphNumber: null,
  };
}

function makeNodes(): TocNode[] {
  return [makeNode("chap-1"), makeNode("chap-2")];
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

describe("toc-cache（目次キャッシュ）", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createStorageMock());
  });

  afterEach(() => {
    // モジュールレベルのメモリキャッシュを破棄してテスト間を分離する
    invalidateCachedToc(EDITION, REV_2026, LAW_ID);
    invalidateCachedToc(EDITION, REV_2027, LAW_ID);
    invalidateCachedToc("ksk-2027", REV_2026, LAW_ID);
    invalidateCachedToc(EDITION, REV_2026, "law-other");
  });

  it("同じRevisionで保存した目次を取得できる", () => {
    const nodes = makeNodes();
    setCachedToc(EDITION, REV_2026, LAW_ID, nodes);
    const cached = getCachedToc(EDITION, REV_2026, LAW_ID);
    expect(cached).not.toBeNull();
    expect(cached).toHaveLength(2);
    expect(cached?.[0].id).toBe("chap-1");
  });

  it("異なるRevisionではキャッシュを取得しない（キーが変わる）", () => {
    const nodes = makeNodes();
    setCachedToc(EDITION, REV_2026, LAW_ID, nodes);
    const cached = getCachedToc(EDITION, REV_2027, LAW_ID);
    expect(cached).toBeNull();
  });

  it("異なるEditionではキャッシュを取得しない（キーが変わる）", () => {
    const nodes = makeNodes();
    setCachedToc(EDITION, REV_2026, LAW_ID, nodes);
    const cached = getCachedToc("ksk-2027", REV_2026, LAW_ID);
    expect(cached).toBeNull();
  });

  it("異なるlawIdではキャッシュを取得しない（キーが変わる）", () => {
    const nodes = makeNodes();
    setCachedToc(EDITION, REV_2026, LAW_ID, nodes);
    const cached = getCachedToc(EDITION, REV_2026, "law-other");
    expect(cached).toBeNull();
  });

  it("invalidateCachedTocでキャッシュを破棄できる", () => {
    const nodes = makeNodes();
    setCachedToc(EDITION, REV_2026, LAW_ID, nodes);
    expect(getCachedToc(EDITION, REV_2026, LAW_ID)).not.toBeNull();

    invalidateCachedToc(EDITION, REV_2026, LAW_ID);
    expect(getCachedToc(EDITION, REV_2026, LAW_ID)).toBeNull();
  });

  it("空配列はキャッシュへ保存しない", () => {
    setCachedToc(EDITION, REV_2026, LAW_ID, []);
    expect(getCachedToc(EDITION, REV_2026, LAW_ID)).toBeNull();
  });

  it("破損したsessionStorageデータは破棄して再取得を促す", () => {
    // メモリキャッシュが空であることを確認した上で、
    // 不正なJSONをsessionStorageへ直接書き込み
    invalidateCachedToc(EDITION, REV_2026, LAW_ID);
    // buildKey が v2 プレフィックスを含むため、実際のキー形式へ合わせる
    const sessionKey = `toc-session:v2:${EDITION}:${REV_2026}:${LAW_ID}`;
    sessionStorage.setItem(sessionKey, "this-is-not-json");
    const cached = getCachedToc(EDITION, REV_2026, LAW_ID);
    expect(cached).toBeNull();
    // 破損データは削除される
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
  });

  it("Schema不一致のキャッシュは破棄する", () => {
    invalidateCachedToc(EDITION, REV_2026, LAW_ID);
    // 必須フィールドが欠けたエントリ
    const badEntry = {
      editionKey: EDITION,
      lawRevisionId: REV_2026,
      // lawId 欠落
      nodes: [makeNode("x")],
      cachedAt: Date.now(),
    };
    sessionStorage.setItem(
      `toc-session:${EDITION}:${REV_2026}:${LAW_ID}`,
      JSON.stringify(badEntry),
    );
    const cached = getCachedToc(EDITION, REV_2026, LAW_ID);
    expect(cached).toBeNull();
  });
});
