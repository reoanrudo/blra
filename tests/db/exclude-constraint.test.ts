/**
 * Kysely + EXCLUDE制約の動作検証。
 * ADR-022 の未検証事項「Kysely が EXCLUDE 制約を持つテーブルへの操作で問題を起こさないか」を確認する。
 *
 * 検証内容:
 * 1. provision_version への INSERT が成功する（正常系）
 * 2. 同一 provision_id で有効期間が重複する INSERT が制約違反で拒否される（異常系）
 * 3. 異なる provision_id であれば重複しない（正常系）
 * 4. valid_from_status = UNDETERMINED は制約対象外
 * 5. SELECT の型推論が正しく働く
 *
 * 前提: マイグレーションが全て適用済みであること。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/types.js";

let db: Kysely<Database>;

beforeAll(async () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://blra:blra_dev@localhost:5432/blra",
  });
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
});

afterAll(async () => {
  await db?.destroy();
});

// 各テストの前にデータをクリーンアップ
beforeEach(async () => {
  await sql`TRUNCATE provision_version, provision, source_version, source CASCADE`.execute(db);
});

describe("provision_version の EXCLUDE 制約", () => {
  it("正常系: 1件目の INSERT が成功する", async () => {
    // テストデータの準備
    const source = await db
      .insertInto("source")
      .values({
        canonical_uri: "jp/law/325AC0000000201",
        title: "建築基準法",
        publisher: "国土交通省",
        authority_class: "PRIMARY_LAW",
        jurisdiction: "jp",
        source_type: "EGOV_LAW",
        status: "ACTIVE",
      })
      .returning("source_id")
      .executeTakeFirstOrThrow();

    const sourceVersion = await db
      .insertInto("source_version")
      .values({
        source_id: source.source_id,
        content_hash: "abc123",
        raw_object_key: "raw/test.xml",
        parser_version: "egov-xml-1.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        valid_from: new Date("2025-01-01"),
        retrieved_at: new Date(),
      })
      .returning("source_version_id")
      .executeTakeFirstOrThrow();

    const provision = await db
      .insertInto("provision")
      .values({
        source_id: source.source_id,
        canonical_path: "art52-2/para1/item3",
        provision_type: "ITEM",
        stable_label: "第52条の2第1項第3号",
      })
      .returning("provision_id")
      .executeTakeFirstOrThrow();

    // ★ 検証対象: INSERT が成功する
    const result = await db
      .insertInto("provision_version")
      .values({
        provision_id: provision.provision_id,
        source_version_id: sourceVersion.source_version_id,
        citation_anchor: "jp/law/325AC0000000201/art52-2/para1/item3",
        body: "建築物の敷地は、国土交通省令で定める基準に適合するものとする。",
        body_normalized: "建築物の敷地は、国土交通省令で定める基準に適合するものとする。",
        content_fingerprint: "sha256:deadbeef",
        sequence: 1,
        valid_from: new Date("2025-01-01"),
        valid_from_status: "FIXED",
      })
      .returning("provision_version_id")
      .executeTakeFirstOrThrow();

    expect(result.provision_version_id).toBeDefined();
  });

  it("異常系: 同一 provision_id で有効期間重複する INSERT が拒否される", async () => {
    const source = await db
      .insertInto("source")
      .values({
        canonical_uri: "jp/law/test-overlap",
        title: "テスト法",
        publisher: "テスト省",
        authority_class: "PRIMARY_LAW",
        jurisdiction: "jp",
        source_type: "EGOV_LAW",
        status: "ACTIVE",
      })
      .returning("source_id")
      .executeTakeFirstOrThrow();

    const sv1 = await db
      .insertInto("source_version")
      .values({
        source_id: source.source_id,
        content_hash: "hash-v1",
        raw_object_key: "raw/v1.xml",
        parser_version: "egov-xml-1.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        valid_from: new Date("2025-01-01"),
        retrieved_at: new Date(),
      })
      .returning("source_version_id")
      .executeTakeFirstOrThrow();

    const sv2 = await db
      .insertInto("source_version")
      .values({
        source_id: source.source_id,
        content_hash: "hash-v2",
        raw_object_key: "raw/v2.xml",
        parser_version: "egov-xml-1.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        valid_from: new Date("2025-06-01"),
        retrieved_at: new Date(),
      })
      .returning("source_version_id")
      .executeTakeFirstOrThrow();

    const provision = await db
      .insertInto("provision")
      .values({
        source_id: source.source_id,
        canonical_path: "art1/para1",
        provision_type: "PARAGRAPH",
        stable_label: "第一条第一項",
      })
      .returning("provision_id")
      .executeTakeFirstOrThrow();

    // 1件目: 2025-01-01 〜 null（現在〜未来、有効）
    await db
      .insertInto("provision_version")
      .values({
        provision_id: provision.provision_id,
        source_version_id: sv1.source_version_id,
        citation_anchor: "jp/law/test-overlap/art1/para1",
        body: "本文 v1",
        body_normalized: "本文 v1",
        content_fingerprint: "sha256:v1",
        sequence: 1,
        valid_from: new Date("2025-01-01"),
        valid_from_status: "FIXED",
        // valid_to を指定しない = null = 終了日なし（ずっと有効）
      })
      .execute();

    // ★ 重複: 1件目が 2025-01-01〜null（無期限）で有効な中に、
    // 同一 provision で 2025-06-01〜 の版を入れようとする → 制約違反
    await expect(
      db
        .insertInto("provision_version")
        .values({
          provision_id: provision.provision_id,
          source_version_id: sv2.source_version_id,
          citation_anchor: "jp/law/test-overlap/art1/para1",
          body: "本文 v2",
          body_normalized: "本文 v2",
          content_fingerprint: "sha256:v2",
          sequence: 2,
          valid_from: new Date("2025-06-01"),
          valid_from_status: "FIXED",
        })
        .execute()
    ).rejects.toThrow();
  });

  it("正常系: 異なる provision_id であれば重複しない", async () => {
    const source = await db
      .insertInto("source")
      .values({
        canonical_uri: "jp/law/test-distinct",
        title: "テスト法2",
        publisher: "テスト省",
        authority_class: "PRIMARY_LAW",
        jurisdiction: "jp",
        source_type: "EGOV_LAW",
        status: "ACTIVE",
      })
      .returning("source_id")
      .executeTakeFirstOrThrow();

    const sv = await db
      .insertInto("source_version")
      .values({
        source_id: source.source_id,
        content_hash: "hash-distinct",
        raw_object_key: "raw/d.xml",
        parser_version: "egov-xml-1.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        valid_from: new Date("2025-01-01"),
        retrieved_at: new Date(),
      })
      .returning("source_version_id")
      .executeTakeFirstOrThrow();

    const provisionA = await db
      .insertInto("provision")
      .values({
        source_id: source.source_id,
        canonical_path: "art1/para1",
        provision_type: "PARAGRAPH",
        stable_label: "第一条第一項",
      })
      .returning("provision_id")
      .executeTakeFirstOrThrow();

    const provisionB = await db
      .insertInto("provision")
      .values({
        source_id: source.source_id,
        canonical_path: "art2/para1",
        provision_type: "PARAGRAPH",
        stable_label: "第二条第一項",
      })
      .returning("provision_id")
      .executeTakeFirstOrThrow();

    // 異なる provision で同じ期間なら重複しない
    await db
      .insertInto("provision_version")
      .values({
        provision_id: provisionA.provision_id,
        source_version_id: sv.source_version_id,
        citation_anchor: "jp/law/test-distinct/art1/para1",
        body: "本文A",
        body_normalized: "本文A",
        content_fingerprint: "sha256:a",
        sequence: 1,
        valid_from: new Date("2025-01-01"),
        valid_from_status: "FIXED",
      })
      .execute();

    await db
      .insertInto("provision_version")
      .values({
        provision_id: provisionB.provision_id,
        source_version_id: sv.source_version_id,
        citation_anchor: "jp/law/test-distinct/art2/para1",
        body: "本文B",
        body_normalized: "本文B",
        content_fingerprint: "sha256:b",
        sequence: 2,
        valid_from: new Date("2025-01-01"),
        valid_from_status: "FIXED",
      })
      .execute();

    const count = await db
      .selectFrom("provision_version")
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();

    expect(Number(count.count)).toBe(2);
  });

  it("正常系: valid_to を設定すれば期間が隣接する版を挿入できる", async () => {
    const source = await db
      .insertInto("source")
      .values({
        canonical_uri: "jp/law/test-adjacent",
        title: "テスト法3",
        publisher: "テスト省",
        authority_class: "PRIMARY_LAW",
        jurisdiction: "jp",
        source_type: "EGOV_LAW",
        status: "ACTIVE",
      })
      .returning("source_id")
      .executeTakeFirstOrThrow();

    const sv1 = await db
      .insertInto("source_version")
      .values({
        source_id: source.source_id,
        content_hash: "hash-adj1",
        raw_object_key: "raw/adj1.xml",
        parser_version: "egov-xml-1.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        valid_from: new Date("2025-01-01"),
        retrieved_at: new Date(),
      })
      .returning("source_version_id")
      .executeTakeFirstOrThrow();

    const sv2 = await db
      .insertInto("source_version")
      .values({
        source_id: source.source_id,
        content_hash: "hash-adj2",
        raw_object_key: "raw/adj2.xml",
        parser_version: "egov-xml-1.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        valid_from: new Date("2025-06-01"),
        retrieved_at: new Date(),
      })
      .returning("source_version_id")
      .executeTakeFirstOrThrow();

    const provision = await db
      .insertInto("provision")
      .values({
        source_id: source.source_id,
        canonical_path: "art1/para1",
        provision_type: "PARAGRAPH",
        stable_label: "第一条第一項",
      })
      .returning("provision_id")
      .executeTakeFirstOrThrow();

    // v1: 2025-01-01 〜 2025-06-01（終了日あり）
    await db
      .insertInto("provision_version")
      .values({
        provision_id: provision.provision_id,
        source_version_id: sv1.source_version_id,
        citation_anchor: "jp/law/test-adjacent/art1/para1",
        body: "本文 v1",
        body_normalized: "本文 v1",
        content_fingerprint: "sha256:adj1",
        sequence: 1,
        valid_from: new Date("2025-01-01"),
        valid_to: new Date("2025-06-01"),
        valid_from_status: "FIXED",
      })
      .execute();

    // v2: 2025-06-01 〜 null（隣接、重複なし）
    await db
      .insertInto("provision_version")
      .values({
        provision_id: provision.provision_id,
        source_version_id: sv2.source_version_id,
        citation_anchor: "jp/law/test-adjacent/art1/para1",
        body: "本文 v2",
        body_normalized: "本文 v2",
        content_fingerprint: "sha256:adj2",
        sequence: 2,
        valid_from: new Date("2025-06-01"),
        valid_from_status: "FIXED",
      })
      .execute();

    const rows = await db
      .selectFrom("provision_version")
      .select(["valid_from", "valid_to"])
      .orderBy("valid_from")
      .execute();

    expect(rows).toHaveLength(2);
  });

  it("正常系: SELECT の型推論が正しく働く（Kysely の型安全性確認）", async () => {
    const source = await db
      .insertInto("source")
      .values({
        canonical_uri: "jp/law/test-typesafe",
        title: "型安全性テスト法",
        publisher: "テスト省",
        authority_class: "MINISTERIAL_ORDINANCE",
        jurisdiction: "jp",
        source_type: "EGOV_LAW",
        // date 型: JST環境で new Date("2024-01-01") が前日UTCになるのを防ぐため
        // 文字列表現は使えない（KyselyはDate型を期待）ので、UTC基準で作成
        coverage_from: new Date("2024-01-01T00:00:00Z"),
        status: "ACTIVE",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // TypeScript の型推論が効いていることを確認（コンパイル時）
    // authority_class は AuthorityClass 型、source_type は SourceType 型
    expect(source.authority_class).toBe("MINISTERIAL_ORDINANCE");
    expect(source.source_type).toBe("EGOV_LAW");
    // date 型は時刻なし。取得時に UTC 00:00:00 として解釈される
    expect(source.coverage_from).toBeInstanceOf(Date);
    // pg ドライバは date 型をプロセスのタイムゾーン（JST）で解釈するため、
    // 取得値は 2023-12-31T15:00:00Z（= JST 2024-01-01 00:00）になる。
    // これは既知の pg ドライバの挙動。年月日をJSTで比較する。
    const retrievedDate = source.coverage_from!.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
    expect(retrievedDate).toBe("2024/1/1");
    expect(source.title_kana).toBeNull();
    expect(source.abbrev).toBeNull();

    // UPDATE の型安全性と updated_at の更新
    await db
      .updateTable("source")
      .set({ title: "改称法", updated_at: new Date() })
      .where("source_id", "=", source.source_id)
      .execute();

    const updated = await db
      .selectFrom("source")
      .select(["title", "authority_class"])
      .where("source_id", "=", source.source_id)
      .executeTakeFirstOrThrow();

    expect(updated.title).toBe("改称法");
    // 型推論: authority_class は union 型として推論される
    expect(updated.authority_class).toBe("MINISTERIAL_ORDINANCE");
  });
});
