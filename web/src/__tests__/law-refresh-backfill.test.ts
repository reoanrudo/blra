import { describe, expect, it } from "vitest";
import {
  planDurableKeyBackfill,
  type BackfillDbNode,
  type BackfillParsedNode,
  BackfillChecksumMismatchError,
} from "@/lib/law-refresh/backfill-durable-keys";

/**
 * planDurableKeyBackfill の単体テスト。
 *
 * この関数は純粋関数（DB接続なし）であり、DBノード配列とパースノード配列を
 * legacyStableNodeKey（= stableNodeKey）で1対1照合し、
 * 件数・contentChecksum・親子数がすべて一致した場合のみ更新計画を作成する。
 *
 * 計画書 Step 3 より:
 * - checksum が1件でも違えば法令全体を BACKFILL_CHECKSUM_MISMATCH で拒否（throw）
 * - 件数不一致・キー集合不一致・親子数不一致は blocked（ready=false で返却）
 */

// ─── テスト用ヘルパー ───

interface DbSeed {
  id: string;
  key: string;
  checksum: string;
  /** 親の stableNodeKey。省略時は "root" から直接派生しない独立ノードとして扱う。 */
  parentKey?: string | null;
}

interface ParsedSeed {
  key: string;
  durableKey: string;
  checksum: string;
  bodyChecksum?: string;
  parentKey?: string | null;
}

function dbNode(seed: DbSeed): BackfillDbNode {
  return {
    id: seed.id,
    stableNodeKey: seed.key,
    contentChecksum: seed.checksum,
    parentStableNodeKey: seed.parentKey === undefined ? null : seed.parentKey,
  };
}

function parsedNode(seed: ParsedSeed): BackfillParsedNode {
  return {
    legacyStableNodeKey: seed.key,
    durableNodeKey: seed.durableKey,
    contentChecksum: seed.checksum,
    bodyChecksum: seed.bodyChecksum ?? `body-${seed.key}`,
    parentLegacyStableNodeKey: seed.parentKey === undefined ? null : seed.parentKey,
  };
}

// ─── テスト本体 ───

