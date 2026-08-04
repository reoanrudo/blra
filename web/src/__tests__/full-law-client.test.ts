import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFullLawDocumentCache,
  fetchFullLawDocument,
} from "@/lib/article/full-law-client";
import type { FullLawDocument } from "@/lib/article/full-law-document";

const documentFixture: FullLawDocument = {
  law: {
    id: "law-1",
    egovLawId: "325AC0000000201",
    name: "建築基準法",
    shortName: "建基法",
  },
  revision: {
    id: "rev-1",
    editionKey: "ksk-2026",
    effectiveFrom: "2026-05-27",
    sourceUpdatedAt: "2026-05-27T10:30:46+09:00",
    fetchedAt: "2026-08-04T04:01:00+09:00",
    lastSuccessfulCheckAt: "2026-08-04T04:00:00+09:00",
    lastAttemptAt: "2026-08-04T04:00:00+09:00",
    refreshStatus: "verified",
    refreshErrorCode: null,
    repealStatus: "None",
    repealDate: null,
  },
  toc: [],
  nodes: [],
  linksBySource: {},
};

beforeEach(() => {
  clearFullLawDocumentCache();
});

describe("full law client", () => {
  it("同じrevisionは1回だけfetchする", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(documentFixture)));

    await fetchFullLawDocument("rev-1", fetcher);
    await fetchFullLawDocument("rev-1", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("失敗結果はキャッシュせず再試行できる", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(documentFixture)));

    await expect(fetchFullLawDocument("rev-2", fetcher)).rejects.toThrow();
    await expect(fetchFullLawDocument("rev-2", fetcher)).resolves.toEqual(
      documentFixture,
    );
  });
});
