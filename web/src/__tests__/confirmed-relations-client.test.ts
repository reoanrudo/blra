import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearConfirmedRelationsCache,
  fetchConfirmedRelations,
} from "@/lib/relations/confirmed-relations-client";
import type { ConfirmedRelationsDocument } from "@/lib/relations/confirmed-relation";

const fixture: ConfirmedRelationsDocument = {
  revisionId: "rev-1",
  relationsBySource: {},
};

beforeEach(() => clearConfirmedRelationsCache());
afterEach(() => vi.useRealTimers());

describe("confirmed relations client", () => {
  it("TTL内の同じrevisionを1回だけ取得する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(fixture))),
    );

    await fetchConfirmedRelations("rev-1", fetcher);
    vi.advanceTimersByTime(59_999);
    await fetchConfirmedRelations("rev-1", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/law-revisions/rev-1/confirmed-relations",
    );
  });

  it("TTLの60秒経過後は同じrevisionを再取得する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(fixture))),
    );

    await fetchConfirmedRelations("rev-1", fetcher);
    vi.advanceTimersByTime(60_000);
    await fetchConfirmedRelations("rev-1", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("進行中の同じrevisionの取得を共有する", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetcher = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const first = fetchConfirmedRelations("rev-1", fetcher);
    const second = fetchConfirmedRelations("rev-1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveResponse?.(new Response(JSON.stringify(fixture)));
    await expect(Promise.all([first, second])).resolves.toEqual([
      fixture,
      fixture,
    ]);
  });

  it("失敗をキャッシュせず次の取得で再試行する", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));

    await expect(fetchConfirmedRelations("rev-1", fetcher)).rejects.toThrow();
    await expect(fetchConfirmedRelations("rev-1", fetcher)).resolves.toEqual(
      fixture,
    );
  });

  it.each([
    ["relationsBySource欠落", { revisionId: "rev-1" }],
    ["revision不一致", { ...fixture, revisionId: "rev-other" }],
    [
      "未定義のrelationType",
      {
        ...fixture,
        relationsBySource: {
          "article-1": [{
            id: "relation-1",
            relationType: "UNKNOWN",
            rationale: "確認根拠",
            confirmedAt: "2026-08-02T00:00:00.000Z",
            target: {
              articleId: "article-2",
              lawName: "建築基準法",
              lawShortName: null,
              articleNumber: null,
              caption: null,
            },
          }],
        },
      },
    ],
  ])("不正な200応答（%s）を安定したエラーで拒否する", async (_, body) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body)),
    );

    await expect(fetchConfirmedRelations("rev-1", fetcher)).rejects.toThrow(
      "確認済みの関連の応答が不正です",
    );
  });

  it("JSONとして壊れた200応答も安定したエラーで拒否する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("{invalid-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetchConfirmedRelations("rev-1", fetcher)).rejects.toThrow(
      "確認済みの関連の応答が不正です",
    );
  });

  it("200応答を許可フィールドだけのDTOへ再構築する", async () => {
    const expected: ConfirmedRelationsDocument = {
      revisionId: "rev-1",
      relationsBySource: {
        "article-1": [{
          id: "relation-1",
          relationType: "DEFINES",
          rationale: "確認根拠",
          confirmedAt: "2026-08-02T00:00:00.000Z",
          target: {
            articleId: "article-2",
            lawName: "建築基準法",
            lawShortName: "建基法",
            articleNumber: "百七",
            caption: "（特殊建築物の内装）",
          },
        }],
      },
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ...expected,
        candidates: [{ id: "candidate-top-level" }],
        relationsBySource: {
          "article-1": [{
            ...expected.relationsBySource["article-1"][0],
            confidence: 0.99,
            candidateId: "candidate-1",
            target: {
              ...expected.relationsBySource["article-1"][0].target,
              proposedBy: "generator",
            },
          }],
        },
      })),
    );

    await expect(fetchConfirmedRelations("rev-1", fetcher)).resolves.toEqual(
      expected,
    );
  });
});