describe("planDurableKeyBackfill", () => {
  it("既存nodeと公式XMLのchecksumが1件でも違えば法令全体を拒否する", () => {
    // 計画書 Step 1 の指定テストケース。
    // DB側 contentChecksum="db" と XML側 contentChecksum="xml" が異なるため throw。
    expect(() =>
      planDurableKeyBackfill(
        [{ id: "article-1", stableNodeKey: "root/article:1@1", contentChecksum: "db" }],
        [{ legacyStableNodeKey: "root/article:1@1", durableNodeKey: "main/article:1", contentChecksum: "xml" }],
      ),
    ).toThrowError(expect.objectContaining({ code: "BACKFILL_CHECKSUM_MISMATCH" }));
  });

  it("checksum不一致エラーは BackfillChecksumMismatchError のインスタンスである", () => {
    try {
      planDurableKeyBackfill(
        [{ id: "a1", stableNodeKey: "root/article:1@1", contentChecksum: "aaa" }],
        [{ legacyStableNodeKey: "root/article:1@1", durableNodeKey: "main/article:1", contentChecksum: "bbb" }],
      );
      expect.unreachable("例外が投げられるべき");
    } catch (error) {
      expect(error).toBeInstanceOf(BackfillChecksumMismatchError);
    }
  });

  it("件数・checksum・親子数がすべて一致すれば ready=true の更新計画を返す", () => {
    const dbNodes = [
      dbNode({ id: "art-1", key: "root/article:1@1", checksum: "cs-1" }),
      dbNode({ id: "art-2", key: "root/article:2@1", checksum: "cs-2", parentKey: "root/article:1@1" }),
    ];
    const parsedNodes = [
      parsedNode({ key: "root/article:1@1", durableKey: "main/article:1", checksum: "cs-1" }),
      parsedNode({ key: "root/article:2@1", durableKey: "main/article:1/paragraph:1", checksum: "cs-2", parentKey: "root/article:1@1" }),
    ];

    const plan = planDurableKeyBackfill(dbNodes, parsedNodes);

    expect(plan.ready).toBe(true);
    expect(plan.errorCode).toBeNull();
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          articleId: "art-1",
          durableNodeKey: "main/article:1",
          bodyChecksum: "body-root/article:1@1",
        }),
        expect.objectContaining({
          articleId: "art-2",
          durableNodeKey: "main/article:1/paragraph:1",
          bodyChecksum: "body-root/article:2@1",
        }),
      ]),
    );
  });

  it("両方空配列のときは ready=true・updates=空 で返す", () => {
    const plan = planDurableKeyBackfill([], []);
    expect(plan.ready).toBe(true);
    expect(plan.errorCode).toBeNull();
    expect(plan.updates).toEqual([]);
  });

  it("DB側のノード数とXML側のノード数が違えば BACKFILL_NODE_COUNT_MISMATCH で blocked", () => {
    const plan = planDurableKeyBackfill(
      [
        dbNode({ id: "a1", key: "root/article:1@1", checksum: "x" }),
        dbNode({ id: "a2", key: "root/article:2@1", checksum: "x" }),
      ],
      [parsedNode({ key: "root/article:1@1", durableKey: "main/article:1", checksum: "x" })],
    );

    expect(plan.ready).toBe(false);
    expect(plan.errorCode).toBe("BACKFILL_NODE_COUNT_MISMATCH");
    expect(plan.updates).toEqual([]);
  });

  it("DBに存在しない legacyStableNodeKey がXML側にあれば BACKFILL_KEY_SET_MISMATCH で blocked", () => {
    // 件数は同じだがキーが違う。DB には article:1、XML には article:2。
    const plan = planDurableKeyBackfill(
      [dbNode({ id: "a1", key: "root/article:1@1", checksum: "x" })],
      [parsedNode({ key: "root/article:2@1", durableKey: "main/article:2", checksum: "x" })],
    );

    expect(plan.ready).toBe(false);
    expect(plan.errorCode).toBe("BACKFILL_KEY_SET_MISMATCH");
    expect(plan.updates).toEqual([]);
  });

  it("親子構造（各親の子供数）が一致しなければ BACKFILL_PARENT_CHILD_MISMATCH で blocked", () => {
    // 件数・キー集合・checksum は一致するが、親の紐付けが異なる。
    // DB は article:1 の下に paragraph が1件、XML は article:2 の下に paragraph が1件。
    const dbNodes = [
      dbNode({ id: "a1", key: "root/article:1@1", checksum: "cs" }),
      dbNode({ id: "p1", key: "root/article:1@1/paragraph:1@1", checksum: "cs", parentKey: "root/article:1@1" }),
    ];
    const parsedNodes = [
      parsedNode({ key: "root/article:1@1", durableKey: "main/article:1", checksum: "cs" }),
      parsedNode({
        key: "root/article:1@1/paragraph:1@1",
        durableKey: "main/article:1/paragraph:1",
        checksum: "cs",
        // DB では article:1 の子供だが、XML では root 直属とする（親子構造の不一致）
        parentKey: null,
      }),
    ];

    const plan = planDurableKeyBackfill(dbNodes, parsedNodes);

    expect(plan.ready).toBe(false);
    expect(plan.errorCode).toBe("BACKFILL_PARENT_CHILD_MISMATCH");
    expect(plan.updates).toEqual([]);
  });

  it("100ノードの整合したセットでも正しく ready になる", () => {
    const dbNodes: BackfillDbNode[] = [];
    const parsedNodes: BackfillParsedNode[] = [];
    for (let i = 1; i <= 100; i++) {
      const key = `root/article:${i}@1`;
      dbNodes.push(dbNode({ id: `art-${i}`, key, checksum: `cs-${i}` }));
      parsedNodes.push(parsedNode({ key, durableKey: `main/article:${i}`, checksum: `cs-${i}` }));
    }

    const plan = planDurableKeyBackfill(dbNodes, parsedNodes);

    expect(plan.ready).toBe(true);
    expect(plan.updates).toHaveLength(100);
  });

  it("複数ノード中の1件だけ checksum が違っても法令全体を throw する", () => {
    const dbNodes = [
      dbNode({ id: "a1", key: "root/article:1@1", checksum: "ok" }),
      dbNode({ id: "a2", key: "root/article:2@1", checksum: "ok" }),
      dbNode({ id: "a3", key: "root/article:3@1", checksum: "WRONG" }),
    ];
    const parsedNodes = [
      parsedNode({ key: "root/article:1@1", durableKey: "main/article:1", checksum: "ok" }),
      parsedNode({ key: "root/article:2@1", durableKey: "main/article:2", checksum: "ok" }),
      parsedNode({ key: "root/article:3@1", durableKey: "main/article:3", checksum: "ok" }),
    ];

    expect(() => planDurableKeyBackfill(dbNodes, parsedNodes)).toThrowError(
      expect.objectContaining({ code: "BACKFILL_CHECKSUM_MISMATCH" }),
    );
  });
});
