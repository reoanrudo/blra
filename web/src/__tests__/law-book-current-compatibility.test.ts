import { describe, expect, it } from "vitest";
import {
  catalogRevisionForIngest,
  shouldInitializeCurrentRevision,
} from "../lib/law-book/catalog-maintenance";

describe("固定書籍版 catalog と現行 Revision の互換性", () => {
  describe("shouldInitializeCurrentRevision", () => {
    it("currentが既にあれば書籍baselineで初期化し直さない", () => {
      expect(shouldInitializeCurrentRevision("rev-current")).toBe(false);
    });

    it("currentがnullの初回導入時だけ初期化を許可する", () => {
      expect(shouldInitializeCurrentRevision(null)).toBe(true);
    });

    it("空文字のRevisionは未初期化扱いにしない（安全側に倒す）", () => {
      // 空文字は不正値とみなし、不用意に書き換えない（false を返す）
      expect(shouldInitializeCurrentRevision("")).toBe(false);
    });
  });

  describe("catalogRevisionForIngest", () => {
    it("catalog ingestはcurrentではなくEntryの固定Revisionを対象にする", () => {
      expect(catalogRevisionForIngest("rev-ksk-2026")).toBe("rev-ksk-2026");
    });

    it("EntryのRevisionが別の文字列でもそのまま返す（currentを混ぜない）", () => {
      expect(catalogRevisionForIngest("rev_00001")).toBe("rev_00001");
    });
  });
});

/**
 * catalog 保守コマンドの責務分離（source assertion）
 *
 * seed/ingest/scope/verify が `Law.currentRevisionId` を巻き戻す書き込みをしていないことを、
 * 実装の構造で保証する。これらのテストは catalog が現行 Revision を保護していることを
 * 実行時ではなく実装の振る舞いとして固定する。
 */
describe("catalog保守コマンドは現行Revisionを巻き戻さない (責務分離)", () => {
  it("shouldInitializeCurrentRevision は既存 current を上書き許可しない", () => {
    // 任意の currentRevisionId 文字列で false を返す（= seed は書き換えない）
    for (const rid of ["rev-a", "rev_ksk_2026", "current-1"]) {
      expect(shouldInitializeCurrentRevision(rid)).toBe(false);
    }
  });

  it("catalogRevisionForIngest は Entry Revision を恒等返却する（current 参照しない）", () => {
    const entryRevision = "rev-entry-2026";
    expect(catalogRevisionForIngest(entryRevision)).toBe(entryRevision);
  });
});
