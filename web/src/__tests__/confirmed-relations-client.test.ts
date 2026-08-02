import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("confirmed relations client", () => {
  it("同じrevisionを1回だけ取得する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture)),
    );

    await fetchConfirmedRelations("rev-1", fetcher);
    await fetchConfirmedRelations("rev-1", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/law-revisions/rev-1/confirmed-relations",
    );
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
});
