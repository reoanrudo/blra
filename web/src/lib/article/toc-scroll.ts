/**
 * 目次クリック→別章遷移後スクロールの sessionStorage プロトコル。
 * 書き込み（TocTree）と消費（ChapterArticleBlock）の契約を本モジュールに集約する。
 */
const TOC_SCROLL_KEY = "hourei-rag-toc-scroll-to";

// 遷移が完遂しなかった場合の残存キーによる予期しないジャンプを防ぐ有効期限
const TOC_SCROLL_TTL_MS = 10_000;

interface PendingTocScroll {
  id: string;
  ts: number;
}

function isPendingTocScroll(value: unknown): value is PendingTocScroll {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.ts === "number";
}

/** 遷移先条文IDをスクロール予約として記録する（クライアント専用） */
export function setPendingTocScroll(articleId: string): void {
  try {
    sessionStorage.setItem(
      TOC_SCROLL_KEY,
      JSON.stringify({ id: articleId, ts: Date.now() } satisfies PendingTocScroll),
    );
  } catch {
    // sessionStorage不可の環境では予約なしの通常遷移にフォールバック
  }
}

/**
 * 自分がスクロール予約のターゲットなら true を返し、予約を消費する。
 * 期限切れ・不正値はターゲット不一致でも破棄し、残存キーを残さない。
 */
export function consumePendingTocScroll(articleId: string): boolean {
  try {
    const raw = sessionStorage.getItem(TOC_SCROLL_KEY);
    if (!raw) return false;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(TOC_SCROLL_KEY);
      return false;
    }

    if (!isPendingTocScroll(parsed) || Date.now() - parsed.ts > TOC_SCROLL_TTL_MS) {
      sessionStorage.removeItem(TOC_SCROLL_KEY);
      return false;
    }

    if (parsed.id !== articleId) return false;

    sessionStorage.removeItem(TOC_SCROLL_KEY);
    return true;
  } catch {
    return false;
  }
}
