import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setPendingTocScroll, consumePendingTocScroll } from "@/lib/article/toc-scroll";

const KEY = "hourei-rag-toc-scroll-to";

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

describe("toc-scroll", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("set→consume: ターゲット一致で true を返しキーを消費する", () => {
    setPendingTocScroll("article-1");
    expect(consumePendingTocScroll("article-1")).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("ターゲット不一致では false を返し予約を保持する", () => {
    setPendingTocScroll("article-1");
    expect(consumePendingTocScroll("article-2")).toBe(false);
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    // 本来のターゲットは後から消費できる
    expect(consumePendingTocScroll("article-1")).toBe(true);
  });

  it("予約なしでは false を返す", () => {
    expect(consumePendingTocScroll("article-1")).toBe(false);
  });

  it("期限切れの予約は破棄して false を返す", () => {
    vi.useFakeTimers();
    setPendingTocScroll("article-1");
    vi.advanceTimersByTime(10_001);
    expect(consumePendingTocScroll("article-1")).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("不正なJSON（旧形式の生ID等）は破棄して false を返す", () => {
    sessionStorage.setItem(KEY, "article-1");
    expect(consumePendingTocScroll("article-1")).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("形式不一致のオブジェクトは破棄して false を返す", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ id: 123 }));
    expect(consumePendingTocScroll("article-1")).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("sessionStorage 不可の環境では例外を出さず false を返す", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => setPendingTocScroll("article-1")).not.toThrow();
    expect(consumePendingTocScroll("article-1")).toBe(false);
  });
});
